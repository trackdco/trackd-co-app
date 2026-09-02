"use client"

import { useRouter } from "next/navigation"

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { useSheetDrag } from "@/components/home/useSheetDrag"
import { WeightGraph, type WeightPoint } from "@/components/weight/WeightGraph"
import { ArrowRight } from "@/components/icons"
import { CARD_EYEBROW, DATA_MONO, SHEET_TITLE } from "@/lib/ui-presets"
import { formatPhotoDateShort } from "@/lib/progress/photos"
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
 * closed block does not contain. The way out to `/weight` is at the foot.
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
  const { cardRef, handleProps, cardStyle } = useSheetDrag(() => onOpenChange(false), open)

  // Newest first for the list: the last thing you weighed is the thing you are
  // looking for, which is the order the entry log on /weight uses too.
  const newestFirst = points.slice().reverse()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 border-t-0 bg-transparent p-0 shadow-none"
      >
        <div
          ref={cardRef}
          style={cardStyle}
          className="flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl border-t border-border-default bg-bg-surface shadow-lg"
        >
          <div
            {...handleProps}
            className="flex h-11 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          >
            <span aria-hidden className="h-1 w-9 rounded-full bg-border-strong" />
          </div>

          <SheetTitle className="sr-only">{blockName} weight</SheetTitle>
          <SheetDescription className="sr-only">
            Your weight readings inside this block.
          </SheetDescription>

          <div className="flex-1 overflow-y-auto px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            {/* The scope in three parts, same as the photos gallery: what kind of
                thing, which one, and when. Block names repeat; ranges do not. */}
            <p className={CARD_EYEBROW}>Block weight</p>
            <h2 className={cn(SHEET_TITLE, "mt-1.5")}>{blockName}</h2>
            <p className="mt-1 text-sm text-text-muted">
              {formatPhotoDateShort(from)} to {formatPhotoDateShort(to)}
            </p>

            <WeightGraph
              entries={points}
              unit={unit}
              anchorKey={to}
              spanDays={days}
              className="mt-4 bg-bg-surface-raised"
            />

            {newestFirst.length > 0 && (
              <div className="mt-5">
                <p className={CARD_EYEBROW}>Readings</p>
                <ul className="mt-2 overflow-hidden rounded-2xl bg-bg-surface-raised">
                  {newestFirst.map((p, i) => (
                    <li
                      key={p.key}
                      className={cn(
                        "flex items-center justify-between gap-3 px-4 py-3",
                        i > 0 && "hairline-t",
                      )}
                    >
                      <span className="text-sm text-foreground">
                        {formatPhotoDateShort(p.key)}
                      </span>
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
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm text-text-muted transition-colors hover:text-foreground"
            >
              See all weight
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
