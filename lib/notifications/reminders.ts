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

/** Minimal shape of an active protocol_compound the schedule logic needs. */
export interface ReminderCompound {
  id: string;
  name: string;
  schedule_type: ScheduleType;
  days_of_week: number[] | null; // ISO weekday (Mon=1 … Sun=7) for specific_days
  interval_days: number | null;
  first_dose_on: string; // YYYY-MM-DD
  end_date: string | null; // YYYY-MM-DD
}

export interface LowStockItem {
  name: string;
  estEmptyDate: string | null; // YYYY-MM-DD from v_inventory_math
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
 * Whether a compound is due on `todayKey`. Mirrors the client `isDueOn`
 * (lib/home/stack.ts) but reads the Postgres schedule columns directly: nothing
 * before first_dose_on or after end_date; every_n_days counts FROM first_dose_on;
 * specific_days matches the ISO weekday.
 */
export function isDueToday(c: ReminderCompound, todayKey: string): boolean {
  const today = dayNumber(todayKey);
  if (c.first_dose_on && today < dayNumber(c.first_dose_on)) return false;
  if (c.end_date && today > dayNumber(c.end_date)) return false;

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

/** Vials projected to run out within `withinDays` of today. */
export function lowStock(
  stock: LowStockItem[],
  todayKey: string,
  withinDays: number,
): LowStockItem[] {
  const today = dayNumber(todayKey);
  return stock.filter((s) => {
    if (!s.estEmptyDate) return false;
    const daysLeft = dayNumber(s.estEmptyDate) - today;
    return daysLeft >= 0 && daysLeft <= withinDays;
  });
}

/* --------------------------------------------------------------- messages */

/** "Doses due today" digest. Lists names when few, else just the count. */
export function doseReminderMessage(due: ReminderCompound[]): PushMessage | null {
  if (due.length === 0) return null;
  const names = due.map((c) => c.name);
  const body =
    names.length === 1
      ? `${names[0]} is due today.`
      : names.length <= 3
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

/** Combined low-stock heads-up (one message even for several vials). */
export function lowStockMessage(items: LowStockItem[]): PushMessage | null {
  if (items.length === 0) return null;
  const body =
    items.length === 1
      ? `${items[0].name} is running low${
          items[0].dosesRemaining != null
            ? ` — about ${Math.floor(items[0].dosesRemaining)} doses left.`
            : "."
        }`
      : `${items.length} vials are running low: ${items.map((i) => i.name).join(", ")}.`;
  return { title: "Running low", body, url: "/protocol", tag: "trackd-lowstock" };
}
