"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, CaretRight, Plus } from "@/components/icons"

import { cn } from "@/lib/utils"
import { PageScrollTitle } from "@/components/layout/PageScrollTitle"
import { useDeviceToday } from "@/components/home/useDeviceToday"
import { BlockCreateSheet } from "@/components/blocks/BlockCreateSheet"
import { BlockEndPrompt } from "@/components/blocks/BlockEndPrompt"
import { BlockRetrospective } from "@/components/blocks/BlockRetrospective"
import type { WeightUnit } from "@/lib/weight"
import { useCloudHydration } from "@/components/home/useCloudHydration"
import { BlockActionsMenu } from "@/components/blocks/BlockActionsMenu"
import { dismissEndPrompt } from "@/lib/blocks/endPromptDismissal"
import {
  activeBlock,
  blockProgress,
  blockWindow,
  formatDuration,
  pastBlocks,
  targetProgress,
  targetReading,
  weekLabel,
  type Block,
} from "@/lib/blocks/block"
import {
  CARD_EYEBROW,
  DATA_MONO,
  METRIC_VALUE,
  UNIT_SUFFIX,
} from "@/lib/ui-presets"
import { formatPhotoDateShort } from "@/lib/progress/photos"
import type { BloodworkPhoto } from "@/lib/progress/bloodwork"
import type { JournalEntry } from "@/lib/progress/journal"
import type { ProgressPhoto } from "@/lib/progress/photos"
import type { StackCompound } from "@/lib/home/stack"
import type { DayLogs } from "@/lib/home/doseLog"

/**
 * `/blocks` — the live block, and the look-back list.
 *
 * Its own route rather than a sheet (following `/weight`): a retrospective is
 * long enough to want a page it can scroll rather than a sheet's height to
 * fight, and it is a canonical view someone returns to rather than a step in a
 * flow.
 *
 * Which block is open lives in the URL (`?block=<id>`) rather than in component
 * state, so the phone's back button walks back to the list instead of leaving
 * the app's Blocks section entirely. Everything is already loaded, so the switch
 * costs no fetch.
 */
