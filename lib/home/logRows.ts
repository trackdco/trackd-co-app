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
import type { StockItem } from "@/lib/db/inventory"
import { unitFamilyOk } from "@/lib/db/doseUnits"
import { belongsInDayLog } from "@/lib/home/dayDoses"
import { parseSlotKey, slotKey, slotsForDay, type DayLogs, type DaySlot } from "@/lib/home/doseLog"
import type { DoseLog } from "@/lib/home/mockHomeData"
import { isPausedOn } from "@/lib/home/pauses"
import type { StackCompound } from "@/lib/home/stack"
import { containersOf } from "@/lib/protocol/stockView"

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
 * counted back from it: the day chips on the Site panel's map. The dose being
 * logged (`exclude`: its compound and slot, on that day) is left out, so a dose
 * never counts itself. ONLY that dose: this morning's dose of the same compound
 * is a real use, and hiding it offered the same spot again for the evening
 * dose (cold review B21).
 */
export function siteDaysBefore(
  logs: DayLogs,
  dayKey: string,
  exclude?: { compoundId: string; slot: number } | null,
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
      if (key === dayKey && exclude) {
        const own = parseSlotKey(slot)
        if (own.compoundId === exclude.compoundId && own.slot === exclude.slot) continue
      }
      const sid = log.siteId
      if (sid && (out[sid] === undefined || ago < out[sid])) out[sid] = ago
    }
  }
  return out
}

/* ------------------------------------------------ writes that land later */

/**
 * May a late write put a dose back in this slot: the "Unticked" Undo (3s) and
 * Save's confirm (620ms)? Only while the slot is still EMPTY. A dose logged
 * there meanwhile (re-tracked, or ticked with its stack) is the newer fact, and
 * putting the old one back overwrote it (cold review B17).
 */
export function slotIsFree(logs: DayLogs, day: string, compoundId: string, slot: number): boolean {
  return logs[day]?.[slotKey(compoundId, slot)] == null
}

/**
 * The doses an Undo may put back: the ones whose slot is still empty (B17, for
 * a whole stack's untick as for one row's). The rest were logged again since.
 */
export function freeToRestore<T extends { id: string; slot: number }>(
  logs: DayLogs,
  day: string,
  removed: readonly T[],
): T[] {
  return removed.filter((r) => slotIsFree(logs, day, r.id, r.slot))
}

/* ------------------------------------------------- the open row's stock */

/**
 * The id a compound's containers carry (cold review S11). A container belongs
 * to a Postgres compound row, whose id is usually the device's own but not
 * always (a row reused for a compound that had one, or an older non-uuid id).
 * Filtering by the device id alone then found nothing, and the panel said "No
 * stock yet" beside the vials Protocol shows. Protocol maps the ids with
 * `resolveProtocolCompoundIds`; `resolved` is that answer, when it was needed.
 */
export function stockCompoundId(
  items: readonly StockItem[],
  compoundId: string,
  resolved?: string | null,
): string {
  if (items.some((i) => i.protocolCompoundId === compoundId)) return compoundId
  return resolved || compoundId
}

/** No container carries the device id: ask for the Postgres one. */
export function needsStockIdLookup(items: readonly StockItem[], compoundId: string): boolean {
  return !items.some((i) => i.protocolCompoundId === compoundId)
}

/** What an open row knows about its compound's containers. */
export interface RowStock {
  /** Open containers that fit the dose's unit, the one in use first. */
  open: StockItem[]
  /** Unopened ones that fit, oldest first. Empty on a back-dated day. */
  spares: StockItem[]
  /** Every container of the compound, used up ones too (a logged dose can
   *  point at a vial it emptied). */
  all: StockItem[]
  /** A back-dated day: the container in use THEN (null = none). */
  dateVialId?: string | null
}

/**
 * The row's containers. Today: the open ones and the spares that fit the dose's
 * unit. A back-dated day offers only the container in use THEN: one started
 * later would be dropped by the server, and a spare started on a past day would
 * take every later dose.
 */
