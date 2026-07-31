"use client"

import { useMemo, useSyncExternalStore } from "react"

import { Container } from "@/components/containers/Container"
import { useMounted } from "@/components/home/useMounted"
import { CARD_EYEBROW } from "@/lib/ui-presets"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { compoundsRunningOn } from "@/lib/progress/running"
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

const EMPTY_STACK: StackCompound[] = []
const EMPTY_LOGS: DayLogs = {}

/**
 * What the user was RUNNING on a PHOTO'S date (spec 08 · part two).
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
 * showing an empty state"). That includes the pre-hydration render: the device
 * store is not readable on the server, so a server-rendered empty state would
 * flash and then be replaced.
 *
 * ONE FLAT LIST, ordered by category and NOT labelled (Adrian, 2026-07-31).
 * Anabolics and peptides sit at the top and supplements at the bottom, by
 * consequence rather than by how many of each there are — a single anabolic
 * buried under five supplements is the wrong way round. But the grouping is the
 * ORDER and nothing else: headings would put five labels on what is usually five
 * rows, and the containers already carry the category in their colour.
 *
 * The sort lives in `compoundsRunningOn` so every consumer inherits it.
 *
 * Explicitly not a horizontal row — that was built once and corrected.
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

  // KNOWN, NOT FIXED: on a throttled connection this returns null until the
  // device store hydrates and then appears at ~+4.9s, shoving everything below
  // it down 145px (measured at 390). Reserving the height was tried and backed
  // out: it removes the jump for a user who IS running something and creates an
  // upward collapse for one who is not, and "not running anything yet" is
  // exactly the new user whose first impression this would cost. It needs a
  // real answer (a server-rendered hint, or a skeleton that matches either
  // outcome), not a swap of one shift for another. See `next-tasks.md`.
  if (running.length === 0) return null

  return (
    <div className="px-5 pb-5">
      <p className={CARD_EYEBROW}>Running</p>
      <ul className="mt-2 space-y-1.5">
        {running.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-3 rounded-xl bg-bg-surface-raised px-3 py-2.5"
          >
            <Container
              name={c.name}
              inventoryType={inventoryTypeForCompound(c.name, c.method)}
              category={c.category}
              fill={0.7}
              size={28}
              className="shrink-0"
            />
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {c.name}
            </span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">
              {c.amount}
              {c.unit ? ` ${c.unit}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
