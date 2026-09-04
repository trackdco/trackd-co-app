/**
 * Consistency = adherence to the protocol over time (Context/Feature Specs/09 →
 * Step 6). Computed from the same device-local stack + dose log the Home screen
 * reads (the dosing model isn't on Postgres yet — see architecture). Per day:
 * how many of the doses DUE that day were logged. Rest days (nothing due) don't
 * count for or against you. Pure — no React.
 *
 * NOTE: this is a logging/behavioural read ("how closely you're sticking to it"),
 * NOT health data — so it's allowed an accent, unlike biomarker/marker values.
 */

import {
  dateKeyToDate,
  resolveDateKey,
  type DateKey,
} from "@/lib/home/mockHomeData";
import { isDueOnFor, wasObservedOn, type StackCompound } from "@/lib/home/stack";
import { slotsForDay, type DayLogs } from "@/lib/home/doseLog";

export interface AdherencePoint {
  key: DateKey;
  /** Doses due that day. */
  due: number;
  /** Of those, how many were logged. */
  logged: number;
  /** logged / due as a %, or null on a rest day (nothing due). */
  pct: number | null;
}

const MAX_DAYS = 365;

/**
 * Whole days between two date keys.
 *
 * Via UTC, deliberately. Subtracting two LOCAL midnights and dividing by 86.4M
 * loses an hour across a spring-forward transition, so the span came out one day
 * short and the walk never reached its final day: every user in a DST zone lost
 * the last day of any window crossing the change — including a block's close
 * date, the day most likely to carry a dose. UTC has no such transitions, and
 * these are calendar days, not durations.
 */
function daysBetween(from: DateKey, to: DateKey): number {
  const at = (key: DateKey) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(to) - at(from)) / 86_400_000);
}

/**
 * Whether a compound may contribute to a day's due count at all.
 *
 * THE SAME TEST HOME AND THE CALENDAR USE: not archived. Nothing else in the app
 * agrees with any other answer — both build their due lists from
 * `stack.filter(c => !c.archived)`, so an archived compound is invisible
 * everywhere a dose can actually be LOGGED.
 *
 * An earlier version of this let an archived compound back in when it carried a
 * `stopped` schedule version, on the reasoning that its earlier run was real.
 * The run is real, but the consequence was not: consistency counted days as
 * missed that the calendar drew as "nothing due" and the day sheet offered no
 * way to log. A figure that reads as a statement about the user, describing a
 * failure they cannot clear by any action in the app, is worse than a figure
 * that quietly covers less history.
 *
 * So the trade is deliberate and it is the same one made everywhere else: a
 * deleted compound leaves consistency entirely, past days included.
 * `compoundsRunningOn` makes the opposite trade, and correctly — a list of what
 * you were on names things, and naming one extra is not an accusation.
 */
function countsTowardConsistency(c: StackCompound): boolean {
  return !c.archived;
}

/** One point per calendar day from day one (earliest start) → today, oldest first. */
export function computeAdherence(
  stack: StackCompound[],
  logs: DayLogs,
  todayKey: DateKey,
): AdherencePoint[] {
  // Nothing running NOW means no widget — a display guard, not a rule about which
  // days count. Which compounds count is `countsTowardConsistency`, shared with
  // the window walk below so the two can never disagree about a day they both
  // cover.
  if (stack.every((c) => c.archived)) return [];
  const eligible = stack.filter(countsTowardConsistency);
  if (eligible.length === 0) return [];

  // The EARLIEST recorded rule, not the compound's current `startDate`.
  // `resolveScheduleOn` deliberately anchors on the earliest schedule version
  // for exactly this reason: re-adding a deleted compound sets a NEW start date,
  // and bounding the walk by it threw away the run before the delete. A user who
  // logged twenty-four consecutive days and then re-added the compound was shown
  // 0%.
  const starts = stack
    .flatMap((c) => [
      c.schedule.startDate,
      ...(c.scheduleHistory ?? []).map((v) => v.effectiveFrom),
    ])
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
  const earliest = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : todayKey;

  const today = dateKeyToDate(todayKey);
  const days = Math.min(Math.max(daysBetween(earliest, todayKey) + 1, 1), MAX_DAYS);

  const points: AdherencePoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = resolveDateKey(today, i);
    points.push(adherenceOn(eligible, logs, key));
  }
  return points;
}

/**
 * The same per-day rule over an ARBITRARY range, oldest first.
 *
 * Split out for the Blocks retrospective (2026-07-30). `computeAdherence` walks
 * backwards from TODAY and caps at a year, which is right for the Progress
 * widget and wrong for a look-back: a block that ran eighteen months ago fell
 * entirely outside the series, so clipping it produced `due: 0` and the
 * retrospective printed a headline **0%** directly beneath its own list of the
 * doses logged inside that same window.
 *
 * The per-day maths is `adherenceOn` and the eligible set is
 * `countsTowardConsistency` in BOTH cases, so the two cannot disagree about a
 * day they both cover — which is the property `architecture.md` claims. The
 * first attempt at this shared only the maths and carved out archived compounds
 * here alone, which made the retrospective and the Progress widget contradict
 * each other on the same day and the same compound.
 */
