"use client"

import { useEffect, useMemo, useState, useSyncExternalStore } from "react"

import { PageScrollTitle } from "@/components/layout/PageScrollTitle"
import { useCloudHydration } from "@/components/home/useCloudHydration"
import { CompoundsRow } from "@/components/protocol/CompoundsRow"
import { ScheduleWeeks } from "@/components/protocol/ScheduleWeeks"
import { StacksView } from "@/components/protocol/StacksView"
import { CyclesView } from "@/components/protocol/CyclesView"
import { CompoundDetailSheet } from "@/components/home/CompoundDetailSheet"
import { AddCompoundSheet } from "@/components/home/AddCompoundSheet"
import { AddToStackMenu } from "@/components/navigation/add-to-stack-menu"
import { AddStockSheet } from "@/components/protocol/AddStockSheet"
import { StockActionsSheet } from "@/components/protocol/StockActionsSheet"
import { listStock, type StockItem } from "@/lib/db/inventory"
import { remainingLabel } from "@/lib/containers/labels"
import { subscribeDoseSynced } from "@/lib/home/doseLog"
import { resolveProtocolCompoundIds } from "@/lib/home/protocolSync"
import {
  archiveInStack,
  getStackSnapshot,
  isRunning,
  subscribeStack,
  type StackCompound,
} from "@/lib/home/stack"
import {
  getDoseLogsSnapshot,
  subscribeDoseLogs,
  type DayLogs,
} from "@/lib/home/doseLog"
import { toDateKey } from "@/lib/home/mockHomeData"
import type { Stack } from "@/lib/home/stacks"
import { useWriteAccess } from "@/components/billing/ReadOnlyGate"

const EMPTY_STACK: StackCompound[] = []
const EMPTY_LOGS: DayLogs = {}

/**
 * Protocol — ONE scrolling page (Spec 04), replacing the Plan / Stock segmented
 * control. Order: title, Compounds, Schedule, Stacks, Cycles.
 *
 * There is deliberately NO overall-cycle header (name, weeks, start date,
 * description). It was prototyped, orphaned by the tab merge, and removed on
 * Adrian's call: a protocol-level GOAL belongs on Progress, where you track
 * against it, not on the page that lists what you are running.
 *
 * **Logging never happens here.** The dashboard owns a selected date and this
 * page does not, so any log action from Protocol would have to assume today —
 * exactly the bug Spec 01 exists to remove. Tapping a compound opens its detail
 * in the `plan` context, whose primary action is "Edit dose & schedule" and which
 * carries no day-logging path at all.
 */
