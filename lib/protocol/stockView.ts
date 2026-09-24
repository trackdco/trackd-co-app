/**
 * How one compound's containers are read: which are open, which are spares, and
 * which one a dose comes out of (Adrian, 2026-09-24, ui-context → "Stock,
 * Stacks and Cycles pages" and "the five").
 *
 * - OPEN: started (`acquiredOn` set), not discarded, with something left. Two
 *   can be open at once and both can be logged from.
 * - SPARES: held but not started (`acquiredOn` null) — unreconstituted vials and
 *   unopened containers. Grouped, and they count toward doses left only once
 *   started.
 * - IN USE: the OLDEST open container. The old one is used first; the Stock page
 *   marks it NEXT.
 *
 * Every figure here is read from `v_inventory_math`; this only orders and
 * groups rows. Pure: no React, no storage (code-standards.md).
 */
import type { StockItem } from "@/lib/db/inventory"

/** Oldest start first; the row's own creation breaks a same-day tie. */
export function byStartOrder(a: StockItem, b: StockItem): number {
  const day = (a.acquiredOn ?? "").localeCompare(b.acquiredOn ?? "")
  if (day !== 0) return day
  return (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
}

/** Started, and not yet used up. A container the view cannot measure counts as
 *  open rather than vanishing. */
export function isOpen(item: StockItem): boolean {
  if (item.acquiredOn == null) return false
  return item.remainingBase == null || item.remainingBase > 0
}

export function isSpare(item: StockItem): boolean {
  return item.acquiredOn == null
}

export interface CompoundContainers {
  /** Open containers, the one in use first. */
  open: StockItem[]
  /** Spares, oldest first (the next to be started). */
  spares: StockItem[]
  /**
   * The container a live dose comes out of: the oldest open one. When every
   * started container is empty, the newest of them, so the card still shows the
   * container you were on, drawn empty.
   */
  inUse: StockItem | null
}

/** One compound's containers, from every row the stock read returned. */
export function containersOf(items: readonly StockItem[], protocolCompoundId: string): CompoundContainers {
  const mine = items.filter((i) => i.protocolCompoundId === protocolCompoundId)
  const open = mine.filter(isOpen).sort(byStartOrder)
  const spares = mine.filter(isSpare).sort(byStartOrder)
  const started = mine.filter((i) => i.acquiredOn != null).sort(byStartOrder)
  const inUse = open[0] ?? started[started.length - 1] ?? null
  return { open, spares, inUse }
}

/** The protocol compound ids that hold any active stock at all. */
export function stockedCompoundIds(items: readonly StockItem[]): Set<string> {
  return new Set(items.map((i) => i.protocolCompoundId))
}
