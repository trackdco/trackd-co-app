/**
 * THE CYCLES PAGE'S TIMELINE AND STRIPS (build-brief-final §3.10). Which days a
 * cycle is on across a range, the runs a long range draws as smooth bars, the
 * few words a lane shows, the range labels, the one grouping by type the list
 * and the Timeline share, and what a scrub reads. Days are counted from today:
 * 0 is today, -7 a week ago.
 *
 * A day is ON when the cycle says so and the compound is not paused that day,
 * so a paused stretch reads as a gap, as it does on Home.
 *
 * Pure: no React, no storage (`code-standards.md`).
 */
import {
  CATEGORY_DISPLAY_ORDER,
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
  type CompoundCategory,
} from "@/lib/compound-categories"
import { PRESS_SLOP_PX } from "@/lib/feel/press"
import { activePause, cyclePauseContext, dayKeyFromNumber, isPausedOn, type Pause } from "@/lib/home/pauses"
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

/** How long a finger rests on a lane before it scrubs (W48). Shorter is a tap,
 *  which opens the lane as before. */
export const HOLD_TO_SCRUB_MS = 280

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
 * "Off, 2 days left", "Starts 12 Oct", "Paused", "On" (a continuous cycle).
 *
 * A compound paused today reads "Paused" (cold review B22): the lane draws
 * today as a gap, and the pause holds the cycle's clock, so "Day 4 of 5" would
 * name a day that is not being run. A cycle that has not started, or has
 * ended, says so first: that is the more useful fact.
 */
export function nowWords(cycle: CycleRule, pauses: readonly Pause[] | undefined, todayKey: string): string {
  const s = cycleStatusOn(cycle, todayKey, cyclePauseContext(pauses, cycle, todayKey))
  if (s.pending) return `Starts ${shortDate(cycle.anchor)}`
  if (s.ended) return "Ended"
  if (isPausedOn(pauses, todayKey)) return "Paused"
  if (cycle.pattern.type !== "onOff" || s.daysLeftInPhase == null) return "On"
  const left = s.daysLeftInPhase
  if (!s.on) return `Off, ${left} ${left === 1 ? "day" : "days"} left`
  const onDays = cycle.pattern.onDays
  const at = onDays - left
  if (onDays >= 14) return `Week ${Math.floor(at / 7) + 1} of ${Math.ceil(onDays / 7)}`
  return `Day ${at + 1} of ${onDays}`
}

/** How far past a pause `nextTurn` looks: a pause longer than this reads as no turn. */
const TURN_LOOKAHEAD_DAYS = 730

/**
 * The next day the cycle turns (on to off, or off to on), within one round of
 * days that are not paused, as "26 Sep"; null for a continuous cycle, one
 * about to end, or one paused with no end in sight. Paused days are stepped
 * over and do not use up the round, so a pause longer than a round still finds
 * the day it comes back.
 */
export function nextTurn(cycle: CycleRule, pauses: readonly Pause[] | undefined, todayKey: string): string | null {
  const period = cyclePeriod(cycle.pattern)
  if (!period) return null
  const today = onOnDay(cycle, pauses, todayKey)
  let counted = 0
  for (let d = 1; d <= TURN_LOOKAHEAD_DAYS && counted <= period; d++) {
    const key = offsetKey(todayKey, d)
    const s = cycleStatusOn(cycle, key, cyclePauseContext(pauses, cycle, key))
    if (s.ended) return null
    if (isPausedOn(pauses, key)) continue
    counted++
    if (s.on !== today) return shortDate(key)
  }
  return null
}

/**
 * The open lane's second row (W30): when the cycle next turns, as a label and
 * a date. "Off from 29 Sep" while it is on; "Back on 27 Sep" while it is off
 * or paused. Null when nothing turns (a continuous cycle, one about to end, one
 * paused with no end) and before it starts (the first row already says
 * "Starts 12 Oct").
 */
