"use client"

import { useRouter } from "next/navigation"

import { BottomSheet } from "@/components/layout/BottomSheet"
import { WeightGraph, type WeightPoint } from "@/components/weight/WeightGraph"
import { ArrowRight } from "@/components/icons"
import { CARD_EYEBROW, DATA_MONO, PRESS, ROWS, SHEET_TITLE } from "@/lib/ui-presets"
import { dayRange, dayShort } from "@/lib/format/date"
import { formatWeight, type WeightUnit } from "@/lib/weight"
import { cn } from "@/lib/utils"

/**
 * The block's weight, opened from its retrospective.
 *
 * Same graph as `/weight` (`WeightGraph`), bounded to the block's window. The
 * scope changes exactly two things and neither is cosmetic:
 *
 *  - **The ranges offered are only the ones the block CONTAINS.** A six week
 *    block has no 3M button promising a picture it cannot draw. They unlock as
 *    the block gets longer and "All" always means the block (Adrian,
 *    2026-09-03). This is the general rule that a scope fixes time, so nothing
 *    inside it may filter time again.
 *  - **Ranges count back from the block's LAST day, not today.** A block closed
 *    in April measured from now would window to nothing.
 *
 * Read-only, like the photos gallery: logging a weigh-in lands on today, which a
 * closed block does not contain. The way out to `/weight` is at the foot. The
 * one sheet frame (`BottomSheet`, consistency fix #1).
 */
export function BlockWeightSheet({
  open,
  onOpenChange,
  points,
  blockName,
  from,
  to,
  days,
  unit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Readings inside the window, oldest first. */
  points: WeightPoint[]
  blockName: string
  from: string
  to: string
  /** The window's length, which decides which ranges unlock. */
  days: number
  unit: WeightUnit
}) {
  const router = useRouter()

  // Newest first for the list: the last thing you weighed is the thing you are
  // looking for, which is the order the entry log on /weight uses too.
  const newestFirst = points.slice().reverse()

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`${blockName} weight`}
      description="Your weight readings inside this block."
      desktop="rail"
      header={
        // The scope in three parts, same as the photos gallery: what kind of
        // thing, which one, and when. Block names repeat; ranges do not.
        <div>
          <p className={CARD_EYEBROW}>Block weight</p>
          <p aria-hidden className={cn(SHEET_TITLE, "mt-1.5")}>{blockName}</p>
          <p className="mt-1 text-sm text-text-muted">{dayRange(from, to)}</p>
        </div>
      }
    >
      {/* The sections rise in as the sheet lands (feel pass §4). */}
      <div data-sheet-body>
        <WeightGraph
          entries={points}
          unit={unit}
          anchorKey={to}
          spanDays={days}
          className="mt-1 bg-bg-surface-raised"
        />

        {newestFirst.length > 0 && (
          <div className="mt-5">
            <p className={CARD_EYEBROW}>Readings</p>
            <ul className={cn(ROWS, "mt-2 overflow-hidden")}>
              {newestFirst.map((p) => (
                <li key={p.key} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm text-foreground">{dayShort(p.key)}</span>
                  <span className={DATA_MONO}>
                    {formatWeight(p.kg, unit)} {unit}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            onOpenChange(false)
            router.push("/weight")
          }}
          className={cn(
            PRESS.text,
            "mt-5 flex min-h-11 w-full items-center justify-center gap-2 text-sm text-text-muted transition-colors hover:text-foreground",
          )}
        >
          See all weight
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </BottomSheet>
  )
}
