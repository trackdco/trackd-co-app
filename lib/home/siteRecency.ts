/**
 * Injection-site recency (Spec 19, Step 4 — rotation view). PURE helpers, no
 * React, no side effects (code-standards.md). Everything here is DERIVED at read
 * time from the dose log — nothing recency/freshness is ever stored (architecture
 * Invariant 1). This "reports, it does not recommend": it turns the log into a
 * days-since number + an amber heat; it never ranks, suggests, or warns.
 *
 * Kept free of runtime imports: the landing page and onboarding import
 * `siteHeat` from here, and must not pull the dose-log store in with it.
 */
import type { DayLogs } from "@/lib/home/doseLog"
import type { DateKey } from "@/lib/home/mockHomeData"
import type { InjectionSiteRoute } from "@/lib/db/types"

/**
 * The amber decay windows (days): full saturation on the day of injection, one
 * shade lighter per day, reaching a neutral/unfilled state at the end of the
 * window. Tuned on feel — the ONE place these live.
 */
export const IM_DECAY_DAYS = 7
export const SUBQ_DECAY_DAYS = 5

/** The decay window for a route. */
export function decayWindow(route: InjectionSiteRoute): number {
  return route === "im" ? IM_DECAY_DAYS : SUBQ_DECAY_DAYS
}

/**
 * Amber heat 0–1 for a site last used `daysSince` days ago on `route`: 1 (full)
 * on the day of injection, one step lighter per day, 0 (neutral/unfilled) at or
 * past the decay window. `null` (never used) → 0. The colour is heat; the
 * accompanying day-count text is the fact that keeps it from reading as a warning.
 */
export function siteHeat(
  daysSince: number | null,
  route: InjectionSiteRoute,
): number {
  if (daysSince == null) return 0
  const w = decayWindow(route)
  return Math.max(0, Math.min(1, 1 - daysSince / w))
}

/**
 * "YYYY-MM-DD" → a whole CALENDAR day number, or null for a malformed key.
 *
 * Counted from the key's own year, month and day in UTC, so no clock change can
 * move it. The old count divided a LOCAL midnight by a whole day: where local
 * midnight crosses UTC midnight at a clock change (Europe/London, Dublin,
 * Lisbon), 29 and 30 March came out as one number and a site used yesterday
 * read "today". The Site panel (`siteDaysBefore`) counts the same way.
 */
export function calendarDayNumber(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000)
}

/**
 * Days since each site was MOST RECENTLY used, from the device dose log —
 * INCLUDING today (a site logged today = 0). Keyed by the granular local site id
 * (the accurate per-site source; the coarse `dose_logs.injection_site` enum
 * collapses many sites to `other`). Counted in calendar days. Derived on read;
 * nothing stored.
 */
export function siteDaysSince(
  logs: DayLogs,
  todayKey: DateKey,
): Record<string, number> {
  const out: Record<string, number> = {}
  const todayN = calendarDayNumber(todayKey)
  if (todayN === null) return out
  for (const [key, dayLogObj] of Object.entries(logs)) {
    if (key > todayKey) continue // ignore any future-dated entries
    const n = calendarDayNumber(key)
    if (n === null) continue
    const ago = todayN - n
    if (ago < 0) continue
    for (const dayLog of Object.values(dayLogObj ?? {})) {
      const sid = dayLog?.siteId
      if (sid && (out[sid] === undefined || ago < out[sid])) out[sid] = ago
    }
  }
  return out
}

/** The day-count label shown on a marker ("today", "2d", "11d"). */
export function daysSinceLabel(daysSince: number): string {
  return daysSince === 0 ? "today" : `${daysSince}d`
}
