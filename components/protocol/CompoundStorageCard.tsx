"use client"

import { cn } from "@/lib/utils"
import { HIT_Y_TEXT, PRESS } from "@/lib/ui-presets"
import { AnimatedContainer, Container } from "@/components/containers"
import type { StackCompound } from "@/lib/home/stack"
import type { StockItem } from "@/lib/db/inventory"
import { activePause } from "@/lib/home/pauses"
import { cardStockLine } from "@/lib/protocol/stockPage"
import { cardName, extrasDrawn } from "@/lib/protocol/compoundRow"
import { containerNoun } from "@/lib/containers/labels"

/** A card's width. A little bigger than the first build's 112 (W49). */
export const CARD_W = "w-[124px]"
/** The container's drawn height, up from 54 (W49). */
const CONTAINER_SIZE = 62

/**
 * One compound on Protocol's compounds row (build-brief-final §3.7, and
 * Adrian's walk of the preview, 2026-09-26):
 *
 * - Its container, drawn filled to the level of the one in use. With nothing
 *   on hand it is still drawn, at the app's illustrative level, over "Add
 *   stock" (W13: the dotted vial read as broken).
 * - The containers held beyond the one in use are drawn stacked behind it,
 *   fading, with the count on a small badge (W18, his "stack" pick for spares
 *   in round three), rather than a "+2 vials" line competing with the name.
 * - The name in full: a blend reads as its name over what it holds, and may
 *   take a third line (cold review D10).
 * - "Runs dry" over when (W15, the current app's wording he liked), amber at a
 *   week or less.
 *
 * The WHOLE card presses (W14): the press used to shrink and dim only the
 * button inside it, so the vial and name moved inside a card that stood still.
 * The open button covers the card; "Add stock" sits above it with its own
 * press and a 44-point reach (cold review D8), drawn as before.
 */
export function CompoundStorageCard({
  compound,
  stock,
  others,
  inventoryType,
  stockKnown,
  todayKey,
  onOpen,
  onAddStock,
  extraFills,
}: {
  compound: StackCompound
  /** The container in use, with ITS OWN figures and the compound's runway. */
  stock: StockItem | null
  /** How many more containers it holds beyond the one in use. */
  others: number
  inventoryType: string | null
  stockKnown: boolean
  todayKey: string
  onOpen: () => void
  onAddStock: () => void
  /** How full to draw each container stacked behind the one in use, nearest
   *  first (`extraFill`). Missing: drawn full. */
  extraFills?: readonly number[]
}) {
  const paused = activePause(compound.pauses, todayKey) !== null
  // No figure, no `fill`: the container draws its illustrative level, which is
  // what "no figure" means everywhere (`ContainerProps.fill`).
  const fill =
    stock && stock.remainingBase != null && stock.totalBase
      ? Math.max(0, Math.min(1, stock.remainingBase / stock.totalBase))
      : undefined
  const line = stock ? cardStockLine(stock, paused, todayKey) : null
  const type = stock?.inventoryType ?? inventoryType
  // The shared noun (a dropper is a dropper, a counted oral a bottle), not a
  // local guess that called every dropper a vial.
  const noun = containerNoun({
    inventoryType: type,
    totalAmountUnit: stock?.totalAmountUnit,
    category: compound.category,
    name: compound.name,
  })
  const more = stock && others > 0 ? others : 0
  const extras = extrasDrawn(more)
  const name = cardName(compound.name)
  const spoken = [
    compound.name,
    more > 0 ? `${more} more ${noun}${more === 1 ? "" : "s"}` : null,
    line ? (line.label ? `${line.label.toLowerCase()} ${line.text}` : line.text) : null,
  ]
    .filter(Boolean)
    .join(", ")

  return (
    <div className={cn(CARD_W, PRESS.card, "inst-card relative flex shrink-0 flex-col items-center px-2 pt-3.5 pb-3")}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={spoken}
        className="flex w-full flex-1 flex-col items-center gap-2 outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring/60"
      >
        <span
          className="relative flex h-[64px] items-end"
          style={extras.length ? { paddingRight: extras[extras.length - 1].offsetX } : undefined}
        >
          {/* Farthest first, so the nearest spare sits over the others. */}
          {extras.map((e, i) => ({ ...e, fill: extraFills?.[i] ?? 1 })).reverse().map((e) => (
            <span
              key={e.offsetX}
              aria-hidden
              className="absolute bottom-0 left-0"
              style={{
                transform: `translate(${e.offsetX}px, ${-e.lift}px) scale(${e.scale})`,
                transformOrigin: "bottom center",
                opacity: e.opacity,
              }}
            >
              <Container
                name={compound.name}
                inventoryType={type}
                category={compound.category}
                fill={e.fill}
                size={CONTAINER_SIZE}
              />
            </span>
          ))}
          <span className="relative">
            <AnimatedContainer
              name={compound.name}
              inventoryType={type}
              category={compound.category}
              fill={fill}
              size={CONTAINER_SIZE}
            />
          </span>
          {more > 0 ? (
            <span
              aria-hidden
              className="absolute -top-1 -right-2.5 rounded-[6px] bg-bg-surface-raised px-1 py-px font-mono text-[10px] leading-tight text-foreground"
            >
              +{more}
            </span>
          ) : null}
        </span>
        <span className="w-full text-center leading-tight text-balance [overflow-wrap:anywhere]">
          <span className="block text-[13px] text-foreground">{name.head}</span>
          {name.parts ? (
            <span className="mt-0.5 block text-[11px] text-text-muted">
              {name.parts.map((p, i) => (
                <span key={p}>
                  {i > 0 ? " " : null}
                  <span className="whitespace-nowrap">
                    {p}
                    {i < name.parts!.length - 1 ? " +" : ""}
                  </span>
                </span>
              ))}
            </span>
          ) : null}
        </span>
      </button>

      {/* The foot: the same height whatever it holds, so a card does not
          jump when the stock read lands. Taps on the words open the card. */}
      <div className="mt-2 flex min-h-[30px] w-full flex-col items-center justify-end">
        {!stockKnown ? null : stock ? (
          line ? (
            <>
              {line.label ? <span className="text-[10.5px] leading-tight text-text-muted">{line.label}</span> : null}
              <span
                className={cn(
                  "font-mono text-[12px] leading-tight",
                  line.low ? "text-accent-amber" : "text-foreground",
                )}
              >
                {line.text}
              </span>
            </>
          ) : null
        ) : (
          <button
            type="button"
            onClick={onAddStock}
            aria-label={`Add stock for ${compound.name}`}
            className={cn(PRESS.text, HIT_Y_TEXT, "px-1 font-mono text-[11px] text-text-muted")}
          >
            Add stock
          </button>
        )}
      </div>
    </div>
  )
}
