/**
 * Calendar screen — pure date helpers + shared shapes (Context/Feature Specs/10).
 * No React, no side effects (Context/code-standards.md).
 *
 * The Calendar is read-only review: it surfaces existing data, it never creates
 * or edits it. Weight / journal / markers come from Supabase (server-fetched,
 * RLS-scoped, passed in as date-keyed maps); "Running" — what was active that day
 * — comes from the device-local dose log. The cycles/`protocol_compounds` model
 * isn't wired yet, so there is no true cycle date-range: a day reads as "active"
 * when a dose was actually logged on it (the founder's "only what was logged"
 * call), and the Running row lists those logged compounds.
 */
import { toDateKey, type DateKey } from "@/lib/home/mockHomeData";
import { parseSlotKey } from "@/lib/home/doseLog";
import { dayLong } from "@/lib/format/date";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Mon-first weekday initials for the grid header (the Home week strip's row runs Mon→Sun too). */
export const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

export interface MonthCell {
  key: DateKey;
  date: Date;
  /** false for the leading / trailing days that belong to the adjacent month. */
  inMonth: boolean;
}

/**
 * A day's adherence state — the ring treatment in the month grid (the Milligram
 * "Calendar key"). Logged-vs-missed reads as the presence/strength of a NEUTRAL
 * ring, never a green/red good-bad judgement (Context/ui-context.md → health data
 * is categorical, never evaluative). The amber is the selected day only.
 *  - `logged`      — filled disc: a dose, journal entry, or weight logged that day.
 *  - `scheduled`   — dotted ring: a dose was due but isn't logged (past missed +
 *                    upcoming both land here).
 *  - `none-past`   — regular stroke: a past/today day with nothing scheduled
 *                    (rest day / off-cycle).
 *  - `none-future` — faint stroke: a future day with nothing scheduled, or days
 *                    before the protocol started.
 */
export type CalendarDayStatus = "logged" | "scheduled" | "none-past" | "none-future";

/** What was logged that day — drives the tiny icon under a logged day. */
export type LoggedKind = "dose" | "photo" | "journal" | "weight" | null;

/** A progress photo for a day (signed for display), passed in from the server. */
export interface CalendarPhoto {
  id: string;
  pose: string;
  url: string | null;
}

/** Resolve a day's ring state from whether it was logged / scheduled / in the future. */
export function resolveDayStatus(
  logged: boolean,
  scheduled: boolean,
  future: boolean,
): CalendarDayStatus {
  if (logged) return "logged";
  if (scheduled) return "scheduled";
  return future ? "none-future" : "none-past";
}

/** Per-day grid info: the ring state + which icon (if any) sits under the number. */
export interface DayInfo {
  /**
   * Something off-plan was logged on this day (Spec w2b-13, Step 8).
   *
   * **Deliberately NOT part of `status`.** The ring answers "did I do what I
   * planned"; a one-off is not part of any plan, so letting it fill the ring
   * would make an off-plan supplement read as protocol adherence — and would
   * let a day where nothing was scheduled show as complete. It gets its own
   * quiet mark instead, which answers the different question: what happened.
   */
  oneOff?: boolean
  status: CalendarDayStatus;
  kind: LoggedKind;
}

/** One logged dose for the Day-detail "Running" row (resolved client-side). */
export interface LoggedCompound {
  id: string;
  name: string;
  /** Drives the legend dot (organisational, not health data). */
  category: string;
  /** Amount as it was logged. */
  amount: string;
  /** The compound's unit (mg / mcg / iu …), or "" if the compound is gone. */
  unit: string;
  /** 24h "HH:mm". */
  time24: string;
  /** Injection-site id, or null for orals / removed-compound logs. */
  siteId: string | null;
}

/**
 * Resolve the compounds LOGGED on one day, oldest-first by time.
 *
 * Pure, so it is safe inside a memo or a render. The Calendar's day-detail sheet
 * is the only caller: the Progress photo card briefly used this too, until it
 * turned out to be asking a different question — "what was I RUNNING", which
 * includes compounds no dose fell on that day. That lives in
 * `lib/progress/running.ts`. Logged and running are not the same set and this
 * one is the smaller.
 *
 * A log whose compound has since been deleted still renders: the dose happened,
 * and the row degrades to "Logged dose" with no unit rather than vanishing.
 */
export function buildRunning(
  day:
    | Record<
        string,
        {
          amount: string
          time24: string
          siteId: string | null
          status?: "taken" | "skipped"
        }
      >
    | undefined,
  stackById: Map<string, { name: string; category: string; unit: string }>,
): LoggedCompound[] {
  if (!day) return []
  return Object.entries(day)
    .map(([key, log]) => {
      // PARSED. The keys are SLOT keys (`abc#1` for the evening dose), so a raw
      // lookup missed for every dose after the first and the row degraded to an
      // anonymous "Logged dose" with no unit and no category — for a compound
      // sitting right above it, fully named.
      const { compoundId, slot } = parseSlotKey(key)
      const c = stackById.get(compoundId)
      const base = c?.name ?? "Logged dose"
      return {
        id: key,
        // Later doses say WHICH they were, or the same name appears twice with
        // no way to tell them apart.
        name: slot > 0 ? `${base} · dose ${slot + 1}` : base,
        category: c?.category ?? "",
        // A skipped dose is not a dose that was taken. Showing its planned
        // amount here made a deliberate skip indistinguishable from a dose the
        // user actually had.
        amount: log.status === "skipped" ? "Skipped" : log.amount,
        unit: log.status === "skipped" ? "" : (c?.unit ?? ""),
        time24: log.time24,
        siteId: log.siteId,
      }
    })
    .sort((a, b) => a.time24.localeCompare(b.time24))
}

/**
 * "11/09/2026" — the numeric form, for a date used as a TITLE rather than read
 * in a sentence (the photo sheet's header). Date keys are ISO `YYYY-MM-DD`, so
 * this is string slicing on purpose: building a `Date` to format it is how a
 * key written in the user's own timezone comes back out a day early.
 */
export function formatDateKeyNumeric(key: string): string {
  const [y, m, d] = key.split("-");
  if (!y || !m || !d) return key;
  return `${d}/${m}/${y}`;
}

/** "June 2026" for a 0-based month. */
export function monthTitle(year: number, month0: number): string {
  return `${MONTHS[month0] ?? ""} ${year}`;
}

/**
 * The 42 cells (6 weeks × 7 days, Mon-first) covering the given month, with the
 * adjacent-month spill flagged `inMonth: false`. A fixed 6 rows keeps the grid a
 * stable height as the user pages through months.
 */
export function buildMonthMatrix(year: number, month0: number): MonthCell[] {
  const first = new Date(year, month0, 1);
  // JS getDay(): 0=Sun..6=Sat → Mon-first offset (Mon=0 … Sun=6).
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month0, 1 - offset);
  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + i,
    );
    cells.push({
      key: toDateKey(date),
      date,
      inMonth: date.getMonth() === month0,
    });
  }
  return cells;
}

