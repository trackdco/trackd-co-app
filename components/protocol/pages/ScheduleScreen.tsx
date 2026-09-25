"use client"

import { useSyncExternalStore } from "react"

import { useCloudHydration } from "@/components/home/useCloudHydration"
import { ScheduleWeeks } from "@/components/protocol/ScheduleWeeks"
import { SubpageShell } from "@/components/protocol/pages/Subpage"
import {
  getHydrationState,
  subscribeHydrationState,
  type HydrationState,
} from "@/lib/home/hydrationState"
import { getStackSnapshot, subscribeStack, type StackCompound } from "@/lib/home/stack"
import { getDoseLogsSnapshot, subscribeDoseLogs, type DayLogs } from "@/lib/home/doseLog"
import { toDateKey } from "@/lib/home/mockHomeData"

const EMPTY_STACK: StackCompound[] = []
const EMPTY_LOGS: DayLogs = {}

/**
 * Protocol → Schedule (build-brief-final §3.7): opened from the Schedule card,
 * it shows this week and steps back through the weeks before it. Reads the same
 * device-first stores Protocol does (the FULL stack, archived compounds
 * included, so a past week keeps the compounds that ran in it).
 */
export function ScheduleScreen({
  userId,
  backHref,
  previewCompounds,
  previewLogs,
}: {
  userId: string
  backHref?: string
  /** Dev-only mock data, as the other Protocol pages take. */
  previewCompounds?: StackCompound[]
  previewLogs?: DayLogs
}) {
  useCloudHydration(userId)
  const liveStack = useSyncExternalStore(
    subscribeStack,
    () => (userId === "anon" ? EMPTY_STACK : getStackSnapshot(userId, EMPTY_STACK)),
    () => EMPTY_STACK,
  )
  const liveLogs = useSyncExternalStore(
    subscribeDoseLogs,
    () => getDoseLogsSnapshot(userId),
    () => EMPTY_LOGS,
  )
  const hydration = useSyncExternalStore<HydrationState>(
    subscribeHydrationState,
    () => getHydrationState(userId),
    () => "pending",
  )
  const compounds = previewCompounds ?? liveStack
  const logs = previewLogs ?? liveLogs
  // An empty device must not flash "Nothing is running" before the first cloud
  // pull has settled (feel pass §1). Also keeps dates out of the server render.
  const known =
    previewCompounds !== undefined || compounds.length > 0 || hydration !== "pending"
  const todayKey = toDateKey(new Date())

  return (
    <SubpageShell screen="protocol-schedule" title="Schedule" backHref={backHref}>
      {known && (
        <div className="animate-home-up" style={{ animationDelay: "55ms" }}>
          <ScheduleWeeks compounds={compounds} logs={logs} todayKey={todayKey} />
        </div>
      )}
    </SubpageShell>
  )
}
