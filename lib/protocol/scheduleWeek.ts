/**
 * Stepping the Schedule grid back through past weeks (Adrian, 2026-09-03).
 *
 * Pure, no React (`code-standards.md`). Everything here is a QUERY over records
 * the protocol already keeps; nothing is stored and nothing is back-filled.
 *
 * The load-bearing fact is that **Delete is dated**. `archiveInStack` sets the
 * undated `archived` flag AND writes a `stopped` schedule version stamped with
 * the day it happened, so `resolveScheduleOn(c, key).stopped` answers "was this
 * being run on that day" correctly for any day in the past. Row membership below
 * uses THAT and never `archived`: gating a history view on the current flag
 * would erase a deleted compound from every week it ever ran in, which is the
 * one thing a look-back must not do.
 */

import { isPausedOn } from "@/lib/home/pauses"
import {
  isCycleEnded,
  isDueOnFor,
  resolveScheduleOn,
  type StackCompound,
} from "@/lib/home/stack"
import { dateKeyToDate, toDateKey } from "@/lib/home/mockHomeData"
import type { DayLogs } from "@/lib/home/doseLog"

const DAY_MS = 86_400_000

/** The Monday of the week containing `dateKey`. Weeks are Monday-first, which
 *  is what the grid has always drawn. */
export function mondayOf(dateKey: string): string {
  const d = dateKeyToDate(dateKey)
  // getDay() is 0-Sunday; shift so Monday is 0.
  const shift = (d.getDay() + 6) % 7
  return toDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - shift))
}

/** The seven dates of the week starting at `mondayKey`. */
export function weekDaysFrom(mondayKey: string): Date[] {
  const d = dateKeyToDate(mondayKey)
  return Array.from(
    { length: 7 },
    (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + i),
  )
}

/** `mondayKey` shifted by whole weeks; negative goes back. */
export function shiftWeeks(mondayKey: string, weeks: number): string {
  const d = dateKeyToDate(mondayKey)
  return toDateKey(
    new Date(d.getFullYear(), d.getMonth(), d.getDate() + weeks * 7),
  )
}

/** Whole days between two keys, b − a. */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (dateKeyToDate(b).getTime() - dateKeyToDate(a).getTime()) / DAY_MS,
  )
}

/**
 * The earliest day the user has any dose logged, or null when they have none.
 *
 * This is the floor for stepping back on Protocol (Adrian, 2026-09-03): "it
 * should go back to the first dose someone does". The log is keyed by date, so
 * the earliest key IS the answer and no scan of the protocol is needed.
 *
 * Weeks between that day and now with nothing in them render empty, which is
 * correct rather than an error: a dose of creatine three years ago earns three
 * years of steppable history, most of it blank.
 */
export function firstLoggedDay(logs: DayLogs): string | null {
  let earliest: string | null = null
  for (const key of Object.keys(logs)) {
    // A day whose entry exists but holds nothing is not a dose.
    if (!logs[key] || Object.keys(logs[key]).length === 0) continue
    if (earliest === null || key < earliest) earliest = key
  }
  return earliest
}

/**
 * The earliest week the grid may step back to.
 *
 * `blockStart` scopes it to a block, which stops at the block's own start: the
 * window is the scope, and stepping out of it would be the grid disagreeing with
 * the header above it. Without one it is the user's first logged dose, and with
 * neither there is no history to walk, so the current week is the floor.
 */
export function historyFloor(
  logs: DayLogs,
  todayKey: string,
  blockStart?: string | null,
): string {
  if (blockStart) return mondayOf(blockStart)
  const first = firstLoggedDay(logs)
  return mondayOf(first ?? todayKey)
}

/** True when the compound carries a DATED record of having been stopped, i.e.
 *  when its history can place a delete on a day. */
function hasDatedStop(c: StackCompound): boolean {
  return (c.scheduleHistory ?? []).some((v) => v.stopped === true)
}

/**
 * Was the compound being run on this day? Dated, so it stays true for days
 * before a delete.
 *
 * Four gates, and the last two exist because the first version of this shipped
 * without them and put phantom rows in the CURRENT week:
 *
 *  1. The run had begun (its earliest recorded start is on or before the day).
 *  2. No `stopped` version was in force.
 *  3. **Its cycle had not ended by then.** Spec 06 says a compound whose cycle
 *     has ended behaves exactly like a deleted one, and `isRunning` gates on it.
 *     Handing this module the full stack without re-applying the gate gave an
 *     ended compound a permanent row of seven blank cells, which is precisely
 *     the bug `ProtocolScreen` had already been fixed for once.
 *  4. **A delete with no dated trail stops TODAY.** The dated `stopped` version
 *     is what makes history answerable, but it is not guaranteed to exist: a
 *     compound pulled from the cloud carries no schedule history, and
 *     `pushScheduleVersions` no-ops against a database without the versions
 *     table. Archived with no dated stop therefore means "deleted, date
 *     unknown", and the honest reading is that it ran until now: past weeks keep
 *     their rows, and the current week stops claiming doses are due for a
 *     compound the user has deleted.
 */
