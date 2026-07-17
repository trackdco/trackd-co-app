"use client"

import { useEffect, useRef, useState } from "react"
import { CalendarDays, Check } from "lucide-react"

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
  formatDateKeyShort,
  formatTimeLabel,
  isInjectable,
  sanitizeDoseInput,
  type StackCompound,
} from "@/lib/home/stack"
import { siteLabel, sitesForSex } from "@/lib/home/siteCatalog"
import { listStock, type StockItem } from "@/lib/db/inventory"
import { resolveVialForDate } from "@/lib/home/protocolSync"
import { BodyMap } from "@/components/sites/BodyMap"
import { listInjectionSiteCatalogue } from "@/lib/db/injectionSites"
import type {
  BodySex,
  InjectionSiteRoute,
  InjectionSiteRow,
} from "@/lib/db/types"

interface LogDoseSheetProps {
  open: boolean
  /** The compound being logged; retained through the close animation. */
  compound: StackCompound | null
  /** The existing log when editing an already-logged dose; null = fresh log. */
  existing: DoseLog | null
  /** The day this dose lands on, "YYYY-MM-DD" — the caller's selected day, which
   *  need NOT be today (the week strip can look back). Everything date-dependent
   *  keys off this: the notice, the default time, and which vial it draws from. */
  dateKey: string
  /** The device's local today, "YYYY-MM-DD" — what `dateKey` is judged against. */
  todayKey: string
  /** Days since each site was last logged on an earlier day — the map's day-count. */
  siteLastUsedDays: Record<string, number>
  /** Which figure the pick map draws (from the user's profile). */
  bodySex: BodySex
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
 * amount, injection time, and — for injectables — the site, chosen on the shared
 * body map (Spec 19) drawn from the user's working set for this compound's route.
 * "Track"/"Update" shows a brief full-bleed green tick (auto-dismiss ~1.2s or on
 * tap) then commits; in edit mode a "Remove dose" undoes it.
 *
 * The body is keyed by compound id and re-mounts on each open, so it always
 * reflects the current compound/existing log (no setState-in-effect resets).
 */
export function LogDoseSheet({
  open,
  compound,
  existing,
  dateKey,
  todayKey,
  siteLastUsedDays,
  bodySex,
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
  } | null>(compound ? { compound, existing } : null)
  if (
    compound !== null &&
    (compound !== shown?.compound || existing !== shown?.existing)
  ) {
    setShown({ compound, existing })
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
            // Keyed by day too: the default time and the vial wording both derive
            // from it, so re-opening on another day must start fresh.
            key={`${shown.compound.id}:${dateKey}`}
            compound={shown.compound}
            existing={shown.existing}
            dateKey={dateKey}
            todayKey={todayKey}
            siteLastUsedDays={siteLastUsedDays}
            bodySex={bodySex}
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
  dateKey,
  todayKey,
  siteLastUsedDays,
  bodySex,
  onClose,
  onTracked,
  onRemove,
}: {
  compound: StackCompound
  existing: DoseLog | null
  dateKey: string
  todayKey: string
  siteLastUsedDays: Record<string, number>
  bodySex: BodySex
  onClose: () => void
  onTracked: (compoundId: string, log: DoseLog) => void
  onRemove: (compoundId: string) => void
}) {
  const editing = existing !== null
  const injectable = isInjectable(compound.method)
  // Life doesn't happen at the phone: the week strip can look back, so a dose may
  // land on a day that isn't today. Everything below that depends on "when" reads
  // this rather than the clock.
  const onToday = dateKey === todayKey

  const cardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startY: number; height: number } | null>(null)
  const [offsetY, setOffsetY] = useState(0)
  const [dragging, setDragging] = useState(false)

  // A1: the preset dose shows as a VALUE; tapping it reveals the keypad-bound
  // input. So there's no keypad on open and the preset reads as a figure.
  const [amount, setAmount] = useState(existing?.amount ?? String(compound.dose))
  const [editingAmount, setEditingAmount] = useState(false)

