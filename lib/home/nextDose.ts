/**
 * "Next dose" resolution — which scheduled dose is still outstanding, and how it
 * reads on the widget (Spec 01 → Next dose resolution).
 *
 * Lives here rather than inside `HomeScreen` so it is a pure function of its
 * inputs and can be tested directly. That matters: the original bug was that the
 * screen handed this logic `seedStack` — the empty first-run fixture — instead of
 * the user's real stack, so it returned null for every user on every render and
 * the card showed a dash while doses were genuinely due. Nothing about that was
 * visible from the widget's own code, and nothing could have caught it without
 * exercising the resolution in isolation.
 *
 * Pure helpers only; no React, no side effects (code-standards.md).
 */
import type { DateKey } from "@/lib/home/mockHomeData"
import {
  hasTime,
  isDueOnFor,
  resolveScheduleOn,
  type StackCompound,
} from "@/lib/home/stack"
import type { DayLogs } from "@/lib/home/doseLog"

export interface NextDose {
  name: string
  /** 24h "HH:mm", or `""` when this compound has no dose time set. */
  time24: string
  /** The compound itself, so a caller can draw its container (Spec 02). */
  compound: StackCompound
  /** Dose + unit AS THEY WERE on that day — an alteration made later must not
   *  restate a past day (Spec 01 → alterations apply forward only). */
  dose: number
  unit: string
}

/**
 * Time until a "HH:MM" clock time LATER TODAY, as "Xh Ym".
 *
 * A time that has already passed reads `0h 0m` — the dose is due now. It
 * deliberately does NOT roll forward to tomorrow: this counts down to a specific
 * dose on a specific day, so rolling over would silently re-point it at the next
 * day's dose and hide one that is overdue.
 */
export function formatCountdown(now: Date, time24: string): string {
  const [h, m] = time24.split(":").map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "0h 0m"
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0)
  const mins = Math.max(0, Math.round((target.getTime() - now.getTime()) / 60000))
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

/**
 * The soonest UNLOGGED scheduled dose on `date`, or null when nothing is
 * outstanding.
 *
 * Three rules, each of which the previous implementation broke:
 *  - it reads the REAL stack it is given (see the module note above);
 *  - an already-LOGGED dose is not "next" — the card is about what's still
 *    outstanding, so it advances as doses are ticked off;
 *  - an archived compound is not dosed, so it can never be next.
 *
 * Ordered by scheduled time within the day. An unlogged dose whose time has
 * passed still counts — it's overdue, not gone — and sorts before later ones, so
 * the earliest outstanding dose surfaces. A compound with no time set sorts LAST
 * (`""` compares below every real time, so it would otherwise sit permanently in
 * the slot and hide the doses that do have one).
 */
export function computeNextDose(
  stack: StackCompound[],
  logs: DayLogs,
  dateKey: DateKey,
  date: Date
): NextDose | null {
  const dayLogs = logs[dateKey] ?? {}
  const due = stack
    .filter((c) => !c.archived && !dayLogs[c.id] && isDueOnFor(c, date))
    // The time to show is the one scheduled for THAT day, which an alteration made
    // later must not restate (Spec 01 → alterations apply forward only).
    .map((c) => {
      const on = resolveScheduleOn(c, dateKey)
      return {
        name: c.name,
        time24: on.schedule.timeOfDay,
        // The compound itself, so a caller can draw its container — and the dose
        // AS IT WAS on that day, which an alteration made later must not restate.
        compound: c,
        dose: on.dose,
        unit: on.unit,
      }
    })
  if (due.length === 0) return null
  const sorted = due.sort((a, b) => {
    if (hasTime(a.time24) !== hasTime(b.time24)) return hasTime(a.time24) ? -1 : 1
    return a.time24.localeCompare(b.time24)
  })
  return sorted[0]
}
