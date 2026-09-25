"use client"

import { cn } from "@/lib/utils"
import { PRESS } from "@/lib/ui-presets"
import { AnimatedContainer } from "@/components/containers"
import type { StackCompound } from "@/lib/home/stack"
import type { StockItem } from "@/lib/db/inventory"
import { activePause } from "@/lib/home/pauses"
import { runsDryText } from "@/lib/protocol/stockPage"

export const CARD_W = "w-[112px]"

/** Nothing on hand: the container's outline, dotted (round two). */
function DottedVial({ size = 50 }: { size?: number }) {
  return (
    <svg width={(size * 26) / 50} height={size} viewBox="0 0 26 50" aria-hidden>
      <rect x="7" y="1" width="12" height="7" rx="2" fill="none" style={{ stroke: "var(--text-muted)" }} strokeWidth="1.2" strokeDasharray="2 2.2" />
      <rect x="2" y="10" width="22" height="38" rx="5" fill="none" style={{ stroke: "var(--text-muted)" }} strokeWidth="1.2" strokeDasharray="2 2.2" />
    </svg>
  )
}

/**
 * One compound on Protocol's compounds row (build-brief-final §3.7): its
 * container (filled to the one in use), its full name, "+N vials" when it holds
 * more than the one in use, and Runs dry as the app words it ("Today",
 * "Tomorrow", "In N days" in amber at 7 or fewer, else the date). With nothing
 * on hand: a dotted container and "Add stock". Tapping the card opens the
 * compound's sheet, where stock is added and mixed.
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
}: {
  compound: StackCompound
  /** The container in use, with doses and runway from the views. */
  stock: StockItem | null
  /** How many more containers it holds beyond the one in use. */
  others: number
  inventoryType: string | null
  stockKnown: boolean
  todayKey: string
  onOpen: () => void
  onAddStock: () => void
}) {
  const paused = activePause(compound.pauses, todayKey) !== null
  const fill =
    stock && stock.remainingBase != null && stock.totalBase
      ? Math.max(0, Math.min(1, stock.remainingBase / stock.totalBase))
      : 1
  const dry = stock && !paused ? runsDryText(stock.daysToEmpty ?? null, todayKey) : null
  const noun = inventoryType === "oral_solid" ? "bottle" : inventoryType === "bulk_powder" ? "tub" : "vial"

  return (
    <div className={cn(CARD_W, "inst-card flex shrink-0 flex-col items-center gap-1.5 px-2 pt-3 pb-2.5")}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${compound.name}, stock`}
        className={cn(PRESS.card, "flex w-full flex-col items-center gap-1.5")}
      >
        <span className="flex h-[54px] items-end justify-center">
          {stock ? (
            <AnimatedContainer name={compound.name} inventoryType={stock.inventoryType ?? inventoryType} category={compound.category} fill={fill} size={54} />
          ) : (
            <DottedVial size={50} />
          )}
        </span>
        <span className="flex h-[2.5em] w-full items-center justify-center">
          <span className="line-clamp-2 text-center text-[12px] leading-tight text-foreground">{compound.name}</span>
        </span>
        {stock && others > 0 ? (
          <span className="font-mono text-[10.5px] text-text-muted">
            +{others} {noun}
            {others === 1 ? "" : "s"}
          </span>
        ) : null}
      </button>
      {!stockKnown ? (
        <span aria-hidden className="h-4" />
      ) : stock ? (
        dry ? (
          <span className={cn("font-mono text-[10.5px]", dry.low ? "text-accent-amber" : "text-text-muted")}>{dry.text}</span>
        ) : (
          <span aria-hidden className="h-4" />
        )
      ) : (
        <button
          type="button"
          onClick={onAddStock}
          aria-label={`Add stock for ${compound.name}`}
          className={cn(PRESS.text, "px-1 font-mono text-[10.5px] text-text-muted")}
        >
          Add stock
        </button>
      )}
    </div>
  )
}