  // A4: `manualTime === null` ⇒ take the day's default; any value ⇒ the user's own,
  // frozen. Editing an existing dose starts frozen at its logged time.
  //
  // What the default IS depends on the day. On TODAY it live-tracks the clock
  // (ticking each second) and is evaluated at SUBMIT, never captured at open. On a
  // BACK-DATED day the clock is meaningless — stamping "now" onto yesterday's dose
  // is exactly the thing that makes late-logged data wrong — so it defaults to the
  // compound's own scheduled time for that day, which is the best guess available.
  const [manualTime, setManualTime] = useState<string | null>(
    existing?.time24 ?? null
  )
  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    if (manualTime !== null || !onToday) return
    const tick = () => setNow(new Date())
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [manualTime, onToday])
  const liveTracking = manualTime === null && onToday
  const defaultTime = onToday ? toHHMM(now) : compound.schedule.timeOfDay
  const displayTime = manualTime ?? defaultTime

  const [siteId, setSiteId] = useState<string | null>(existing?.siteId ?? null)

  // Injection-site body map (Spec 19): this compound's site catalogue, lazily
  // loaded like the vials below (so this stays localised to the sheet). One tap
  // picks where you injected. The route is FIXED to the compound's method — an IM
  // compound only logs IM sites, Sub-Q only Sub-Q; there's no cross-route logging
  // (the method is chosen once, when the compound is added). Oral compounds skip it.
  const route: InjectionSiteRoute = compound.method === "subq" ? "subq" : "im"
  const [catalogue, setCatalogue] = useState<InjectionSiteRow[]>([])
  const [loadingSites, setLoadingSites] = useState(injectable)
  useEffect(() => {
    if (!injectable) return
    let cancelled = false
    void (async () => {
      try {
        const cat = await listInjectionSiteCatalogue()
        if (!cancelled) setCatalogue(cat)
      } catch {
        if (!cancelled) setCatalogue([])
      } finally {
        if (!cancelled) setLoadingSites(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [injectable])

  // Vials of THIS compound the dose can draw from, so its "stock left" decrements.
  // Only family-compatible ones (mg-tracked vial ↔ mg/mcg dose; iu ↔ iu) — the DB
  // enforces the same. A fresh log ON TODAY defaults to the most-recent vial;
  // editing keeps the dose's existing link. setState runs after the await (not in
  // the effect body).
  //
  // A BACK-DATED log never picks from this list: `listStock` only knows the vials
  // active NOW, which may not be the one that was in use on the dose's day. It stays
  // undecided so the server resolves the vial by the dose's own instant instead.
  const [vials, setVials] = useState<StockItem[]>([])
  // `undefined` = undecided (a fresh log; the vial read may still be in flight) —
  // the server then resolves the vial for the dose's date, so a dose tracked before
  // this settles still draws down stock. `null` = the user tapped "Not tracked". A
  // string = a specific vial. Editing starts from the dose's saved link — and an
  // undecided one must stay `undefined`, NOT collapse to `null`: `null` means
  // "explicitly don't count this", so updating the dose would unlink the vial the
  // server had resolved for it. (The store preserves the distinction; see doseLog.)
  const [inventoryItemId, setInventoryItemId] = useState<string | null | undefined>(
    existing ? existing.inventoryItemId : undefined
  )
  // Starts true — the body re-mounts per compound (keyed), so the initial value
  // applies on each open; the fetch flips it false in `finally`.
  const [loadingVials, setLoadingVials] = useState(true)
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
        if (existing == null && onToday && mine.length > 0) {
          setInventoryItemId(mine[0].id)
        }
      } catch {
        if (!cancelled) setVials([])
      } finally {
        if (!cancelled) setLoadingVials(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [compound.id, compound.unit, existing, onToday])

  // BACK-DATED: which vial this compound was actually drawing from on `dateKey`.
  // `listStock` above can't answer that — it only knows what's active NOW, and the
  // vial in use on a past day is often archived by now — so the server resolves it
  // by the same rule the write path uses. Drives BOTH the section's visibility (no
  // vial back then ⇒ nothing links ⇒ show nothing, rather than claim a vial that
  // doesn't exist) and the committed link, so an edit round-trips the real id
  // instead of re-guessing. `undefined` = still resolving.
  const [dateVialId, setDateVialId] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (onToday) return
    let cancelled = false
    void (async () => {
      try {
        const v = await resolveVialForDate(compound.id, dateKey)
        if (cancelled) return
        setDateVialId(v?.id ?? null)
        // Only adopt it as the pick for a FRESH log, and only while the user hasn't
        // decided — never clobber an edit's saved link or an explicit "Not tracked".
        if (v && existing == null) {
          setInventoryItemId((cur) => (cur === undefined ? v.id : cur))
        }
      } catch {
        if (!cancelled) setDateVialId(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [onToday, compound.id, dateKey, existing])

  const [tracked, setTracked] = useState(false)

  // Sites to show on the map: this compound's route only — pick any site on it.
  // The day-count for the picked spot is shown in the caption below (never on the
  // muscle itself). Narrowed to the sites that exist on this user's body too (the
  // sheet loads the catalogue itself, so it filters itself — the female IM art has
  // no pecs, and an unpickable site in the list would be a dead end).
  const sitesToShow = sitesForSex(
    catalogue.filter((s) => s.route === route),
    bodySex,
  )

  function buildLog(): DoseLog {
    // Keep the chosen site only if it's a real site on THIS compound's route —
    // editing an older/cross-route dose could otherwise round-trip a siteId that
    // isn't even pickable here (it's off-route or gone from the catalogue), so drop
    // it to null. While the catalogue is still loading we can't validate, so the
    // existing value is trusted (the dose logs either way).
    const siteOnRoute =
      siteId == null ||
      catalogue.length === 0 ||
      sitesToShow.some((s) => s.id === siteId)
    // Evaluate the time at SUBMIT: a manual override wins, otherwise the day's
    // default — the live clock right now on today (A4), or the compound's scheduled
    // time when back-dating (the clock says nothing about a dose taken yesterday).
    return {
      amount,
      siteId: injectable && siteOnRoute ? siteId : null,
      time24:
        manualTime ?? (onToday ? toHHMM(new Date()) : compound.schedule.timeOfDay),
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
        {/* Which day this lands on — shown ONLY when that isn't today, so nobody
            back-fills a week of doses having forgotten they scrolled the strip back.
            Deliberately quiet (muted, no amber): it's an orientation note, not a
            warning, and the whole point of the week strip is that this is allowed.
            It states the date and nothing else — past and future read identically
            (Adrian's call). Naming the day is the whole job; qualifying it ("not
            today", "a future day") editorialises about a choice the user just made. */}
        {!onToday && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-border-default bg-bg-surface-raised px-3 py-2">
            <CalendarDays
              className="h-3.5 w-3.5 shrink-0 text-text-muted"
              aria-hidden
            />
            <p className="text-xs text-text-muted">
              Logging to{" "}
              <span className="font-mono text-foreground">
                {formatDateKeyShort(dateKey)}
              </span>
            </p>
          </div>
        )}

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

        {/* Time hint — on today the clock ticks each second until you set a value
            (A4); on a back-dated day it says which default it fell back to, since
            "live now" would be a lie about a dose taken days ago. */}
        <p className="mt-1.5 px-1 text-xs text-text-subtle">
          {liveTracking ? (
            <>
              Logging at{" "}
              <span className="font-mono text-accent-amber">
                {toHHMMSS(now)}
              </span>{" "}
              — live now. Tap the time to set it yourself.
            </>
          ) : manualTime === null ? (
            <>
              Using this compound&apos;s scheduled time. Tap the time to set it
              yourself.
            </>
          ) : (
            <>Time set manually. Clear it to use the default again.</>
          )}
        </p>

        {/* Injection site — the shared body map (Spec 19), this compound's own
            route only (IM or Sub-Q, fixed by the compound — no cross-route logging).
            One tap picks where you injected; each carries its day-count. Oral
            compounds show nothing; picking a site is optional (the dose logs either
            way). */}
        {injectable && (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Injection site
              </span>
              <span className="text-xs text-text-subtle">
                {route === "im" ? "Intramuscular" : "Subcutaneous"}
              </span>
            </div>

            {loadingSites ? (
              <p className="px-1 text-xs text-text-subtle">Loading sites…</p>
            ) : sitesToShow.length === 0 ? (
              <p className="rounded-xl border border-border-default bg-bg-input px-3 py-3 text-xs text-text-muted">
                Couldn&apos;t load the body map — you can still log the dose.
              </p>
            ) : (
              <BodyMap
                sites={sitesToShow}
                mode="pick"
                sex={bodySex}
                activeIds={siteId ? [siteId] : []}
                onTapSite={setSiteId}
              />
            )}

            {siteId != null && (
              <>
                {/* Site rest hint — how long since this spot was last used. */}
                {siteLastUsedDays[siteId] !== undefined && (
                  <p
                    className={cn(
                      "mt-2 px-1 text-xs",
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

                {/* Confirmation of the chosen site. */}
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
              </>
            )}
          </div>
        )}

        {/* While the vial read is in flight, a brief hint so the picker doesn't pop
            in unexplained and the sheet doesn't read as "no vial" before it knows
            (the link itself is set server-side regardless). Each day asks a different
            question — today reads the active Stock list, a back-dated day resolves
            the vial that was in use then — so each has its own pending signal.
            Deliberately NOT a blocked "Track": the local write is synchronous and
            offline-first (architecture.md — "a network blip never blocks the UI"), so
            gating the primary action on a Supabase round-trip would be the worse bug.
            Tracking early still links the SAME vial via the server fallback, which
            runs the same rule; the opt-out is then one tap away on re-open. */}
        {onToday
          ? loadingVials &&
            vials.length === 0 && (
              <p className="mt-5 px-1 text-xs text-text-subtle">Checking your stock…</p>
            )
          : dateVialId === undefined && (
              <p className="mt-5 px-1 text-xs text-text-subtle">
                Checking which vial you were using…
              </p>
            )}

        {/* From vial, BACK-DATED — keyed off the vial resolved for THIS DAY, not the
            active-now list (which needn't contain it: adding or refilling archives
            the prior vial, so the vial in use back then is often archived today).
            Shown exactly when a vial WILL be linked — so the opt-out is always
            reachable for a dose that's about to draw down stock, including an
            archived vial with nothing active today, and a compound that had no vial
            back then shows nothing rather than naming one that doesn't exist. */}
        {!onToday && dateVialId != null && (
          <div className="mt-5">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
              From vial
            </span>
            {inventoryItemId === null ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-border-default bg-bg-input px-3 py-2.5">
                <span className="min-w-0 text-xs text-text-muted">
                  Not counting this dose against your stock.
                </span>
                <button
                  type="button"
                  onClick={() => setInventoryItemId(dateVialId)}
                  className="shrink-0 text-xs font-medium text-accent-amber transition-opacity hover:opacity-80"
                >
                  Count it
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-border-default bg-bg-input px-3 py-2.5">
                <span className="min-w-0 text-xs text-text-muted">
                  Counts against the vial you were using on{" "}
                  <span className="font-mono text-foreground">
                    {formatDateKeyShort(dateKey)}
                  </span>
                  .
                </span>
                <button
                  type="button"
                  onClick={() => setInventoryItemId(null)}
                  className="shrink-0 text-xs text-text-subtle underline underline-offset-2 transition-colors hover:text-foreground"
                >
                  Don&apos;t count this one
                </button>
              </div>
            )}
          </div>
        )}

        {/* From vial — the dose AUTO-LINKS to this compound's active vial so its
            "stock left" counts down (v_inventory_math); no manual picking. The
            usual case (one active vial per compound) shows a calm confirmation with
            a quiet opt-out. The rare 2+ vials case keeps an explicit chooser. */}
        {onToday &&
          vials.length === 1 &&
          (() => {
            const v = vials[0]
            const left =
              v.remainingDisplay == null
                ? null
                : v.inventoryType === "oral_solid"
                  ? `${v.remainingDisplay} left`
                  : `${v.remainingDisplay} mL left`
            return (
              <div className="mt-5">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
                  From vial
                </span>
                {inventoryItemId === null ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-border-default bg-bg-input px-3 py-2.5">
                    <span className="min-w-0 text-xs text-text-muted">
                      Not counting this dose against your stock.
                    </span>
                    <button
                      type="button"
                      onClick={() => setInventoryItemId(v.id)}
                      className="shrink-0 text-xs font-medium text-accent-amber transition-opacity hover:opacity-80"
                    >
                      Count it
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-accent-amber/50 bg-accent-amber/10 px-3 py-2.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-accent-amber" aria-hidden />
                      <span className="truncate text-xs text-text-muted">
                        Drawing from your stock
                        {left && <span className="font-mono text-foreground">{` · ${left}`}</span>}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setInventoryItemId(null)}
                      className="shrink-0 text-xs text-text-subtle underline underline-offset-2 transition-colors hover:text-foreground"
                    >
                      Don&apos;t count this one
                    </button>
                  </div>
                )}
              </div>
            )
          })()}

        {onToday && vials.length > 1 && (
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
