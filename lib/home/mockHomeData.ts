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
 * A day's dose-logging compliance.
 *  - `logged`  — every due dose was logged
 *  - `partial` — some but not all due doses logged
 *  - `missed`  — a past day with nothing logged
 *  - `future`  — a day yet to come (nothing to log)
 */
export type DayStatus = "logged" | "partial" | "missed" | "future"

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

/** One body-weight reading. */
export interface WeightPoint {
  /** Days before today; 0 = today. */
  daysAgo: number
  kg: number
}

// Blank template — no weight history until the user logs their first reading.
export const weightSeries: WeightPoint[] = []

export const weightUnit = "kg"

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

/** The mock weight series as absolute-dated points (the empty-state fallback
 *  when a user has no real `body_metrics` rows yet). Oldest → newest. */
export function mockWeightPoints(today: Date): { key: DateKey; kg: number }[] {
  return weightSeries.map((p) => ({
    key: resolveDateKey(today, p.daysAgo),
    kg: p.kg,
  }))
}