export function ProtocolScreen({
  userId,
  /** A compound id from `?stock=` — opens straight onto its add-stock sheet, so
   *  the dashboard's "add stock" tap lands on the compound the user tapped rather
   *  than at the top of the page. */
  initialStockFor,
  previewStock,
  previewCompounds,
  previewStacks,
  previewLogs,
}: {
  userId: string
  initialStockFor?: string | null
  /** Dev-only: mock data so `/preview/protocol` renders without a session. */
  previewStock?: StockItem[]
  previewCompounds?: StackCompound[]
  previewStacks?: Stack[]
  previewLogs?: DayLogs
}) {
  /**
   * Guarded: adding a compound and adding or editing stock. Both EDIT THE
   * PROTOCOL, which is on Adrian's list. Archiving is not guarded.
   */
  const { canWrite, guard } = useWriteAccess()

  useCloudHydration(userId)

  const [detailTarget, setDetailTarget] = useState<StackCompound | null>(null)
  const [editTarget, setEditTarget] = useState<StackCompound | null>(null)
  // Adding / refilling a vial. Merging the Stock tab away removed the only path
  // to this, so the compound card's stock block opens it instead.
  const [stockTarget, setStockTarget] = useState<StackCompound | null>(null)
  const [stockActionsFor, setStockActionsFor] = useState<StackCompound | null>(null)
  const [stockEditItem, setStockEditItem] = useState<StockItem | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const liveStack = useSyncExternalStore(
    subscribeStack,
    () => (userId === "anon" ? EMPTY_STACK : getStackSnapshot(userId, EMPTY_STACK)),
    () => EMPTY_STACK
  )
  const liveLogs = useSyncExternalStore(
    subscribeDoseLogs,
    () => getDoseLogsSnapshot(userId),
    () => EMPTY_LOGS
  )
  const compounds = previewCompounds ?? liveStack
  const logs = previewLogs ?? liveLogs
  const screenToday = toDateKey(new Date())
  // `isRunning`, not just `!archived`. Spec 06 says a compound whose cycle has
  // ENDED behaves exactly like a deleted one, and Home drops it — but this
  // screen filtered on the deleted flag alone, so an ended compound kept its
  // card, its stock and a schedule row of seven "nothing due" cells here while
  // being absent from the dashboard entirely.
  const active = useMemo(
    () => compounds.filter((c) => isRunning(c, screenToday)),
    [compounds, screenToday],
  )
  // Honour `?stock=` once the compound list is available. Adjusted during render
  // rather than in an effect (React's documented pattern for reacting to a
  // changed input) so there is no paint without the sheet.
  const [stockDeepLinkDone, setStockDeepLinkDone] = useState(false)
  if (!stockDeepLinkDone && initialStockFor && active.length > 0) {
    setStockDeepLinkDone(true)
    const target = active.find((c) => c.id === initialStockFor)
    /**
     * ⚠️ `canWrite`, NOT `guard()`, AND THAT IS FORCED.
     *
     * This runs DURING RENDER (React's documented pattern for reacting to a
     * changed input, so there is no paint without the sheet). `guard()` calls
     * `setOpen` on the provider, and setState-ing another component mid-render
     * is the hazard `flow.tsx` documents at length and was fixed for.
     *
     * So the deep link simply does not open the sheet for a read-only account.
     * The pop-up is one tap away on the "Add stock" control beside it, which IS
     * guarded, and that is the right place to meet it anyway.
     *
     * The hole this closes, driven by a cold review: Home's "add stock" on a
     * dose row `router.push`es to `?stock=<id>`, which set `stockTarget`
     * directly. A lapsed user got the sheet with no pop-up, filled it in,
     * pressed Add stock, and was told **"Couldn't sync this compound. Check
     * your connection and try again."** Zero rows written, and the user blamed
     * for their connection.
     */
    if (target && canWrite) setStockTarget(target)
  }


  const todayKey = screenToday
  // The week the Schedule grid draws (and the ones behind it) now lives in
  // `ScheduleWeeks`, which derives it from `todayKey` so it still follows
  // midnight rather than freezing at mount.
  // Stock per compound, keyed by the CLIENT id. `listStock` returns rows keyed by
  // `protocol_compounds.id`, which can diverge from the client id, so it is mapped
  // back through the same resolver the stack mirror uses rather than assumed equal.
  // `null` = NOT YET KNOWN. An empty Map is a positive claim that the user owns
  // no vials, so initialising to one made the page assert that on every cold load
  // and on any failed read (offline, resolver error) — the same mistake
  // `resolveDrawSources` was written to avoid.
  const [fetchedStock, setFetchedStock] = useState<Map<string, StockItem> | null>(
    null
  )
  const [stockTick, setStockTick] = useState(0)
  /**
   * Re-read stock when a dose write LANDS, the same signal the dashboard uses.
   *
   * These figures come from `v_inventory_math`, so a dose logged from the FAB's
   * quick-track sheet while standing on this tab left every "8 mL left" and
   * every doses-remaining estimate at its pre-dose value until the user
   * navigated away and back — the identical symptom that was just fixed on Home,
   * one tab over. The signal is already coalesced at the source, so this is one
   * read per burst. (Second cold review, 2026-08-12.)
   */
  useEffect(() => subscribeDoseSynced(() => setStockTick((t) => t + 1)), [])
  // Preview data is DERIVED, not set into state from an effect — a synchronous
  // setState there cascades an extra render for no reason.
  const stockByCompound = useMemo(
    () =>
      previewStock
        ? new Map(previewStock.map((s) => [s.protocolCompoundId, s]))
        : fetchedStock,
    [previewStock, fetchedStock]
  )
  const stockKnown = previewStock !== undefined || fetchedStock !== null
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
  }, [userId, activeKey, previewStock, stockTick])


  const delay = (ms: number) => ({ animationDelay: `${ms}ms` })

  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5">
      <div className="animate-home-up" style={delay(0)}>
        <PageScrollTitle title="Protocol" />
      </div>


      <div className="animate-home-up" style={delay(55)}>
        <CompoundsRow
          compounds={active}
          stockByCompound={stockByCompound ?? new Map()}
          stockKnown={stockKnown}
          todayKey={todayKey}
          onOpen={setDetailTarget}
          onAddCompound={() => guard(() => setPickerOpen(true))}
          onAddStock={(c) =>
            guard(() => {
              // A compound that already has a vial gets the actions sheet (refill /
              // correct / discard); one that does not goes straight to adding.
              const existing = stockByCompound?.get(c.id) ?? null
              if (existing) setStockActionsFor(c)
              else setStockTarget(c)
            })
          }
        />
      </div>

      <div className="animate-home-up" style={delay(85)}>
        {/* The FULL stack, not `active`. A past week needs the compounds that
            are no longer current, and `compoundsInWeek` dates them from the
            `stopped` version Delete writes rather than the undated `archived`
            flag, so a deleted compound keeps every week it actually ran in. */}
        <ScheduleWeeks compounds={compounds} logs={logs} todayKey={todayKey} />
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
        // Protocol holds the real `StockItem`, so the sheet's container draws
        // its ACTUAL fill here — the same `remainingBase / totalBase` the
        // storage card two rows up is showing (Spec w2b-13, Step 7).
        stock={(() => {
          const item = detailTarget
            ? (stockByCompound?.get(detailTarget.id) ?? null)
            : null
          if (!item) return undefined
          const fill =
            item.remainingBase != null && item.totalBase
              ? Math.max(0, Math.min(1, item.remainingBase / item.totalBase))
              : null
          return {
            fill,
            exists: true,
            // The shared wording — this branch was the closest of the copies but
            // still read "1000 g left" where the Storage card one row up said
            // "1 kg left", and "30 tab left" in the singular.
            label: remainingLabel(item),
          }
        })()}
        onAddStock={(c) => {
          setDetailTarget(null)
          setStockTarget(c)
        }}
        onCorrectStock={(c) => {
          setDetailTarget(null)
          setStockEditItem(stockByCompound?.get(c.id) ?? null)
        }}
        onArchive={(id) => archiveInStack(userId, id, true)}
      />

      {/* What you can do to a vial you already have. Restores the only entry
          points to `updateStockItem` and `setStockArchived`, both of which lost
          their caller when StockItemCard was deleted. */}
      <StockActionsSheet
        open={stockActionsFor !== null}
        onOpenChange={(o) => !o && setStockActionsFor(null)}
        compound={stockActionsFor}
        stock={
          stockActionsFor ? (stockByCompound?.get(stockActionsFor.id) ?? null) : null
        }
        onRefill={() => {
          setStockTarget(stockActionsFor)
          setStockActionsFor(null)
        }}
        onEditAmounts={() => {
          const item = stockActionsFor
            ? (stockByCompound?.get(stockActionsFor.id) ?? null)
            : null
          setStockEditItem(item)
          setStockActionsFor(null)
        }}
        onDiscarded={() => setStockTick((t) => t + 1)}
      />

      {/* Add, refill, or correct the amounts.
          `refillFor` takes the RESOLVED `protocol_compounds.id` from the stock row,
          never the client id: the two legitimately diverge, and passing the client
          id made every refill of a re-added compound fail the inventory FK.
          `refillType` locks the form to the vial being replaced, so a refill can no
          longer silently flip a preconcentrated vial to reconstituted. */}
      <AddStockSheet
        open={stockTarget !== null || stockEditItem !== null}
        /* Only when there IS a vial to refill. It used to fall back to the
           compound id whenever one was targeted, so `refillFor` was never null
           from this screen and the first vial a user ever added opened a sheet
           headed "Refill stock" — on the very path that exists for having none. */
        /* The CLIENT stack id, because that is what the sheet's own <option>
           values are keyed by. It used to pass the SERVER
           `protocol_compounds.id`, which legitimately diverges from it — the
           whole reason the stock write resolves its own id — so on a diverged
           compound the sheet preselected whatever happened to be first and
           confidently named a DIFFERENT compound on a stock-correction form.
           Null when there is no vial: the fallback made `refillFor` never null
           from this screen, so the first vial anyone ever added opened a sheet
           headed "Refill stock". */
        refillFor={
          stockEditItem || !stockTarget || !stockByCompound?.get(stockTarget.id)
            ? null
            : stockTarget.id
        }
        // The compound you tapped Stock on, whether or not it has a vial yet.
        // `refillFor` above only fires for a REFILL, so without this a compound
        // with no stock opened the sheet on whatever happened to be first.
        preselectFor={stockEditItem ? null : (stockTarget?.id ?? null)}
        refillType={
          stockEditItem
            ? null
            : (stockTarget
                ? (stockByCompound?.get(stockTarget.id)?.inventoryType ?? null)
                : null)
        }
        editItem={stockEditItem}
        userId={userId}
        onOpenChange={(o) => {
          if (!o) {
            setStockTarget(null)
            setStockEditItem(null)
          }
        }}
        onAdded={() => {
          setStockTarget(null)
          setStockEditItem(null)
          // Refetch, or the card keeps showing "Add stock" until a route change.
          setStockTick((t) => t + 1)
        }}
      />


      {/* Protocol's own add-compound entry. Without it every control on the page
          was dead for a new account — including the empty copy that told the user
          to add one. */}
      <AddToStackMenu
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        userId={userId}
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
