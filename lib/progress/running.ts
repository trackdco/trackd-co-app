/**
 * What a user was RUNNING on a given day — pure, no React (`code-standards.md`).
 *
 * "Running" is deliberately not "logged" (Adrian, 2026-07-30). Someone on
 * testosterone every third day is still running testosterone on the two days
 * between injections, and a photo taken on one of those days should say so. The
 * first build of the Progress photo card read the dose LOG, which answered a
 * different question and quietly under-reported every compound that is not
 * daily.
 *
 * So a compound is running on a day when all three hold:
 *
 *  1. Its protocol had started by then (`startDate <= day`), so a compound added
 *     afterwards never appears under an older photo.
 *  2. It was not stopped on that day, per the schedule-version trail. A stopped
 *     stretch is not a rest day; the compound was not being taken at all.
 *  3. It was ON-cycle that day. Off-cycle means the user is not taking it, which
 *     is the same rule `isDueOnFor` applies and the same one that makes
 *     off-cycle compounds vanish from Today's Log.
 *
 * Whether a DOSE fell on that particular day is not part of it.
 *
 * The dose and unit come from `resolveScheduleOn`, so a photo from before a dose
 * change shows the dose that was actually being run then, not today's.
 */

import { isOnCycle } from "@/lib/protocol/cycleRule"
import { resolveScheduleOn, type StackCompound } from "@/lib/home/stack"

export interface RunningCompound {
  id: string
  name: string
  /** Drives the container's colour. */
  category: string
  /** The route, for resolving which container to draw. */
  method: string
  /** The dose in force on that day. */
  amount: string
  unit: string
}

/** `dateKey` is a local "YYYY-MM-DD". */
export function compoundsRunningOn(
  stack: StackCompound[],
  dateKey: string,
): RunningCompound[] {
  const out: RunningCompound[] = []
  for (const c of stack) {
    // `archived` carries no date, so it can only be read as "not running now".
    // Applying it to a past day would erase a compound from history the moment
    // it was archived, which is the retroactive rewrite spec 01 exists to stop.
    //
    // KNOWN LIMIT: deleting normally writes a `stopped` version, which bounds
    // the compound in time properly. A legacy record or a failed stop-write has
    // no such bound, so it reads as running for every past day. Preferred over
    // the alternative, which is erasing it from days it genuinely covered.
    if (c.archived && dateKey >= todayish()) continue

    const resolved = resolveScheduleOn(c, dateKey)
    if (resolved.stopped) continue
    if (resolved.schedule.startDate && dateKey < resolved.schedule.startDate) continue
    // No CycleContext: the only end condition that needs one is "until the vial
    // empties", which is withheld behind VIAL_END_SUPPORTED and cannot be set.
    // If that ships, this call needs the vial-empty date threading through it.
    if (!isOnCycle(resolved.cycle, dateKey)) continue

    out.push({
      id: c.id,
      name: c.name,
      category: c.category,
      method: c.method,
      amount: String(resolved.dose),
      unit: resolved.unit,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Today, as a local date key. Only used to decide whether `archived` applies:
 * an archived compound is hidden from today onward and left alone in the past.
 */
function todayish(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
