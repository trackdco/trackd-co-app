/**
 * THE CYCLES PAGE'S TIMELINE AND STRIPS (build-brief-final §3.10). Which days a
 * cycle is on across a range, the runs a long range draws as smooth bars, the
 * few words a lane shows, and the range labels. Days are counted from today:
 * 0 is today, -7 a week ago.
 *
 * A day is ON when the cycle says so and the compound is not paused that day,
 * so a paused stretch reads as a gap, as it does on Home.
 *
 * Pure: no React, no storage (`code-standards.md`).
 */
import { cyclePauseContext, dayKeyFromNumber, isPausedOn, type Pause } from "@/lib/home/pauses"
import { cyclePeriod, cycleStatusOn, type CycleRule } from "@/lib/protocol/cycleRule"
import { shortDate } from "@/lib/protocol/cyclePage"

export type TimelineZoom = "1m" | "3m" | "1y" | "all"

export const TIMELINE_ZOOMS: { key: TimelineZoom; label: string }[] = [
  { key: "1m", label: "1M" },
  { key: "3m", label: "3M" },
  { key: "1y", label: "1Y" },
  { key: "all", label: "All" },
]

/** Past this many days a lane is drawn as smooth bars, not a cell a day. */
export const SMOOTH_AFTER_DAYS = 60

/** Up to this many cycles get a lane each (with the curve); more are grouped by type. */
export const LANES_MAX = 4

/** The days the list row's strip shows, from today. */
export const STRIP_DAYS = 28

/**
 * The days a zoom shows, `[from, to)` from today. "All" reaches back to the
 * earliest cycle's start when that is further than a year's view.
 */
export function timelineRange(zoom: TimelineZoom, earliestOffset: number | null = null): [number, number] {
  switch (zoom) {
    case "1m":
      return [-7, 23]
    case "3m":
      return [-30, 60]
    case "1y":
      return [-120, 245]
    case "all":
      return [Math.min(-120, earliestOffset ?? -120), 245]
  }
}

/** Local "YYYY-MM-DD" → a day index (UTC arithmetic, as `cycleRule.ts`). */
export function dayIndex(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000)
}

/** The date key `offset` days from `todayKey`. */
export function offsetKey(todayKey: string, offset: number): string {
  const t = dayIndex(todayKey)
  return t === null ? todayKey : dayKeyFromNumber(t + offset)
}

/** Is the cycle's compound dosed on this day: on in the cycle, and not paused? */
export function onOnDay(cycle: CycleRule, pauses: readonly Pause[] | undefined, dateKey: string): boolean {
  if (isPausedOn(pauses, dateKey)) return false
  return cycleStatusOn(cycle, dateKey, cyclePauseContext(pauses, cycle, dateKey)).on
}

/** On or off for each day of `[from, to)`, index 0 = `from`. */
export function onDaysIn(
  cycle: CycleRule,
  pauses: readonly Pause[] | undefined,
  todayKey: string,
  [from, to]: [number, number],
): boolean[] {
  const out: boolean[] = []
  for (let d = from; d < to; d++) out.push(onOnDay(cycle, pauses, offsetKey(todayKey, d)))
  return out
}

/** The runs of on days, as `[start, end)` indexes: one smooth bar each. */
export function onRuns(on: readonly boolean[]): [number, number][] {
  const runs: [number, number][] = []
  let start: number | null = null
  on.forEach((v, i) => {
    if (v && start === null) start = i
    if (!v && start !== null) {
      runs.push([start, i])
      start = null
    }
  })
  if (start !== null) runs.push([start, on.length])
  return runs
}

/**
 * Where the cycle is today, in a few words: "Day 3 of 5", "Week 2 of 8",
 * "Off, 2 days left", "Starts 12 Oct", "On" (a continuous cycle).
 */
export function nowWords(cycle: CycleRule, pauses: readonly Pause[] | undefined, todayKey: string): string {
  const s = cycleStatusOn(cycle, todayKey, cyclePauseContext(pauses, cycle, todayKey))
  if (s.pending) return `Starts ${shortDate(cycle.anchor)}`
  if (s.ended) return "Ended"
  if (cycle.pattern.type !== "onOff" || s.daysLeftInPhase == null) return "On"
  const left = s.daysLeftInPhase
  if (!s.on) return `Off, ${left} ${left === 1 ? "day" : "days"} left`
  const onDays = cycle.pattern.onDays
  const at = onDays - left
  if (onDays >= 14) return `Week ${Math.floor(at / 7) + 1} of ${Math.ceil(onDays / 7)}`
  return `Day ${at + 1} of ${onDays}`
}

/**
 * The next day the cycle turns (on to off, or off to on), within one round,
 * as "26 Sep"; null for a continuous cycle or one about to end.
 */
export function nextTurn(cycle: CycleRule, pauses: readonly Pause[] | undefined, todayKey: string): string | null {
  const period = cyclePeriod(cycle.pattern)
  if (!period) return null
  const today = onOnDay(cycle, pauses, todayKey)
  for (let d = 1; d <= period + 1; d++) {
    const key = offsetKey(todayKey, d)
    const s = cycleStatusOn(cycle, key, cyclePauseContext(pauses, cycle, key))
    if (s.ended) return null
    if (isPausedOn(pauses, key)) continue
    if (s.on !== today) return shortDate(key)
  }
  return null
}

/** How many days before today the earliest cycle began (negative), or null. */
export function earliestOffset(cycles: readonly CycleRule[], todayKey: string): number | null {
  const t = dayIndex(todayKey)
  if (t === null) return null
  let min: number | null = null
  for (const c of cycles) {
    const a = dayIndex(c.anchor)
    if (a === null) continue
    const off = a - t
    if (min === null || off < min) min = off
  }
  return min
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** A range end's label: "18 Sep", with the year ("Sep ’25") on the long views. */
export function rangeEndLabel(todayKey: string, offset: number, span: number): string {
  const key = offsetKey(todayKey, offset)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return key
  const month = MON[Number(m[2]) - 1]
  if (span > 200) return `${month} ’${m[1].slice(2)}`
  return `${Number(m[3])} ${month}`
}