export function computeAdherenceOver(
  stack: StackCompound[],
  logs: DayLogs,
  from: DateKey,
  to: DateKey,
): AdherencePoint[] {
  if (stack.length === 0 || to < from) return [];
  const start = dateKeyToDate(from);
  const days = Math.min(Math.max(daysBetween(from, to) + 1, 1), MAX_WINDOW_DAYS);

  const eligible = stack.filter(countsTowardConsistency);
  if (eligible.length === 0) return [];

  const points: AdherencePoint[] = [];
  for (let i = 0; i < days; i++) {
    const key = resolveDateKey(start, -i);
    points.push(adherenceOn(eligible, logs, key));
  }
  return points;
}

/** A generous ceiling on a single window's walk — a guard, not a product rule. */
const MAX_WINDOW_DAYS = 3660;

/** One day's adherence. The single rule both walks above share. */
function adherenceOn(
  compounds: StackCompound[],
  logs: DayLogs,
  key: DateKey,
): AdherencePoint {
  const date = dateKeyToDate(key);
  const dayLogs = logs[key] ?? {};
  // Judged by the rule in force on that day — consistency must not be
  // recomputed against a schedule the user only adopted later.
  //
  // ⚠️ AND ONLY FOR DAYS THE APP WAS THERE FOR. A start date may be back-dated
  // on purpose ("I have been running this for three months"), and every day
  // between that start and the day the record was created has no evidence
  // behind it. Counting them made the percentage a statement about a stretch
  // nobody tracked, always in the same direction: the doses were never logged,
  // because there was nothing to log them with, so back-dating a start by a
  // month silently deducted a month of misses from the user's figure.
  //
  // A LOG on the day overrides it, and has to: someone who back-dates a start
  // AND back-fills the doses is telling us exactly what happened, and their
  // work must count. See `wasObservedOn`.
  const dueCompounds = compounds.filter(
    (c) =>
      isDueOnFor(c, date) &&
      (wasObservedOn(c, key) ||
        slotsForDay(c, key, dayLogs).some((s) => s.log != null)),
  );

  // Counted in DOSES, not compounds. `dueIds.filter((id) => dayLogs[id])` tested
  // slot 0 alone, so a twice-daily compound counted once and its morning dose
  // alone made the day 100%.
  let due = 0;
  let logged = 0;
  for (const c of dueCompounds) {
    const slots = slotsForDay(c, key, dayLogs);
    due += slots.length;
    // ⚠️ A SKIPPED dose is due-and-not-taken (Adrian, 2026-08-07).
    //
    // The distinction that settles it: a PAUSE changes what was due, and paused
    // days never reach here at all because `isDueOnFor` gates them out. A skip
    // does not change the plan — the dose was still due on that day and you
    // decided not to take it, so the percentage should say so.
    //
    // Skip's value is therefore the RECORD and the silenced nudge, not an escape
    // from the number. Counting it as taken would let someone skip everything and
    // read 100%, which makes the metric mean nothing.
    logged += slots.filter((s) => s.log != null && s.log.status !== "skipped").length;
  }
  if (due === 0) return { key, due: 0, logged: 0, pct: null };
  return { key, due, logged, pct: Math.round((logged / due) * 100) };
}

/** Overall adherence across a set of points (logged ÷ due), or null if no doses. */
export function overallPct(
  points: AdherencePoint[],
  /**
   * Today's local day key. When given, doses still OUTSTANDING today are left
   * out of the denominator: the day is not over, so they have not been missed.
   *
   * Without this, adding your first compound headlined Progress with a bare
   * `0 %` — denominator 1, numerator 0, for a dose whose time had not yet come.
   * The same arithmetic understates every user's figure every morning; it is
   * simply most visible on day one, when today IS the whole history.
   */
  todayKey?: string,
): number | null {
  let due = 0;
  let logged = 0;
  for (const p of points) {
    if (todayKey && p.key === todayKey) {
      // Count what has been taken today, never what is still to come.
      due += p.logged;
      logged += p.logged;
      continue;
    }
    due += p.due;
    logged += p.logged;
  }
  return due > 0 ? Math.round((logged / due) * 100) : null;
}

/** Days that actually had doses due (the bars). */
export function doseDayCount(points: AdherencePoint[]): number {
  return points.reduce((n, p) => n + (p.due > 0 ? 1 : 0), 0);
}
