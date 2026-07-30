"use client"

import { useEffect, useMemo, useState, useSyncExternalStore } from "react"

import { PageScrollTitle } from "@/components/layout/PageScrollTitle"
import { useCloudHydration } from "@/components/home/useCloudHydration"
import { CompoundsRow } from "@/components/protocol/CompoundsRow"
import { ScheduleGrid } from "@/components/protocol/ScheduleGrid"
import { StacksView } from "@/components/protocol/StacksView"
import { CyclesView } from "@/components/protocol/CyclesView"
import { CompoundDetailSheet } from "@/components/home/CompoundDetailSheet"
import { AddCompoundSheet } from "@/components/home/AddCompoundSheet"
import { AddStockSheet } from "@/components/protocol/AddStockSheet"
import { getActiveCycle } from "@/lib/db/cycles"
import { listStock, type StockItem } from "@/lib/db/inventory"
import { resolveProtocolCompoundIds } from "@/lib/home/protocolSync"
import {
  archiveInStack,
  getStackSnapshot,
  subscribeStack,
  type StackCompound,
} from "@/lib/home/stack"
import {
  getDoseLogsSnapshot,
  subscribeDoseLogs,
  type DayLogs,
} from "@/lib/home/doseLog"
import { toDateKey } from "@/lib/home/mockHomeData"
import type { Cycle } from "@/lib/db/types"
import type { Stack } from "@/lib/home/stacks"

const EMPTY_STACK: StackCompound[] = []
const EMPTY_LOGS: DayLogs = {}

/**
 * Protocol — ONE scrolling page (Spec 04), replacing the Plan / Stock segmented
 * control. Order: title, Compounds, Stacks, Schedule, Cycles.
 *
 * **Logging never happens here.** The dashboard owns a selected date and this
 * page does not, so any log action from Protocol would have to assume today —
 * exactly the bug Spec 01 exists to remove. Tapping a compound opens its detail
 * in the `plan` context, whose primary action is "Edit dose & schedule" and which
 * carries no day-logging path at all.
 */
