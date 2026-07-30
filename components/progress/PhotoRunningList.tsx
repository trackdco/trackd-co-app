"use client"

import { useMemo, useSyncExternalStore } from "react"

import { Container } from "@/components/containers/Container"
import { useMounted } from "@/components/home/useMounted"
import { COLUMN_EYEBROW } from "@/lib/ui-presets"
import { buildRunning } from "@/lib/calendar/calendar"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import {
  getDoseLogsSnapshot,
  subscribeDoseLogs,
  type DayLogs,
} from "@/lib/home/doseLog"
import {
  getStackSnapshot,
  subscribeStack,
  type StackCompound,
} from "@/lib/home/stack"

const EMPTY_LOGS: DayLogs = {}
const EMPTY_STACK: StackCompound[] = []

/**
 * What the user was running on a PHOTO'S date (spec 08 · part two).
 *
 * The date is the point. Scrolling back to a photo from three months ago and
 * seeing today's protocol under it would be actively misleading, so this
 * resolves against `date` and never against today. It reads the same device
 * dose log the Calendar reads, through the same `buildRunning`, so the two
 * screens cannot answer the same question differently.
 *
 * Renders NOTHING when nothing was logged that day (spec: "omit the section
 * rather than showing an empty state"). That includes the pre-hydration render:
 * the device store is not readable on the server, so a server-rendered empty
 * state would flash and then be replaced.
 *
 * Vertical list, one row per compound. Explicitly not a horizontal row — that
 * was built once and corrected.
 */
export function PhotoRunningList({
  date,
  userId,
  /** Dev-preview-only: inject the device stack + logs without signing in. */
  sampleStack,
  sampleLogs,
}: {
  date: string
  userId: string
  sampleStack?: StackCompound[]
  sampleLogs?: DayLogs
}) {
  const mounted = useMounted()
  const deviceReady = sampleStack || sampleLogs ? true : mounted

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

  const stackById = useMemo(
    () => new Map(stack.map((c) => [c.id, c])),
    [stack],
  )
  const running = useMemo(
    () => buildRunning(deviceReady ? logs[date] : undefined, stackById),
    [deviceReady, logs, date, stackById],
  )

  if (running.length === 0) return null

  return (
    <div className="px-5 pb-5">
      <p className={COLUMN_EYEBROW}>Running</p>
      <ul className="mt-2 space-y-1.5">
        {running.map((c) => {
          const compound = stackById.get(c.id)
          return (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-xl bg-bg-surface-raised px-3 py-2.5"
            >
              <Container
                inventoryType={
                  compound
                    ? inventoryTypeForCompound(compound.name, compound.method)
                    : null
                }
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
          )
        })}
      </ul>
    </div>
  )
}
