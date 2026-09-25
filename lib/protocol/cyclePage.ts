/**
 * The Cycles page's figures (Adrian, 2026-09-24): the rhythm a row draws, the
 * days left in the current stretch, and the end tile, which NEVER wraps ("1 of
 * 3" over "Round", not "Round 1 of 3"). Pure, over `cycleStatusOn`.
 */
import {
  cyclePeriod,
  cycleStatusOn,
  type CycleContext,
  type CyclePattern,
  type CycleRule,
} from "@/lib/protocol/cycleRule"

const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** A cycle up to this many days long draws a cell a day; longer, one bar. */
export const RHYTHM_CELL_MAX = 21

function dayOf(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

/** "30 Nov". */
export function shortDate(key: string): string {
  const d = dayOf(key)
  return d ? `${d.getDate()} ${MON_SHORT[d.getMonth()]}` : key
}

/**
 * A row's pattern in words (build-brief-final §3.10): "5 days on, 2 off",
 * "1 day on, 1 off". The calendar key's compact "5 on / 2 off" stays
 * `formatCyclePattern`.
 */
export function cyclePatternText(pattern: CyclePattern): string {
  if (pattern.type !== "onOff") return "Continuous"
  return `${pattern.onDays} ${pattern.onDays === 1 ? "day" : "days"} on, ${pattern.offDays} off`
}

export interface CycleFacts {
  /** Off the running list; it shows under Ended instead (`endedCycles.ts`). */
  ended: boolean
  /** Before its anchor: nothing is on yet. */
  pending: boolean
  on: boolean
  /** Days left in the current on or off stretch; null when continuous. */
  daysLeft: number | null
  /** On days then off days, for the rhythm; null when continuous. */
  onDays: number | null
  offDays: number | null
  /** Where today falls in the round, 0-based; null when continuous or pending. */
  at: number | null
  /** The second tile: its value and the word under it. */
  end: { value: string; label: string }
}

export function cycleFacts(cycle: CycleRule, todayKey: string, ctx?: CycleContext): CycleFacts {
  const status = cycleStatusOn(cycle, todayKey, ctx)
  const period = cyclePeriod(cycle.pattern)
  const onOff = cycle.pattern.type === "onOff" ? cycle.pattern : null
  let at: number | null = null
  if (onOff && period && status.daysLeftInPhase != null) {
    at = status.on ? onOff.onDays - status.daysLeftInPhase : period - status.daysLeftInPhase
  }
  let end: CycleFacts["end"]
  switch (cycle.end.type) {
    case "onDate":
      end = { value: shortDate(cycle.end.date), label: "Ends" }
      break
    case "afterRounds":
      end = { value: `${Math.min((status.round ?? 0) + 1, cycle.end.rounds)} of ${cycle.end.rounds}`, label: "Round" }
      break
    case "whenVialEmpty":
      end = { value: "Vial", label: "Ends when empty" }
      break
    default:
      end = { value: "No end", label: "Ends" }
  }
  return {
    ended: status.ended,
    pending: status.pending,
    on: status.on,
    daysLeft: status.daysLeftInPhase,
    onDays: onOff ? onOff.onDays : null,
    offDays: onOff ? onOff.offDays : null,
    at,
    end,
  }
}
