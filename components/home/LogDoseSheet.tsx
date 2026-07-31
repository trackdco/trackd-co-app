"use client"

import { useEffect, useRef, useState } from "react"
import { CaretRight, Check } from "@/components/icons"

import { cn } from "@/lib/utils"
import { SHEET_TITLE } from "@/lib/ui-presets"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { CompoundHeader } from "@/components/compounds/CompoundHeader"
import type { DoseLog } from "@/lib/home/mockHomeData"
import {
  formatDateKeyShort,
  formatTimeLabel,
  hasTime,
  isInjectable,
  resolveScheduleOn,
  sanitizeDoseInput,
  type StackCompound,
} from "@/lib/home/stack"
import { siteLabel, sitesForSex } from "@/lib/home/siteCatalog"
import { listStock, type StockItem } from "@/lib/db/inventory"
import { resolveDrawSources, resolveVialForDate } from "@/lib/home/protocolSync"
import { formatDraw, type DrawSource } from "@/lib/home/draw"
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
  /**
   * Commit the log (fresh or edited).
   *
   * `landsOn` is the day the dose belongs to, which is NOT always the day the
   * sheet was opened on: the Date row is editable, so someone who took a dose a
   * day early can say so. When it differs from `openedOn` the caller must MOVE
   * the entry, not copy it.
   */
  onTracked: (
    compoundId: string,
    log: DoseLog,
    landsOn: string,
    openedOn: string
  ) => void
  /** Undo — remove the dose's log entirely. */
  onRemove: (compoundId: string) => void
  /**
   * Whether this compound already has a dose logged on a given day.
   *
   * The Date row can move a dose, and `logDose` writes by `[day][compound]` — so
   * moving one onto a day that already had one silently DESTROYED the other,
   * with its own amount, time and site, and no undo. The sheet needs to know
   * before it lets that happen.
   */
  hasLogOn?: (dateKey: string) => boolean
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
  hasLogOn,
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

  /**
   * The day the sheet was OPENED on, frozen for as long as it is open.
   *
   * The body used to be keyed on the live `dateKey` prop, and two ordinary
   * things change that prop underneath an open sheet: committing a dose whose
   * date the user moved (the caller follows the dose to its new day), and local
   * midnight arriving (`syncToday` rolls the selected day over). Either one
   * REMOUNTED the body — which discarded the success tick and its auto-close
   * timer, and re-seeded every field from the schedule.
   *
   * What the user saw after moving a dose's date and tapping Track: no
   * confirmation, the sheet still open, the dose back at its default and the
   * note gone. Tapping Track again — the only reasonable response — overwrote
   * their corrected dose with the full scheduled one. Someone who had
   * deliberately halved a dose ended up with the whole one on record.
   *
   * So the parent's day is read ONCE per open. Everything inside already works
   * off `logDate`, which the Date row owns.
   */
  const [openedOn, setOpenedOn] = useState(dateKey)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setOpenedOn(dateKey)
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
            // Keyed by the day the sheet OPENED on, so re-opening on another day
            // still starts fresh while the day moving under an open sheet cannot
            // wipe what the user has typed.
            key={`${shown.compound.id}:${openedOn}`}
            compound={shown.compound}
            existing={shown.existing}
            dateKey={openedOn}
            todayKey={todayKey}
            siteLastUsedDays={siteLastUsedDays}
            bodySex={bodySex}
            onClose={() => onOpenChange(false)}
            onTracked={onTracked}
            onRemove={onRemove}
            hasLogOn={hasLogOn}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

// Re-using a spot sooner than this (days) gets a gentle amber rest flag.
const REST_DAYS = 7

/** Matches the cap the sync layer applies before the write. */
const NOTE_MAX = 2000

/**
 * Bounds on the Date row.
 *
 * Not a product rule — a guard against a typed year. A native date input takes
 * digits straight into the year segment, and typing eight of them produced
 * `275760-07-31`, which was stored verbatim as the day key. That dose lands
 * somewhere the week strip and the calendar cannot navigate to: invisible, and
 * unremovable. The window is deliberately generous; back-dating and logging a
 * day or two ahead both stay allowed.
 */