/** Step a {year, month0} by `delta` months, normalising the year rollover. */
export function addMonths(
  year: number,
  month0: number,
  delta: number,
): { year: number; month0: number } {
  const d = new Date(year, month0 + delta, 1);
  return { year: d.getFullYear(), month0: d.getMonth() };
}

/* ---------------------------------------------------------------------------
 * THE DATE PICKER'S RULES (W32: one date field for the whole app).
 *
 * `DatePickerPanel` and `DateField` (components/feel) run on these and nothing
 * else, so which days can be picked, which month the calendar opens on, where
 * the arrow keys go and how the field words its date are decided once, here,
 * where they are tested. Keys are local "YYYY-MM-DD" and all the arithmetic is
 * done on the key's own numbers through UTC, so a daylight-saving night can
 * never turn "add a day" into "add none".
 * ------------------------------------------------------------------------- */

/** The range a picker offers, both ends INCLUSIVE; `null` is open-ended. */
export interface DayBounds {
  min: DateKey | null;
  max: DateKey | null;
}

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function keyParts(key: string): { y: number; m0: number; d: number } | null {
  const m = KEY_RE.exec(key);
  if (!m) return null;
  return { y: Number(m[1]), m0: Number(m[2]) - 1, d: Number(m[3]) };
}

function keyFromUtc(t: number): DateKey {
  const d = new Date(t);
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** A real calendar day written as a key: "2026-02-30" and "" are not. */
export function isDateKey(key: unknown): key is DateKey {
  if (typeof key !== "string") return false;
  const p = keyParts(key);
  if (!p || p.m0 < 0 || p.m0 > 11 || p.d < 1) return false;
  return keyFromUtc(Date.UTC(p.y, p.m0, p.d)) === key;
}

/**
 * The bounds as the picker uses them. A missing or malformed end is open.
 * Bounds that cross (`min` after `max`, a caller's mistake) collapse onto
 * `min` rather than leaving a calendar where nothing can be picked: a picker
 * with no pickable day is a dead control, and the later bound is the one a
 * rule like "an end on or after its start" is protecting.
 */
export function dayBounds(min?: string | null, max?: string | null): DayBounds {
  const lo = isDateKey(min) ? min : null;
  const hi = isDateKey(max) ? max : null;
  if (lo && hi && lo > hi) return { min: lo, max: lo };
  return { min: lo, max: hi };
}

/**
 * THE PANEL'S BOUNDS, backward compatible. `DatePickerPanel` was built for
 * the photo sheet, where a photo cannot be dated tomorrow, so a caller that
 * says nothing about `max` still gets today as the last day. `max: null`
 * opens the future (an end date); a key sets it.
 */
export function panelBounds(
  todayKey: DateKey,
  min?: string | null,
  max?: string | null,
): DayBounds {
  return dayBounds(min, max === undefined ? todayKey : max);
}

/** True when the day cannot be picked. */
export function isDayOutside(key: DateKey, bounds: DayBounds): boolean {
  return (bounds.min !== null && key < bounds.min) || (bounds.max !== null && key > bounds.max);
}

/** The nearest pickable day to `key`. */
export function clampDay(key: DateKey, bounds: DayBounds): DateKey {
  if (bounds.min !== null && key < bounds.min) return bounds.min;
  if (bounds.max !== null && key > bounds.max) return bounds.max;
  return key;
}

/** `n` days after `key` (before, when negative). */
export function addDaysToKey(key: DateKey, n: number): DateKey {
  const p = keyParts(key);
  if (!p) return key;
  return keyFromUtc(Date.UTC(p.y, p.m0, p.d + n));
}

/**
 * The same day `n` months on, held to the end of a shorter month: 31 January
 * plus one month is 28 (or 29) February, never 3 March.
 */
export function addMonthsToKey(key: DateKey, n: number): DateKey {
  const p = keyParts(key);
  if (!p) return key;
  const last = new Date(Date.UTC(p.y, p.m0 + n + 1, 0)).getUTCDate();
  return keyFromUtc(Date.UTC(p.y, p.m0 + n, Math.min(p.d, last)));
}

/** The month a key falls in. */
export function monthOfKey(key: DateKey): { year: number; month0: number } {
  const p = keyParts(key);
  if (!p) return { year: 1970, month0: 0 };
  return { year: p.y, month0: p.m0 };
}

/** A month as one number, so two months compare with `<`. */
export function monthIndex(year: number, month0: number): number {
  return year * 12 + month0;
}

function monthIndexOfKey(key: DateKey): number {
  const m = monthOfKey(key);
  return monthIndex(m.year, m.month0);
}

/** True when not one day of the month can be picked. */
export function isMonthOutside(year: number, month0: number, bounds: DayBounds): boolean {
  const i = monthIndex(year, month0);
  if (bounds.min !== null && i < monthIndexOfKey(bounds.min)) return true;
  if (bounds.max !== null && i > monthIndexOfKey(bounds.max)) return true;
  return false;
}

/** True when not one day of the year can be picked. */
export function isYearOutside(year: number, bounds: DayBounds): boolean {
  if (bounds.min !== null && year < monthOfKey(bounds.min).year) return true;
  if (bounds.max !== null && year > monthOfKey(bounds.max).year) return true;
  return false;
}

/**
 * Whether the month arrows may move `delta` months from the one in view: the
 * month they land on must hold at least one pickable day. (The photo sheet's
 * "next month stops at this month" is this, with `max` at today.)
 */
export function canStepMonth(
  view: { year: number; month0: number },
  delta: number,
  bounds: DayBounds,
): boolean {
  const next = addMonths(view.year, view.month0, delta);
  return !isMonthOutside(next.year, next.month0, bounds);
}

/**
 * The day the calendar is about: the chosen day when there is a pickable one,
 * else today brought inside the bounds. An empty field ("Ends (optional)")
 * opens on today, or on the first day it can take when today is not one.
 */
export function anchorDay(value: string, todayKey: DateKey, bounds: DayBounds): DateKey {
  if (isDateKey(value) && !isDayOutside(value, bounds)) return value;
  return clampDay(isDateKey(todayKey) ? todayKey : (bounds.min ?? bounds.max ?? todayKey), bounds);
}

/**
 * THE ONE DAY IN A MONTH THAT TAB LANDS ON (the grid is one Tab stop, and the
 * arrow keys move inside it). The first of `prefer` that is in this month and
 * pickable (the day the arrows last reached, the chosen day, today), else the
 * month's first pickable day. Null only when the month has none, and then the
 * grid is skipped, which is right: there is nothing in it to press.
 */
export function rovingDay(
  year: number,
  month0: number,
  prefer: readonly (string | null | undefined)[],
  bounds: DayBounds,
): DateKey | null {
  const i = monthIndex(year, month0);
  for (const k of prefer) {
    if (isDateKey(k) && monthIndexOfKey(k) === i && !isDayOutside(k, bounds)) return k;
  }
  if (isMonthOutside(year, month0, bounds)) return null;
  const first = `${String(year).padStart(4, "0")}-${String(month0 + 1).padStart(2, "0")}-01`;
  return clampDay(first, bounds);
}

/** A key the calendar grid understands, from the keyboard. */
export type DayMove =
  | "prevDay"
  | "nextDay"
  | "prevWeek"
  | "nextWeek"
  | "weekStart"
  | "weekEnd"
  | "prevMonth"
  | "nextMonth"
  | "prevYear"
  | "nextYear";

/**
 * The move a key press asks for in the day grid (the WAI-ARIA date picker's
 * keys): arrows by day and week, Home / End to the week's Monday and Sunday,
 * Page Up / Down by month, and with Shift by year. Null for any other key.
 */
export function dayMoveForKey(key: string, shiftKey = false): DayMove | null {
  switch (key) {
    case "ArrowLeft":
      return "prevDay";
    case "ArrowRight":
      return "nextDay";
    case "ArrowUp":
      return "prevWeek";
    case "ArrowDown":
      return "nextWeek";
    case "Home":
      return "weekStart";
    case "End":
      return "weekEnd";
    case "PageUp":
      return shiftKey ? "prevYear" : "prevMonth";
    case "PageDown":
      return shiftKey ? "nextYear" : "nextMonth";
    default:
      return null;
  }
}

/**
 * Where a keyboard move lands, held inside the bounds, so focus never rests on
 * a day that cannot be picked. The week is Monday-first, like the grid.
 */
export function moveDay(key: DateKey, move: DayMove, bounds: DayBounds): DateKey {
  const p = keyParts(key);
  if (!p) return key;
  const dow = (new Date(Date.UTC(p.y, p.m0, p.d)).getUTCDay() + 6) % 7; // Mon = 0
  let next: DateKey;
  switch (move) {
    case "prevDay":
      next = addDaysToKey(key, -1);
      break;
    case "nextDay":
      next = addDaysToKey(key, 1);
      break;
    case "prevWeek":
      next = addDaysToKey(key, -7);
      break;
    case "nextWeek":
      next = addDaysToKey(key, 7);
      break;
    case "weekStart":
      next = addDaysToKey(key, -dow);
      break;
    case "weekEnd":
      next = addDaysToKey(key, 6 - dow);
      break;
    case "prevMonth":
      next = addMonthsToKey(key, -1);
      break;
    case "nextMonth":
      next = addMonthsToKey(key, 1);
      break;
    case "prevYear":
      next = addMonthsToKey(key, -12);
      break;
    case "nextYear":
      next = addMonthsToKey(key, 12);
      break;
  }
  return clampDay(next, bounds);
}

/**
 * Whether the calendar's "Today" can act: never when today cannot be picked,
 * and not when it is already the chosen day and in view (it would do nothing).
 */
export function canGoToday(
  todayKey: DateKey,
  value: string,
  view: { year: number; month0: number },
  bounds: DayBounds,
): boolean {
  if (!isDateKey(todayKey) || isDayOutside(todayKey, bounds)) return false;
  const t = monthOfKey(todayKey);
  return !(value === todayKey && t.year === view.year && t.month0 === view.month0);
}

const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Jan" … "Dec" for a 0-based month (the calendar's month-and-year view). */
export function monthShort(month0: number): string {
  return MON_SHORT[month0] ?? "";
}

/**
 * A DATE FIELD'S WORDS: the app's day format (`dayLong`, "Tue 3 Sep") with the
 * year added when it is not this year, because a field is where a date a year
 * out is set (a cycle's end, "Tue 3 Sep 2027"), and "Tue 3 Sep" alone would
 * read as this year's. Sliced from the key, never through a Date in the
 * device's zone. Empty for anything that is not a day.
 */
export function dateFieldText(key: string, thisYear: number): string {
  if (!isDateKey(key)) return "";
  const { year } = monthOfKey(key);
  return year === thisYear ? dayLong(key) : `${dayLong(key)} ${year}`;
}

/** A day as a screen reader hears it in the grid: always with its year. */
export function dayAccessibleName(key: string): string {
  if (!isDateKey(key)) return key;
  return `${dayLong(key)} ${monthOfKey(key).year}`;
}
