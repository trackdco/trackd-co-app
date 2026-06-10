/**
 * Home / Dashboard mock fixture — the SINGLE source of mock data for the Home
 * screen. No real data is wired this pass; everything the Home screen shows
 * resolves from the exports here.
 *
 * Per-compound dosing, schedule, and injection-site rotation live on each
 * `StackCompound` (see `lib/home/stack.ts`); logged doses persist via
 * `lib/home/doseLog.ts`, and the week-strip + consistency status are computed
 * from those logs at runtime (HomeScreen). There is no global rotation list.
 *
 * Pure data + pure helpers only; no React, no side effects (code-standards.md).
 */
import type { StackCompound } from "@/lib/home/stack"

/** A calendar day as "YYYY-MM-DD" in local time. */
export type DateKey = string

/**
 * A day's dose-logging compliance. Labelled by POSITION, never as a celebratory
 * state (Context/Feature Specs/08 → A7): a past day is never "Upcoming".
 *  - `logged`  — every due dose was logged
 *  - `partial` — some but not all due doses logged
 *  - `missed`  — a past/today day with due doses, none logged
 *  - `none`    — a past/today day with nothing due (a rest day, or before the
 *                protocol began) — not adherence-relevant, renders blank
 *  - `future`  — a day yet to come ("Upcoming")
 */
export type DayStatus = "logged" | "partial" | "missed" | "none" | "future"

/**
 * The starting stack is EMPTY (the app is a blank template). A new user adds
 * their own compounds via the "+"; until then the Home screen shows the
 * "get started" empty state.
 */
export const seedStack: StackCompound[] = []

/**
 * What was recorded when a dose was logged (editable after the fact: the row's
 * tick re-opens the sheet pre-filled with this).
 */
export interface DoseLog {
  /** Amount as typed (kept as a string so a half-typed edit round-trips). */
  amount: string
  /** Injection site id (injectables only); null for orals. */
  siteId: string | null
  /** Time the dose was taken, 24h "HH:MM". */
  time24: string
}

/* ----------------------------------------------------------- pure helpers */

/** Format a Date as a local "YYYY-MM-DD" key (never UTC — avoids off-by-one). */
export function toDateKey(d: Date): DateKey {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** The DateKey `daysAgo` days before `today` (local time). */
export function resolveDateKey(today: Date, daysAgo: number): DateKey {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  d.setDate(d.getDate() - daysAgo)
  return toDateKey(d)
}

/** A Date at local midnight for the given DateKey. */
export function dateKeyToDate(key: DateKey): Date {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y, m - 1, d)
}
