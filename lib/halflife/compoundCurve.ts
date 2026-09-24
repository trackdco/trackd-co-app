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

/** The time a logged dose was taken: its own, else its slot's scheduled time
 *  that day, else noon (the app's documented fallback). */
function takenAt(c: StackCompound, dateKey: string, slot: number, time24: string): number {
  if (hasTime(time24)) return hoursAt(dateKey, time24)
  const planned = doseTimesOf(resolveScheduleOn(c, dateKey).schedule)[slot]
  return hoursAt(dateKey, hasTime(planned) ? planned : "12:00")
}

/**
 * Every dose of `c` TAKEN, in `c`'s unit, oldest first. A skipped dose is not
 * a dose; one logged in a unit that cannot be converted is left out.
 */
export function loggedDoses(c: StackCompound, logs: DayLogs): Dose[] {
  const out: Dose[] = []
  for (const [dateKey, day] of Object.entries(logs)) {
    for (const [key, log] of Object.entries(day)) {
      const { compoundId, slot } = parseSlotKey(key)
      if (compoundId !== c.id || log.status === "skipped") continue
      const raw = Number.parseFloat(log.amount)
      if (!(raw > 0)) continue
      const amount = convertAmount(raw, log.unit ?? c.unit, c.unit)
      if (amount == null) continue
      out.push({ atH: takenAt(c, dateKey, slot, log.time24), amount, slot })
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

/** The next dose the schedule has to come, in epoch hours, or null when none
 *  is due within the walk (an ended, or indefinitely paused, compound). */
export function nextDoseAt(c: StackCompound, logs: DayLogs, now: Date): number | null {
  const next = scheduledDoses(c, logs, now, hoursOf(now) + 24 * 400, 1)[0]
  return next ? next.atH : null
}

/** One line of a compound's chart: itself, or one component of a blend. */
export interface CurveLine {
  /** The tab label for a component; the compound's name for a single. */
  label: string
  name: string
  unit: string
  source: HalfLifeSource | null
  /** Taken doses, oldest first, and the ones still to come. */
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
 */
export function curveLines(
  c: StackCompound,
  logs: DayLogs,
  now: Date,
  untilH: number,
  customHalfLives?: ReadonlyMap<string, number>,
): CurveLine[] {
  const taken = loggedDoses(c, logs)
  const toCome = scheduledDoses(c, logs, now, untilH)
  const parts: BlendComponent[] | null = componentsOf(c.name)
  if (!parts) {
    return [{ label: c.name, name: c.name, unit: c.unit, source: halfLifeOf(c.name, c.method, customHalfLives), taken, toCome }]
  }
  return parts.map((p) => ({
    label: p.label,
    name: p.name,
    unit: p.unit ?? c.unit,
    source: halfLifeOf(p.name, c.method, customHalfLives),
    taken: scale(taken, p.perDoseUnit),
    toCome: scale(toCome, p.perDoseUnit),
  }))
}

/** A local day key for an epoch-hours instant. */
export function dateKeyOfHours(h: number): string {
  return toDateKey(new Date(h * MS_PER_H))
}