export function BlocksScreen({
  blocks,
  selectedId,
  todayKey: serverTodayKey,
  userId,
  weight,
  photos,
  bloods,
  journal,
  /** The reader's weight unit. Storage is always kg; this is display only. */
  unit = "kg",
  /** Dev-preview-only: inject the device stores without signing in. */
  sampleStack,
  sampleLogs,
}: {
  blocks: Block[]
  selectedId?: string
  todayKey: string
  userId: string
  weight: { key: string; kg: number }[]
  unit?: WeightUnit
  photos: ProgressPhoto[]
  bloods: BloodworkPhoto[]
  journal: JournalEntry[]
  sampleStack?: StackCompound[]
  sampleLogs?: DayLogs
}) {
  const [creating, setCreating] = useState(false)
  const [ending, setEnding] = useState(false)

  // The retrospective reads the dose log out of the DEVICE store. Without this
  // a device that had never opened Home or Protocol reported a measured "0%"
  // consistency for a block that has doses in it.
  useCloudHydration(userId)

  // The page hands down the SERVER's date, which is UTC. Every date judgement on
  // this screen and in the sheets below it — the default start, the `max` on the
  // date input, "days left", the retrospective's window — has to be the user's
  // own day or it is wrong by one for most of the world, in one direction or the
  // other. Corrected once, here, so a single value flows to all of them.
  const todayKey = useDeviceToday(serverTodayKey)

  const live = activeBlock(blocks)
  const past = pastBlocks(blocks)
  const selected = selectedId ? blocks.find((b) => b.id === selectedId) : undefined
  const latestWeight = weight.length > 0 ? weight[weight.length - 1].kg : null

  const shared = {
    todayKey,
    userId,
    weight,
    photos,
    bloods,
    journal,
    unit,
    sampleStack,
    sampleLogs,
  }

  // ── One block's look-back ────────────────────────────────────────────────
  if (selected) {
    const window = blockWindow(selected, todayKey)
    return (
      <div className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5">
        <div className="animate-home-up" style={{ animationDelay: "0ms" }}>
          <Link
            href="/blocks"
            /* 44px. It is the primary way back from the page a block now opens
               onto, and it measured 20px tall. */
            className="-ml-2 inline-flex min-h-11 items-center gap-2 px-2 text-sm text-text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Blocks
          </Link>
          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-light tracking-[-0.02em] text-foreground">
                {selected.name}
              </h1>
              <p className="mt-1 text-sm text-text-muted">
                {selected.status === "active" ? "Running" : "Closed"}
                {selected.status !== "active" &&
                  selected.closedOn &&
                  ` ${formatPhotoDateShort(selected.closedOn)}`}
                {" · "}
                {formatDuration(window.days)}
              </p>
            </div>
            {/* Only a LIVE block has anything to end or extend. */}
            {selected.status === "active" && (
              <BlockActionsMenu onEndOrExtend={() => setEnding(true)} />
            )}
          </div>
        </div>

        <div className="animate-home-up" style={{ animationDelay: "55ms" }}>
          <BlockRetrospective block={selected} {...shared} />
        </div>

        {/* The prompt lives on this page now, because the menu that opens it
            does. Same component, same props as the list view used. */}
        {selected.status === "active" && (
          <BlockEndPrompt
            open={ending}
            onOpenChange={setEnding}
            block={selected}
            todayKey={todayKey}
            reachedEnd={blockProgress(selected, todayKey).daysRemaining === 0}
            onResolved={(outcome) =>
              dismissEndPrompt(userId, selected.id, outcome === "left-running")
            }
          />
        )}
      </div>
    )
  }

  // ── The list ─────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5">
      <div className="animate-home-up" style={{ animationDelay: "0ms" }}>
        <PageScrollTitle title="Blocks" />
      </div>

      <div className="animate-home-up" style={{ animationDelay: "40ms" }}>
        {live ? (
          <LiveBlockCard
            block={live}
            todayKey={todayKey}
            latestWeight={latestWeight}
            startWeight={startWeightFor(live, weight)}
            unit={unit}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="hairline flex w-full flex-col items-center gap-1.5 rounded-2xl border-border-default px-6 py-8 text-center text-text-muted transition hover:text-foreground active:scale-[0.98]"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <Plus className="h-4 w-4" aria-hidden />
              New block
            </span>
            <span className="text-xs text-text-subtle">
              A prep, an off-season, a cut. Start and end dates, and what you ran.
            </span>
          </button>
        )}
      </div>

      {live && (
        <div className="animate-home-up" style={{ animationDelay: "70ms" }}>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="hairline flex w-full items-center justify-center gap-2 rounded-2xl border-border-default px-6 py-4 text-sm font-medium text-text-muted transition hover:text-foreground active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New block
          </button>
        </div>
      )}

      {past.length > 0 && (
        <div className="animate-home-up space-y-2" style={{ animationDelay: "100ms" }}>
          <p className={CARD_EYEBROW}>Look back</p>
          {past.map((b) => (
            <PastBlockRow key={b.id} block={b} todayKey={todayKey} />
          ))}
        </div>
      )}

      <BlockCreateSheet
        open={creating}
        onOpenChange={setCreating}
        todayKey={todayKey}
        liveBlockName={live?.name ?? null}
        currentWeightKg={latestWeight}
        unit={unit}
      />

    </div>
  )
}

/* ------------------------------------------------------------------ pieces */

