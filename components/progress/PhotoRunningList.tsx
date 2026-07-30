"use client"

import { useMemo, useSyncExternalStore } from "react"

import { Container } from "@/components/containers/Container"
import { useMounted } from "@/components/home/useMounted"
import { COLUMN_EYEBROW } from "@/lib/ui-presets"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { compoundsRunningOn } from "@/lib/progress/running"
import {
  getStackSnapshot,
  subscribeStack,
  type StackCompound,
} from "@/lib/home/stack"

const EMPTY_STACK: StackCompound[] = []

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
 * Vertical list, one row per compound. Explicitly not a horizontal row — that
 * was built once and corrected.
 */
export function PhotoRunningList({
  date,
  userId,
  /** Dev-preview-only: inject the device stack without signing in. */
  sampleStack,
}: {
  date: string
  userId: string
  sampleStack?: StackCompound[]
}) {
  const mounted = useMounted()
  const deviceReady = sampleStack ? true : mounted

  const liveStack = useSyncExternalStore(
    subscribeStack,
    () => getStackSnapshot(userId, EMPTY_STACK),
    () => EMPTY_STACK,
  )
  const stack = sampleStack ?? liveStack

  const running = useMemo(
    () => (deviceReady ? compoundsRunningOn(stack, date) : []),
    [deviceReady, stack, date],
  )

  if (running.length === 0) return null

  return (
    <div className="px-5 pb-5">
      <p className={COLUMN_EYEBROW}>Running</p>
      <ul className="mt-2 space-y-1.5">
        {running.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-3 rounded-xl bg-bg-surface-raised px-3 py-2.5"
          >
            <Container
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
