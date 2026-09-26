import { inventoryTypeForCompound } from "@/lib/containers/form"
import { isRunning, type StackCompound } from "@/lib/home/stack"
import { orderByCategory } from "@/lib/protocol/compoundRow"
import type { StockItem } from "@/lib/db/inventory"

/**
 * W43: THE +'S "ADD STOCK" ASKS WHICH COMPOUND FIRST.
 *
 * The compounds it offers are the ones Protocol shows a card for (running: not
 * deleted, cycle not ended; a paused one still holds its stock), in Protocol's
 * order (by type, then name), each with its container drawn as Protocol draws
 * it: filled to the level of the one in use, or at the illustrative level when
 * nothing is known. Pure: no DOM.
 */
export interface StockPickRow {
  /** The CLIENT stack id: what `AddStockSheet`'s `preselectFor` is keyed by. */
  id: string
  name: string
  category: string
  /** The container's form: the one in use when there is one, else the compound's own. */
  inventoryType: string | null
  /** 0 to 1: the level of the container in use. Undefined: no figure (drawn illustrative). */
  fill?: number
  /** Whether it holds any container. Null until the stock read has landed. */
  onHand: boolean | null
}

/** What a compound's stock read says, as far as the picker needs it. */
export type HeldStock = { inUse: Pick<StockItem, "inventoryType" | "remainingBase" | "totalBase"> }

/** The in-use container's level, as Protocol's card draws it; undefined without both figures. */
export function pickFill(held: HeldStock | undefined): number | undefined {
  const s = held?.inUse
  if (!s || s.remainingBase == null || !s.totalBase) return undefined
  return Math.max(0, Math.min(1, s.remainingBase / s.totalBase))
}

/**
 * The picker's rows. `held` is the stock read keyed by client id (Protocol's
 * `compoundStockViews`); null while it is in flight or when it failed, and then
 * no row claims to hold nothing.
 */
export function stockPickRows(
  compounds: readonly StackCompound[],
  todayKey: string,
  held: ReadonlyMap<string, HeldStock> | null,
): StockPickRow[] {
  return orderByCategory(compounds.filter((c) => isRunning(c, todayKey))).map((c) => {
    const h = held?.get(c.id)
    return {
      id: c.id,
      name: c.name,
      category: c.category,
      inventoryType: h?.inUse.inventoryType ?? inventoryTypeForCompound(c.name, c.method, c.inventoryForm),
      fill: pickFill(h),
      onHand: held ? h !== undefined : null,
    }
  })
}

/**
 * What choosing Add stock does: with one compound there is nothing to ask, so
 * its Add stock opens straight away; with none, the picker says so and offers
 * Add compound (a working control, never an empty pop-up); otherwise it asks.
 */
export type StockPickStep = { kind: "none" } | { kind: "one"; id: string } | { kind: "choose" }

export function stockPickStep(rows: readonly Pick<StockPickRow, "id">[]): StockPickStep {
  if (rows.length === 0) return { kind: "none" }
  if (rows.length === 1) return { kind: "one", id: rows[0].id }
  return { kind: "choose" }
}
