/**
 * What a user was RUNNING on a given day — pure, no React (`code-standards.md`).
 *
 * "Running" is deliberately not "logged ON THAT DAY" (Adrian, 2026-07-30).
 * Someone on testosterone every third day is still running testosterone on the
 * two days between injections, and a photo taken on one of those days should say
 * so. Reading the dose log per-day answered a different question and quietly
 * under-reported every compound that is not daily.
 *
 * But a schedule alone was too generous in the other direction, and both ways it
 * was wrong made the card claim something the user had not done (Adrian,
 * 2026-07-31, from his own photos):
 *
 *  - A compound ADDED AND DELETED without a single dose ever being taken was
 *    listed under a photo from that stretch. He had never run it.
 *  - A compound added recently was listed under photos from BEFORE he started
 *    taking it, because a schedule's start date is when the plan begins, not
 *    when the run does.
 *
 * So the run is bounded at its start by the FIRST LOGGED DOSE. A compound is
 * running on a day when all four hold:
 *
 *  1. It has been taken at least once, and that first dose was on or before this
 *     day. A plan nobody has acted on is not a run, and no photo predates it.
 *  2. Its protocol had started by then (`startDate <= day`).
 *  3. It was not stopped on that day, per the schedule-version trail. A stopped
 *     stretch is not a rest day; the compound was not being taken at all.
 *  4. It was ON-cycle that day. Off-cycle means the user is not taking it, which
 *     is the same rule `isDueOnFor` applies and the same one that makes
 *     off-cycle compounds vanish from Today's Log.
 *
 * Whether a dose fell on that PARTICULAR day is still not part of it, so the
 * every-third-day case the original rule protects is unchanged.
 *
 * The dose and unit come from `resolveScheduleOn`, so a photo from before a dose
 * change shows the dose that was actually being run then, not today's.
 */

import { categoryRank } from "@/lib/compound-categories"
import { isOnCycle } from "@/lib/protocol/cycleRule"
import type { DayLogs } from "@/lib/home/doseLog"
import { resolveScheduleOn, type StackCompound } from "@/lib/home/stack"

export interface RunningCompound {
  id: string
  name: string
  /** Drives the container's colour. */
  category: string
  /** The route, for resolving which container to draw. */
  method: string
  /** The compound's stated form, when it has one — passed through so this list
   *  draws the same container Home does rather than re-deriving it from name +
   *  route (`supabase/protocol/023`). */
  inventoryForm?: string | null
  /** The dose in force on that day. */
  amount: string
  unit: string
}

/**
 * The day each compound was FIRST logged, or absent when it never was.
 *
 * Exported so a caller can compute it once across a gallery rather than per
 * photo — the log is every day the user has ever recorded.
 */
export function firstLoggedDays(logs: DayLogs): Map<string, string> {
  const first = new Map<string, string>()
  for (const [day, byCompound] of Object.entries(logs)) {
    for (const id of Object.keys(byCompound)) {
      const seen = first.get(id)
      if (seen === undefined || day < seen) first.set(id, day)
    }
  }
  return first
}

/**
 * `dateKey` is a local "YYYY-MM-DD".
 *
 * `logs` bounds each run at its first recorded dose (see the module note) and is
 * REQUIRED. It was briefly optional, defaulting to `{}` "so the preview
 * harnesses can render" — and because an omitted optional argument is not a
 * type error, the block retrospective silently kept calling it with two
 * arguments and got an empty list for every day. "What you ran" quietly became
 * "what you logged inside the window", which is the exact distinction this
 * module exists to make. A required parameter turns that whole class of
 * mistake back into a compile error.
 */
export function compoundsRunningOn(
  stack: StackCompound[],
  dateKey: string,
  logs: DayLogs,
): RunningCompound[] {
  const firstLogged = firstLoggedDays(logs)
  const out: RunningCompound[] = []
  for (const c of stack) {
    // THE RUN STARTS AT THE FIRST DOSE, not at the plan. A compound that has
    // never been taken is a plan, and a photo from before the first dose was
    // taken predates the run. Both readings claimed something the user had not
    // done, which is the one thing a look-back must never do.
    const began = firstLogged.get(c.id)
    if (began === undefined || dateKey < began) continue

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
      inventoryForm: c.inventoryForm,
      amount: String(resolved.dose),
      unit: resolved.unit,
    })
  }
  // Category order, then name inside each. NO headings — the grouping is the
  // ORDER and nothing else (Adrian, 2026-07-31), so anabolics and peptides sit
  // at the top and supplements at the bottom without the list sprouting five
  // labels for what is often five rows.
  return out.sort(
    (a, b) =>
      categoryRank(a.category) - categoryRank(b.category) ||
      a.category.localeCompare(b.category) ||
      a.name.localeCompare(b.name),
  )
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
