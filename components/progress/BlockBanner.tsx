"use client"

import { useSyncExternalStore } from "react"
import Link from "next/link"
import { CaretRight } from "@/components/icons"

import { cn } from "@/lib/utils"
import { CARD_EYEBROW, DATA_MONO } from "@/lib/ui-presets"
import { activeBlock, blockProgress, type Block } from "@/lib/blocks/block"
import {
  EMPTY_BLOCKS,
  getBlocksSnapshot,
  subscribeBlocks,
} from "@/lib/blocks/blockStore"

/**
 * The live block, at the top of Progress (Adrian, 2026-07-30: slim banner, own
 * page).
 *
 * Slim rather than a hero card on purpose. A block is the FRAME for everything
 * below it — the photos, the weight, the consistency all belong to the window it
 * defines — and a frame that pushed the photo below the fold would be competing
 * with the thing it frames. One number does not need a ring.
 *
 * Every string states a fact. No "on track", no "behind", nothing that would
 * want a colour: `architecture.md`'s categorical-never-evaluative rule covers
 * health data, and while a block is the user's own plan rather than a reading,
 * the moment a progress bar starts judging you it has crossed into the same
 * territory. Week N of M, days left, a date.
 */
export function BlockBanner({
  userId,
  todayKey,
  /** Dev-preview-only: render without a device store. */
  sampleBlocks,
}: {
  userId: string
  todayKey: string
  sampleBlocks?: Block[]
}) {
  const live = useSyncExternalStore(
    subscribeBlocks,
    () => getBlocksSnapshot(userId),
    () => EMPTY_BLOCKS,
  )
  const blocks = sampleBlocks ?? live
  const block = activeBlock(blocks)

  // Nothing live: an invitation, not an empty state with a hole in it. This is
  // also where the word "block" gets taught, which is the answer to "will people
  // know what that means" without reaching for a mushier word.
  if (!block) {
    return (
      <Link
        href="/blocks"
        className="flex items-center gap-3 rounded-2xl bg-bg-surface p-5 transition-colors hover:bg-bg-surface-raised/40"
      >
        <span className="min-w-0 flex-1">
          <span className={cn(CARD_EYEBROW, "block")}>Blocks</span>
          <span className="mt-1.5 block text-sm text-text-muted">
            A block is a stretch of training with a start and an end. A prep, an
            off-season, a cut.
          </span>
        </span>
        <CaretRight className="h-5 w-5 shrink-0 text-text-subtle" aria-hidden />
      </Link>
    )
  }

  const p = blockProgress(block, todayKey)

  return (
    <Link
      href="/blocks"
      className="block rounded-2xl bg-bg-surface p-5 transition-colors hover:bg-bg-surface-raised/40"
    >
      <div className="flex items-center gap-3">
        <span className={cn(CARD_EYEBROW, "min-w-0 flex-1 truncate")}>
          {block.name}
        </span>
        <span className={DATA_MONO}>
          {p.totalWeeks != null ? `Week ${p.week} of ${p.totalWeeks}` : `Week ${p.week}`}
        </span>
        <CaretRight className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
      </div>

      {/* A bar, not a ring. It is one figure and it is a length of time, which
          is what a bar already looks like. Open-ended blocks get no bar at all
          rather than a fake one: there is no denominator. */}
      {p.fraction != null ? (
        <div
          className="mt-3 h-1 w-full overflow-hidden rounded-full bg-bg-input"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(p.fraction * 100)}
          aria-label={`${block.name}, week ${p.week} of ${p.totalWeeks}`}
        >
          <div
            className="h-full rounded-full bg-accent-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${p.fraction * 100}%` }}
          />
        </div>
      ) : null}

      <p className="mt-2 text-xs text-text-muted">
        {p.overrun
          ? `Ran past ${formatDate(block.endsOn)}. Close it to look back on it.`
          : p.daysRemaining != null
            ? `${p.daysRemaining} ${p.daysRemaining === 1 ? "day" : "days"} left, ends ${formatDate(block.endsOn)}`
            : `Started ${formatDate(block.startedOn)}`}
      </p>
    </Link>
  )
}

/**
 * "24 Sep". Short because it sits inside a one-line summary.
 *
 * A literal table rather than `toLocaleDateString`, which renders September as
 * "Sept" in current ICU while every other month gets three letters — and the
 * rest of the app (`lib/progress/photos.ts`, the calendar) already uses this
 * exact three-letter set. One screen spelling a month differently is the kind of
 * detail that reads as sloppy without anyone being able to say why.
 */
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

function formatDate(key: string | null): string {
  if (!key) return ""
  const [y, m, d] = key.split("-").map(Number)
  if (!y || !m || !d) return key
  return `${d} ${MONTHS_SHORT[m - 1] ?? ""}`
}