const MIN_LOG_DATE = "2015-01-01"
const MAX_LOG_DATE = "2100-12-31"

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
  hasLogOn,
}: {
  compound: StackCompound
  existing: DoseLog | null
  dateKey: string
  todayKey: string
  siteLastUsedDays: Record<string, number>
  bodySex: BodySex
  onClose: () => void
  onTracked: (
    compoundId: string,
    log: DoseLog,
    landsOn: string,
    openedOn: string
  ) => void
  onRemove: (compoundId: string) => void
  hasLogOn?: (dateKey: string) => boolean
}) {
  const editing = existing !== null
  const injectable = isInjectable(compound.method)

  /**
   * The day this dose lands on, EDITABLE.
   *
   * Seeded from the day the sheet was opened on (the week strip's or the
   * calendar's selection), which is right almost always. But life does not run
   * to the schedule: a supplement taken the evening before it was due belongs to
   * the evening it was taken, and until now the only way to record that was to
   * close the sheet, scroll the strip and start again — which nobody does, so
   * the dose went down on the wrong day instead.
   *
   * Everything date-dependent below reads THIS, not the prop: the schedule rule
   * in force, the vial in use, the live-clock default, and what gets written.
   */
  const [logDate, setLogDate] = useState(dateKey)
  /**
   * Moving this dose onto a day that ALREADY has one for this compound would
   * overwrite it — `logDose` writes by `[day][compound]`, so the other dose,
   * with its own amount, time and site, would simply be gone. Blocked rather
   * than resolved: there is no correct automatic answer to "which of these two
   * doses did you mean", and destroying data to avoid asking is the worst one.
   */
  const dayTaken =
    logDate !== dateKey && (hasLogOn?.(logDate) ?? false)
  // Life doesn't happen at the phone: the week strip can look back, so a dose may
  // land on a day that isn't today. Everything below that depends on "when" reads
  // this rather than the clock.
  const onToday = logDate === todayKey

  const cardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startY: number; height: number } | null>(null)
  const [offsetY, setOffsetY] = useState(0)
  const [dragging, setDragging] = useState(false)

  // A1: the preset dose shows as a VALUE; tapping it reveals the keypad-bound
  // input. So there's no keypad on open and the preset reads as a figure.
  // The dose AS IT WAS on the day being logged, not the compound's current one.
  // `resolveScheduleOn` is what every retrospective READ already uses; the write
  // was reading the live compound, so back-dating a day recorded today's dose.
  const onDay = resolveScheduleOn(compound, logDate)
  const [amount, setAmount] = useState(existing?.amount ?? String(onDay.dose))
  const [editingAmount, setEditingAmount] = useState(false)

  // `manualTime === null` ⇒ take the day's default; any value ⇒ the user's own,
  // frozen. Editing an existing dose starts frozen at its logged time.
  //
  // What the default IS depends on the day. On TODAY it live-tracks the clock
  // (ticking each second) and is evaluated at SUBMIT, never captured at open. On a
  // BACK-DATED day the clock is meaningless — stamping "now" onto yesterday's dose
  // would be a plain lie — so it defaults to the compound's own scheduled time for
  // that day, which is the best guess available.
  //
  // Spec 01 briefly made this start empty and required; reverted at Adrian's
  // request (2026-07-29) — a pre-filled, overridable time is the faster log, and
  // leaving it unset stays allowed.
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
  // The dose's own note. Optional, always last, and never interpreted by
  // anything — `dose_logs.note` has existed since v0.4.2 and nothing had ever
  // written to it (spec 11 · card three).
  const [note, setNote] = useState(existing?.note ?? "")
  const [siteSheetOpen, setSiteSheetOpen] = useState(false)

  // How much to draw for THIS dose (Spec 21, extended to this sheet by spec 11).
  // The vial facts are resolved server-side for the dose's own DAY, exactly as
  // Home's today's-log does — a back-dated log prices against the vial that was
  // in use then, not the one in use now. The arithmetic is `formatDraw`,
  // unchanged; nothing here recomputes a concentration.
  const [drawSource, setDrawSource] = useState<DrawSource | null>(null)
  useEffect(() => {
    if (!injectable) return
    let cancelled = false
    void (async () => {
      try {
        const result = await resolveDrawSources([compound.id], logDate)
        if (!cancelled) setDrawSource(result.sources[compound.id] ?? null)
      } catch {
        if (!cancelled) setDrawSource(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [injectable, compound.id, logDate])
  // Against the amount ACTUALLY in the field, so editing the dose moves the draw
  // with it. `formatDraw` returns null rather than a plausible-but-wrong figure
  // when the units disagree, which is why this can simply be rendered or not.
  // THE UNIT IN FORCE ON THE DOSE'S OWN DAY, not the compound's current one.
  // The amount already comes from `onDay`, and `buildLog` already stamps the
  // record with `onDay.unit` — the draw was the one place still reading
  // `compound.unit`. Change a compound from mcg to mg, then open a dose from
  // before the change: the amount was the historic 250, the unit handed to
  // `formatDraw` was the current mg, and `formatDraw`'s own mismatch guard could
  // not fire because it compares against `protocol_compounds.dose_unit`, which is
  // also current. The row then printed "5000u (50 mL)" for a 5u dose — a
  // thousandfold error, in amber, on the figure the spec calls the one the user
  // acts on. With the historic unit the guard fires and the row is simply absent,
  // which is the right answer: no figure beats a wrong one.
  const loggedUnit = existing?.unit ?? onDay.unit ?? compound.unit
  const drawAmount = Number(amount)
  const draw = Number.isFinite(drawAmount)
    ? formatDraw(drawAmount, loggedUnit, drawSource)
    : null

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
        const v = await resolveVialForDate(compound.id, logDate)
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
  }, [onToday, compound.id, logDate, existing])

  const [tracked, setTracked] = useState(false)

  /**
   * What the vial card says, if anything.
   *
   * One model for three situations that used to be three separate blocks of
   * markup: a BACK-DATED dose links to the vial resolved for its own day, TODAY
   * links to the compound's single active vial, and 2+ active vials get an
   * explicit chooser. `null` means there is nothing honest to say — no vial
   * resolved, or the read has not landed — and the card is absent rather than
   * naming a vial that does not exist.
   */
  const vialCard: {
    value: string
    note?: string
    choices?: { key: string; label: string; active: boolean; onPick: () => void }[]
    toggle?: { label: string; onPress: () => void }
  } | null = (() => {
    const stockLabel = (v: StockItem) =>
      v.remainingDisplay == null
        ? "Vial"
        : v.inventoryType === "oral_solid"
          ? `${v.remainingDisplay} left`
          : `${v.remainingDisplay} mL left`

    if (!onToday) {
      if (dateVialId == null) return null
      return inventoryItemId === null
        ? {
            value: "Not counted",
            note: "This dose will not come off your stock.",
            toggle: {
              label: "Count it against your stock",
              onPress: () => setInventoryItemId(dateVialId),
            },
          }
        : {
            value: "Counted",
            note: `Comes off the vial you were using on ${formatDateKeyShort(logDate)}.`,
            toggle: {
              label: "Don't count this one",
              onPress: () => setInventoryItemId(null),
            },
          }
    }

    if (vials.length === 1) {
      const v = vials[0]
      return inventoryItemId === null
        ? {
            value: "Not counted",
            note: "This dose will not come off your stock.",
            toggle: {
              label: "Count it against your stock",
              onPress: () => setInventoryItemId(v.id),
            },
          }
        : {
            // The remaining figure is the WHOLE point of this line, so it is the
            // row's value rather than the tail of a sentence that truncated it.
            value: stockLabel(v),
            note: "Comes off your stock.",
            toggle: {
              label: "Don't count this one",
              onPress: () => setInventoryItemId(null),
            },
          }
    }

    if (vials.length > 1) {
      return {
        value: inventoryItemId === null ? "Not counted" : "Counted",
        note: "Which vial this dose comes off.",
        choices: [
          ...vials.map((v) => ({
            key: v.id,
            label: stockLabel(v),
            active: v.id === inventoryItemId,
            onPick: () => setInventoryItemId(v.id),
          })),
          {
            key: "none",
            label: "Not tracked",
            active: inventoryItemId === null,
            onPick: () => setInventoryItemId(null),
          },
        ],
      }
    }
    return null
  })()

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
    // default — the live clock right now on today, or the compound's scheduled
    // time when back-dating (the clock says nothing about a dose taken yesterday).
    return {
      amount,
      /**
       * The unit this dose is RECORDED in, and the comment above used to be a
       * lie: reading `compound.unit` meant editing an existing dose re-stamped it
       * with whatever the compound's unit happens to be NOW. Log 500 mcg, later
       * switch the compound to mg, then edit that dose's time, and it became
       * 500 mg in both stores. The figure survived and its meaning changed
       * thousandfold, which is the exact regression `DoseLog.unit` was introduced
       * to prevent, reopened through the edit path.
       *
       * Order: the unit it was already logged in wins; otherwise the unit that was
       * in force ON THAT DAY (a back-dated log must not be stamped with today's
       * rule); the compound's current unit is the last resort.
       */
      unit: existing?.unit ?? onDay.unit ?? compound.unit,
      siteId: injectable && siteOnRoute ? siteId : null,
      ...(note.trim() ? { note: note.trim() } : {}),
      time24:
        manualTime ?? (onToday ? toHHMM(new Date()) : onDay.schedule.timeOfDay),
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

  return (
    <div
      ref={cardRef}
      style={{
        transform: `translateY(${offsetY}px)`,
        transition: dragging ? "none" : "transform 250ms ease-out",
      }}
      className="relative flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl hairline-t bg-bg-surface shadow-lg"
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

      {/* Header — Cancel left, title centred, the confirm verb right (spec 11 ·
          Design Decision 1). The same three-column grid the add form uses, so
          the two sheets are laid out identically as well as worded identically.
          The confirm used to be a wide button at the FOOT of a scrolling sheet,
          which is the one place the spec says it should not be. */}
      <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4 pt-1 pb-3">
        <button
          type="button"
          onClick={onClose}
          className="-m-2 flex min-h-11 items-center justify-self-start p-2 text-base text-text-muted transition-colors hover:text-text-primary"
        >
          Cancel
        </button>
        <SheetTitle className="justify-self-center text-base font-medium text-foreground">
          {editing ? "Edit dose" : "Log dose"}
        </SheetTitle>
        <button
          type="button"
          disabled={dayTaken}
          onClick={() => {
            if (dayTaken) return
            // Commit immediately, THEN show the success tick — so nothing about
            // dismissing the tick can undo the log.
            onTracked(compound.id, buildLog(), logDate, dateKey)
            setTracked(true)
          }}
          className="-m-2 flex min-h-11 items-center justify-self-end p-2 text-base font-medium text-foreground transition-colors hover:opacity-80 disabled:opacity-40"
        >
          {editing ? "Update" : "Track"}
        </button>
      </div>
      <SheetDescription className="sr-only">
        {editing
          ? "Adjust the amount, time or site, then update or remove this dose."
          : "Confirm or adjust the amount, time and site, then track this dose."}
      </SheetDescription>

      <div className="flex-1 overflow-y-auto overscroll-contain px-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        {/* Compound header — the SAME component the add form uses (spec 11:
            reuse it, do not rebuild it), so the two screens cannot drift. The
            detail line carries the scheduled time, which is the more useful
            second fact here than the unit alone. */}
        <CompoundHeader
          name={compound.name}
          category={compound.category}
          method={compound.method}
          // The unit this DOSE is in, not the compound's current one. On a
          // compound switched from mcg to mg, the header read "mg" eight pixels
          // above a Dose row correctly reading "250 mcg" — the row was right and
          // the header contradicted it.
          unit={loggedUnit}
          // A compound may legitimately have no time, and "Scheduled Not set"
          // is not a sentence. No time means no second fact worth stating.
          detail={
            hasTime(compound.schedule.timeOfDay)
              ? `Scheduled ${formatTimeLabel(compound.schedule.timeOfDay)}`
              : undefined
          }
        />

        {/* ── Card one: the dose ─────────────────────────────────────
            Rows, matching the add form exactly: label left, control right, one
            height and one divider. */}
        <div className="mt-5 overflow-hidden rounded-2xl bg-bg-surface-raised">
          <LogRow label="Dose">
            <div className="flex items-center justify-end gap-2">
              {editingAmount ? (
                <Input
                  // A1: the keypad-bound field only mounts (and focuses) once the
                  // value is tapped — so opening the sheet never raises the keypad.
                  autoFocus
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(sanitizeDoseInput(e.target.value))}
                  onBlur={() => setEditingAmount(false)}
                  aria-label={`Amount in ${loggedUnit}`}
                  className="h-11 w-24 rounded-lg border-border-default bg-bg-input text-right font-mono text-base dark:bg-bg-input"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingAmount(true)}
                  aria-label={`Amount ${amount} ${loggedUnit}. Tap to edit.`}
                  className="h-11 w-24 rounded-lg border border-border-default bg-bg-input px-3 text-right font-mono text-base text-foreground"
                >
                  {amount || "0"}
                </button>
              )}
              <span className="w-10 shrink-0 text-right font-mono text-sm text-text-muted">
                {/* The unit the AMOUNT is in. It read the compound's current
                    unit beside a historic dose, so a mcg-era dose was labelled
                    mg. Cosmetic until the Draw row turned it into arithmetic. */}
                {loggedUnit}
              </span>
            </div>
          </LogRow>

          {/* Draw — the figure the user actually acts on, which is why it takes
              the amber accent (spec 11). READ-ONLY: it is arithmetic on their own
              dose and their own vial, and the calculation is `formatDraw`
              unchanged. Absent for non-injectables, and absent when no vial
              resolved at all — a wrong draw is worse than no draw.
              
              Once a vial IS known the row STAYS, showing a dash while the figure
              is unavailable rather than unmounting. It used to appear when the
              vial read landed and vanish again the moment the dose field was
              cleared, resizing the card by 53px each way — so anyone replacing a
              dose by select-all-delete watched the sheet jump twice. */}
          {injectable && drawSource && (
            <>
              <LogRowDivider />
              <LogRow label="Draw">
                <span className="font-mono text-sm text-accent-amber">
                  {draw == null ? (
                    <span className="text-text-subtle">—</span>
                  ) : draw.kind === "count" ? (
                    draw.label
                  ) : (
                    <>
                      {draw.units}u{" "}
                      <span className="text-text-muted">({draw.ml} mL)</span>
                    </>
                  )}
                </span>
              </LogRow>
            </>
          )}

          {/* Date — EDITABLE (Adrian, 2026-07-30). It still DEFAULTS to the day
              the sheet was opened on, so the week strip and the calendar remain
              how you choose a day and the normal path is unchanged. What is new
              is that a dose taken a day earlier than planned can be recorded on
              the day it was actually taken, without closing the sheet and
              starting again somewhere else — which nobody does, so the dose used
              to go down on the wrong day instead.

              Changing it moves everything with it: the schedule rule in force
              that day, the vial that was in use, the live-clock default, and on
              an edit the entry itself, which is MOVED rather than copied. */}
          <LogRowDivider />
          <LogRow label="Date">
            <div className="flex items-center justify-end gap-2">
              {onToday && (
                <span className="text-sm text-text-subtle">today</span>
              )}
              <Input
                type="date"
                value={logDate}
                onChange={(e) => {
                  // An empty value is what a cleared native picker sends.
                  // Falling back to the day the sheet opened on is the only sane
                  // answer: a dose has to land somewhere.
                  setLogDate(e.target.value || dateKey)
                }}
                aria-label="Date this dose was taken"
                aria-invalid={dayTaken || undefined}
                min={MIN_LOG_DATE}
                max={MAX_LOG_DATE}
                className={cn(
                  "h-11 w-44 rounded-lg border-border-default bg-bg-input px-3 font-mono text-base dark:bg-bg-input",
                  dayTaken && "border-state-error",
                )}
              />
            </div>
          </LogRow>
          {dayTaken && (
            <p role="alert" className="px-4 pb-3 text-xs text-state-error">
              {compound.name} already has a dose logged on{" "}
              {formatDateKeyShort(logDate)}. Edit that one instead.
            </p>
          )}

          {/* Time. "Set time" shows only when it is genuinely unset — clearing
              the field is what gets you there. It still pre-fills (Adrian,
              2026-07-29, reverting spec 01), which is why the placeholder is
              rarely what you see. Flagged: spec 11's checklist still describes
              the reverted behaviour. */}
          <LogRowDivider />
          <LogRow label="Time">
            <div className="flex items-center justify-end gap-2">
              {!hasTime(displayTime) && (
                <span className="text-sm text-text-subtle">Set time</span>
              )}
              <Input
                type="time"
                value={displayTime}
                onChange={(e) =>
                  // Empty ⇒ resume the day's default; any value ⇒ a manual override.
                  setManualTime(e.target.value === "" ? null : e.target.value)
                }
                aria-label="Time taken"
                // w-36 and h-11. At 112px a 12-hour locale rendered "08:14 pm"
                // clipped to "08:14" — so a 20:14 dose displayed as 8:14, right
                // above a hint reading "Live now, 20:35". Two contradictory times
                // eight pixels apart, on a dosing screen.
                className="h-11 w-36 rounded-lg border-border-default bg-bg-input px-3 font-mono text-base dark:bg-bg-input"
              />
            </div>
          </LogRow>
        </div>

        {/* The one piece of time helper text worth keeping: on today the clock is
            still ticking, and that is not something the row label implies. The
            other two states said what the field already showed and are gone. */}
        {liveTracking && (
          <p className="mt-1.5 px-1 text-xs text-text-subtle">
            Live now, <span className="font-mono text-accent-amber">{toHHMMSS(now)}</span>.
            Tap the time to set it yourself.
          </p>
        )}

        {/* ── Card two: the site ─────────────────────────────────────
            One row showing the chosen site, opening the body map. The map itself
            is the existing `BodyMap` in `pick` mode with the same props it always
            had — spec 11 says it stays exactly as it is, so it moved into a sheet
            without a single prop changing. Injectables only. */}
        {injectable && (
          <div className="mt-3 overflow-hidden rounded-2xl bg-bg-surface-raised">
            <LogRow
              label="Site"
              onPress={() => setSiteSheetOpen(true)}
              value={
                siteId
                  ? // The catalogue's own label when it has loaded; the local
                    // lexicon otherwise, so editing a logged dose names the site
                    // immediately instead of reading "Loading…" over a known
                    // answer.
                    (catalogue.find((s) => s.id === siteId)?.label ??
                    siteLabel(siteId))
                  : loadingSites
                    ? "Loading…"
                    : "Choose"
              }
            />
            {/* How long since this spot was last used, ON THE ROW.
                It used to live inside the body-map sheet, where picking a site
                closed the sheet in the same handler — so the observation could
                only ever exist in the frames where its own container was
                dismissing. Measured at 60ms after a tap it was already sliding
                off screen. It is the app's one categorical rotation signal, so
                it belongs where it can actually be read. */}
            {siteId != null && siteLastUsedDays[siteId] !== undefined && (
              <p
                className={cn(
                  "px-4 pb-3 text-xs",
                  siteLastUsedDays[siteId] < REST_DAYS
                    ? "text-accent-amber"
                    : "text-text-subtle",
                )}
              >
                {siteLastUsedDays[siteId] < REST_DAYS
                  ? `You last used this spot ${siteLastUsedDays[siteId]}d ago. Just an observation, your choice.`
                  : `Last used here ${siteLastUsedDays[siteId]}d ago.`}
              </p>
            )}
          </div>
        )}

        {/* The body map, in a sheet. Every prop is what it was when this was
            inline — `sites`, `mode="pick"`, `sex`, `activeIds`, `onTapSite` — so
            spec 11's "entirely unchanged" holds literally. Picking a site closes
            the sheet, because one tap is the whole interaction. */}
        {injectable && (
          <Sheet open={siteSheetOpen} onOpenChange={setSiteSheetOpen}>
            <SheetContent
              side="bottom"
              showCloseButton={false}
              // px-6, matching the parent. It had NO padding at all, so the
              // title sat four pixels from the edge of the phone.
              className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-3xl border-border-default bg-bg-surface px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
            >
              {/* A grab handle, because this sheet had neither one nor a close
                  button: the only ways out were tapping the strip of backdrop
                  above it or committing to a site. */}
              <button
                type="button"
                onClick={() => setSiteSheetOpen(false)}
                aria-label="Close the injection site picker"
                className="flex h-11 w-full shrink-0 items-center justify-center"
              >
                <span aria-hidden className="h-1 w-9 rounded-full bg-border-strong" />
              </button>

              <SheetTitle className={cn(SHEET_TITLE, "px-1")}>
                Injection site
              </SheetTitle>
              <SheetDescription className="px-1 text-sm text-text-muted">
                {route === "im" ? "Intramuscular" : "Subcutaneous"}. Tap where you
                injected. Picking one is optional.
              </SheetDescription>

              <div className="pt-3">
                {loadingSites ? (
                  <p className="px-1 text-xs text-text-subtle">Loading sites…</p>
                ) : sitesToShow.length === 0 ? (
                  <p className="rounded-xl border border-border-default bg-bg-input px-3 py-3 text-xs text-text-muted">
                    Couldn&apos;t load the body map. You can still log the dose.
                  </p>
                ) : (
                  <BodyMap
                    sites={sitesToShow}
                    mode="pick"
                    sex={bodySex}
                    activeIds={siteId ? [siteId] : []}
                    onTapSite={(id) => {
                      setSiteId(id)
                      setSiteSheetOpen(false)
                    }}
                  />
                )}

              </div>
            </SheetContent>
          </Sheet>
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

        {/* ── Card three: the note ────────────────────────────────────
            Optional and last, as spec 11 asks. A textarea rather than a row
            that opens something: a note is a sentence, and putting a sentence
            behind a second tap is how a field goes unused. It grows with what
            is typed and starts at one line, so it costs nothing when empty. */}
        <div className="mt-3 overflow-hidden rounded-2xl bg-bg-surface-raised">
          <label className="block px-4 py-3">
            <span className="text-sm text-text-muted">Note</span>
            <textarea
              value={note}
              onChange={(e) => setNote(capNote(e.target.value, NOTE_MAX))}
              rows={1}
              placeholder="Add a note"
              aria-label="Note about this dose"
              className="mt-1.5 block max-h-40 min-h-[1.75rem] w-full resize-none bg-transparent text-base text-foreground outline-none placeholder:text-text-subtle"
              onInput={(e) => {
                // Grow to fit, up to the max-height, then scroll. `field-sizing`
                // is not in Safari yet, so this is the portable version.
                const el = e.currentTarget
                el.style.height = "auto"
                el.style.height = `${el.scrollHeight}px`
              }}
            />
          </label>
        </div>

        {/* ── Card four: the vial ─────────────────────────────────────
            Brought into the SAME row language as the cards above it (spec 11).
            These three blocks were left as bordered pills with uppercase
            eyebrows and inline underlined links — the exact vocabulary specs 10
            and 11 replaced — sitting twelve pixels below three borderless row
            cards. The single-vial line also truncated, so "7.5 mL left" rendered
            as "7…" and the one figure the block exists to show was cut off.

            The rules are unchanged: a BACK-DATED dose links to the vial resolved
            for its own day, TODAY links to the active one, and 2+ active vials
            keep an explicit chooser. Only the presentation moved. */}
        {vialCard && (
          <div className="mt-3 overflow-hidden rounded-2xl bg-bg-surface-raised">
            <LogRow label="From vial" value={vialCard.value} />
            {vialCard.note && (
              <p className="px-4 pb-3 text-xs text-text-subtle">{vialCard.note}</p>
            )}
            {vialCard.choices && (
              <>
                <LogRowDivider />
                <div className="flex flex-wrap gap-2 px-4 py-3">
                  {vialCard.choices.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={c.onPick}
                      aria-pressed={c.active}
                      className={cn(
                        "min-h-9 rounded-full border px-3 py-2 font-mono text-xs transition-colors duration-200 ease-out active:scale-[0.98]",
                        c.active
                          ? "border-transparent bg-accent-primary font-medium text-bg-base"
                          : "border-border-default bg-bg-input text-text-muted hover:text-text-primary",
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {vialCard.toggle && (
              <>
                <LogRowDivider />
                <button
                  type="button"
                  onClick={vialCard.toggle.onPress}
                  className="flex min-h-11 w-full items-center px-4 py-2.5 text-left text-sm text-text-muted transition-transform duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none"
                >
                  {vialCard.toggle.label}
                </button>
              </>
            )}
          </div>
        )}

        {/* The footer spec 11 says stays — but not the sentence it used to be.
            "Saved to this device for you only" is FALSE of a dose: every one
            logged here is pushed to Postgres by `logDose`. On a health app, on
            the screen where the health data is entered, that is a privacy claim
            rather than a small imprecision. What IS true is that the row is
            yours alone: RLS scopes every read to the signed-in user. Flagged for
            Adrian; the same sentence is on two other screens. */}
        <p className="mt-5 px-1 text-xs leading-relaxed text-text-subtle">
          Saved to your account. Only you can see it.
        </p>


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
              <Check className="h-9 w-9" aria-hidden />
            </span>
          </span>
          <span className="animate-shortcut-fade text-base font-medium">
            {editing ? "Updated" : "Tracked"}
          </span>
        </button>
      )}
    </div>
  )
}

/* ── The row language, matching the add form (spec 11) ──────────────
   Co-located rather than shared, exactly as `AddCompoundSheet`'s are: the two
   forms are meant to READ the same, and a shared primitive was not asked for. */

// The SAME rhythm as the add form's `ROW_BASE` (spec 11: the two must read the
// same). 56px minimum with py-1.5, so a 44px control sits in a row exactly as
// tall as a text-only one — the heights used to vary 52 / 60 / 78.
const LOG_ROW_BASE =
  "flex w-full min-h-14 items-center justify-between gap-3 px-4 py-1.5 text-left"

function LogRowDivider() {
  return <div className="mx-4 hairline-t" aria-hidden />
}

function LogRow({
  label,
  value,
  onPress,
  children,
}: {
  label: string
  value?: string
  onPress?: () => void
  children?: React.ReactNode
}) {
  const inner = (
    <>
      <span className="shrink-0 text-sm text-text-muted">{label}</span>
      {children ?? (
        <span className="flex min-w-0 items-center gap-2">
          {value && <span className="truncate text-sm text-foreground">{value}</span>}
          {onPress && (
            <CaretRight className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
          )}
        </span>
      )}
    </>
  )
  return onPress ? (
    <button type="button" onClick={onPress} className={LOG_ROW_BASE}>
      {inner}
    </button>
  ) : (
    <div className={LOG_ROW_BASE}>{inner}</div>
  )
}

/**
 * Cap a note without splitting a character in half.
 *
 * `slice` counts UTF-16 code units, so cutting at 2000 through an emoji left a
 * LONE SURROGATE. `JSON.stringify` emits it as `"\ud83d"`, and Postgres rejects
 * an unpaired surrogate in a JSON body — which failed the entire `dose_logs`
 * write, so the dose logged on the device and never synced. Spreading the string
 * iterates by code point, so the cut always lands between characters.
 */
function capNote(note: string, max: number): string {
  if (note.length <= max) return note
  const out = [...note]
  let n = 0
  const kept: string[] = []
  for (const ch of out) {
    if (n + ch.length > max) break
    kept.push(ch)
    n += ch.length
  }
  return kept.join("")
}
