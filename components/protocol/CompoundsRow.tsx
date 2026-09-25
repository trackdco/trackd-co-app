"use client"

import { useState } from "react"

import { CARD_EYEBROW, PRESS } from "@/lib/ui-presets"
import { Plus } from "@/components/icons"
import { TypeRail } from "@/components/feel/TypeRail"
import { CARD_W, CompoundStorageCard } from "@/components/protocol/CompoundStorageCard"
import { cn } from "@/lib/utils"
import { categoryRank } from "@/lib/compound-categories"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import type { StackCompound } from "@/lib/home/stack"
import type { StockItem } from "@/lib/db/inventory"

/**
 * Protocol's compounds, WITH their stock (build-brief-final §3.7: Protocol owns
 * stock; the Stock page is gone). The type rail from Home over a sideways row
 * of cards, one per compound in category order, and an "Add" card at the end,
 * so an empty Protocol still has a working control.
 */
export function CompoundsRow({
  compounds,
  stockByCompound,
  othersByCompound,
  stockKnown,
  todayKey,
  onOpen,
  onAddStock,
  onAddCompound,
}: {
  compounds: StackCompound[]
  stockByCompound: Map<string, StockItem>
  /** Containers held beyond the one in use, per compound. */
  othersByCompound: Map<string, number>
  stockKnown: boolean
  todayKey: string
  onOpen: (c: StackCompound) => void
  onAddStock: (c: StackCompound) => void
  onAddCompound: () => void
}) {
  const [type, setType] = useState("all")
  const ordered = orderByCategory(compounds)
  const shown = type === "all" ? ordered : ordered.filter((c) => c.category === type)

  return (
    <section className="space-y-3">
      <h2 className={`${CARD_EYEBROW} px-1`}>Compounds</h2>
      <TypeRail categories={compounds.map((c) => c.category)} value={type} onChange={setType} />
      {/* Bleeds to the screen edges so the row reads as scrollable, while the
          page keeps its px-5 column. */}
      <div className="type-rail -mx-5 overflow-x-auto px-5">
        <div className="flex items-stretch gap-2 pb-1">
          {shown.map((c) => (
            <CompoundStorageCard
              key={c.id}
              compound={c}
              stock={stockByCompound.get(c.id) ?? null}
              others={othersByCompound.get(c.id) ?? 0}
              inventoryType={inventoryTypeOf(c)}
              stockKnown={stockKnown}
              todayKey={todayKey}
              onOpen={() => onOpen(c)}
              onAddStock={() => onAddStock(c)}
            />
          ))}
          <button
            type="button"
            onClick={onAddCompound}
            className={cn(
              PRESS.card,
              "flex w-[86px] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl text-[12px] text-foreground shadow-[inset_0_0_0_1px_var(--border-strong)]",
              shown.length === 0 && cn(CARD_W, "min-h-[136px]"),
            )}
          >
            <span className="inst-ghost flex h-[34px] w-[34px] items-center justify-center rounded-lg">
              <Plus className="h-4 w-4" aria-hidden />
            </span>
            Add
          </button>
        </div>
      </div>
    </section>
  )
}

export function orderByCategory(compounds: StackCompound[]): StackCompound[] {
  return [...compounds].sort((a, b) => {
    const byCategory = categoryRank(a.category) - categoryRank(b.category)
    if (byCategory !== 0) return byCategory
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    return a.name.localeCompare(b.name)
  })
}

function inventoryTypeOf(c: StackCompound): string | null {
  return inventoryTypeForCompound(c.name, c.method, c.inventoryForm)
}
