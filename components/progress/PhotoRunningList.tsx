"use client"

import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"

import { CaretRight } from "@/components/icons"
import { Container } from "@/components/containers/Container"
import { TypeRail } from "@/components/feel/TypeRail"
import { useMounted } from "@/components/home/useMounted"
import { Fold } from "@/components/protocol/pages/Subpage"
import { CARD_EYEBROW, DATA_MONO, PRESS, ROWS } from "@/lib/ui-presets"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { compoundsRunningOn, type RunningCompound } from "@/lib/progress/running"
import { VIEWER } from "@/lib/progress/viewerGesture"
import {
  getStackSnapshot,
  subscribeStack,
  type StackCompound,
} from "@/lib/home/stack"
import {
  getDoseLogsSnapshot,
  subscribeDoseLogs,
  type DayLogs,
} from "@/lib/home/doseLog"
import { cn } from "@/lib/utils"

const EMPTY_STACK: StackCompound[] = []
const EMPTY_LOGS: DayLogs = {}

/**
 * What the user was RUNNING on a PHOTO'S date (spec 08 · part two), as the
 * photos card's folded "Running N" row (build-brief-final §3.15).
 *
 * Running, not logged (Adrian, 2026-07-30). Someone on testosterone every third
 * day is still running it on the two days between injections, and a photo taken
 * on one of those days has to say so. Reading the dose log answered a different
 * question and quietly under-reported every compound that is not daily; the rule
 * now lives in `compoundsRunningOn`, which is pure and tested.
 *
 * The DATE is the other half. Scrolling back to a photo from three months ago
 * and seeing today's protocol under it would be worse than showing nothing, so
 * this resolves against `date` and never against today — including the dose,
 * which comes from the schedule-version trail rather than the compound's
 * current one.
 *
 * Renders NOTHING when nothing was running (spec: "omit the section rather than
 * showing an empty state"), its separator included. That includes the
 * pre-hydration render: the device store is not readable on the server, so a
 * server-rendered empty state would flash and then be replaced.
 *
 * It is attached to the photos on purpose, under a separator (Adrian, final
 * check round one). It starts FOLDED every time: "Running", the count and a
 * chevron that turns as it opens (300ms). Open, it is the type rail ("All" and
 * one chip per type in it) over ONE sideways row, in category order (the sort
 * lives in `compoundsRunningOn`). Switching type re-lays the row, each item
 * rising 6px and fading in, 35ms apart.
 */
export function PhotoRunningList({
  date,
  userId,
  /** Dev-preview-only: inject the device stores without signing in. */
  sampleStack,
  sampleLogs,
}: {
  date: string
  userId: string
  sampleStack?: StackCompound[]
  sampleLogs?: DayLogs
}) {
  const mounted = useMounted()
  const deviceReady = sampleStack ? true : mounted

  const liveStack = useSyncExternalStore(
    subscribeStack,
    () => getStackSnapshot(userId, EMPTY_STACK),
    () => EMPTY_STACK,
  )
  const liveLogs = useSyncExternalStore(
    subscribeDoseLogs,
    () => getDoseLogsSnapshot(userId),
    () => EMPTY_LOGS,
  )
  const stack = sampleStack ?? liveStack
  const logs = sampleLogs ?? liveLogs

  // The log bounds each run at its first recorded dose, so a compound that was
  // added and removed without ever being taken is not claimed under a photo.
  const running = useMemo(
    () => (deviceReady ? compoundsRunningOn(stack, date, logs) : []),
    [deviceReady, stack, date, logs],
  )

  const [open, setOpen] = useState(false)
  const [type, setType] = useState("all")
  // Only a type SWITCH animates the row; opening the fold does not.
  const [switched, setSwitched] = useState(false)

  // KNOWN, NOT FIXED: on a throttled connection this returns null until the
  // device store hydrates and then appears, shoving what is below it down. It is
  // one folded row now rather than a list, so the jump is one row's height. It
  // still needs a real answer (a server-rendered hint, or a skeleton that
  // matches either outcome). See `next-tasks.md`.
  if (running.length === 0) return null

  const categories = running.map((c) => c.category)
  // A type that is not on this date (the date changed under it) reads as All.
  const active = type !== "all" && categories.includes(type) ? type : "all"
  const shown = active === "all" ? running : running.filter((c) => c.category === active)

  return (
    <div className="mt-4">
      {/* The separator: a dark line with a lit edge under it, as rows divide. */}
      <div
        aria-hidden
        className="h-px bg-black/40"
        style={{ boxShadow: "0 1px 0 color-mix(in srgb, var(--text-primary) 4%, transparent)" }}
      />
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(PRESS.text, "mt-1 -mb-3 flex min-h-11 w-full items-center gap-2 text-left")}
      >
        <span className={CARD_EYEBROW}>Running</span>
        <span className={cn(DATA_MONO, "text-[10px]")}>{running.length}</span>
        <span className="flex-1" />
        {/* `.cy-chev` turns 90deg under an expanded parent, 300ms. */}
        <CaretRight className="cy-chev h-4 w-4 text-text-muted" aria-hidden />
      </button>

      {/* Bleeds to the card's edges so the row reads as one you can scroll. */}
      <div className="-mx-5">
        <Fold open={open} className="px-5 pt-2">
          <TypeRail
            categories={categories}
            value={active}
            onChange={(v) => {
              setSwitched(true)
              setType(v)
            }}
          />
          <RunRow key={active} items={shown} rise={switched} />
        </Fold>
      </div>
    </div>
  )
}

/** One sideways row: a container, the name in full (truncated), the dose. */
function RunRow({ items, rise }: { items: RunningCompound[]; rise: boolean }) {
  const listRef = useRef<HTMLUListElement>(null)

  // A fresh row after a type switch: each item rises 6px and fades in, 35ms
  // apart. WAAPI with numbers only (`var()` snaps in Safari). Reduced motion:
  // the row just appears.
  useLayoutEffect(() => {
    const list = listRef.current
    if (!rise || !list) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    Array.from(list.children).forEach((el, i) => {
      el.animate(
        [
          { opacity: 0, transform: "translateY(6px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 260, delay: i * 35, easing: VIEWER.ease, fill: "backwards" },
      )
    })
  }, [rise])

  return (
    <ul
      ref={listRef}
      aria-label="Running on this day"
      // `type-rail` hides the scrollbar; the 2px pad keeps each item's outer
      // edge from being clipped by the scroller.
      className="type-rail -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 py-0.5"
    >
      {items.map((c) => (
        <li key={c.id} className={cn(ROWS, "w-[76px] shrink-0")}>
          {/* One child, so the rows block's dividers never draw inside it. */}
          <div className="flex flex-col items-center px-1.5 pt-2.5 pb-2">
            <span className="flex h-[38px] items-end justify-center">
              <Container
                name={c.name}
                inventoryType={inventoryTypeForCompound(c.name, c.method, c.inventoryForm)}
                category={c.category}
                fill={0.62}
                size={34}
              />
            </span>
            <span className="mt-1.5 w-full truncate text-center text-[11px] text-foreground" title={c.name}>
              {c.name}
            </span>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.04em] text-text-muted">
              {c.amount}
              {c.unit ? ` ${c.unit}` : ""}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