export function turnRow(
  cycle: CycleRule,
  pauses: readonly Pause[] | undefined,
  todayKey: string,
): { label: string; date: string } | null {
  if (cycleStatusOn(cycle, todayKey, cyclePauseContext(pauses, cycle, todayKey)).pending) return null
  const date = nextTurn(cycle, pauses, todayKey)
  if (!date) return null
  return { label: onOnDay(cycle, pauses, todayKey) ? "Off from" : "Back on", date }
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

/* ------------------------------------------------------------ by type */

/** The key of the group every cycle whose compound is paused today sits in. */
export const PAUSED_GROUP = "paused"
/** The key of the group a cycle of an unknown type sits in (stale storage). */
export const OTHER_GROUP = "other"

export interface CycleTypeGroup<T> {
  /** A type, "other" (a type this build does not know), or "paused". */
  key: CompoundCategory | typeof OTHER_GROUP | typeof PAUSED_GROUP
  /** "Anabolics", "Peptides", ..., "Other", "Paused". */
  label: string
  /** The type, for its mark and colour; null for Other and Paused. */
  category: CompoundCategory | null
  items: T[]
}

/** Is the compound paused today? The one test the list and the Timeline share. */
export function pausedToday(pauses: readonly Pause[] | undefined, todayKey: string): boolean {
  return activePause(pauses, todayKey) !== null
}

/**
 * THE CYCLES PAGE'S ONE GROUPING (cold review D6, W31): the list card and the
 * Timeline both group by it, so they name the same types with the same counts.
 * Running cycles by type, in `CATEGORY_DISPLAY_ORDER` (anabolics and peptides
 * first, by consequence, never by count); a type this build does not know under
 * "Other" rather than dropped; and every cycle whose compound is paused today
 * LAST, under "Paused", out of its type. Each group keeps its items' order.
 */
export function cycleTypeGroups<T>(
  items: readonly T[],
  categoryOf: (item: T) => string,
  pausedOf: (item: T) => boolean,
): CycleTypeGroup<T>[] {
  const by = new Map<string, T[]>()
  const paused: T[] = []
  const other: T[] = []
  for (const item of items) {
    if (pausedOf(item)) {
      paused.push(item)
      continue
    }
    const k = categoryOf(item)
    if (!(CATEGORY_DISPLAY_ORDER as string[]).includes(k)) {
      other.push(item)
      continue
    }
    by.set(k, [...(by.get(k) ?? []), item])
  }
  const out: CycleTypeGroup<T>[] = CATEGORY_DISPLAY_ORDER.filter((k) => by.has(k)).map((k) => ({
    key: k,
    label: CATEGORY_META[k].label,
    category: k,
    items: by.get(k)!,
  }))
  if (other.length) out.push({ key: OTHER_GROUP, label: FALLBACK_CATEGORY_META.label, category: null, items: other })
  if (paused.length) out.push({ key: PAUSED_GROUP, label: "Paused", category: null, items: paused })
  return out
}

/* ------------------------------------------------------------ the scrub */

/**
 * Where a scrub stands (W35): `frac` (0 to 1) across the range `[from, to)` →
 * the day under it (from today) and the moment, in hours from the start of
 * today. The Today line marks the start of today, so the moment on it is 0.
 */
export function scrubAt(frac: number, [from, to]: [number, number]): { day: number; hours: number } {
  const f = Number.isFinite(frac) ? Math.min(1, Math.max(0, frac)) : 0
  const at = from + f * (to - from)
  return { day: Math.max(from, Math.min(to - 1, Math.floor(at))), hours: at * 24 }
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`

/**
 * How far a scrubbed moment is from now, in a few words (W35): "Now", "In 5
 * hours", "3 hours ago" within a day of now; then by calendar day, "Tomorrow",
 * "Yesterday", "In 3 days", "4 days ago"; then "In 3 weeks", "In 4 months",
 * "2 years ago" on the long views, where a finger moves a day a pixel and a
 * count of days would flicker. The date beside it keeps the exact day.
 *
 * `hours` is the moment from the start of today (`scrubAt`), `nowHours` the
 * time now from the start of today, `day` the calendar day under the finger.
 */
export function scrubWords(hours: number, nowHours: number, day: number): string {
  const dh = hours - nowHours
  const a = Math.abs(dh)
  if (!Number.isFinite(a) || a < 1) return "Now"
  if (a < 24 || day === 0) {
    const n = Math.min(23, Math.max(1, Math.round(a)))
    return dh > 0 ? `In ${plural(n, "hour")}` : `${plural(n, "hour")} ago`
  }
  const d = Math.abs(day)
  const ahead = day > 0
  if (d === 1) return ahead ? "Tomorrow" : "Yesterday"
  const words =
    d < 14
      ? plural(d, "day")
      : d < 56
        ? plural(Math.round(d / 7), "week")
        : d < 365
          ? plural(Math.max(2, Math.round(d / 30.44)), "month")
          : plural(Math.max(1, Math.round(d / 365.25)), "year")
  return ahead ? `In ${words}` : `${words} ago`
}

/** The scrubbed day's date: "29 Sep", with the year when it is not this year's. */
export function scrubDate(todayKey: string, day: number): string {
  const key = offsetKey(todayKey, day)
  const label = shortDate(key)
  return key.slice(0, 4) === todayKey.slice(0, 4) ? label : `${label} ${key.slice(0, 4)}`
}

/** Hours from the start of the day to `now`, local time. */
export function hoursIntoDay(now: Date): number {
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600
}

/* ------------------------------------------------ press, hold and scrub */

/** A click this soon after a scrub ends is its release, not a tap. */
export const SCRUB_TAP_GUARD_MS = 400

/**
 * The lanes' press-and-hold gesture (W48), as a state: nothing, a finger
 * resting on a lane (`pressing`), or a scrub under way. `endedAt` is when the
 * last scrub ended, so the click its release makes can be told from a tap.
 */
export type ScrubGesture =
  | { phase: "idle"; endedAt: number }
  | { phase: "pressing"; lane: string; pointerId: number; x0: number; y0: number; x: number; endedAt: number }
  | { phase: "scrubbing"; lane: string; pointerId: number; x: number; endedAt: number }

export const SCRUB_IDLE: ScrubGesture = { phase: "idle", endedAt: Number.NEGATIVE_INFINITY }

export type ScrubInput =
  /** A pointer went down on `lane` (null: not on a lane). `primary`: a touch,
   *  a pen, or the main mouse button. */
  | { type: "down"; lane: string | null; pointerId: number; x: number; y: number; primary: boolean }
  /** The finger rested for `HOLD_TO_SCRUB_MS`. */
  | { type: "hold" }
  | { type: "move"; pointerId: number; x: number; y: number }
  /** The pointer lifted or was cancelled, at `at` (ms). */
  | { type: "end"; pointerId: number; at: number }
  /** A pointer capture ended. `own`: the lanes' own, not a child's bubbling up. */
  | { type: "lost"; pointerId: number; own: boolean; at: number }
  /** The pointer left the lanes. */
  | { type: "leave"; pointerId: number; at: number }

function finishScrub(g: ScrubGesture, pointerId: number, at: number): ScrubGesture {
  if (g.phase === "idle" || pointerId !== g.pointerId) return g
  return { phase: "idle", endedAt: g.phase === "scrubbing" ? at : g.endedAt }
}

/**
 * One step of the gesture. A press on a lane waits for the hold; moving past
 * the slop first is a scroll, and lifting first is a tap (the lane's own click
 * opens it). Once held, it scrubs until the finger lifts: moves only move it.
 * A capture lost by a CHILD is ignored (a touch is captured by what it landed
 * on until the scrub takes the capture, and that child's "lost" bubbles up the
 * moment the scrub starts); leaving the lanes ends only a press, never a scrub.
 * Other pointers never touch it. Returns `g` itself when nothing changes.
 */
export function scrubStep(g: ScrubGesture, e: ScrubInput, slop = PRESS_SLOP_PX): ScrubGesture {
  switch (e.type) {
    case "down":
      if (g.phase !== "idle" || !e.primary || !e.lane) return g
      return { phase: "pressing", lane: e.lane, pointerId: e.pointerId, x0: e.x, y0: e.y, x: e.x, endedAt: g.endedAt }
    case "hold":
      if (g.phase !== "pressing") return g
      return { phase: "scrubbing", lane: g.lane, pointerId: g.pointerId, x: g.x, endedAt: g.endedAt }
    case "move":
      if (g.phase === "idle" || e.pointerId !== g.pointerId) return g
      if (g.phase === "scrubbing") return e.x === g.x ? g : { ...g, x: e.x }
      if (Math.hypot(e.x - g.x0, e.y - g.y0) > slop) return { phase: "idle", endedAt: g.endedAt }
      return { ...g, x: e.x }
    case "end":
      return finishScrub(g, e.pointerId, e.at)
    case "lost":
      return e.own ? finishScrub(g, e.pointerId, e.at) : g
    case "leave":
      return g.phase === "pressing" ? finishScrub(g, e.pointerId, e.at) : g
  }
}

/** Is a click at `at` the release of a scrub rather than a tap? */
export function isScrubRelease(g: ScrubGesture, at: number): boolean {
  return g.phase === "scrubbing" || at - g.endedAt < SCRUB_TAP_GUARD_MS
}
