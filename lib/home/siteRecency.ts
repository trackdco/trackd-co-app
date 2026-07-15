/**
 * Injection-site recency (Spec 19, Step 4 — rotation view). PURE helpers, no
 * React, no side effects (code-standards.md). Everything here is DERIVED at read
 * time from the dose log — nothing recency/freshness is ever stored (architecture
 * Invariant 1). This "reports, it does not recommend": it turns the log into a
 * days-since number + an amber heat; it never ranks, suggests, or warns.
 */
import type { DayLogs } from "@/lib/home/doseLog"
import { dateKeyToDate, type DateKey } from "@/lib/home/mockHomeData"
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
 * Days since each site was MOST RECENTLY used, from the device dose log —
 * INCLUDING today (a site logged today = 0). Keyed by the granular local site id
 * (the accurate per-site source; the coarse `dose_logs.injection_site` enum
 * collapses many sites to `other`). Derived on read; nothing stored.
 */
export function siteDaysSince(
  logs: DayLogs,
  todayKey: DateKey,
): Record<string, number> {
  const todayN = Math.floor(dateKeyToDate(todayKey).getTime() / 86_400_000)
  const out: Record<string, number> = {}
  for (const [key, dayLogObj] of Object.entries(logs)) {
    if (key > todayKey) continue // ignore any future-dated entries
    const ago = todayN - Math.floor(dateKeyToDate(key).getTime() / 86_400_000)
    if (ago < 0) continue
    for (const dayLog of Object.values(dayLogObj)) {
      const sid = dayLog.siteId
      if (sid && (out[sid] === undefined || ago < out[sid])) out[sid] = ago
    }
  }
  return out
}

/** The day-count label shown on a marker ("today", "2d", "11d"). */
export function daysSinceLabel(daysSince: number): string {
  return daysSince === 0 ? "today" : `${daysSince}d`
}
