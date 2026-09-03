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
import { slotsForDay, type DayLogs } from "@/lib/home/doseLog"

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

/**
 * True when the compound's history can date the delete it is currently carrying,
 * i.e. when its LATEST version is a stop.
 *
 * Deliberately not `.some(v => v.stopped)`, which asks "was it ever stopped".
 * A compound deleted, re-added and deleted again would satisfy that from the
 * OLD stop while its current archive has no dated record at all, so the
 * fallback below would never fire for it.
 */
function hasDatedStop(c: StackCompound): boolean {
  const versions = c.scheduleHistory ?? []
  if (versions.length === 0) return false
  const latest = versions.reduce((a, b) =>
    b.effectiveFrom >= a.effectiveFrom ? b : a,
  )
  return latest.stopped === true
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

/** One day's doses for one compound: how many were due, and how many were
 *  actually taken. A skip is NOT taken. */
function dayDoses(
  c: StackCompound,
  key: string,
  logs: DayLogs,
): { due: number; taken: number } {
  const slots = slotsForDay(c, key, logs[key])
  // `status !== "skipped"` is the same test `lib/progress/consistency.ts` uses,
  // and it is the whole point: a SKIPPED dose is due-and-not-taken. A bare
  // truthiness check on the log counted it as taken, so a week of skips drew
  // seven solid marks and claimed perfect adherence, which is exactly what that
  // module's own comment says must never happen.
  const taken = slots.filter((s) => s.log != null && s.log.status !== "skipped").length
  return { due: slots.length, taken }
}

/**
 * The mark for one compound on one day.
 *
 * `paused` sits ABOVE the due check for the same reason `isDueOnFor` puts it
 * there: a paused day was never due, so it can be neither missed nor logged, and
 * showing it as a plain rest day loses the one fact the row is there to carry.
 *
 * A compound with more than one dose a day resolves to "logged" only when EVERY
 * slot was taken. Reading `logs[key][c.id]` judged the day on slot 0 alone, so
 * someone who logged their evening dose every day for a week and skipped no
 * mornings still read as having missed all seven: `slotKey` leaves slot 0
 * unsuffixed and puts later doses at `id#1`, so the morning was the only one
 * the check could ever see. `slotsForDay` is the same resolver Home and
 * consistency use.
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
  const { due, taken } = dayDoses(c, key, logs)
  if (due > 0 && taken >= due) return "logged"
  if (taken > 0) return key < todayKey ? "missed" : "due"
  return key < todayKey ? "missed" : "due"
}

/** Every mark in the week, plus the week's figures, from a SINGLE pass.
 *
 *  The states and the tally used to be computed separately, which meant
 *  `weekCellState` ran twice for every cell, and each call costs three
 *  `resolveScheduleOn` calls (its own, `isCycleEnded`'s and `isDueOnFor`'s),
 *  each of which copies and sorts `scheduleHistory`. Measured at 25 compounds
 *  with 24 versions each: 1100 sorts and 20ms per render, on a component that
 *  re-renders on every dose-log notification and is collapsed by default. */
export interface WeekMatrix {
  /** Compound id → its seven marks, in week order. */
  states: Map<string, WeekCellState[]>
  /** Doses TAKEN, counting a skip as not taken. */
  logged: number
  /**
   * Doses that have come due. Counted in SLOTS, so a twice-daily compound
   * contributes two a day, which is what makes this agree with the consistency
   * figure on `/progress` rather than quietly disagreeing with it.
   *
   * A dose scheduled for Friday is not something you are behind on on Tuesday,
   * so days after today contribute only what was actually logged: counting the
   * whole week's plan reported "1 of 7 logged" on a Tuesday.
   */
  due: number
  /** DAYS on which something was paused, and named so: a pause covers calendar
   *  days and only some of them would have carried a dose, so this cannot
   *  honestly be a dose count. */
  pausedDays: number
}

export function weekMatrix(
  compounds: StackCompound[],
  weekDays: Date[],
  logs: DayLogs,
  todayKey: string,
): WeekMatrix {
  const states = new Map<string, WeekCellState[]>()
  const pausedKeys = new Set<string>()
  let logged = 0
  let due = 0

  for (const c of compounds) {
    const row: WeekCellState[] = []
    for (const d of weekDays) {
      const key = toDateKey(d)
      const state = weekCellState(c, d, logs, todayKey)
      row.push(state)
      if (state === "paused") {
        pausedKeys.add(key)
        continue
      }
      if (state === "none") continue
      const counts = dayDoses(c, key, logs)
      logged += counts.taken
      due += key < todayKey ? counts.due : counts.taken
    }
    states.set(c.id, row)
  }
  return { states, logged, due, pausedDays: pausedKeys.size }
}

/* ------------------------------------------------------------------ labels */

/** Roughly a month, in days. Used to round a week COUNT into months rather than
 *  doing calendar arithmetic, because the label is orientation and the exact
 *  answer is already on screen: the date range beneath it. */
const DAYS_PER_MONTH = 30.44
/** Including the leap-year quarter, so a whole number of years lands exactly. */
const DAYS_PER_YEAR = 365.25

/**
 * How long ago a week was, in words.
 *
 * The unit widens as you go back, because "97 weeks ago" is a number nobody can
 * picture. Weeks up to twelve, then months, then a year plus its remainder:
 * "1 year and 1 week ago", "1 year and 6 months ago" (Adrian, 2026-09-03).
 *
 * The remainder is what makes the year rung usable. Rounding into whole years
 * blurred everything from 51 to 76 weeks into "1 year ago", and months alone
 * gave "23 months ago", which is precise and reads like an arithmetic problem.
 * Carrying the remainder keeps both: the year you can picture, and the part of
 * it you are into.
 *
 * The label is DELIBERATELY approximate and the precise answer sits directly
 * under it: the week's own date range. That division is why rounding is safe.
 */
export function relativeWeekLabel(monday: string, thisMonday: string): string {
  const days = daysBetween(monday, thisMonday)
  const weeks = Math.round(days / 7)
  if (weeks <= 0) return "This week"
  if (weeks === 1) return "Last week"
  // Twelve is Adrian's cut: at twelve weeks the answer people want is "about
  // three months", not a count.
  if (weeks < 12) return `${weeks} weeks ago`

  const totalMonths = Math.round(days / DAYS_PER_MONTH)
  if (totalMonths < 12) return `${totalMonths} months ago`

  // Split via total MONTHS rather than by dividing days twice, so the year and
  // its remainder can never disagree (a separately rounded remainder produced
  // "1 year and 12 months ago").
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  const yearPart = years === 1 ? "1 year" : `${years} years`
  if (months > 0) {
    return `${yearPart} and ${months} ${months === 1 ? "month" : "months"} ago`
  }

  // Under a month past the year, so weeks are the only useful remainder. Clamped
  // at zero: 364 days rounds to twelve months while sitting just SHORT of a
  // year, and a negative remainder would read as a week in the future.
  const pastYear = Math.max(0, days - years * DAYS_PER_YEAR)
  const remWeeks = Math.round(pastYear / 7)
  if (remWeeks > 0) {
    return `${yearPart} and ${remWeeks} ${remWeeks === 1 ? "week" : "weeks"} ago`
  }
  return `${yearPart} ago`
}
