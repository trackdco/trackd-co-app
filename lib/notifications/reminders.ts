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

/** Minimal shape of an active protocol_compound the schedule logic needs. */
export interface ReminderCompound {
  id: string;
  name: string;
  /**
   * True when a pause covers today (`supabase/protocol/018`).
   *
   * Resolved by the caller, because this module is pure and the pause lives in
   * another table. It exists for the same reason `cycle` does: this file is the
   * SERVER-SIDE MIRROR of the client's `isDueOnFor`, and a gate the client
   * applies but the push does not means the app correctly shows nothing due
   * while the notification announces the dose and then nags for "missing" it.
   */
  paused?: boolean;
  schedule_type: ScheduleType;
  days_of_week: number[] | null; // ISO weekday (Mon=1 … Sun=7) for specific_days
  interval_days: number | null;
  first_dose_on: string; // YYYY-MM-DD
  end_date: string | null; // YYYY-MM-DD
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

/* --------------------------------------------------------------- schedule */

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Days since the Unix epoch for a YYYY-MM-DD (treated as UTC midnight, so the
 *  integer is tz-independent and safe to difference). */
function dayNumber(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** ISO weekday (Mon=1 … Sun=7) for a YYYY-MM-DD. */
function isoWeekday(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun … 6=Sat
  return dow === 0 ? 7 : dow;
}

/**
 * Whether a compound is due on `todayKey`. Mirrors the client `isDueOnFor`
 * (lib/home/stack.ts) but reads the Postgres schedule columns directly: nothing
 * before first_dose_on or after end_date; off-cycle days are not due;
 * every_n_days counts FROM first_dose_on; specific_days matches the ISO weekday.
 *
 * The cycle gate is applied with the SAME `isOnCycle` the client uses rather
 * than a second implementation of the on/off maths — a parallel copy here is
 * exactly how this mirror fell out of step with the client in the first place.
 */
export function isDueToday(c: ReminderCompound, todayKey: string): boolean {
  const today = dayNumber(todayKey);
  if (c.first_dose_on && today < dayNumber(c.first_dose_on)) return false;
  if (c.end_date && today > dayNumber(c.end_date)) return false;
  // PAUSED: nothing is due, so nothing is announced and nothing is nagged about.
  // Mirrors the client's gate, which sits in the same position — above the
  // cycle check and below the stopped one.
  if (c.paused) return false;
  // Off-cycle means the user is not taking it: nothing is due, so nothing can be
  // announced and nothing can be nagged about. No `CycleContext` is passed for
  // the same reason the client passes none — the "ends when the vial runs out"
  // condition is withheld behind `VIAL_END_SUPPORTED = false`.
  if (!isOnCycle(c.cycle, todayKey)) return false;

  switch (c.schedule_type) {
    case "every_day":
      return true;
    case "every_n_days": {
      const n = c.interval_days ?? 1;
      if (n <= 0) return false;
      const anchor = c.first_dose_on ? dayNumber(c.first_dose_on) : 0;
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
    // already told us they are not taking it.
    if (s.paused) return false;
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
 * Combined low-stock heads-up (one message even for several vials).
 *
 * Names are listed only while the list stays readable, then the count speaks for
 * itself — the same rule `doseReminderMessage` uses, so the three messages read
 * as one voice. Joining every name grew without bound: ten low vials produced a
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
        ? `${items.length} vials are running low: ${items.map((i) => i.name).join(", ")}.`
        : `${items.length} vials are running low.`;
  return { title: "Running low", body, url: "/protocol", tag: "trackd-lowstock" };
}
