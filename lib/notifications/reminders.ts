/**
 * Reminder computation (Spec 14, Phase 2) — PURE, no I/O, no React. Given a user's
 * already-fetched data, decide what's due and build the push messages. The same
 * functions back both the test harness (force, current user) and the scheduled
 * runner (all founders), so there is ONE source of truth for "what's due today".
 *
 * "Today" is a local date key (YYYY-MM-DD) the caller resolves in the user's
 * timezone — every date here is date-only and tz-independent once resolved.
 */
import type { ScheduleType } from "@/lib/db/types";
import { isOnCycle, type CycleRule } from "@/lib/protocol/cycleRule";
import {
  cyclePauseContext,
  effectiveCadenceStart,
  isPausedOn,
  type Pause,
} from "@/lib/home/pauses";

/** Minimal shape of an active protocol_compound the schedule logic needs. */
export interface ReminderCompound {
  id: string;
  name: string;
  /**
   * The compound's pauses (`supabase/protocol/018`), passed as SPANS rather than
   * as a "paused today" boolean.
   *
   * Resolved by the caller, because this module is pure and pauses live in
   * another table. It exists for the same reason `cycle` does: this file is the
   * SERVER-SIDE MIRROR of the client's `isDueOnFor`, and a gate the client
   * applies but the push does not means the app correctly shows nothing due
   * while the notification announces the dose and then nags for "missing" it.
   *
   * ⚠️ IT WAS A BOOLEAN, AND THAT WAS NOT ENOUGH. A pause does three things on
   * the client and only the first survived the trip here:
   *
   *  1. today is not due while the pause covers it (`isPausedOn`);
   *  2. the CADENCE RE-ANCHORS to the day the compound came back
   *     (`effectiveCadenceStart`), so an every-third-day compound is due on the
   *     day it resumes rather than on whatever day the untouched grid picked;
   *  3. paused days do not advance the CYCLE clock (`cyclePauseContext`).
   *
   * Dropping 2 and 3 left the two grids permanently offset after any pause: a
   * cold review walked eleven days of an every-3-days compound paused for two and
   * found the app and the phone disagreeing on seven of them — announcing doses
   * the app never asked for, and staying silent on the days it did. Spans carry
   * everything all three need, so the mirror now runs the client's own functions
   * instead of a boolean's worth of them.
   */
  pauses?: readonly Pause[];
  /**
   * True when the schedule trail says the compound was STOPPED — deleted, and not
   * since re-added (`supabase/protocol/005`, resolved by `isStoppedOn`).
   *
   * Resolved by the caller for the same reason `paused` and `cycle` are: this
   * module is pure and the versions live in another table. It exists because
   * DELETING a compound writes two facts and only one of them is
   * `protocol_compounds.is_active` — the other is a `stopped` version, and when
   * the first write does not land the second is the only record of the user's
   * intent that reached Postgres at all.
   *
   * Measured, on the founder's own account: four compounds deleted on 31 July and
   * 7 August kept `is_active = true` for up to thirteen days because that one
   * write failed silently, and every day of it this runner announced them as due
   * and then nagged for "missing" them — while the app, which reads the trail,
   * had correctly shown nothing. The trail was in Postgres the whole time.
   */
  stopped?: boolean;
  schedule_type: ScheduleType;
  days_of_week: number[] | null; // ISO weekday (Mon=1 … Sun=7) for specific_days
  interval_days: number | null;
  first_dose_on: string; // YYYY-MM-DD
  end_date: string | null; // YYYY-MM-DD
  /**
   * The EARLIEST recorded schedule version's day, when the compound has a trail.
   *
   * The client anchors the cadence on the earlier of this and the compound's
   * current start date (`resolveScheduleOn`), deliberately: re-adding a deleted
   * compound writes a NEW `first_dose_on`, and anchoring on that alone shifts the
   * every-N-days grid onto a different residue — so the app and the phone pick
   * different days, every day, for the rest of the run. Absent = no trail, and
   * `first_dose_on` is then the whole truth.
   */
  scheduleOrigin?: string | null;
  /**
   * The compound's on/off cycle, resolved from the `cycle_*` columns by the
   * caller (`cycleRuleFromColumns`). Absent = uncycled, which is every compound
   * before spec 06 and every compound the user never put on a cycle.
   *
   * This exists because the cycle gate MUST be applied here too: the client's
   * `isDueOnFor` gates on stopped → cycle → schedule, and this function is the
   * server-side mirror of it. Shipping cycles to the client without this meant
   * the app correctly showed nothing due on an off-day while the push still
   * announced the dose and then nagged for "missing" it.
   */
  cycle?: CycleRule;
}

