/**
 * The half-life model's INPUTS for one compound, read from the app's own
 * records: its half-life (the catalogue, or a custom compound's own), its route,
 * the doses logged, and the doses the schedule still has to come. The model
 * (`./model`) turns these into every figure; nothing here computes one.
 *
 * Time is epoch HOURS throughout, so a dose's instant and "now" share one axis.
 *
 * Pure: no React, no storage (code-standards.md).
 */
import { COMPOUNDS } from "@/lib/compounds-catalogue"
import { componentsOf, type BlendComponent } from "@/lib/compound-blends"
import { parseSlotKey, type DayLogs } from "@/lib/home/doseLog"
import { combineLocalDateTime, toDateKey } from "@/lib/home/mockHomeData"
import {
  doseAmountsOf,
  doseTimesOf,
  hasTime,
  isDueOnFor,
  resolveScheduleOn,
  type StackCompound,
} from "@/lib/home/stack"

import { routeFor, type AbsorptionRoute, type Dose } from "./model"

const MS_PER_H = 3_600_000

/** Epoch hours for a local day and a wall-clock time. */
export function hoursAt(dateKey: string, time24: string): number {
  return new Date(combineLocalDateTime(dateKey, time24)).getTime() / MS_PER_H
}

/** Epoch hours for an instant. */
export function hoursOf(d: Date): number {
  return d.getTime() / MS_PER_H
}

/** Where a compound's half-life comes from, and how it is absorbed. */
export interface HalfLifeSource {
  halfLifeH: number
  /** No human PK behind it: the Half-life row adds a small "est.". */
  estimated: boolean
  route: AbsorptionRoute
}

const byName = new Map(COMPOUNDS.map((c) => [c.name.trim().toLowerCase(), c]))

/**
 * A compound's half-life: the catalogue's, else a custom compound's own (the
 * optional field, Adrian 2026-09-24). Null when there is none, and then the
 * compound draws no curve.
 */
export function halfLifeOf(
  name: string,
  method: StackCompound["method"],
  customHalfLives?: ReadonlyMap<string, number>,
): HalfLifeSource | null {
  const key = name.trim().toLowerCase()
  const cat = byName.get(key)
  const hl = cat?.halfLifeHours ?? customHalfLives?.get(key) ?? null
  if (hl == null || !(hl > 0)) return null
  return { halfLifeH: hl, estimated: Boolean(cat?.halfLifeEstimated), route: routeFor(method) }
}

/**
 * An amount moved between units the model can add together: mg and mcg, and g
 * and mg. Null across families (iu never becomes mg): such a dose is left out
 * of the curve rather than drawn at a wrong scale.
 */
export function convertAmount(amount: number, from: string, to: string): number | null {
  if (from === to) return amount
  const f: Record<string, number> = { mcg: 0.001, mg: 1, g: 1000 }
  if (f[from] != null && f[to] != null) return (amount * f[from]) / f[to]
  return null
}

/**
 * The time a logged dose was taken: its own, else its slot's scheduled time
 * that day, else noon (the app's documented fallback). A dose with no time of
 * its own is never placed after `nowH`: it has been taken, so today's later
 * slot tracked without a time sits at Now, not at its planned time still to
 * come (cold review B29). Track records the clock today, so this only catches
 * a log that came in without one.
 */
function takenAt(c: StackCompound, dateKey: string, slot: number, time24: string, nowH?: number): number {
  if (hasTime(time24)) return hoursAt(dateKey, time24)
  const planned = doseTimesOf(resolveScheduleOn(c, dateKey).schedule)[slot]
  const at = hoursAt(dateKey, hasTime(planned) ? planned : "12:00")
  return nowH == null ? at : Math.min(at, nowH)
}

/**
 * Every dose of `c` TAKEN, in `c`'s unit, oldest first. A skipped dose is not
 * a dose; one logged in a unit that cannot be converted is left out. With
 * `nowH`, a dose logged without a time is never placed after it.
 */
export function loggedDoses(c: StackCompound, logs: DayLogs, nowH?: number): Dose[] {
  const out: Dose[] = []
  for (const [dateKey, day] of Object.entries(logs)) {
    for (const [key, log] of Object.entries(day)) {
      const { compoundId, slot } = parseSlotKey(key)
      if (compoundId !== c.id || log.status === "skipped") continue
      const raw = Number.parseFloat(log.amount)
      if (!(raw > 0)) continue
      const amount = convertAmount(raw, log.unit ?? c.unit, c.unit)
      if (amount == null) continue
      out.push({ atH: takenAt(c, dateKey, slot, log.time24, nowH), amount, slot })
    }
  }
  return out.sort((a, b) => a.atH - b.atH)
}

/** The doses the schedule still has to come between `now` and `untilH`, at
 *  their planned amounts: the dashed line ahead of today. A slot already logged
 *  today, or already past, is not to come. */
export function scheduledDoses(
  c: StackCompound,
  logs: DayLogs,
  now: Date,
  untilH: number,
  /** Stop after this many (the next dose needs one). */
  limit = Infinity,
): Dose[] {
  const out: Dose[] = []
  const nowH = hoursOf(now)
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  for (let d = 0; d < 400; d++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d)
    const dateKey = toDateKey(date)
    if (out.length >= limit || hoursAt(dateKey, "00:00") > untilH) break
    if (!isDueOnFor(c, date)) continue
    const on = resolveScheduleOn(c, dateKey)
    const times = doseTimesOf(on.schedule)
    const amounts = doseAmountsOf(on.schedule, on.dose)
    const day = logs[dateKey] ?? {}
    times.forEach((t, slot) => {
      const key = slot === 0 ? c.id : `${c.id}#${slot}`
      if (day[key]) return
      const at = hoursAt(dateKey, hasTime(t) ? t : "12:00")
      if (at <= nowH || at > untilH) return
      const amount = convertAmount(amounts[slot] ?? on.dose, on.unit, c.unit)
      if (amount != null && amount > 0) out.push({ atH: at, amount, slot })
    })
  }
  return out
}

