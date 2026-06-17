/**
 * Pure cycle date helpers for the Protocol Plan view (Protocol Cutover, Step 4).
 * "Week X of N" is a display derivation from `started_on` + `ended_on` — a date
 * computation, NOT the stored-derived-value / inventory-maths rule (that governs
 * `v_inventory_math`). No React, no side effects.
 */
import type { Cycle } from "@/lib/db/types"

/** Whole local days since the Unix epoch for a "YYYY-MM-DD" key (DST-safe). */
function dayNumber(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Math.floor(d.getTime() / 86_400_000)
}

function todayNumber(): number {
  const n = new Date()
  return Math.floor(new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime() / 86_400_000)
}

export interface CyclePosition {
  /** Current week (1-based) once started; null before the start / no start set. */
  week: number | null
  /** Total weeks if an end date is set; null = open-ended. */
  total: number | null
  /** Days until the cycle starts when the start is in the future; else null. */
  startsInDays: number | null
}

/** The cycle's total length in whole weeks, or null when open-ended / unset. */
export function cycleTotalWeeks(cycle: Pick<Cycle, "started_on" | "ended_on">): number | null {
  if (!cycle.started_on || !cycle.ended_on) return null
  const s = dayNumber(cycle.started_on)
  const e = dayNumber(cycle.ended_on)
  if (s === null || e === null || e < s) return null
  return Math.max(1, Math.ceil((e - s) / 7))
}

/** Where "today" falls within the cycle. */
export function cyclePosition(cycle: Pick<Cycle, "started_on" | "ended_on">): CyclePosition {
  const total = cycleTotalWeeks(cycle)
  const s = cycle.started_on ? dayNumber(cycle.started_on) : null
  if (s === null) return { week: null, total, startsInDays: null }
  const t = todayNumber()
  if (t < s) return { week: null, total, startsInDays: s - t }
  return { week: Math.floor((t - s) / 7) + 1, total, startsInDays: null }
}

/** A short label for the header: "Week 3 of 12" / "Week 3" / "Starts in 5 days" /
 *  "No dates set". */
export function formatCyclePosition(pos: CyclePosition): string {
  if (pos.startsInDays !== null) {
    if (pos.startsInDays === 0) return "Starts today"
    return `Starts in ${pos.startsInDays} ${pos.startsInDays === 1 ? "day" : "days"}`
  }
  if (pos.week === null) return "No dates set"
  return pos.total ? `Week ${pos.week} of ${pos.total}` : `Week ${pos.week}`
}

/** "YYYY-MM-DD" + a whole-week count → the end-date key (start + weeks·7). */
export function endDateFromLength(startKey: string, weeks: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startKey)
  if (!m || weeks <= 0) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Math.round(weeks) * 7)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${mo}-${day}`
}

/** Today as a local "YYYY-MM-DD" key. */
export function todayKey(): string {
  const d = new Date()
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mo}-${day}`
}
