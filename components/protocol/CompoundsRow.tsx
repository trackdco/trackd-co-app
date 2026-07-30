"use client"

import { CARD_EYEBROW } from "@/lib/ui-presets"
import { Plus } from "@/components/icons"
import {
  CARD_H,
  CARD_W,
  CompoundStorageCard,
} from "@/components/protocol/CompoundStorageCard"
import { cn } from "@/lib/utils"
import type { StackCompound } from "@/lib/home/stack"
import type { StockItem } from "@/lib/db/inventory"
import { routesOf } from "@/lib/compound-categories"
import { COMPOUNDS } from "@/lib/compounds-catalogue"

/**
 * Every compound in ONE horizontal side-scrolling row (Spec 04) — deliberately
 * not stacked per-category blocks, which was an explicit change of direction.
 *
 * **Ordering: by category volume, then alphabetically within a category.** The
 * category you hold the most compounds in comes first, so the row opens on what
 * you are mostly running. Within a category, alphabetical is the only rule where
 * you can predict a compound's position without remembering when you added it,
 * and it never reshuffles as you log. Ties on volume break on the catalogue's own
 * category order, so the row is stable rather than dependent on Map iteration.
 */
export function CompoundsRow({
  compounds,
  stockByCompound,
  stockKnown,
  todayKey,
  onOpen,
  onAddStock,
  onAddCompound,
}: {
  compounds: StackCompound[]
  /** The backing vial per compound id, from `v_inventory_math`. */
  stockByCompound: Map<string, StockItem>
  /** False until the stock read has LANDED. Until then the cards must not claim
   *  the user has no vials. */
  stockKnown: boolean
  todayKey: string
  onOpen: (c: StackCompound) => void
  onAddStock: (c: StackCompound) => void
  onAddCompound: () => void
}) {
  const ordered = orderByCategoryVolume(compounds)

  return (
    <section className="space-y-3">
      <h2 className={`${CARD_EYEBROW} px-1`}>Compounds</h2>
      {/* Bleeds to the screen edges so the row reads as scrollable, while the
          page keeps its px-5 column. The "Add compound" card is ALWAYS the last
          item, so an empty Protocol has a working control rather than copy that
          tells the user to do something the page offers no way to do. */}
      <div className="-mx-5 overflow-x-auto px-5">
        <div className="flex gap-3 pb-1">
          {ordered.map((c) => (
              <CompoundStorageCard
                key={c.id}
                compound={c}
                stock={stockByCompound.get(c.id) ?? null}
                inventoryType={inventoryTypeOf(c)}
                stockKnown={stockKnown}
                todayKey={todayKey}
                onOpen={() => onOpen(c)}
                onAddStock={() => onAddStock(c)}
              />
            ))}

            {/* Same hairline treatment as "New stack" and "New cycle", so the
                three affordances read as one family. No preview: a compound needs
                no explaining. */}
            <button
              type="button"
              onClick={onAddCompound}
              className={cn(
                CARD_W,
                CARD_H,
                "hairline flex shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border-border-default text-text-muted transition hover:text-foreground active:scale-[0.98]"
              )}
            >
              <Plus className="h-5 w-5" aria-hidden />
              <span className="text-sm">Add compound</span>
            </button>
        </div>
      </div>
    </section>
  )
}

/** Most-held category first; alphabetical inside each. */
export function orderByCategoryVolume(compounds: StackCompound[]): StackCompound[] {
  const counts = new Map<string, number>()
  for (const c of compounds) counts.set(c.category, (counts.get(c.category) ?? 0) + 1)

  return [...compounds].sort((a, b) => {
    const byVolume = (counts.get(b.category) ?? 0) - (counts.get(a.category) ?? 0)
    if (byVolume !== 0) return byVolume
    // Same volume — settle it on the category NAME so the order is deterministic
    // rather than whatever order the categories happened to be seen in.
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    return a.name.localeCompare(b.name)
  })
}

export function inventoryTypeOf(c: StackCompound): string | null {
  const lower = c.name.toLowerCase()
  const cat = COMPOUNDS.find((x) => x.name.toLowerCase() === lower)
  if (cat) {
    const forms = routesOf(cat)
    return (
      (forms.find((f) => f.route === c.method) ?? forms[0])?.inventoryType ?? null
    )
  }
  // CUSTOM compound: not in the catalogue, so there is no route table to read.
  // Fall back to its METHOD, which is the same rule AddStockSheet uses. Returning
  // null here made every custom untrackable, and `supabase/protocol/004` exists
  // precisely so customs can carry vials.
  return methodToInventoryType(c.method)
}

/** A route's default inventory form, for compounds with no catalogue row. */
function methodToInventoryType(method: StackCompound["method"]): string {
  return method === "po" ? "oral_solid" : "preconcentrated"
}
