"use client"

import { useState } from "react"
import Link from "next/link"
import { CaretRight, Plus } from "@/components/icons"

import { cn } from "@/lib/utils"
import { useMounted } from "@/components/home/useMounted"
import { useDeviceToday } from "@/components/home/useDeviceToday"
import {
  CARD_EYEBROW,
  DATA_MONO,
  METRIC_VALUE,
  UNIT_SUFFIX,
} from "@/lib/ui-presets"
import { BlockCreateSheet } from "@/components/blocks/BlockCreateSheet"
import { BlockEndPrompt } from "@/components/blocks/BlockEndPrompt"
import {
  dismissEndPrompt,
  isEndPromptDismissed,
  pruneEndPromptDismissals,
} from "@/lib/blocks/endPromptDismissal"
import {
  activeBlock,
  blockProgress,
  pastBlocks,
  targetProgress,
  targetReading,
  weekLabel,
  type Block,
  type BlockTarget,
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
  todayKey: serverTodayKey,
  userId,
  weight,
  blocks,
}: {
  todayKey: string
  /** Scopes the "leave running" memory to the signed-in user. */
  userId: string
  /**
   * Bodyweight points, oldest first. The start reading is resolved HERE rather
   * than by the caller because only this component knows which block is live,
   * and the server that renders the page cannot read the device store at all.
   */
  weight?: { key: string; kg: number }[]
  /** Every block the user has, from Postgres. */
  blocks: Block[]
}) {
  const mounted = useMounted()
  // The page renders on the server, whose date is UTC. That is the user's
  // yesterday for the first ten hours of an Australian day and their tomorrow for
  // the last seven of a Californian one. Uncorrected it fed the default start
  // date on the create sheet, the `max` that decides whether "today" is even
  // selectable, "days left", and the end-date dot.
  const todayKey = useDeviceToday(serverTodayKey)
  const [creating, setCreating] = useState(false)
  const [ending, setEnding] = useState(false)
  /**
   * Whether the dot has been answered with "leave running" on this device.
   *
   * The component owns this and storage only remembers it. Reading storage back
   * to learn what was just tapped is the regression spec 07 shipped briefly: a
   * refused write then reads as a dead control. Here the tap hides the dot
   * whether or not the write lands.
   */
  const [dismissed, setDismissed] = useState(false)
  const block = activeBlock(blocks)
  const past = pastBlocks(blocks)

  // Read the remembered dismissal once the device store is readable. Before
  // mount it is false, which errs toward SHOWING the dot — a dot that appears a
  // frame late is a smaller failure than a prompt that never appears at all.
  const [checkedFor, setCheckedFor] = useState<string | null>(null)
  if (mounted && checkedFor !== (block?.id ?? "")) {
    setCheckedFor(block?.id ?? "")
    setDismissed(block ? isEndPromptDismissed(userId, block.id) : false)
    // A dismissal only means anything while its block is live, so a closed one's
    // entry is dropped here rather than left to accumulate for the life of the
    // device.
    pruneEndPromptDismissals(userId, block ? [block.id] : [])
  }

  // Nothing live: the same hairline affordance Protocol uses for a new stack or
  // cycle (Adrian), so an empty slot looks the same wherever you meet one. Also
  // where the word gets taught, in one line.
  if (!block) {
    return (
      <>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="hairline flex w-full flex-col items-center gap-1.5 rounded-2xl border-border-default px-6 py-5 text-center text-text-muted transition hover:text-foreground active:scale-[0.98]"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Plus className="h-4 w-4" aria-hidden />
            New block
          </span>
          <span className="text-xs text-text-subtle">
            A prep, an off-season, a cut. Start and end dates, and what you ran.
          </span>
        </button>

        {/* Only when there is something to look back on. A link to an empty
            page is worse than no link. */}
        {past.length > 0 && (
          <Link
            href="/blocks"
            /* 44px tall, not the 16px the text alone gave it. With no block live
               this link is the ONLY way into the retrospectives — /blocks is not
               in the bottom nav — so it is the one target on the screen that
               cannot be fiddly. */
            className="mt-1 flex min-h-11 items-center justify-center gap-1.5 text-xs text-text-muted transition-colors hover:text-foreground"
          >
            Look back on {past.length} finished{" "}
            {past.length === 1 ? "block" : "blocks"}
            <CaretRight className="h-3 w-3" aria-hidden />
          </Link>
        )}

        <BlockCreateSheet
          open={creating}
          onOpenChange={setCreating}
          todayKey={todayKey}
          currentWeightKg={weight?.at(-1)?.kg ?? null}
        />
      </>
    )
  }

  const p = blockProgress(block, todayKey)
  const week = weekLabel(p)
  // The WEIGHT target if there is one, because that is the only kind this banner
  // can show progress for — it has weigh-ins and no adherence series. Taking
  // `targets[0]` blindly let a consistency target sitting first hide a weight
  // target that could have been rendered.
  const t = pickBannerTarget(block.targets)
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
    t?.variable === "weight" && startValue != null && currentValue != null
      ? targetProgress(t, startValue, currentValue)
      : null
  // A consistency target has no live figure here (adherence is device-side and
  // this banner has none), so it is STATED rather than silently dropped. It used
  // to vanish completely: the user set a goal and nothing in the app ever
  // mentioned it again. Its progress lives on the block's own page.
  const consistencyTarget = t?.variable === "consistency" ? t : null

  // `daysRemaining === 0` is exactly "today is on or past the end date" — it is
  // clamped at zero, so it cannot mean anything else. ON the end date counts:
  // Adrian's rule is to ask on the end date, not after it.
  const atEnd = p.daysRemaining === 0 && !dismissed

  return (
    <div className="relative">
      <Link
        href="/blocks"
        className="block rounded-2xl bg-bg-surface p-5 transition-colors hover:bg-bg-surface-raised/40"
      >
        <div className="flex items-center gap-3">
          <span className={cn(CARD_EYEBROW, "min-w-0 flex-1 truncate")}>Block</span>
          <CaretRight
            className={cn("h-4 w-4 shrink-0 text-text-subtle", atEnd && "mr-9")}
            aria-hidden
          />
        </div>

        <p className="mt-1.5 flex items-baseline gap-2">
          <span className={METRIC_VALUE}>{week.value}</span>
          <span className={UNIT_SUFFIX}>{week.suffix}</span>
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
            aria-label={`${block.name}, ${week.value} ${week.suffix}`}
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
            <span className={DATA_MONO}>Weight</span>
            <span className={DATA_MONO}>
              {targetReading(target)}
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
            ? `Ran past ${formatDate(block.endsOn)}. Close it to look back on it.`
            : p.daysRemaining != null
              ? `${p.daysRemaining} ${p.daysRemaining === 1 ? "day" : "days"} left, ends ${formatDate(block.endsOn)}`
              : `Started ${formatDate(block.startedOn)}`}
        </p>
      </Link>

      {/* The end-date prompt's dot (Adrian: "a dot on the Blocks banner,
          tapped"). A sibling of the link rather than a child of it, because a
          button inside a link is neither valid nor tappable in the way anyone
          expects. It sits ABOVE the link in the stacking order with a 44px tap
          target, so the tap that looks like it hits the dot does hit the dot.

          Amber (`--accent-amber`) because it is an interactive prompt, which is
          what amber means in this app. NOT `--accent-primary`, which resolves to
          white and put a white dot beside a white progress bar. It is not a
          warning and there is nothing wrong. */}
      {atEnd && (
        <button
          type="button"
          onClick={() => setEnding(true)}
          aria-label={`${block.name} has reached its end date. Extend, close, or leave it running.`}
          className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-accent-amber" aria-hidden />
        </button>
      )}

      <BlockEndPrompt
        open={ending}
        onOpenChange={setEnding}
        block={block}
        todayKey={todayKey}
        onResolved={(outcome) => {
          const left = outcome === "left-running"
          setDismissed(left)
          dismissEndPrompt(userId, block.id, left)
        }}
      />
    </div>
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

/** The weight target if the block has one, else whatever else it has. */
function pickBannerTarget(targets: BlockTarget[]): BlockTarget | undefined {
  return targets.find((t) => t.variable === "weight") ?? targets[0]
}
