"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"

import { PageScrollTitle } from "@/components/layout/PageScrollTitle"
import { ProtocolBlocks, RouteTitle } from "@/components/feel/RouteSkeletons"
import {
  SkeletonGroup,
  SkeletonSwap,
  useArrivedFromSkeleton,
  useSkeletonOnScreen,
} from "@/components/feel/Skeleton"
import {
  getHydrationState,
  subscribeHydrationState,
  type HydrationState,
} from "@/lib/home/hydrationState"
import { useCloudHydration } from "@/components/home/useCloudHydration"
import { CompoundsRow } from "@/components/protocol/CompoundsRow"
import { ScheduleCard } from "@/components/protocol/ScheduleCard"
import { FootTiles } from "@/components/protocol/FootTiles"
import { CompoundDetailSheet } from "@/components/home/CompoundDetailSheet"
import { AddCompoundSheet } from "@/components/home/AddCompoundSheet"
import { AddToStackMenu } from "@/components/navigation/add-to-stack-menu"
import { AddStockSheet } from "@/components/protocol/AddStockSheet"
import { MixVialSheet } from "@/components/protocol/MixVialSheet"
import { listStock, type StockItem, type StockRead } from "@/lib/db/inventory"
import { cn } from "@/lib/utils"
import { PRESS } from "@/lib/ui-presets"
import { remainingLabel } from "@/lib/containers/labels"
import { compoundStockViews, extraFill, withRunway, type StockSnapshot } from "@/lib/protocol/stockPage"
import { useDeviceToday } from "@/components/home/useDeviceToday"
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
  loggedCountFor,
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
  previewRead,
  previewCompounds,
  previewLogs,
  footBase,
}: {
  userId: string
  initialStockFor?: string | null
  /** Dev-only: mock data so `/preview/protocol` renders without a session. */
  previewStock?: StockItem[]
  /** Dev-preview-only: a whole stock read (containers and spares), read as the
   *  live one is, keyed by the mock's own compound ids. */
  previewRead?: StockRead
  previewCompounds?: StackCompound[]
  previewStacks?: Stack[]
  previewLogs?: DayLogs
  /** Where the foot tiles' pages live (the preview has its own). */
  footBase?: string
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
  // Mix one, from the compound's sheet: the spare, and the water last used.
  const [mixTarget, setMixTarget] = useState<{ compound: StackCompound; spare: StockItem; lastWater: number } | null>(null)
  // Held apart from the target, so the sheet slides away with its vial still in it.
  const [mixOpen, setMixOpen] = useState(false)
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
  // Not known until the device has a stack or the first cloud pull has
  // settled: an empty device must not flash "no compounds" (feel pass §1).
  const hydration = useSyncExternalStore<HydrationState>(
    subscribeHydrationState,
    () => getHydrationState(userId),
    () => "pending",
  )
  const known =
    previewCompounds !== undefined || compounds.length > 0 || hydration !== "pending"
  const fromSkeleton = useArrivedFromSkeleton("protocol")
  const skeletonShown = useSkeletonOnScreen("protocol")
  const logs = previewLogs ?? liveLogs
  // The device's day, and it follows midnight (on focus, on becoming visible,
  // and once a minute), so a Protocol left open overnight moves its Runs dry
  // with the date rather than reading a day late (cold review B37).
  const todayKey = useDeviceToday(toDateKey(new Date()))
  // `isRunning`, not just `!archived`. Spec 06 says a compound whose cycle has
  // ENDED behaves exactly like a deleted one, and Home drops it — but this
  // screen filtered on the deleted flag alone, so an ended compound kept its
  // card, its stock and a schedule row of seven "nothing due" cells here while
  // being absent from the dashboard entirely.
  const active = useMemo(
    () => compounds.filter((c) => isRunning(c, todayKey)),
    [compounds, todayKey],
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
  //
  // What the read returned is kept AS READ, one view per compound: the
  // container in use with its own figures, and the doses every open one holds.
  // The runway is walked from the latter in render, on the day it is then
  // (cold review B37); the former is what the sheet's "Current vial" states
  // (F1: it used to be overwritten with the compound's total).
  const [snapshot, setSnapshot] = useState<StockSnapshot | null>(null)
  // Today's logged doses as they stand when a read LANDS, not when it was
  // asked for: a ref, so the read's effect need not re-run on every log.
  const logsRef = useRef(logs)
  useEffect(() => {
    logsRef.current = logs
  }, [logs])
  const [stockTick, setStockTick] = useState(0)
  const [stockFailed, setStockFailed] = useState(false)
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
  const stockByCompound = useMemo(() => {
    if (previewStock && !previewRead) return new Map(previewStock.map((s) => [s.protocolCompoundId, s]))
    if (!snapshot) return null
    const out = new Map<string, StockItem>()
    for (const [id, view] of snapshot.views) {
      out.set(id, withRunway(view, active.find((c) => c.id === id), todayKey, snapshot.readOn))
    }
    return out
  }, [previewStock, previewRead, snapshot, active, todayKey])
  const stockKnown = (previewStock !== undefined && !previewRead) || snapshot !== null
  const views = snapshot?.views
  const othersByCompound = useMemo(
    () => new Map([...(views ?? [])].map(([id, v]) => [id, v.others])),
    [views],
  )
  const extraFills = useMemo(
    () => new Map([...(views ?? [])].map(([id, v]) => [id, v.extras.map(extraFill)])),
    [views],
  )
  const activeKey = active.map((c) => c.id).join(",")
  useEffect(() => {
    if (previewStock && !previewRead) return
    if (!userId || (userId === "anon" && !previewRead) || activeKey === "") return
    let cancelled = false
    void (async () => {
      const members = activeKey
        .split(",")
        .map((id) => ({ id, name: active.find((c) => c.id === id)?.name ?? null }))
      const [read, idMap] = previewRead
        ? [previewRead, Object.fromEntries(members.map((m) => [m.id, m.id])) as Record<string, string>]
        : await Promise.all([listStock(), resolveProtocolCompoundIds(members)])
      if (cancelled) return
      // A failed read is NOT "no stock": the cards keep claiming nothing and one
      // line says the read failed (build brief §5, item 6).
      if (!read.ok) {
        setStockFailed(true)
        return
      }
      setStockFailed(false)
      const pcToClient = new Map(
        Object.entries(idMap).map(([clientId, pcId]) => [pcId, clientId])
      )
      // ONE card per compound, as today: the container IN USE (the oldest open
      // one) with its own figures, beside what the compound holds in every open
      // container. The day's logged doses are the ones this read has already
      // subtracted, so they are counted now, as it lands.
      const readOn = toDateKey(new Date())
      const day = logsRef.current[readOn]
      setSnapshot({
        readOn,
        views: compoundStockViews(read, pcToClient, (id) => loggedCountFor(day, id)),
      })
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
    <div
      data-screen="protocol"
      data-desktop-layout="grid"
      className="relative mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5"
    >
      {/* One arrival (feel pass §1): the title fades in where it stands, or
          is simply there when the route's skeleton handed over. */}
      <RouteTitle id="protocol" data-area="title">
        <PageScrollTitle title="Protocol" />
      </RouteTitle>
      <SkeletonSwap
        ready={known}
        leaveOnMount={fromSkeleton}
        skeleton={
          <SkeletonGroup label="Loading your protocol" className="space-y-5" still={skeletonShown}>
            <ProtocolBlocks />
          </SkeletonGroup>
        }
      >


      <div data-area="compounds" className="animate-home-up" style={delay(0)}>
        <CompoundsRow
          compounds={active}
          stockByCompound={stockByCompound ?? new Map()}
          othersByCompound={othersByCompound}
          extraFills={extraFills}
          stockKnown={stockKnown}
          todayKey={todayKey}
          onOpen={setDetailTarget}
          onAddCompound={() => guard(() => setPickerOpen(true))}
          onAddStock={(c) => guard(() => setStockTarget(c))}
        />
        {/* The read FAILED: say so once, with a retry, rather than letting the
            cards read "Add stock" for stock the user does hold. */}
        {stockFailed && (
          <p className="mt-2 px-1 text-sm text-state-error">
            Couldn&apos;t load your stock.{" "}
            <button
              type="button"
              onClick={() => setStockTick((t) => t + 1)}
              className={cn(PRESS.text, "text-foreground underline underline-offset-4")}
            >
              Try again
            </button>
          </p>
        )}
      </div>

      {/* The half-life and blends cards moved to the Half-life page (the third
          tile, build-brief-final §3.7 / §3.11). */}
      <div data-area="schedule" className="animate-home-up" style={delay(165)}>
        {/* The FULL stack, not `active`. A past week needs the compounds that
            are no longer current, and `compoundsInWeek` dates them from the
            `stopped` version Delete writes rather than the undated `archived`
            flag, so a deleted compound keeps every week it actually ran in. */}
        <ScheduleCard compounds={compounds} logs={logs} todayKey={todayKey} href={footBase ? `${footBase}/schedule` : undefined} />
      </div>

      {/* The foot (Adrian, 2026-09-24): Stacks, Cycles and Stock each push
          their own page, in place of the Stacks and Cycles sections. */}
      <div data-area="foot" className="animate-home-up" style={delay(220)}>
        <FootTiles base={footBase} />
      </div>
      </SkeletonSwap>

      {/* `context="plan"` — viewing and editing only. The dashboard's
          "log today's dose" path is deliberately absent. */}
      <CompoundDetailSheet
        open={detailTarget !== null}
        compound={detailTarget}
        context="plan"
        // Today's doses already logged, so "Next dose" moves past today once
        // they all are (D13/F14).
        loggedToday={detailTarget ? loggedCountFor(logs[todayKey], detailTarget.id) : 0}
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
        stockSection={
          detailTarget
            ? {
                // The container in use, with ITS OWN count: the figure Home
                // states for the same vial (cold review F1).
                inUse: stockByCompound?.get(detailTarget.id) ?? null,
                others: views?.get(detailTarget.id)?.others ?? 0,
                drySpare: views?.get(detailTarget.id)?.drySpare ?? null,
                // The mixed, unmixed and sealed containers held beyond the one
                // in use, drawn under it (W17).
                extras: views?.get(detailTarget.id)?.extras ?? null,
                onAddStock: () =>
                  guard(() => {
                    const c = detailTarget
                    setDetailTarget(null)
                    setStockTarget(c)
                  }),
                onMix: (spare) =>
                  guard(() => {
                    const c = detailTarget
                    setDetailTarget(null)
                    setMixTarget({ compound: c, spare, lastWater: views?.get(c.id)?.lastWater ?? 2 })
                    setMixOpen(true)
                  }),
                onCorrect: (item) =>
                  guard(() => {
                    setDetailTarget(null)
                    setStockEditItem(item)
                  }),
                onChanged: () => setStockTick((t) => t + 1),
              }
            : undefined
        }
      />

      {/* Add stock, or Edit (correct) the amounts.
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
        refillFor={null}
        // The compound you tapped Stock on, whether or not it has a vial yet.
        // `refillFor` above only fires for a REFILL, so without this a compound
        // with no stock opened the sheet on whatever happened to be first.
        preselectFor={stockEditItem ? null : (stockTarget?.id ?? null)}
        refillType={null}
        editItem={stockEditItem}
        // A refill replaces the container refilled ("A new vial replaces this
        // one"); adding to a compound that holds none replaces nothing.
        replaceItemId={null}
        // The mock-data preview shows the full flow (spares, the dropper);
        // the live app asks the database what it holds (sweep).
        sparesSupported={previewCompounds !== undefined ? true : undefined}
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


      {/* Mix one (build-brief-final §3.12): the spare starts dry and fills as the
          powder and water go in; "Mixed. Now in use." with Undo. */}
      {mixTarget ? (
        <MixVialSheet
          open={mixOpen}
          onOpenChange={setMixOpen}
          compound={mixTarget.compound}
          spare={mixTarget.spare}
          lastWaterMl={mixTarget.lastWater}
          todayKey={todayKey}
          onMixed={() => setStockTick((t) => t + 1)}
        />
      ) : null}

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
