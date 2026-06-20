"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Check } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
} from "@/lib/compound-categories"
import type { DoseLog } from "@/lib/home/mockHomeData"
import {
  formatTimeLabel,
  isInjectable,
  nextSiteId,
  sanitizeDoseInput,
  type StackCompound,
} from "@/lib/home/stack"
import { siteLabel, sitesForMethod } from "@/lib/home/siteCatalog"
import { listStock, type StockItem } from "@/lib/db/inventory"

interface LogDoseSheetProps {
  open: boolean
  /** The compound being logged; retained through the close animation. */
  compound: StackCompound | null
  /** The existing log when editing an already-logged dose; null = fresh log. */
  existing: DoseLog | null
  /** This compound's real next site to preselect (no auto-dodge). */
  preselectSiteId: string | null
  /** Sites OTHER compounds land on today — flagged (not blocked). */
  usedByOtherIds: string[]
  /** Days since each site was last logged on an earlier day — the rest hint. */
  siteLastUsedDays: Record<string, number>
  onOpenChange: (open: boolean) => void
  /** Commit the log (fresh or edited) — marks the dose logged upstream. */
  onTracked: (compoundId: string, log: DoseLog) => void
  /** Undo — remove the dose's log entirely. */
  onRemove: (compoundId: string) => void
}

// Release the handle past this fraction of the sheet height → dismiss.
const DISMISS_THRESHOLD = 0.3
// How long the green success state lingers before auto-dismissing.
const SUCCESS_MS = 1200

/**
 * The bottom sheet the row "+" (or a logged tick) opens: a pre-filled, editable
 * amount, injection time, and — for injectables — the site. The site selector is
 * limited to THIS compound's own rotation sites, with its next site preselected;
 * confirming advances that compound's pointer upstream. "Track"/"Update" shows a
 * brief full-bleed green tick (auto-dismiss ~1.2s or on tap) then commits; in
 * edit mode a "Remove dose" undoes it.
 *
 * The body is keyed by compound id and re-mounts on each open, so it always
 * reflects the current compound/existing log (no setState-in-effect resets).
 */
