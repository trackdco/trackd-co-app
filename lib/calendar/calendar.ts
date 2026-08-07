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