/**
 * The `protocol_compounds` columns needed to build a {@link ReminderCompound},
 * spelled out as one literal because PostgREST's typed client parses a select as
 * a string LITERAL and cannot follow a joined array or a concatenation.
 *
 * Lives here, beside the shape it fills, rather than in the runner: the seven
 * `cycle_*` names must stay in step with `CYCLE_COLUMNS`, and a missing one does
 * not fail loudly — it makes `cycleRuleFromColumns` return `undefined` and the
 * cycle gate silently stop gating, which is the exact defect this fixes.
 * `reminders.test.ts` asserts every `CYCLE_COLUMNS` entry appears here.
 */
export const PC_REMINDER_SELECT =
  "id, schedule_type, days_of_week, interval_days, first_dose_on, end_date, cycle_anchor, cycle_on_days, cycle_off_days, cycle_end_type, cycle_end_date, cycle_end_rounds, cycle_colour, compounds(name)";

export interface LowStockItem {
  name: string;
  /** True when the compound this stock belongs to is paused today. Its stock is
   *  not moving, so "running low" is noise rather than news. */
  paused?: boolean;
  /** True when the compound this stock belongs to was DELETED (see
   *  {@link ReminderCompound.stopped}). Its vials belong to something the user
   *  stopped running, and "you're running low" about it is worse than noise —
   *  it names a compound they have already removed from the app. */
  stopped?: boolean;
  estEmptyDate: string | null; // YYYY-MM-DD from v_inventory_math
  /**
   * The view's own day COUNT (`supabase/protocol/010`), which is what the
   * Protocol card reads. Preferred over differencing `estEmptyDate`, because
   * that date is anchored to the DATABASE's date and Supabase runs UTC:
   * subtracting a local today from a UTC-anchored date is a day out for most of
   * the world for part of every day. Null falls back to the subtraction.
   */
  daysToEmpty: number | null;
  dosesRemaining: number | null;
}

/** A ready-to-send Web Push payload. */
export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/* --------------------------------------------------------------- timezone */

/** Validate an IANA timezone name (e.g. "Europe/London") before storing it —
 *  Intl throws RangeError on an unknown zone, so this rejects garbage. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The user-local date key (YYYY-MM-DD) and minutes-since-midnight for an instant.
 *
 * Lives in this pure module rather than in the runner because it is now read by
 * two callers — the runner's "what time is it for this user" and the trial
 * reminder's "which calendar day does this trial end on" — and a second copy of
 * a timezone conversion is precisely how the push pipeline fell out of step with
 * the client once already. One implementation, one set of tests.
 */
export function localParts(now: Date, tz: string): { dateKey: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour")) % 24; // some runtimes emit "24" at midnight
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + Number(get("minute")),
  };
}

/* --------------------------------------------------------------- schedule */

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Days since the Unix epoch for a YYYY-MM-DD (treated as UTC midnight, so the
 *  integer is tz-independent and safe to difference). */
export function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * A date key shifted by whole CALENDAR days. `shiftDateKey("2026-03-01", -2)`
 * is `"2026-02-27"`, and it crosses months, years and leap days by construction
 * because the arithmetic is done on the epoch day integer.
 *
 * Deliberately NOT `new Date(iso)` + `setDate`: a date-only string parses as UTC
 * midnight and `setDate` then works in the RUNTIME's zone, which is the exact
 * shape of the `logged_for` backfill bug (`supabase/protocol/012`). Nothing here
 * has a timezone at all — the caller resolves the local day first, then shifts.
 */
