/**
 * The day's doses as the Flow B rows draw them, for the places that log a dose
 * outside Home's own card: Quick log (the desktop rail) and the Calendar's day
 * (consistency fix #0, "one way to log, wherever you start").
 *
 * Home's card has more to do (stacks, the Paused section), so it keeps its own
 * list; these two draw the plain one. The membership rule is Home's own
 * (`belongsInDayLog`), so the three cannot disagree about what is due.
 *
 * Pure: no React, no storage.
 */
import { belongsInDayLog } from "@/lib/home/dayDoses"
import { parseSlotKey, slotsForDay, type DayLogs, type DaySlot } from "@/lib/home/doseLog"
import type { DoseLog } from "@/lib/home/mockHomeData"
import { isPausedOn } from "@/lib/home/pauses"
import type { StackCompound } from "@/lib/home/stack"

/** One compound's row on a day: the compound, its slots, slot 0's log. */
export type DayDose = StackCompound & {
  log: DoseLog | null
  slots: DaySlot[]
  paused?: boolean
}

/** "YYYY-MM-DD" → a whole-day number, counted in UTC so no offset applies. */
function dayNumber(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000)
}

/** A date key as a local-midnight Date, the way the schedule reads a day. */
function localDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/**
 * Every compound that belongs in this day's log, as a row. A compound paused on
 * the day is left out unless something was logged on it (a paused compound has
 * nothing due, and the rows are for logging). In the stack's own order.
 */
export function dayDoseRows(stack: StackCompound[], logs: DayLogs, dayKey: string): DayDose[] {
  const rows = logs[dayKey] ?? {}
  const date = localDate(dayKey)
  const out: DayDose[] = []
  for (const c of stack) {
    if (!belongsInDayLog(c, rows, date)) continue
    const slots = slotsForDay(c, dayKey, rows)
    const paused = isPausedOn(c.pauses, dayKey)
    if (paused && slots.every((s) => s.log == null)) continue
    out.push({ ...c, log: rows[c.id] ?? null, slots, paused })
  }
  return out
}

/**
 * Days since each injection site was last used, up to and INCLUDING `dayKey`,
 * counted back from it: the day chips on the Site panel's map. The compound
 * being logged is left out on that day, so a dose never counts itself.
 */
export function siteDaysBefore(
  logs: DayLogs,
  dayKey: string,
  excludeCompoundId?: string | null,
): Record<string, number> {
  const out: Record<string, number> = {}
  const at = dayNumber(dayKey)
  if (at === null) return out
  for (const [key, day] of Object.entries(logs)) {
    if (key > dayKey) continue
    const n = dayNumber(key)
    if (n === null) continue
    const ago = at - n
    if (ago < 0) continue
    for (const [slot, log] of Object.entries(day ?? {})) {
      if (key === dayKey && excludeCompoundId && parseSlotKey(slot).compoundId === excludeCompoundId) continue
      const sid = log.siteId
      if (sid && (out[sid] === undefined || ago < out[sid])) out[sid] = ago
    }
  }
  return out
}
