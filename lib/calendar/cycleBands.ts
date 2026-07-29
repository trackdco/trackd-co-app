/**
 * Cycle bands for the month grid (Spec 03 · part two).
 *
 * A user running seven on / seven off should see that SHAPE at a glance, so an
 * on-day gets a soft coloured fill and consecutive on-days join into one band
 * with rounded ends. This module answers, per day, which cycles are on and
 * whether each is at the start or end of its run — the grid just paints it.
 *
 * **Only repeating on/off cycles render.** A continuous cycle drawn as a band
 * across every single day tells you nothing, so it is deliberately omitted.
 *
 * Pure; no React, no storage (`code-standards.md`).
 */
import type { DateKey } from "@/lib/home/mockHomeData"
import { resolveScheduleOn, type StackCompound } from "@/lib/home/stack"
import { cycleStatusOn, type CycleColour } from "@/lib/protocol/cycleRule"

/** Indefinite cycles project forward this far and stop — never unbounded. */
export const CYCLE_HORIZON_MONTHS = 12

/** One cycle's presence on one day. */
export interface CycleSegment {
  /** The compound the cycle belongs to — one cycle, one compound. */
  compoundId: string
  compoundName: string
  colour: CycleColour
  /** First on-day of a consecutive run — round the leading edge. */
  runStart: boolean
  /** Last on-day of a consecutive run — round the trailing edge. */
  runEnd: boolean
}

/** Sort key that keeps stacked bars in the same order month to month. */
function orderOf(c: StackCompound): string {
  // By cycle start date, then by id so equal anchors never swap.
  return `${c.cycle?.anchor ?? ""}|${c.id}`
}

function shiftKey(key: DateKey, days: number): DateKey {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return key
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days)
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}` as DateKey
}

/** The last day an indefinite cycle is drawn to. */
export function horizonKey(todayKey: DateKey): DateKey {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayKey)
  if (!m) return todayKey
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1 + CYCLE_HORIZON_MONTHS,
    Number(m[3])
  )
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}` as DateKey
}

/**
 * Which cycles render on each of `dayKeys`.
 *
 * A compound qualifies only if the cycle in force that day is an on/off one;
 * `resolveScheduleOn` is used rather than the compound's current cycle so a past
 * month keeps the pattern it was actually run under (Spec 06 → no rewriting).
 */
export function cycleBandsForDays(
  stack: StackCompound[],
  dayKeys: DateKey[],
  todayKey: DateKey
): Map<DateKey, CycleSegment[]> {
  const out = new Map<DateKey, CycleSegment[]>()
  if (dayKeys.length === 0) return out

  const horizon = horizonKey(todayKey)
  const cycled = stack
    .filter((c) => !c.archived && c.cycle)
    .sort((a, b) => orderOf(a).localeCompare(orderOf(b)))

  if (cycled.length === 0) return out

  for (const key of dayKeys) {
    // Nothing is projected past the horizon — an indefinite cycle stops there
    // rather than being computed forever.
    if (key > horizon) continue

    const segments: CycleSegment[] = []
    for (const c of cycled) {
      if (!onFor(c, key)) continue
      segments.push({
        compoundId: c.id,
        compoundName: c.name,
        colour: c.cycle!.colour,
        runStart: !onFor(c, shiftKey(key, -1)),
        runEnd: !onFor(c, shiftKey(key, 1)),
      })
    }
    if (segments.length > 0) out.set(key, segments)
  }

  return out
}

/** One row of the key below the grid. */
export interface CycleKeyRow {
  compoundId: string
  compoundName: string
  colour: CycleColour
  /** "7 on / 7 off", or "ends 26 Jul" when the cycle has a fixed end. */
  summary: string
}

/**
 * The key below the grid — one row per cycle that the grid actually draws.
 *
 * Continuous cycles are omitted for the same reason they are not drawn: the key
 * explains the grid, so listing a colour that appears nowhere on it would be
 * more confusing than leaving it out.
 */
export function cycleKeyRows(stack: StackCompound[]): CycleKeyRow[] {
  return stack
    .filter((c) => !c.archived && c.cycle?.pattern.type === "onOff")
    .sort((a, b) => orderOf(a).localeCompare(orderOf(b)))
    .map((c) => {
      const cycle = c.cycle!
      const pattern = cycle.pattern as { onDays: number; offDays: number }
      return {
        compoundId: c.id,
        compoundName: c.name,
        colour: cycle.colour,
        summary:
          cycle.end.type === "onDate"
            ? `ends ${formatKeyShort(cycle.end.date)}`
            : `${pattern.onDays} on / ${pattern.offDays} off`,
      }
    })
}

/** A cycle's end in words, for the day-detail sheet. */
export function describeCycleEnd(cycle: {
  end: { type: string; date?: string; rounds?: number }
}): string {
  switch (cycle.end.type) {
    case "onDate":
      return cycle.end.date ? `ends ${formatKeyShort(cycle.end.date)}` : "ends"
    case "afterRounds":
      return `ends after ${cycle.end.rounds} rounds`
    case "whenVialEmpty":
      return "ends when the vial runs out"
    default:
      return "no end set"
  }
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/** "2026-07-26" → "26 Jul". Falls back to the raw key if unparseable. */
export function formatKeyShort(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return key
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`
}

/** Is this compound's cycle ON for a day, and is it the kind we draw? */
function onFor(c: StackCompound, key: DateKey): boolean {
  const cycle = resolveScheduleOn(c, key).cycle
  // Only repeating on/off cycles render — a continuous run drawn as a band
  // across every day carries no information.
  if (!cycle || cycle.pattern.type !== "onOff") return false
  return cycleStatusOn(cycle, key).on
}
