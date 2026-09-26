"use client"

import { useEffect, useRef, useState } from "react"

import { rowKey, type LogFlow } from "@/components/home/log/LogFlow"
import { LogRowPanel } from "@/components/home/log/LogRowPanel"
import { SAVE_CONFIRM_MS } from "@/components/home/log/TrackBar"
import { openStockItem, type StockRead } from "@/lib/db/inventory"
import type { BodySex, InjectionSiteRow } from "@/lib/db/types"
import { slotKey, type DayLogs } from "@/lib/home/doseLog"
import { draftToLog, initialDraft, LOG_WORDS, trackDay, trackLabel, type RowDraft } from "@/lib/home/logDraft"
import { siteDaysBefore, slotIsFree } from "@/lib/home/logRows"
import { toDateKey, type DoseLog } from "@/lib/home/mockHomeData"
import { siteShortLabel } from "@/lib/home/siteCatalog"
import type { StackCompound } from "@/lib/home/stack"
import { showToast } from "@/lib/toast"

/**
 * FLOW B, HOSTED (consistency fix #0: one way to log, wherever you start).
 *
 * The open row, its draft, the Track bar's state and what a tap on a tick does,
 * for any screen that draws dose rows: Home's Today's Log, Quick log and the
 * Calendar's day. The host renders `<LogFlowContext.Provider value={flow}>` over
 * its rows and a `<TrackBar {...bar} />` (inline inside a sheet).
 *
 * Nothing is logged until Track: the draft lives in the row, and Track turns it
 * into a `DoseLog` through `commit`, the host's own write path.
 */
export interface LogRowsOptions {
  /** The day the rows are drawn for, "YYYY-MM-DD". */
  day: string
  todayKey: string
  /** Every logged dose, for "is it logged" and the Site panel's day chips. */
  logs: DayLogs
  /** The read-only gate: a write opens its pop-up instead. */
  guard: (action: () => void) => boolean
  /** Write a dose (fresh or edited) on `day`. */
  commit: (compoundId: string, log: DoseLog, day: string, slot: number) => void
  /** Remove a logged dose. The tick's un-log; Undo commits it back. */
  remove: (compoundId: string, day: string, slot: number) => void
  /** After a Track has landed and its row has closed (Home's tick pop). */
  afterTrack?: () => void
  /** Any tick tapped (Home's first-run bubble goes). */
  onAnyTick?: () => void
  /** First run: the row whose circle the bubble points at. */
  firstRunKey?: string | null
  catalogue: InjectionSiteRow[]
  bodySex: BodySex
  /** Add stock from an open row. Absent inside a sheet. */
  onAddStock?: (compound: StackCompound) => void
  /** Bump once stock was added from a row, so it reads its stock again. */
  stockReadKey?: number
  /** Dev-preview-only: the stock an open row's Stock panel shows. */
  previewStock?: StockRead
}

interface OpenRow {
  dose: StackCompound
  slot: number
  existing: DoseLog | null
  day: string
  draft: RowDraft
  /**
   * Which open this is. A row closed and opened again is a NEW open, with its
   * own panel and draft (cold review B32: within the 520ms fold the old panel
   * was reused, its stock read already spent, so a spare was never picked).
   */
  openId: number
  /**
   * An unopened spare THIS row's panel picked: Track starts it first. Kept on
   * the row, never shared (cold review B7: a closing row's late stock read set
   * a shared ref, and Track on the next row started the first one's spare).
   */
  spare: string | null
}

/** The same open of the same row: its day, compound and slot, opened once. */
const sameRow = (a: OpenRow | null, b: OpenRow | null) => Boolean(a && b && a.openId === b.openId)

