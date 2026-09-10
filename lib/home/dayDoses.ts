/**
 * WHICH COMPOUNDS BELONG TO A DAY, AND HOW ITS RING COUNTS THEM.
 *
 * Extracted 2026-09-11 after a cold review found the Dashboard and the desktop
 * rail showing different numbers for the same day, 250px apart on the same
 * screen. The rail said "0/1, 1 dose left" while the Dashboard's ring said
 * "1 of 2".
 *
 * The cause was not a hard bug. It was a SECOND IMPLEMENTATION: the rail was
 * written to answer "what is due today", the Dashboard already answered it, and
 * the two rules disagreed in two places nobody thought about while writing the
 * second one. That is the same failure `nextDose.ts` was extracted to fix, and
 * its header makes the same argument — a rule with two homes has two behaviours
 * eventually, and the divergence is invisible from either site.
 *
 * So the rule lives here now, once, and both surfaces call it. It is pure, so
 * the two cases below are pinned by tests rather than by care.
 *
 * ## THE TWO CASES THE SECOND IMPLEMENTATION GOT WRONG
 *
 * 1. **An archived compound with a log on the day still belongs to it.**
 *    Deleting a compound stops future doses and KEEPS every dose already logged
 *    (Spec 02, Invariant 8: archive, never hard-delete history). So the log for
 *    a day you took it has to keep showing it, and the ring has to keep counting
 *    it, or the day silently loses a dose the moment you tidy your protocol. The
 *    archived test has to come SECOND, after the log test.
 *
 * 2. **A historic slot counts.** `slotsForDay` appends slots that are no longer
 *    scheduled but carry a log — a dose genuinely taken under an older, longer
 *    schedule. Dropping from three doses a day to two does not un-take this
 *    morning's third one. Filtering them out makes a day that was complete read
 *    as incomplete.
 *
 * Both errors ran the same direction: they made the day look emptier than it
 * was, on the surface whose entire justification is being the always-present
 * answer to "what is still outstanding".
 */

import { loggedCountFor, type DaySlot } from "@/lib/home/doseLog"
import type { DoseLog } from "@/lib/home/mockHomeData"
import { isDueOnFor, type StackCompound } from "@/lib/home/stack"

/**
 * Does this compound belong in the day's log at all?
 *
 * The three tests, in this order and no other. `HomeScreen` adds a fourth
 * branch after this one for paused STACK MEMBERS, which stay visible inside
 * their stack's row rather than moving to the Paused section; that is a display
 * concern with no effect on the ring (they are filtered out again before
 * counting), which is why it is not here.
 *
 * @param dayRows the logs for THIS day only, keyed by `slotKey`
 * @param date    the day as a Date, for the schedule resolution
 */
export function belongsInDayLog(
  compound: StackCompound,
  dayRows: Record<string, DoseLog> | undefined,
  date: Date,
): boolean {
  // A log is evidence and it outranks everything below. See case 1 above.
  if (loggedCountFor(dayRows, compound.id) > 0) return true
  if (compound.archived) return false
  return isDueOnFor(compound, date)
}

/** One compound's contribution to a day, as the ring counts it. */
export interface DayEntry {
  id: string
  category: string
  /** Paused on this day. Kept for display, never counted. */
  paused: boolean
  /** Every slot, INCLUDING historic ones. See case 2 above. */
  slots: DaySlot[]
}

export interface DayCounts {
  /** Dose slots due, in DOSES not compounds. */
  due: number
  /** Of those, how many carry a log. */
  logged: number
  /** One dot per countable slot, for the ring's category legend. */
  dots: { id: string; category: string; logged: boolean }[]
}

/**
 * The ring's arithmetic, over entries that already belong to the day.
 *
 * DOSES, not compounds: a compound due twice a day contributes two, or a ring
 * would read 100% with the evening dose still untaken.
 *
 * A PAUSED compound contributes nothing. It is not due, so counting it would
 * park an unloggable dose in the denominator and hold the day permanently
 * below 100%.
 */
export function ringCounts(entries: readonly DayEntry[]): DayCounts {
  const countable = entries.filter((e) => !e.paused)
  const dots = countable.flatMap((e) =>
    e.slots.map((s) => ({
      id: `${e.id}#${s.slot}`,
      category: e.category,
      logged: s.log != null,
    })),
  )
  return {
    due: dots.length,
    logged: dots.filter((d) => d.logged).length,
    dots,
  }
}