export function LogDoseSheet({
  open,
  compound,
  existing,
  preselectSiteId,
  usedByOtherIds,
  siteLastUsedDays,
  onOpenChange,
  onTracked,
  onRemove,
}: LogDoseSheetProps) {
  // Retain the target through the close animation so the sheet doesn't blank as
  // it slides away. Adjusting state during render (guarded) is the sanctioned
  // "keep state when a prop changes" pattern — not a setState-in-effect.
  const [shown, setShown] = useState<{
    compound: StackCompound
    existing: DoseLog | null
    preselectSiteId: string | null
    usedByOtherIds: string[]
  } | null>(
    compound ? { compound, existing, preselectSiteId, usedByOtherIds } : null
  )
  if (
    compound !== null &&
    (compound !== shown?.compound || existing !== shown?.existing)
  ) {
    setShown({ compound, existing, preselectSiteId, usedByOtherIds })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[92dvh] gap-0 border-t-0 bg-transparent p-0 shadow-none"
      >
        {shown ? (
          <LogDoseBody
            key={shown.compound.id}
            compound={shown.compound}
            existing={shown.existing}
            preselectSiteId={shown.preselectSiteId}
            usedByOtherIds={shown.usedByOtherIds}
            siteLastUsedDays={siteLastUsedDays}
            onClose={() => onOpenChange(false)}
            onTracked={onTracked}
            onRemove={onRemove}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

// Re-using a spot sooner than this (days) gets a gentle amber rest flag.
const REST_DAYS = 7
// How many free alternate spots to show before the "See more" reveal, so the
// clash notice stays short instead of dumping every catalogue site at once.
const FREE_PREVIEW = 4

/** Local "HH:MM" for the time field / committed log. */
function toHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`
}

/** Local "HH:MM:SS" for the ticking live indicator. */
function toHHMMSS(d: Date): string {
  return `${toHHMM(d)}:${String(d.getSeconds()).padStart(2, "0")}`
}

function LogDoseBody({
  compound,
  existing,
  preselectSiteId,
  usedByOtherIds,
  siteLastUsedDays,
  onClose,
  onTracked,
  onRemove,
}: {
  compound: StackCompound
  existing: DoseLog | null
  preselectSiteId: string | null
  usedByOtherIds: string[]
  siteLastUsedDays: Record<string, number>
  onClose: () => void
  onTracked: (compoundId: string, log: DoseLog) => void
  onRemove: (compoundId: string) => void
}) {
  const editing = existing !== null
  const injectable = isInjectable(compound.method)
  // The selector is limited to this compound's own sites, IN CYCLE ORDER.
  const rotationSites = compound.rotationSites.map((id) => ({
    id,
    label: siteLabel(id),
  }))
  const hasRotation = injectable && rotationSites.length > 0
  const rotationSet = new Set(compound.rotationSites)
  // Sites OTHER compounds land on today. These are FLAGGED, never blocked — the
  // user can still pick them; it's their decision (tracking, not coaching).
  const usedByOthers = new Set(usedByOtherIds)
  // Preselect this compound's real next site (no auto-dodge).
  const defaultSite = hasRotation
    ? preselectSiteId ?? nextSiteId(compound) ?? rotationSites[0]?.id ?? null
    : null
  // Free spots elsewhere in the catalogue (not in the rotation, not used today) —
  // offered if the user would rather keep injections apart, for that day only.
  const freeSpots = hasRotation
    ? sitesForMethod(compound.method).filter(
        (s) => !usedByOthers.has(s.id) && !rotationSet.has(s.id)
      )
    : []

  const cardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startY: number; height: number } | null>(null)
  const [offsetY, setOffsetY] = useState(0)
  const [dragging, setDragging] = useState(false)

  // A1: the preset dose shows as a VALUE; tapping it reveals the keypad-bound
  // input. So there's no keypad on open and the preset reads as a figure.
  const [amount, setAmount] = useState(existing?.amount ?? String(compound.dose))
  const [editingAmount, setEditingAmount] = useState(false)

  // A4: the time live-tracks the clock (ticking each second) until the user makes
  // a manual edit, which overrides + freezes it; clearing the field resumes live.
  // `manualTime === null` ⇒ live. The committed time is evaluated at SUBMIT
  // (new Date()), never captured at open. Editing an existing dose starts frozen
  // at its logged time.
  const [manualTime, setManualTime] = useState<string | null>(
    existing?.time24 ?? null
  )
  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    if (manualTime !== null) return
    const tick = () => setNow(new Date())
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [manualTime])
  const liveTracking = manualTime === null
  const displayTime = manualTime ?? toHHMM(now)

  const [siteId, setSiteId] = useState<string | null>(
    existing?.siteId ?? defaultSite
  )

  // Vials of THIS compound the dose can draw from, so its "stock left" decrements.
  // Only family-compatible ones (mg-tracked vial ↔ mg/mcg dose; iu ↔ iu) — the DB
  // enforces the same. A fresh log defaults to the most-recent vial; editing keeps
  // the dose's existing link. setState runs after the await (not in the effect body).
  const [vials, setVials] = useState<StockItem[]>([])
  // `undefined` = undecided (a fresh log; the Stock list may still be loading) —
  // the server then links the compound's active vial by default, so a dose logged
  // before this resolves still draws down stock. `null` = the user tapped "Not
  // tracked". A string = a specific vial. Editing starts from the dose's saved link.
  const [inventoryItemId, setInventoryItemId] = useState<string | null | undefined>(
    existing ? (existing.inventoryItemId ?? null) : undefined
  )
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const all = await listStock()
        if (cancelled) return
        const mine = all.filter(
          (v) =>
            v.protocolCompoundId === compound.id &&
            ((v.baseUnit === "mg" && (compound.unit === "mg" || compound.unit === "mcg")) ||
              (v.baseUnit === "iu" && compound.unit === "iu"))
        )
        setVials(mine)
        if (existing == null && mine.length > 0) setInventoryItemId(mine[0].id)
      } catch {
        if (!cancelled) setVials([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [compound.id, compound.unit, existing])

  const [tracked, setTracked] = useState(false)
  // The clash notice shows a few free spots first; "See more" reveals the rest.
  const [showAllFree, setShowAllFree] = useState(false)

  // The chosen site is also used by another compound today (a flagged clash).
  const selectedClashes =
    hasRotation && siteId != null && usedByOthers.has(siteId)

  function buildLog(): DoseLog {
    // Evaluate the time at SUBMIT: a manual override wins, otherwise the live
    // clock right now (A4).
    return {
      amount,
      siteId: hasRotation ? siteId : null,
      time24: manualTime ?? toHHMM(new Date()),
      inventoryItemId,
    }
  }

  // The log is committed the instant Track/Update is tapped (see below) — NOT on
  // close — so dismissing the success tick (tapping it, the backdrop, or letting
  // it auto-dismiss) can never cancel the log. This timer only auto-closes the
  // success state; it never commits.
  useEffect(() => {
    if (!tracked) return
    const t = setTimeout(onClose, SUCCESS_MS)
    return () => clearTimeout(t)
  }, [tracked, onClose])

  /* --------------------------------------------------------- drag-to-dismiss */

  function handlePointerDown(e: React.PointerEvent) {
    const height = cardRef.current?.getBoundingClientRect().height ?? 0
    dragRef.current = { startY: e.clientY, height }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    setOffsetY(Math.max(0, Math.min(e.clientY - drag.startY, drag.height)))
  }

  function handlePointerUp() {
    const drag = dragRef.current
    dragRef.current = null
    setDragging(false)
    if (drag && offsetY > drag.height * DISMISS_THRESHOLD) {
      setOffsetY(0)
      onClose()
    } else {
      setOffsetY(0)
    }
  }

  const meta = CATEGORY_META[compound.category] ?? FALLBACK_CATEGORY_META

  return (
    <div
      ref={cardRef}
      style={{
        transform: `translateY(${offsetY}px)`,
        transition: dragging ? "none" : "transform 250ms ease-out",
      }}
      className="relative flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl border-t border-border-default bg-bg-surface shadow-lg"
    >
      {/* Grab handle — drag down to dismiss. */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="flex h-11 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
      >
        <span aria-hidden className="h-1 w-9 rounded-full bg-border-strong" />
      </div>

      <SheetTitle className="shrink-0 px-6 text-base font-semibold text-foreground">
        {editing ? "Edit dose" : "Log dose"}
      </SheetTitle>
      <SheetDescription className="sr-only">
        {editing
          ? "Adjust the amount, time or site, then update or remove this dose."
          : "Confirm or adjust the amount, time and site, then track this dose."}
      </SheetDescription>

      <div className="flex-1 overflow-y-auto overscroll-contain px-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        {/* Dose summary */}
        <div className="flex items-center gap-3 rounded-xl bg-bg-surface-raised px-4 py-3">
          <span
            aria-hidden
            className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-medium text-foreground">
              {compound.name}
            </p>
            <p className="truncate font-mono text-sm text-text-muted">
              Scheduled {formatTimeLabel(compound.schedule.timeOfDay)}
            </p>
          </div>
        </div>

        {/* Amount + time. The row is sized to never overflow at 360–390px: the
            amount can shrink (min-w-0) and the time is width-capped (A2). */}
        <div className="mt-5 flex gap-3">
          <label className="block min-w-0 flex-1">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
              Amount
            </span>
            <div className="relative">
              {editingAmount ? (
                <Input
                  // A1: the keypad-bound field only mounts (and focuses) once the
                  // value is tapped — so opening the sheet never raises the keypad.
                  autoFocus
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(sanitizeDoseInput(e.target.value))}
                  onBlur={() => setEditingAmount(false)}
                  aria-label={`Amount in ${compound.unit}`}
                  className="h-12 rounded-xl border-border-default bg-bg-input pr-14 font-mono text-base dark:bg-bg-input"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingAmount(true)}
                  aria-label={`Amount ${amount} ${compound.unit}. Tap to edit.`}
                  className="flex h-12 w-full items-center rounded-xl border border-border-default bg-bg-input px-4 pr-14 text-left font-mono text-base text-foreground"
                >
                  {amount || "0"}
                </button>
              )}
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-text-muted">
                {compound.unit}
              </span>
            </div>
          </label>

          <label className="block w-28 max-w-[40%] shrink-0">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
              Time
            </span>
            <Input
              type="time"
              value={displayTime}
              onChange={(e) =>
                // Empty ⇒ resume live tracking; any value ⇒ a manual override.
                setManualTime(e.target.value === "" ? null : e.target.value)
              }
              aria-label="Time taken"
              className="h-12 w-full min-w-0 rounded-xl border-border-default bg-bg-input px-3 font-mono text-sm dark:bg-bg-input"
            />
          </label>
        </div>

        {/* Live-clock hint — ticks each second while tracking; tapping the time
            field to set a value freezes it (A4). */}
        <p className="mt-1.5 px-1 text-xs text-text-subtle">
          {liveTracking ? (
            <>
              Logging at{" "}
              <span className="font-mono text-accent-amber">
                {toHHMMSS(now)}
              </span>{" "}
              — live now. Tap the time to set it yourself.
            </>
          ) : (
            <>Time set manually. Clear it to track the current time again.</>
          )}
        </p>

        {/* Injection site — this compound's own rotation (real next preselected,
            no auto-dodge). A site another compound also lands on today is FLAGGED
            (amber dot), never blocked. If the selected site clashes, free spots
            are offered for that day — keep it or switch, the user's choice. */}
        {hasRotation && (
          <div className="mt-5">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
              Injection site
            </span>

            <div className="flex flex-wrap gap-2">
              {rotationSites.map((site) => {
                const active = site.id === siteId
                const shared = usedByOthers.has(site.id)
                return (
                  <button
                    key={site.id}
                    type="button"
                    onClick={() => setSiteId(site.id)}
                    aria-pressed={active}
                    title={
                      shared ? "Also used by another compound today" : undefined
                    }
                    className={cn(
                      "relative rounded-full border px-3 py-1.5 font-mono text-sm transition-colors duration-200 ease-out",
                      active
                        ? "border-accent-amber bg-accent-amber/15 text-foreground"
                        : shared
                          ? "border-accent-amber/40 bg-accent-amber/5 text-text-muted"
                          : "border-border-default bg-bg-input text-text-muted hover:text-text-primary"
                    )}
                  >
                    {site.label}
                    {shared && (
                      <span
                        aria-hidden
                        className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-accent-amber"
                      />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Selected site clashes → offer free alternates for today (optional). */}
            {selectedClashes && freeSpots.length > 0 && (
              <div className="animate-shortcut-in mt-3 rounded-xl border border-accent-amber/40 bg-accent-amber/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-amber"
                    aria-hidden
                  />
                  <p className="text-xs leading-relaxed text-foreground">
                    This site is also used by another compound today. These are
                    free spots if you&apos;d rather keep them apart.{" "}
                    <span className="text-text-muted">
                      It&apos;s an observation, not advice. Where you inject is
                      your choice.
                    </span>
                  </p>
                </div>
                <p className="mt-2.5 mb-1.5 text-[11px] font-medium tracking-wider text-text-muted uppercase">
                  Free spots today
                </p>
                <div className="flex flex-wrap gap-2">
                  {(showAllFree
                    ? freeSpots
                    : freeSpots.slice(0, FREE_PREVIEW)
                  ).map((site) => {
                    const active = site.id === siteId
                    return (
                      <button
                        key={site.id}
                        type="button"
                        onClick={() => setSiteId(site.id)}
                        aria-pressed={active}
                        className={cn(
                          "rounded-full border px-3 py-1.5 font-mono text-sm transition-colors duration-200 ease-out",
                          active
                            ? "border-accent-amber bg-accent-amber/15 text-foreground"
                            : "border-border-default bg-bg-input text-text-muted hover:text-text-primary"
                        )}
                      >
                        {site.label}
                      </button>
                    )
                  })}
                </div>
                {freeSpots.length > FREE_PREVIEW && (
                  <button
                    type="button"
                    onClick={() => setShowAllFree((v) => !v)}
                    className="mt-2 text-xs font-medium text-accent-amber transition-opacity hover:opacity-80"
                  >
                    {showAllFree
                      ? "See fewer"
                      : `See more (${freeSpots.length - FREE_PREVIEW})`}
                  </button>
                )}
              </div>
            )}

            <p className="mt-2 px-1 text-xs text-text-subtle">
              {selectedClashes
                ? "A free spot only logs here for today. It won't change your saved rotation."
                : "Next in your rotation is pre-selected. Change it if needed."}
            </p>

            {/* Site rest hint — how long since this spot was last used. */}
            {siteId != null && siteLastUsedDays[siteId] !== undefined && (
              <p
                className={cn(
                  "mt-1 px-1 text-xs",
                  siteLastUsedDays[siteId] < REST_DAYS
                    ? "text-accent-amber"
                    : "text-text-subtle"
                )}
              >
                {siteLastUsedDays[siteId] < REST_DAYS
                  ? `You last used this spot ${siteLastUsedDays[siteId]}d ago. Just an observation, your choice.`
                  : `Last used here ${siteLastUsedDays[siteId]}d ago.`}
              </p>
            )}

            {/* Confirmation of the chosen site — so picking any spot (including a
                free alternate that isn't in the rotation above) is clearly visible. */}
            {siteId != null && (
              <div
                key={siteId}
                className="animate-shortcut-fade mt-3 flex items-center gap-2 rounded-xl border border-accent-amber/50 bg-accent-amber/10 px-3 py-2.5"
              >
                <Check className="h-4 w-4 shrink-0 text-accent-amber" aria-hidden />
                <span className="text-xs text-text-muted">Logging to</span>
                <span className="font-mono text-sm font-medium text-foreground">
                  {siteLabel(siteId)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* From vial — connect this dose to a tracked vial so its "stock left"
            counts down (v_inventory_math). Only this compound's compatible vials
            are offered; "Not tracked" logs the dose without drawing from stock. */}
        {vials.length > 0 && (
          <div className="mt-5">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
              From vial
            </span>
            <div className="flex flex-wrap gap-2">
              {vials.map((v) => {
                const active = v.id === inventoryItemId
                const label =
                  v.remainingDisplay == null
                    ? "Vial"
                    : v.inventoryType === "oral_solid"
                      ? `${v.remainingDisplay} left`
                      : `${v.remainingDisplay} mL left`
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setInventoryItemId(v.id)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full border px-3 py-1.5 font-mono text-sm transition-colors duration-200 ease-out",
                      active
                        ? "border-accent-amber bg-accent-amber/15 text-foreground"
                        : "border-border-default bg-bg-input text-text-muted hover:text-text-primary"
                    )}
                  >
                    {label}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => setInventoryItemId(null)}
                aria-pressed={inventoryItemId === null}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors duration-200 ease-out",
                  inventoryItemId === null
                    ? "border-accent-amber bg-accent-amber/15 text-foreground"
                    : "border-border-default bg-bg-input text-text-muted hover:text-text-primary"
                )}
              >
                Not tracked
              </button>
            </div>
            <p className="mt-2 px-1 text-xs text-text-subtle">
              Counts this dose against that vial&apos;s “stock left”.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <SheetClose className="flex-1 rounded-xl border border-border-strong py-3 text-sm font-medium text-text-muted transition-colors hover:text-text-primary">
            Cancel
          </SheetClose>
          <button
            type="button"
            onClick={() => {
              // Commit immediately, THEN show the success tick — so nothing about
              // dismissing the tick can undo the log.
              onTracked(compound.id, buildLog())
              setTracked(true)
            }}
            className="flex-[1.6] rounded-xl bg-accent-primary py-3 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99]"
          >
            {editing ? "Update" : "Track"}
          </button>
        </div>

        {/* Undo — edit mode only. */}
        {editing && (
          <button
            type="button"
            onClick={() => {
              onRemove(compound.id)
              onClose()
            }}
            className="mt-4 block w-full text-center text-sm text-state-error transition-opacity hover:opacity-80"
          >
            Remove dose
          </button>
        )}
      </div>

      {/* Full-bleed success state — UI feedback only (sanctioned green). The log
          is already committed; tapping just dismisses (it can't undo anything). */}
      {tracked && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dose tracked"
          className="animate-shortcut-fade absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-t-3xl bg-accent-green text-bg-base"
        >
          <span className="relative flex h-16 w-16 items-center justify-center">
            <span
              aria-hidden
              className="animate-home-tick-ring absolute inset-0 rounded-full border-2 border-bg-base/40"
            />
            <span className="animate-home-tick-pop flex h-16 w-16 items-center justify-center rounded-full bg-bg-base/15">
              <Check className="h-9 w-9" strokeWidth={2.5} aria-hidden />
            </span>
          </span>
          <span className="animate-shortcut-fade text-base font-semibold">
            {editing ? "Updated" : "Tracked"}
          </span>
        </button>
      )}
    </div>
  )
}
