"use client"

import { useLayoutEffect, useRef, useState } from "react"

import { CARD_EYEBROW, PRESS } from "@/lib/ui-presets"
import { Plus } from "@/components/icons"
import { SolidIcon } from "@/components/feel/SolidIcon"
import { TypeRail } from "@/components/feel/TypeRail"
import { CARD_W, CompoundStorageCard } from "@/components/protocol/CompoundStorageCard"
import { cn } from "@/lib/utils"
import { effectiveType, orderByCategory as orderRow, rowEntrance, rowGroups } from "@/lib/protocol/compoundRow"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { CATEGORY_GLYPH } from "@/lib/solidGlyphs"
import type { StackCompound } from "@/lib/home/stack"
import type { StockItem } from "@/lib/db/inventory"

/** Names the row's own entrance, so a new switch finds and replaces it. */
const ROW_IN = "protocol-row-in"

/**
 * Protocol's compounds, WITH their stock (build-brief-final §3.7: Protocol owns
 * stock; the Stock page is gone). The type rail from Home over a sideways row
 * of cards, grouped under their type titles in the Half-life page's eyebrow
 * (W16), and an "Add" card at the end, so an empty Protocol still has a
 * working control.
 *
 * Switching the type brings the cards in one by one, sliding in along the row
 * with the Add card last (W46), however many are left to show; reduced motion
 * fades them in together. The row goes back to its start, so what came in is
 * what you see.
 */
export function CompoundsRow({
  compounds,
  stockByCompound,
  othersByCompound,
  extraFills,
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
  /** Per compound, how full to draw each container stacked behind the one in
   *  use, nearest first. */
  extraFills?: ReadonlyMap<string, readonly number[]>
  stockKnown: boolean
  todayKey: string
  onOpen: (c: StackCompound) => void
  onAddStock: (c: StackCompound) => void
  onAddCompound: () => void
}) {
  const [picked, setPicked] = useState("all")
  const type = effectiveType(picked, compounds)
  const groups = rowGroups(compounds, type)
  const count = groups.reduce((n, g) => n + g.compounds.length, 0)
  const rowRef = useRef<HTMLDivElement>(null)
  // The type last drawn. The first paint is the page's own arrival, so only a
  // CHANGE plays the entrance.
  const drawnType = useRef(type)

  // Before paint, so a card never shows where it will slide in from.
  useLayoutEffect(() => {
    if (drawnType.current === type) return
    drawnType.current = type
    if (rowRef.current) playEntrance(rowRef.current)
  }, [type])

  return (
    <section className="space-y-3">
      <h2 className={`${CARD_EYEBROW} px-1`}>Compounds</h2>
      <TypeRail categories={compounds.map((c) => c.category)} value={type} onChange={setPicked} />
      {/* Bleeds to the screen edges so the row reads as scrollable, while the
          page keeps its px-5 column. The 8px above and below is room for the
          cards' press and "Add stock"'s reach, which a scroll box would clip. */}
      <div ref={rowRef} className="type-rail -mx-5 -my-2 overflow-x-auto px-5 py-2">
        <div className="flex w-max items-stretch gap-4">
          {groups.map((g) => (
            <div key={g.key} className="flex flex-col">
              <p
                data-row-in={g.start}
                className={cn(CARD_EYEBROW, "mb-2 flex items-center gap-1.5 whitespace-nowrap px-1")}
              >
                <SolidIcon name={CATEGORY_GLYPH[g.key] ?? "catPeptide"} size={13} hue={`var(--cat-${g.key})`} />
                {g.label}
              </p>
              <div className="flex flex-1 items-stretch gap-2">
                {g.compounds.map((c, i) => (
                  <div key={c.id} data-row-in={g.start + i} className="flex">
                    <CompoundStorageCard
                      compound={c}
                      stock={stockByCompound.get(c.id) ?? null}
                      others={othersByCompound.get(c.id) ?? 0}
                      extraFills={extraFills?.get(c.id)}
                      inventoryType={inventoryTypeOf(c)}
                      stockKnown={stockKnown}
                      todayKey={todayKey}
                      onOpen={() => onOpen(c)}
                      onAddStock={() => onAddStock(c)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="flex flex-col">
            {count > 0 ? (
              // Lines the Add card up with the cards, under no title of its own.
              <p aria-hidden className={cn(CARD_EYEBROW, "invisible mb-2 flex items-center gap-1.5 px-1")}>
                <span className="h-[13px] w-px" />
                &nbsp;
              </p>
            ) : null}
            <div data-row-in={count} className="flex flex-1">
              <button
                type="button"
                onClick={onAddCompound}
                className={cn(
                  PRESS.card,
                  "flex w-[92px] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl text-[13px] text-foreground shadow-[inset_0_0_0_1px_var(--border-strong)]",
                  count === 0 && cn(CARD_W, "min-h-[152px]"),
                )}
              >
                <span className="inst-ghost flex h-[38px] w-[38px] items-center justify-center rounded-lg">
                  <Plus className="h-[18px] w-[18px]" aria-hidden />
                </span>
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * Plays the type switch's entrance on every `[data-row-in]` in the row, in the
 * order its value gives. A card still coming in from the last switch carries
 * on from where it is (no snap back); the rest start just off to the right,
 * clear. Transform and opacity only, and nothing is left on the element after.
 */
function playEntrance(row: HTMLElement) {
  row.scrollLeft = 0
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  for (const el of row.querySelectorAll<HTMLElement>("[data-row-in]")) {
    if (typeof el.animate !== "function") return
    const t = rowEntrance(Number(el.dataset.rowIn) || 0, reduced)
    const running = el.getAnimations().filter((a) => a.id === ROW_IN)
    let from: Keyframe = { opacity: 0, transform: t.fromX ? `translateX(${t.fromX}px)` : "none" }
    let delay = t.delay
    if (running.length > 0) {
      const now = getComputedStyle(el)
      from = { opacity: now.opacity, transform: now.transform }
      // Already on its way in: it keeps going rather than waiting its turn.
      delay = 0
      for (const a of running) a.cancel()
    }
    const anim = el.animate([from, { opacity: 1, transform: "none" }], {
      duration: t.duration,
      delay,
      easing: t.easing,
      fill: "backwards",
    })
    anim.id = ROW_IN
  }
}

/** Category order, then name. Kept here for its callers; the rule is in lib. */
export function orderByCategory(compounds: StackCompound[]): StackCompound[] {
  return orderRow(compounds)
}

function inventoryTypeOf(c: StackCompound): string | null {
  return inventoryTypeForCompound(c.name, c.method, c.inventoryForm)
}
