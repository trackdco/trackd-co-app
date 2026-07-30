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
import { isDueOnFor, type StackCompound } from "@/lib/home/stack";
import type { DayLogs } from "@/lib/home/doseLog";

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

/** One point per calendar day from day one (earliest start) → today, oldest first. */
export function computeAdherence(
  stack: StackCompound[],
  logs: DayLogs,
  todayKey: DateKey,
): AdherencePoint[] {
  const active = stack.filter((c) => !c.archived);
  if (active.length === 0) return [];

  const starts = stack
    .map((c) => c.schedule.startDate)
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
  const earliest = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : todayKey;

  const today = dateKeyToDate(todayKey);
  const span = Math.floor(
    (today.getTime() - dateKeyToDate(earliest).getTime()) / 86_400_000,
  );
  const days = Math.min(Math.max(span + 1, 1), MAX_DAYS);

  const points: AdherencePoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = resolveDateKey(today, i);
    points.push(adherenceOn(active, logs, key));
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
 * The per-day maths is `adherenceOn` in both cases, so the two can still never
 * disagree about a day they both cover — which is the property
 * `architecture.md` claims and the clipping approach did not actually deliver.
 *
 * Archived compounds are INCLUDED for days before today, for the same reason
 * `compoundsRunningOn` includes them: `archived` carries no date, so applying it
 * to a past day erases a compound from history the moment it is archived. From
 * today forward it is honoured, because that is what archived means now.
 */
export function computeAdherenceOver(
  stack: StackCompound[],
  logs: DayLogs,
  from: DateKey,
  to: DateKey,
  todayKey: DateKey,
): AdherencePoint[] {
  if (stack.length === 0 || to < from) return [];
  const start = dateKeyToDate(from);
  const span = Math.floor(
    (dateKeyToDate(to).getTime() - start.getTime()) / 86_400_000,
  );
  const days = Math.min(Math.max(span + 1, 1), MAX_WINDOW_DAYS);

  const points: AdherencePoint[] = [];
  for (let i = 0; i < days; i++) {
    const key = resolveDateKey(start, -i);
    const eligible = stack.filter((c) => !(c.archived && key >= todayKey));
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
  // Judged by the rule in force on that day — consistency must not be
  // recomputed against a schedule the user only adopted later.
  const dueIds = compounds.filter((c) => isDueOnFor(c, date)).map((c) => c.id);
  const due = dueIds.length;
  if (due === 0) return { key, due: 0, logged: 0, pct: null };
  const dayLogs = logs[key] ?? {};
  const logged = dueIds.filter((id) => dayLogs[id]).length;
  return { key, due, logged, pct: Math.round((logged / due) * 100) };
}

/** Overall adherence across a set of points (logged ÷ due), or null if no doses. */
export function overallPct(points: AdherencePoint[]): number | null {
  let due = 0;
  let logged = 0;
  for (const p of points) {
    due += p.due;
    logged += p.logged;
  }
  return due > 0 ? Math.round((logged / due) * 100) : null;
}

/** Days that actually had doses due (the bars). */
export function doseDayCount(points: AdherencePoint[]): number {
  return points.reduce((n, p) => n + (p.due > 0 ? 1 : 0), 0);
}