export function useLogRows(o: LogRowsOptions) {
  const [openRow, setOpenRow] = useState<OpenRow | null>(null)
  const [closingRow, setClosingRow] = useState<OpenRow | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // Track is running (a spare being started first): the bar stays disabled, so
  // a second tap cannot log the dose twice.
  const [tracking, setTracking] = useState(false)
  const opens = useRef(0)
  const closeTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])
  // A row belongs to the day it was opened on; the day moving closes it.
  const liveRow = openRow && openRow.day === o.day ? openRow : null
  // The open row as it is NOW, for work that finishes later (Save's confirm,
  // Track after a spare starts): a closure holds the row as it was.
  const openRowRef = useRef<OpenRow | null>(null)
  useEffect(() => {
    openRowRef.current = openRow
  }, [openRow])
  // The logs as they are NOW, for an Undo or a confirm that lands later.
  const logsRef = useRef(o.logs)
  useEffect(() => {
    logsRef.current = o.logs
  }, [o.logs])

  /**
   * Every write this hook makes to a slot bumps its count, so a write that
   * lands later (Undo, Save's confirm) can tell the slot was written since
   * (B17, B18), even before the host's logs have caught up.
   */
  const writes = useRef(new Map<string, number>())
  const writeKey = (day: string, id: string, slot: number) => `${day}|${slotKey(id, slot)}`
  const writesTo = (day: string, id: string, slot: number) => writes.current.get(writeKey(day, id, slot)) ?? 0
  const bump = (day: string, id: string, slot: number) => {
    const k = writeKey(day, id, slot)
    writes.current.set(k, (writes.current.get(k) ?? 0) + 1)
  }
  const commitTo = (id: string, log: DoseLog, day: string, slot: number) => {
    bump(day, id, slot)
    o.commit(id, log, day, slot)
  }

  /** Saves still confirming, by slot: an untick meanwhile stops its own (B18),
   *  and a Save on another row never stops this one. */
  const pendingSaves = useRef(new Map<string, number>())
  const dropPendingSave = (day: string, id: string, slot: number) => {
    const k = writeKey(day, id, slot)
    window.clearTimeout(pendingSaves.current.get(k))
    pendingSaves.current.delete(k)
  }

  const isOpenRow = (id: string, slot: number) => liveRow?.dose.id === id && liveRow.slot === slot
  const logOf = (id: string, slot: number) => o.logs[o.day]?.[slotKey(id, slot)] ?? null

  function close() {
    const cur = openRowRef.current ?? openRow
    if (!cur) return
    setClosingRow(cur)
    setOpenRow(null)
    setPanelOpen(false)
    setConfirming(false)
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setClosingRow(null), 520)
  }

  function open(dose: StackCompound, slot: number) {
    const existing = logOf(dose.id, slot)
    if (openRow) setClosingRow(openRow)
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setClosingRow(null), 520)
    opens.current += 1
    setOpenRow({
      dose,
      slot,
      existing,
      day: o.day,
      draft: initialDraft(dose, o.day, slot, existing),
      openId: opens.current,
      spare: null,
    })
    setPanelOpen(false)
    setConfirming(false)
  }

  async function track() {
    const tapped = liveRow
    if (!tapped || tapped.draft.amount <= 0 || confirming || tracking) return
    // The same door as the tick: a read-only account meets the pop-up here.
    if (!o.guard(() => {})) return
    const editing = tapped.existing != null
    // Today read NOW, not from the host's once-a-minute clock (B23): a fresh
    // dose tracked just after midnight belongs to the new day.
    const now = new Date()
    const { day, todayKey } = trackDay(tapped.day, o.todayKey, toDateKey(now), tapped.draft, editing)
    // The spare this row picked, while it is still the row's container.
    const spare = tapped.spare && tapped.draft.inventoryItemId === tapped.spare ? tapped.spare : null
    let spareFailed = false
    // Only today: a spare started on a past day would become the oldest open
    // container and take every later dose (cold review, 2026-09-25).
    if (spare && day === todayKey) {
      // Picking a spare is the moment it goes into use (build brief §5): start
      // it BEFORE the dose links to it, or the link is dropped as not started.
      setTracking(true)
      const started = await openStockItem(spare, day).catch(() => ({ ok: false }))
      setTracking(false)
      spareFailed = !started.ok
    }
    // The row as it is now: an edit made while the spare started still counts,
    // and a row closed meanwhile is not logged.
    const row = openRowRef.current
    if (!row || !sameRow(row, tapped) || row.draft.amount <= 0) return
    // A spare that did not start (offline, or a failed request) is not linked:
    // the server would drop the link for good (B16). Undecided, the server's
    // own rule picks the container in use, which is that spare if it started
    // after all.
    const draft =
      spareFailed && row.draft.inventoryItemId === spare ? { ...row.draft, inventoryItemId: undefined } : row.draft
    const log = draftToLog(row.dose, draft, day, todayKey, row.slot, now)
    if (row.existing) {
      // Edit mode: Save confirms with a calm tick, then the bar drops.
      setConfirming(true)
      const id = row.dose.id
      const slot = row.slot
      const seen = writesTo(day, id, slot)
      dropPendingSave(day, id, slot)
      const timer = window.setTimeout(() => {
        pendingSaves.current.delete(writeKey(day, id, slot))
        // Unticked during the confirm (B18): the untick stands. The dose it
        // edits is gone, or was written again since.
        const stale = writesTo(day, id, slot) !== seen || slotIsFree(logsRef.current, day, id, slot)
        if (!stale) commitTo(id, log, day, slot)
        // Close it only if it is still the open row: another may have been
        // opened during the confirm, and may be confirming its own Save.
        if (sameRow(openRowRef.current, row)) close()
        else if (pendingSaves.current.size === 0) setConfirming(false)
        if (!stale) o.afterTrack?.()
      }, SAVE_CONFIRM_MS)
      pendingSaves.current.set(writeKey(day, id, slot), timer)
      return
    }
    commitTo(row.dose.id, log, day, row.slot)
    close()
    o.afterTrack?.()
  }

  const flow: LogFlow = {
    openKey: liveRow ? rowKey(liveRow.dose.id, liveRow.slot) : null,
    closingKey: closingRow ? rowKey(closingRow.dose.id, closingRow.slot) : null,
    condensed: liveRow !== null && panelOpen,
    draft: liveRow?.draft ?? null,
    firstRunKey: o.firstRunKey ?? null,
    day: o.day,
    onTick: (dose, slot) => {
      o.onAnyTick?.()
      const log = logOf(dose.id, slot)
      // A LOGGED dose's tick un-logs it (the tick only), with a 3s Undo that
      // puts back the very same dose: its amount, time, site and container.
      if (log) {
        if (isOpenRow(dose.id, slot)) close()
        const day = o.day
        // A Save still confirming on this dose is dropped: the untick is the
        // later decision (B18).
        dropPendingSave(day, dose.id, slot)
        bump(day, dose.id, slot)
        o.remove(dose.id, day, slot)
        const removedAs = writesTo(day, dose.id, slot)
        showToast(LOG_WORDS.unticked, {
          undo: () => {
            // Only into an empty slot: a dose logged there since is the newer
            // fact, and Undo must not overwrite it (B17).
            if (writesTo(day, dose.id, slot) !== removedAs) return
            if (!slotIsFree(logsRef.current, day, dose.id, slot)) return
            commitTo(dose.id, log, day, slot)
          },
        })
        return
      }
      // The first tap opens the row, the second logs it.
      if (isOpenRow(dose.id, slot)) {
        void track()
        return
      }
      o.guard(() => open(dose, slot))
    },
    onOpen: (dose, slot) => {
      if (isOpenRow(dose.id, slot)) {
        close()
        return
      }
      // Editing a logged dose writes only on Save, which is guarded there.
      if (logOf(dose.id, slot)) open(dose, slot)
      else o.guard(() => open(dose, slot))
    },
    close,
    renderPanel: (dose, slot) => {
      const row = isOpenRow(dose.id, slot)
        ? liveRow
        : closingRow?.dose.id === dose.id && closingRow.slot === slot
          ? closingRow
          : null
      if (!row) return null
      const live = row === liveRow
      return (
        <LogRowPanel
          // One panel per OPEN, not per row (B32).
          key={`${rowKey(dose.id, slot)}:${row.openId}`}
          compound={row.dose}
          dateKey={row.day}
          todayKey={o.todayKey}
          slot={row.slot}
          editing={row.existing != null}
          draft={row.draft}
          onDraft={(patch) =>
            // Only onto THIS open of this row: a closing row's late stock read
            // must not land on the row opened after it.
            live && setOpenRow((r) => (r && sameRow(r, row) ? { ...r, draft: { ...r.draft, ...patch } } : r))
          }
          catalogue={o.catalogue}
          // The dose being logged never counts itself; the compound's other
          // doses that day do (B21).
          siteLastUsedDays={siteDaysBefore(o.logs, row.day, { compoundId: row.dose.id, slot: row.slot })}
          bodySex={o.bodySex}
          onTileChange={(on) => live && setPanelOpen(on)}
          onAddStock={o.onAddStock ? () => o.onAddStock?.(row.dose) : undefined}
          onSpare={(id) =>
            // The same guard as the draft (B7): a spare lands on the open it
            // was read for, or nowhere.
            setOpenRow((r) => (r && sameRow(r, row) ? { ...r, spare: id } : r))
          }
          readKey={o.stockReadKey ?? 0}
          previewStock={o.previewStock}
        />
      )
    },
  }

  // The Track bar names the site SHORT ("Abdomen L"), consistency fix #28.
  const siteId = liveRow?.draft.siteId ?? null
  const siteName = siteId ? siteShortLabel(siteId, o.catalogue.find((s) => s.id === siteId)?.label) : null

  return {
    flow,
    /** Spread onto `<TrackBar>`. */
    bar: {
      up: liveRow !== null && liveRow.draft.amount > 0,
      label: liveRow ? trackLabel(liveRow.draft, siteName, Boolean(liveRow.existing)) : "",
      confirming,
      busy: tracking,
      onTrack: () => void track(),
    },
    /** Close the open row (a host closing its sheet). */
    close,
    /** The row open on this day, if any. */
    openRow: liveRow,
  }
}