export function rowStockOf(
  items: readonly StockItem[],
  pcId: string,
  doseUnit: string,
  onToday: boolean,
  dateVialId: string | null | undefined,
): RowStock {
  const { open, spares } = containersOf(items, pcId)
  const all = items.filter((i) => i.protocolCompoundId === pcId)
  const fit = (v: StockItem) => unitFamilyOk(v.baseUnit, doseUnit)
  if (onToday) return { open: open.filter(fit), spares: spares.filter(fit), all }
  const then = dateVialId ?? null
  return { open: open.filter((v) => v.id === then), spares: [], all, dateVialId: then }
}

/**
 * The container a NEW dose is left on when nothing was chosen: today, the one
 * in use (the oldest open one), or with none open an unopened spare that Track
 * then starts (never a powder vial, unmixed); a back-dated day, the one in use
 * then. Null when there is no obvious answer: it stays the server's call.
 *
 * Never for a dose already logged (cold review B8): its link was decided when
 * it was logged, and re-picking moved it to another container, or started a
 * spare, on a Save meant for its note.
 */
export function autoPickContainer(
  stock: RowStock,
  onToday: boolean,
  editing: boolean,
): { id: string; spare: boolean } | null {
  if (editing) return null
  if (!onToday) return stock.dateVialId ? { id: stock.dateVialId, spare: false } : null
  if (stock.open[0]) return { id: stock.open[0].id, spare: false }
  const sealed = stock.spares.find((v) => v.inventoryType !== "reconstituted")
  return sealed ? { id: sealed.id, spare: true } : null
}

/** What the Stock panel says the dose comes out of. */
export type RowContainer =
  /** A container the stock read knows. */
  | { kind: "item"; item: StockItem }
  /** A back-dated day's container, used up or put away since: named, not measured. */
  | { kind: "then"; id: string }
  /** Nothing to name: no stock, only powder still to mix, none in use that day,
   *  or a dose logged as not coming off any container. */
  | { kind: "none"; why: "noStock" | "unmixed" | "pastNone" | "notCounted" }

/**
 * The one line the Stock panel shows, and it must agree with what Track writes
 * (cold review B20: a back-dated day said "No container was in use that day"
 * while linking the dose to that day's vial, because the vial had since run out
 * and was no longer "open").
 *
 * - The draft's own container, wherever it is (used up, or a spare), else
 * - with nothing decided (`undefined`), the one the server's rule takes: today
 *   the one in use, a back-dated day the one in use then;
 * - a dose logged as not coming off stock (`null`: "Don't count this dose", or
 *   one the server could not link) says so, where there was stock to count.
 */
export function rowContainer(
  stock: RowStock,
  draftId: string | null | undefined,
  onToday: boolean,
  /** A skipped dose comes off nothing, whatever it is linked to (B4). */
  skipped = false,
): RowContainer {
  if (skipped) return { kind: "none", why: "notCounted" }
  if (draftId) {
    const item = stock.all.find((v) => v.id === draftId) ?? [...stock.open, ...stock.spares].find((v) => v.id === draftId)
    if (item) return { kind: "item", item }
    if (!onToday && draftId === stock.dateVialId) return { kind: "then", id: draftId }
  }
  if (draftId === undefined) {
    if (onToday && stock.open[0]) return { kind: "item", item: stock.open[0] }
    if (!onToday && stock.dateVialId) {
      const item = stock.all.find((v) => v.id === stock.dateVialId)
      return item ? { kind: "item", item } : { kind: "then", id: stock.dateVialId }
    }
  }
  if (!onToday) return { kind: "none", why: draftId === null && stock.dateVialId ? "notCounted" : "pastNone" }
  if (draftId === null && stock.open.length + stock.spares.length > 0) return { kind: "none", why: "notCounted" }
  const unmixed = stock.spares.length > 0 && stock.spares.every((v) => v.inventoryType === "reconstituted")
  return { kind: "none", why: unmixed ? "unmixed" : "noStock" }
}

/* ---------------------------------------------------- the Log card's edge */

/**
 * Does the Log card's edge play its finish (hold bold, exhale thin, the card
 * settles darker)? Only at the moment THIS day completes: a dose logged takes
 * it from due to done. Moving to another day that was already done is a load
 * of that day, not its completion (cold review B33: scrubbing the week strip
 * onto a finished day replayed it).
 */
export function edgeFinishPlays(
  before: { full: boolean; day?: string },
  now: { full: boolean; day?: string },
): boolean {
  return now.full && !before.full && before.day === now.day
}
