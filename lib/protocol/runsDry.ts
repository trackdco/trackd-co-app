/**
 * When a compound's stock runs dry: walk forward from today over the days a
 * dose is actually DUE, spending the doses held, and stop at the first due day
 * that cannot be covered (build brief §5, item 3).
 *
 * The view's `days_to_empty` divides doses by an average week, which cannot see
 * that Mon/Thu from a Wednesday runs out on a Monday, that a 5-on/2-off cycle
 * rests, or that a pause resumes on a given day. Which days are due is the
 * schedule model's answer (`isDueOnFor`: cadence, cycle, pauses, the resume
 * re-anchor, schedule versions), so this asks it rather than re-deriving it,
 * here or in SQL. The doses HELD are the view's (`v_compound_stock`); nothing
 * about the stock is recomputed.
 *
 * Pure: no React, no storage (code-standards.md).
 */
import { toDateKey, dateKeyToDate } from "@/lib/home/mockHomeData"
import {
  isDueOnFor,
  resolveScheduleOn,
  timesPerDayOf,
  type StackCompound,
} from "@/lib/home/stack"

/** How far ahead to look. Past this there is no useful "runs dry" to show. */
export const RUNS_DRY_HORIZON_DAYS = 730

/**
 * Days from `todayKey` to the day the stock runs dry: 0 = today's dose cannot
 * be covered. Null when nothing is held (`dosesReady` null), or when no due day
 * within the horizon runs short — an indefinitely paused or ended compound
 * never does, and a pause has no runway (`supabase/protocol/019`).
 *
 * `takenToday` is how many of today's doses are already logged: those came out
 * of stock already (the view subtracts them), so only today's remaining slots
 * are still to spend.
 */
export function runsDryInDays(
  compound: StackCompound,
  dosesReady: number | null,
  todayKey: string,
  takenToday = 0,
): number | null {
  if (dosesReady == null || !Number.isFinite(dosesReady)) return null
  let left = Math.max(0, Math.floor(dosesReady))
  const start = dateKeyToDate(todayKey)
  for (let d = 0; d <= RUNS_DRY_HORIZON_DAYS; d++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d)
    if (!isDueOnFor(compound, date)) continue
    const slots = timesPerDayOf(resolveScheduleOn(compound, toDateKey(date)).schedule)
    const need = d === 0 ? Math.max(0, slots - takenToday) : slots
    if (need > left) return d
    left -= need
  }
  return null
}