export function shiftDateKey(dateKey: string, days: number): string {
  const shifted = new Date((dayNumber(dateKey) + days) * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

/** ISO weekday (Mon=1 … Sun=7) for a YYYY-MM-DD. */
function isoWeekday(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun … 6=Sat
  return dow === 0 ? 7 : dow;
}

/**
 * Whether a compound is due on `todayKey`. Mirrors the client `isDueOnFor`
 * (lib/home/stack.ts) but reads the Postgres schedule columns directly: a stopped
 * (deleted) compound is never due; nothing before the run's start or after
 * end_date; a paused or off-cycle day is not due; every_n_days counts from the
 * start, re-anchored to the last resume; specific_days matches the ISO weekday.
 *
 * EVERY GATE HERE RUNS THE CLIENT'S OWN FUNCTION — `isOnCycle`, `isPausedOn`,
 * `effectiveCadenceStart`, `cyclePauseContext`, `isStoppedOn`. Not one of them is
 * reimplemented, because a parallel copy is exactly how this mirror fell out of
 * step with the client three times: cycles, then pauses, then deletes. What is
 * left here is the mapping from Postgres columns to those functions' arguments,
 * which is the only thing that genuinely differs between the two callers.
 */
export function isDueToday(c: ReminderCompound, todayKey: string): boolean {
  const today = dayNumber(todayKey);
  // STOPPED: the compound was not being run at all, so nothing was due and
  // nothing can be missed. FIRST, and above the date window, exactly where the
  // client puts it (`isDueOnFor` gates on `resolved.stopped` before anything
  // else) — a deleted compound has no schedule left to consult.
  if (c.stopped) return false;
  // The run's REAL beginning, which is not always `first_dose_on`: re-adding a
  // deleted compound writes a NEW start date, and the client deliberately keeps
  // the earliest recorded version as the anchor so the cadence phase does not
  // shift under a re-add. Same rule here, or the two disagree on every dose day
  // of the new run. See `ReminderCompound.scheduleOrigin`.
  const startKey =
    c.scheduleOrigin && c.scheduleOrigin < c.first_dose_on
      ? c.scheduleOrigin
      : c.first_dose_on;
  if (startKey && today < dayNumber(startKey)) return false;
  if (c.end_date && today > dayNumber(c.end_date)) return false;
  // PAUSED: nothing is due, so nothing is announced and nothing is nagged about.
  // Mirrors the client's gate, which sits in the same position — above the
  // cycle check and below the stopped one.
  if (isPausedOn(c.pauses, todayKey)) return false;
  // Off-cycle means the user is not taking it: nothing is due, so nothing can be
  // announced and nothing can be nagged about. Paused days do not advance the
  // cycle clock, which is what the context carries — without it a cycled
  // compound that had been paused was announced on days the app greyed out. No
  // `vialEmptyOn` for the same reason the client passes none: the "ends when the
  // vial runs out" condition is withheld behind `VIAL_END_SUPPORTED = false`.
  if (!isOnCycle(c.cycle, todayKey, cyclePauseContext(c.pauses, c.cycle, todayKey))) {
    return false;
  }

  switch (c.schedule_type) {
    case "every_day":
      return true;
    case "every_n_days": {
      const n = c.interval_days ?? 1;
      if (n <= 0) return false;
      // The cadence RE-ANCHORS to the day the last pause ended, so a compound is
      // due on the day it comes back rather than on whatever day the untouched
      // grid would have picked. The client's own function, not a copy of it.
      const anchorKey = startKey
        ? effectiveCadenceStart(startKey, c.pauses, todayKey)
        : null;
      const anchor = anchorKey ? dayNumber(anchorKey) : 0;
      return mod(today - anchor, n) === 0;
    }
    case "specific_days":
      return (c.days_of_week ?? []).includes(isoWeekday(todayKey));
    default:
      return false;
  }
}

/** Active compounds due today that have NOT been logged today. */
export function dueUnlogged(
  compounds: ReminderCompound[],
  loggedTodayIds: Set<string>,
  todayKey: string,
): ReminderCompound[] {
  return compounds.filter(
    (c) => isDueToday(c, todayKey) && !loggedTodayIds.has(c.id),
  );
}

/**
 * Vials projected to run out within `withinDays` of today.
 *
 * Reads the view's own `days_to_empty` wherever it is available, which is the
 * same figure `CompoundStorageCard` shows, so the phone and the screen cannot
 * disagree about whether a vial is running low. Falls back to differencing
 * `est_empty_date` only when the count is absent — that subtraction takes a
 * UTC-anchored date away from a local today and is a day out for part of every
 * day, which is why `supabase/protocol/010` added the count.
 */
export function lowStock(
  stock: LowStockItem[],
  todayKey: string,
  withinDays: number,
): LowStockItem[] {
  const today = dayNumber(todayKey);
  return stock.filter((s) => {
    // A paused compound is consuming nothing, so its stock is not running out —
    // it is simply sitting there. Nudging about it is noise, and the user has
    // already told us they are not taking it. A DELETED one said so louder.
    if (s.paused || s.stopped) return false;
    const daysLeft =
      s.daysToEmpty ??
      (s.estEmptyDate ? dayNumber(s.estEmptyDate) - today : null);
    if (daysLeft === null) return false;
    return daysLeft >= 0 && daysLeft <= withinDays;
  });
}

/* --------------------------------------------------------------- messages */

/**
 * How many names a push body will list before it falls back to the count alone.
 * One number for every message, so a long list is truncated the same way
 * wherever it appears rather than each message inventing its own limit.
 */
const NAME_LIST_MAX = 3;

/** "Doses due today" digest. Lists names when few, else just the count. */
export function doseReminderMessage(due: ReminderCompound[]): PushMessage | null {
  if (due.length === 0) return null;
  const names = due.map((c) => c.name);
  const body =
    names.length === 1
      ? `${names[0]} is due today.`
      : names.length <= NAME_LIST_MAX
        ? `Due today: ${names.join(", ")}.`
        : `You have ${names.length} doses due today.`;
  return { title: "Doses due today", body, url: "/dashboard", tag: "trackd-dose-daily" };
}

/** Later-in-the-day nudge for due doses still unlogged. */
export function missedNudgeMessage(due: ReminderCompound[]): PushMessage | null {
  if (due.length === 0) return null;
  const n = due.length;
  return {
    title: "Don't forget",
    body:
      n === 1
        ? `${due[0].name} is still unlogged today.`
        : `${n} doses are still unlogged today.`,
    url: "/dashboard",
    tag: "trackd-missed",
  };
}

/**
 * Combined low-stock heads-up (one message even for several compounds).
 *
 * Names are listed only while the list stays readable, then the count speaks for
 * itself — the same rule `doseReminderMessage` uses, so the three messages read
 * as one voice. Joining every name grew without bound: ten low items produced a
 * 146-character body that the notification shade truncates mid-list anyway.
 */
export function lowStockMessage(items: LowStockItem[]): PushMessage | null {
  if (items.length === 0) return null;
  const body =
    items.length === 1
      ? `${items[0].name} is running low${
          items[0].dosesRemaining != null
            ? `. About ${Math.floor(items[0].dosesRemaining)} doses left.`
            : "."
        }`
      : items.length <= NAME_LIST_MAX
        ? // "compounds", not "vials". The feeding query (`runner.ts`) selects
          // `inventory_items` with NO `inventory_type` filter, so tubs and
          // bottles are in scope — a user low on creatine and vitamin D3 was
          // told "2 vials are running low", naming two things that are neither.
          // There is no per-item form here to word it from (`LowStockItem` is a
          // name and a runway), and the message covers a mixed set anyway, so it
          // uses the one noun that is true of all three.
          `${items.length} compounds are running low: ${items.map((i) => i.name).join(", ")}.`
        : `${items.length} compounds are running low.`;
  return { title: "Running low", body, url: "/protocol", tag: "trackd-lowstock" };
}
