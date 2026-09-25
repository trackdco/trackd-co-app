"use client"

import { useSyncExternalStore } from "react"

import { BlendsCard, HalfLifeCard } from "@/components/halflife/HalfLifeCards"
import { useCloudHydration } from "@/components/home/useCloudHydration"
import { SubpageShell } from "@/components/protocol/pages/Subpage"
import { getHydrationState, subscribeHydrationState, type HydrationState } from "@/lib/home/hydrationState"
import { getStackSnapshot, isRunning, subscribeStack, type StackCompound } from "@/lib/home/stack"
import { getDoseLogsSnapshot, subscribeDoseLogs, type DayLogs } from "@/lib/home/doseLog"
import { toDateKey } from "@/lib/home/mockHomeData"

const EMPTY_STACK: StackCompound[] = []
const EMPTY_LOGS: DayLogs = {}

/**
 * Protocol → Half-life (build-brief-final §3.7, §3.11): the third tile. The
 * compounds you run, each with its curve, and blends as their own group. The
 * "?" beside the title says what a half-life is; the page itself has no intro.
 */
export function HalfLifeScreen({
  userId,
  backHref,
  previewCompounds,
  previewLogs,
}: {
  userId: string
  backHref?: string
  previewCompounds?: StackCompound[]
  previewLogs?: DayLogs
}) {
  useCloudHydration(userId)
  const liveStack = useSyncExternalStore(
    subscribeStack,
    () => (userId === "anon" ? EMPTY_STACK : getStackSnapshot(userId, EMPTY_STACK)),
    () => EMPTY_STACK,
  )
  const liveLogs = useSyncExternalStore(subscribeDoseLogs, () => getDoseLogsSnapshot(userId), () => EMPTY_LOGS)
  const hydration = useSyncExternalStore<HydrationState>(
    subscribeHydrationState,
    () => getHydrationState(userId),
    () => "pending",
  )
  const compounds = previewCompounds ?? liveStack
  const logs = previewLogs ?? liveLogs
  const known = previewCompounds !== undefined || compounds.length > 0 || hydration !== "pending"
  const todayKey = toDateKey(new Date())
  const active = compounds.filter((c) => isRunning(c, todayKey))

  return (
    <SubpageShell screen="protocol-half-life" title="Half-life" backHref={backHref} explainer="half-life">
      {known ? (
        <>
          <div className="animate-home-up empty:hidden" style={{ animationDelay: "55ms" }}>
            <HalfLifeCard compounds={active} logs={logs} userId={userId} />
          </div>
          <div className="animate-home-up empty:hidden" style={{ animationDelay: "110ms" }}>
            <BlendsCard compounds={active} logs={logs} userId={userId} />
          </div>
        </>
      ) : null}
    </SubpageShell>
  )
}
