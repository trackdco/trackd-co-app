"use client"

import Link from "next/link"
import { CaretRight, Plus } from "@/components/icons"

import { cn } from "@/lib/utils"
import {
  CARD_EYEBROW,
  DATA_MONO,
  METRIC_VALUE,
  UNIT_SUFFIX,
} from "@/lib/ui-presets"
import {
  activeBlock,
  blockProgress,
  targetProgress,
  type Block,
} from "@/lib/blocks/block"

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
  todayKey,
  weight,
  blocks,
}: {
  todayKey: string
  /**
   * Bodyweight points, oldest first. The start reading is resolved HERE rather
   * than by the caller because only this component knows which block is live,
   * and the server that renders the page cannot read the device store at all.
   */
  weight?: { key: string; kg: number }[]
  /** Every block the user has, from Postgres. */
  blocks: Block[]
}) {
  const block = activeBlock(blocks)

  // Nothing live: the same hairline affordance Protocol uses for a new stack or
  // cycle (Adrian), so an empty slot looks the same wherever you meet one. Also
  // where the word gets taught, in one line.
  if (!block) {
    return (
      <Link
        href="/blocks"
        className="hairline flex w-full flex-col items-center gap-1.5 rounded-2xl border-border-default px-6 py-5 text-center text-text-muted transition hover:text-foreground active:scale-[0.98]"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Plus className="h-4 w-4" aria-hidden />
          New block
        </span>
        <span className="text-xs text-text-subtle">
          A prep, an off-season, a cut. Start and end dates, and what you ran.
        </span>
      </Link>
    )
  }

  const p = blockProgress(block, todayKey)
  const t = block.targets[0]
  // Against the reading on (or last before) the block's start date, so the
  // target measures from where the user actually began rather than from their
  // earliest ever weigh-in.
  // The last reading before the block began, or failing that the FIRST one
  // inside it. Someone who started logging weight after starting the block still
  // gets a target reading, anchored to their first weigh-in of it rather than to
  // nothing at all.
  const startValue =
    t?.variable === "weight"
      ? (weight?.filter((w) => w.key <= block.startedOn).at(-1)?.kg ??
        weight?.find((w) => w.key >= block.startedOn)?.kg ??
        null)
      : null
  const currentValue = t?.variable === "weight" ? (weight?.at(-1)?.kg ?? null) : null
  const target =
    t && startValue != null && currentValue != null
      ? targetProgress(t, startValue, currentValue)
      : null

  return (
    <Link
      href="/blocks"
      className="block rounded-2xl bg-bg-surface p-5 transition-colors hover:bg-bg-surface-raised/40"
    >
      <div className="flex items-center gap-3">
        <span className={cn(CARD_EYEBROW, "min-w-0 flex-1 truncate")}>Block</span>
        <CaretRight className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
      </div>

      <p className="mt-1.5 flex items-baseline gap-2">
        <span className={METRIC_VALUE}>
          {p.totalWeeks != null ? `${p.week}` : `${p.week}`}
        </span>
        <span className={UNIT_SUFFIX}>
          {p.totalWeeks != null ? `of ${p.totalWeeks} weeks` : "weeks in"}
        </span>
      </p>
      <p className="mt-0.5 truncate text-sm text-text-muted">{block.name}</p>

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

      {/* The target, when there is one. A SECOND reading beside the time, never
          folded into it: a combined percentage across two unrelated measures
          would be a number nobody could act on. */}
      {target ? (
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <span className={DATA_MONO}>
            {target.variable === "weight" ? "Weight" : "Consistency"}
          </span>
          <span className={DATA_MONO}>
            {target.fraction != null ? `${Math.round(target.fraction * 100)}%` : ""}
            {target.remaining > 0
              ? ` · ${trimNum(target.remaining)}${target.variable === "weight" ? " kg" : "%"} to go`
              : " · reached"}
          </span>
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

/** One decimal at most, trailing zero dropped: "4", "3.5". */
function trimNum(n: number): string {
  return String(Number(n.toFixed(1)))
}