export function wasRunningOn(
  c: StackCompound,
  dateKey: string,
  todayKey: string,
): boolean {
  const resolved = resolveScheduleOn(c, dateKey)
  if (resolved.stopped) return false
  if (resolved.schedule.startDate > dateKey) return false
  if (isCycleEnded(c, dateKey)) return false
  if (c.archived && !hasDatedStop(c) && dateKey >= todayKey) return false
  return true
}

/**
 * The compounds that earn a row in this week.
 *
 * **Membership is decided per WEEK, not per day** (Adrian, 2026-09-03): a
 * compound stopped on the Wednesday keeps its row for the rest of that week and
 * is gone from the next one. Half a row would be the honest per-day answer and
 * the wrong thing to look at, because the row is a week's worth of marks and a
 * compound that ran for three days of it did run that week.
 *
 * Order is the caller's; grouping into categories stays in the grid.
 */
export function compoundsInWeek(
  compounds: StackCompound[],
  weekDays: Date[],
  todayKey: string,
): StackCompound[] {
  const keys = weekDays.map(toDateKey)
  return compounds.filter((c) => keys.some((k) => wasRunningOn(c, k, todayKey)))
}

/** What a single day/compound mark shows. `paused` is new: the protocol has
 *  always had explicit pauses, and the grid has never been able to say so. */
export type WeekCellState = "none" | "due" | "logged" | "missed" | "paused"

/**
 * The mark for one compound on one day.
 *
 * `paused` sits ABOVE the due check for the same reason `isDueOnFor` puts it
 * there: a paused day was never due, so it can be neither missed nor logged, and
 * showing it as a plain rest day loses the one fact the row is there to carry.
 */
export function weekCellState(
  c: StackCompound,
  date: Date,
  logs: DayLogs,
  todayKey: string,
): WeekCellState {
  const key = toDateKey(date)
  // A day outside the run is blank rather than paused: nothing to pause.
  if (!wasRunningOn(c, key, todayKey)) return "none"
  if (isPausedOn(c.pauses, key)) return "paused"
  if (!isDueOnFor(c, date)) return "none"
  if (logs[key]?.[c.id]) return "logged"
  return key < todayKey ? "missed" : "due"
}

/**
 * The week's tally, for the line under the grid.
 *
 * `due` counts only doses that have ALREADY come due, i.e. logged plus missed. A
 * dose scheduled for Friday is not something you are behind on on Tuesday, and
 * counting the whole week's schedule against what has been logged so far
 * reported "1 of 7 logged" on a Tuesday and made the user look six doses down
 * when five had not happened yet. This is the same reasoning that keeps paused
 * doses out of the figure.
 *
 * `pausedDays` is DAYS, and named so, because it cannot honestly be doses: a
 * pause covers a stretch of the calendar and only some of those days would have
 * carried a dose. Reporting it as a bare number beside a dose count implied one
 * unit while measuring another.
 */
export function weekTally(
  compounds: StackCompound[],
  weekDays: Date[],
  logs: DayLogs,
  todayKey: string,
): { logged: number; due: number; pausedDays: number } {
  let logged = 0
  let due = 0
  const pausedKeys = new Set<string>()
  for (const c of compounds) {
    for (const d of weekDays) {
      const state = weekCellState(c, d, logs, todayKey)
      if (state === "paused") pausedKeys.add(toDateKey(d))
      // Only what has come due. A future "due" mark is a plan, not a shortfall.
      if (state === "logged") {
        logged += 1
        due += 1
      } else if (state === "missed") {
        due += 1
      }
    }
  }
  return { logged, due, pausedDays: pausedKeys.size }
}

/* ------------------------------------------------------------------ labels */

/** Roughly a month, in days. Used to round a week COUNT into months rather than
 *  doing calendar arithmetic, because the label is orientation and the exact
 *  answer is already on screen: the date range beneath it. */
const DAYS_PER_MONTH = 30.44

/**
 * How long ago a week was, in words.
 *
 * The unit widens as you go back, because "97 weeks ago" is a number nobody can
 * picture (Adrian, 2026-09-03). Weeks up to twelve, then months, then years, so
 * a step back through three years reads as a scale rather than a tally.
 *
 * The label is DELIBERATELY approximate and the precise answer sits directly
 * under it: the week's own date range. "3 months ago" orients you, "11 to 17
 * Jun" is the fact. That division is why rounding here is safe.
 */
export function relativeWeekLabel(monday: string, thisMonday: string): string {
  const days = daysBetween(monday, thisMonday)
  const weeks = Math.round(days / 7)
  if (weeks <= 0) return "This week"
  if (weeks === 1) return "Last week"
  // Twelve is Adrian's cut: at twelve weeks the answer people want is "about
  // three months", not a count.
  if (weeks < 12) return `${weeks} weeks ago`

  const months = Math.round(days / DAYS_PER_MONTH)
  if (months < 12) return `${months} months ago`

  const years = Math.round(months / 12)
  return years === 1 ? "1 year ago" : `${years} years ago`
}