/** How far the walk for the next doses looks ahead, in hours. */
const WALK_H = 24 * 400

/** The next dose the schedule has to come, in epoch hours, or null when none
 *  is due within the walk (an ended, or indefinitely paused, compound). */
export function nextDoseAt(c: StackCompound, logs: DayLogs, now: Date): number | null {
  const next = scheduledDoses(c, logs, now, hoursOf(now) + WALK_H, 1)[0]
  return next ? next.atH : null
}

/**
 * The dose after next (or the next, when only one is to come), in epoch
 * hours, or null with none. The doses to come must reach it however far off
 * it is: the Peaks in row counts to the next dose's own peak, and its window
 * ends at the dose after (`peakCountdown`). A schedule cut at the graph's
 * eight days hid a fortnightly dose and read "Peak · Passed" while one was due
 * (cold review B12).
 */
export function doseAfterNextAt(c: StackCompound, logs: DayLogs, now: Date): number | null {
  const two = scheduledDoses(c, logs, now, hoursOf(now) + WALK_H, 2).slice(0, 2)
  return two.length ? two[two.length - 1].atH : null
}

/** One line of a compound's chart: itself, or one component of a blend. */
export interface CurveLine {
  /** The tab label for a component; the compound's name for a single. */
  label: string
  name: string
  unit: string
  source: HalfLifeSource | null
  /** Taken doses, oldest first, and the ones still to come: those up to
   *  `untilH`, and never fewer than the next two (see {@link doseAfterNextAt}). */
  taken: Dose[]
  toCome: Dose[]
}

function scale(doses: Dose[], by: number): Dose[] {
  return doses.map((d) => ({ ...d, amount: d.amount * by }))
}

/**
 * The lines to draw for a compound: one for a single compound, one per
 * component for a blend (each on its own half-life, from the catalogue by
 * name). A component with no half-life is still listed, with `source` null, so
 * it can say so ("No half-life data").
 *
 * A component counted per unit of its own (`per`: NDT's parts are per mg of
 * tablet) has the dose converted to that unit first, so NDT added in mcg draws
 * 38 mcg of T4 a grain, not 38000 (cold review B25). A component whose unit the
 * dose cannot be converted to is left out rather than drawn at a wrong scale.
 */
export function curveLines(
  c: StackCompound,
  logs: DayLogs,
  now: Date,
  untilH: number,
  customHalfLives?: ReadonlyMap<string, number>,
): CurveLine[] {
  const taken = loggedDoses(c, logs, hoursOf(now))
  const reach = doseAfterNextAt(c, logs, now)
  const toCome = scheduledDoses(c, logs, now, reach == null ? untilH : Math.max(untilH, reach))
  const parts: BlendComponent[] | null = componentsOf(c.name)
  if (!parts) {
    return [{ label: c.name, name: c.name, unit: c.unit, source: halfLifeOf(c.name, c.method, customHalfLives), taken, toCome }]
  }
  return parts.flatMap((p) => {
    // How many of the component's `per` units one unit of the dose is.
    const perUnit = p.per ? convertAmount(1, c.unit, p.per) : 1
    if (perUnit == null) return []
    const by = perUnit * p.perDoseUnit
    return [
      {
        label: p.label,
        name: p.name,
        unit: p.unit ?? c.unit,
        source: halfLifeOf(p.name, c.method, customHalfLives),
        taken: scale(taken, by),
        toCome: scale(toCome, by),
      },
    ]
  })
}

/** A local day key for an epoch-hours instant. */
export function dateKeyOfHours(h: number): string {
  return toDateKey(new Date(h * MS_PER_H))
}

/**
 * Whole calendar days from one epoch-hours instant to another, by their LOCAL
 * dates (so 21:00 to 08:00 tomorrow is 1, and 07:00 to 20:00 today is 0),
 * never by elapsed hours. Counted on the dates alone, so a clock change in
 * between cannot shift it.
 */
export function calendarDaysBetween(fromH: number, toH: number): number {
  const a = new Date(fromH * MS_PER_H)
  const b = new Date(toH * MS_PER_H)
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((day(b) - day(a)) / (24 * MS_PER_H))
}

/**
 * Next dose as calendar days (build-brief-final §3.3, "X days"): "Today",
 * "1 day", "3 days", counted between the local dates of Now and of the dose, not
 * by rounding the hours between them (cold review B13).
 */
export function nextDoseWords(nowH: number, nextAtH: number): string {
  const d = calendarDaysBetween(nowH, nextAtH)
  return d <= 0 ? "Today" : d === 1 ? "1 day" : `${d} days`
}

/**
 * A past run's Length in days: the days its dates span, first and last
 * included, so "1 Sep to 3 Sep" is 3 days whatever the hours (cold review B27).
 */
export function runLengthDays(fromH: number, toH: number): number {
  return Math.max(1, calendarDaysBetween(fromH, toH) + 1)
}