function LiveBlockCard({
  block,
  todayKey,
  latestWeight,
  startWeight,
  unit,
}: {
  block: Block
  todayKey: string
  latestWeight: number | null
  startWeight: number | null
  unit: WeightUnit
}) {
  const p = blockProgress(block, todayKey)
  const week = weekLabel(p)
  const t = block.targets.find((x) => x.variable === "weight") ?? block.targets[0]
  const target =
    t?.variable === "weight" && startWeight != null && latestWeight != null
      ? targetProgress(t, startWeight, latestWeight)
      : null
  const consistencyTarget = t?.variable === "consistency" ? t : null

  /* THE WHOLE CARD IS THE LINK (Adrian, 2026-07-30). It carried two buttons,
     "Look back" and "End or extend", which is two decisions to make before you
     can see the thing you came for. Tapping a block now opens its look-back,
     which is what you want almost every time; ending and extending live behind
     the menu on that page, next to the block they act on. */
  return (
    <Link
      href={`/blocks?block=${block.id}`}
      className="block rounded-2xl bg-bg-surface p-5 transition-transform duration-150 ease-out active:scale-[0.99] motion-reduce:transition-none"
    >
      <div className="flex items-center gap-3">
        <span className={cn(CARD_EYEBROW, "min-w-0 flex-1 truncate")}>Running now</span>
        <CaretRight className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
      </div>

      <p className="mt-1.5 flex items-baseline gap-2">
        <span className={METRIC_VALUE}>{week.value}</span>
        <span className={UNIT_SUFFIX}>{week.suffix}</span>
      </p>
      <p className="mt-0.5 text-sm text-foreground">{block.name}</p>

      {p.fraction != null && (
        <div
          className="mt-3 h-1 w-full overflow-hidden rounded-full bg-bg-input"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(p.fraction * 100)}
          aria-label={`${block.name}, ${week.value} ${week.suffix}`}
        >
          <div
            className="h-full rounded-full bg-accent-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${p.fraction * 100}%` }}
          />
        </div>
      )}

      {target ? (
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <span className={DATA_MONO}>Weight</span>
          <span className={DATA_MONO}>
            {targetReading(target, unit)}
          </span>
        </div>
      ) : consistencyTarget ? (
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <span className={DATA_MONO}>Consistency</span>
          <span className={DATA_MONO}>{trimNum(consistencyTarget.value)}% target</span>
        </div>
      ) : null}

      <p className="mt-2 text-xs text-text-muted">
        {p.overrun
          ? `Ran past ${formatPhotoDateShort(block.endsOn ?? "")}. Close it to look back on it.`
          : p.daysRemaining != null
            ? `${p.daysRemaining} ${p.daysRemaining === 1 ? "day" : "days"} left, ends ${formatPhotoDateShort(block.endsOn ?? "")}`
            : `Started ${formatPhotoDateShort(block.startedOn)}`}
      </p>

    </Link>
  )
}

function PastBlockRow({ block, todayKey }: { block: Block; todayKey: string }) {
  const window = blockWindow(block, todayKey)
  return (
    <Link
      href={`/blocks?block=${block.id}`}
      className="flex items-center gap-3 rounded-2xl bg-bg-surface px-5 py-4 transition-colors hover:bg-bg-surface-raised/40"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">{block.name}</span>
        <span className="mt-0.5 block text-xs text-text-muted">
          {formatDuration(window.days)} · {formatPhotoDateShort(window.from)} to{" "}
          {formatPhotoDateShort(window.to)}
        </span>
      </span>
      <CaretRight className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
    </Link>
  )
}

/**
 * The weight a target measures FROM: the last reading on or before the block
 * started, or failing that the first one inside it.
 *
 * The fallback matters. Someone who starts logging weight a week into a prep
 * still gets a reading, anchored to their first weigh-in of the block rather
 * than to nothing at all — and anchoring to their earliest ever weigh-in
 * instead would credit the block with change that happened before it.
 */
function startWeightFor(
  block: Block,
  weight: { key: string; kg: number }[],
): number | null {
  const sorted = weight.slice().sort((a, b) => a.key.localeCompare(b.key))
  return (
    sorted.filter((w) => w.key <= block.startedOn).at(-1)?.kg ??
    sorted.find((w) => w.key >= block.startedOn)?.kg ??
    null
  )
}

/** One decimal at most, trailing zero dropped: "4", "3.5". */
function trimNum(n: number): string {
  return String(Number(n.toFixed(1)))
}