export function ProtocolScreen({
  userId,
  initialCycle,
  previewStock,
  previewCompounds,
  previewStacks,
  previewLogs,
}: {
  userId: string
  initialCycle: Cycle | null
  /** Dev-only: mock data so `/preview/protocol` renders without a session. */
  previewStock?: StockItem[]
  previewCompounds?: StackCompound[]
  previewStacks?: Stack[]
  previewLogs?: DayLogs
}) {
  useCloudHydration(userId)
  const [, setCycle] = useState<Cycle | null>(initialCycle)
  const [detailTarget, setDetailTarget] = useState<StackCompound | null>(null)
  const [editTarget, setEditTarget] = useState<StackCompound | null>(null)
  // Adding / refilling a vial. Merging the Stock tab away removed the only path
  // to this, so the compound card's stock block opens it instead.
  const [stockTarget, setStockTarget] = useState<StackCompound | null>(null)

  const liveStack = useSyncExternalStore(
    subscribeStack,
    () => getStackSnapshot(userId, EMPTY_STACK),
    () => EMPTY_STACK
  )
  const liveLogs = useSyncExternalStore(
    subscribeDoseLogs,
    () => getDoseLogsSnapshot(userId),
    () => EMPTY_LOGS
  )
  const compounds = previewCompounds ?? liveStack
  const logs = previewLogs ?? liveLogs
  const active = useMemo(() => compounds.filter((c) => !c.archived), [compounds])

  const todayKey = toDateKey(new Date())
  /** This week, Monday first — what the Schedule grid shows. */
  const weekDays = useMemo(() => {
    const now = new Date()
    const monday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - ((now.getDay() + 6) % 7)
    )
    return Array.from(
      { length: 7 },
      (_, i) =>
        new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
    )
  }, [])

  // Stock per compound, keyed by the CLIENT id. `listStock` returns rows keyed by
  // `protocol_compounds.id`, which can diverge from the client id, so it is mapped
  // back through the same resolver the stack mirror uses rather than assumed equal.
  const [fetchedStock, setFetchedStock] = useState<Map<string, StockItem>>(new Map())
  // Preview data is DERIVED, not set into state from an effect — a synchronous
  // setState there cascades an extra render for no reason.
  const stockByCompound = useMemo(
    () =>
      previewStock
        ? new Map(previewStock.map((s) => [s.protocolCompoundId, s]))
        : fetchedStock,
    [previewStock, fetchedStock]
  )
  const activeKey = active.map((c) => c.id).join(",")
  useEffect(() => {
    if (previewStock) return
    if (!userId || userId === "anon" || activeKey === "") return
    let cancelled = false
    void (async () => {
      const members = activeKey
        .split(",")
        .map((id) => ({ id, name: active.find((c) => c.id === id)?.name ?? null }))
      const [items, idMap] = await Promise.all([
        listStock(),
        resolveProtocolCompoundIds(members),
      ])
      if (cancelled) return
      const pcToClient = new Map(
        Object.entries(idMap).map(([clientId, pcId]) => [pcId, clientId])
      )
      const next = new Map<string, StockItem>()
      for (const item of items) {
        const clientId = pcToClient.get(item.protocolCompoundId)
        if (clientId) next.set(clientId, item)
      }
      setFetchedStock(next)
    })()
    return () => {
      cancelled = true
    }
    // Keyed on the compound IDS, not the array — its identity changes on every
    // store read, which would re-fetch stock on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, activeKey, previewStock])

  // The cutover migration may create the active cycle just after this rendered
  // with none; refresh shortly after mount and on focus.
  useEffect(() => {
    if (!userId || userId === "anon") return
    let cancelled = false
    const refresh = async () => {
      const c = await getActiveCycle()
      if (!cancelled && c) setCycle(c)
    }
    const t = window.setTimeout(() => void refresh(), 1500)
    const onFocus = () => void refresh()
    window.addEventListener("focus", onFocus)
    return () => {
      cancelled = true
      window.clearTimeout(t)
      window.removeEventListener("focus", onFocus)
    }
  }, [userId])

  const delay = (ms: number) => ({ animationDelay: `${ms}ms` })

  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5">
      <div className="animate-home-up" style={delay(0)}>
        <PageScrollTitle title="Protocol" />
      </div>

      <div className="animate-home-up" style={delay(55)}>
        <CompoundsRow
          compounds={active}
          stockByCompound={stockByCompound}
          todayKey={todayKey}
          onOpen={setDetailTarget}
          onAddStock={setStockTarget}
        />
      </div>

      <div className="animate-home-up" style={delay(85)}>
        <ScheduleGrid
          compounds={active}
          logs={logs}
          todayKey={todayKey}
          weekDays={weekDays}
        />
      </div>

      <div className="animate-home-up" style={delay(115)}>
        <StacksView
          userId={userId}
          previewCompounds={previewCompounds}
          previewStacks={previewStacks}
        />
      </div>

      <div className="animate-home-up" style={delay(145)}>
        <CyclesView userId={userId} previewStack={previewCompounds} />
      </div>

      {/* `context="plan"` — viewing and editing only. The dashboard's
          "log today's dose" path is deliberately absent. */}
      <CompoundDetailSheet
        open={detailTarget !== null}
        compound={detailTarget}
        context="plan"
        onOpenChange={(o) => !o && setDetailTarget(null)}
        onEdit={(c) => {
          setDetailTarget(null)
          setEditTarget(c)
        }}
        onArchive={(id) => archiveInStack(userId, id, true)}
      />

      {/* Add or refill a vial. `refillFor` pre-selects the compound; the sheet
          resolves its own type, so a refill locks the form to the existing one. */}
      <AddStockSheet
        open={stockTarget !== null}
        refillFor={stockTarget?.id ?? null}
        userId={userId}
        onOpenChange={(o) => !o && setStockTarget(null)}
        onAdded={() => setStockTarget(null)}
      />

      <AddCompoundSheet
        open={editTarget !== null}
        compound={null}
        editCompound={editTarget}
        userId={userId}
        onOpenChange={(o) => !o && setEditTarget(null)}
        onAdded={() => setEditTarget(null)}
      />
    </div>
  )
}
