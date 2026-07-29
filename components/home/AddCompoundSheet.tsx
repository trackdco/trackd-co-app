"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarDots, PencilSimple, Plus, Warning } from "@/components/icons"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { addStockItem, type StockInsert } from "@/lib/db/inventory"
import { resolveFill, FILL_PRESETS, round3 } from "@/lib/protocol/vialFill"
import { isVialForm } from "@/lib/containers/form"
import { CycleRuleSheet } from "@/components/protocol/CycleRuleSheet"
import {
  cycleColourVar,
  formatCyclePattern,
  type CycleRule,
} from "@/lib/protocol/cycleRule"
import { newId } from "@/lib/home/id"
import { pushProtocolCompound } from "@/lib/home/protocolSync"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { CategoryIcon } from "@/components/compounds/CategoryIcon"
import {
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
  ROUTE_OPTIONS,
  routesOf,
  unitOptionsFor,
  type Compound,
  type CompoundCategory,
  type RouteForm,
} from "@/lib/compound-categories"
import { AmberNotice, useAmberNotice } from "@/components/notifications/amber-notice"
import { dateKeyToDate, toDateKey } from "@/lib/home/mockHomeData"
import { getSelectedDayOrToday } from "@/lib/home/selectedDay"
import {
  formatDateKeyShort,
  formatTimeLabel,
  hasTime,
  loadStack,
  recordScheduleVersion,
  methodLabel,
  sanitizeDoseInput,
  upcomingDoseDates,
  upsertStack,
  type Cadence,
  type InjectionMethod,
  type Schedule,
  type StackCompound,
} from "@/lib/home/stack"
import { describeBlendOverlap, findBlendOverlaps } from "@/lib/compound-blends"
import { recordRecentCompound } from "@/lib/home/recentCompounds"
import { loadUnitPref, recordUnitPref } from "@/lib/home/unitPrefs"

interface AddCompoundSheetProps {
  open: boolean
  /** Catalogue pick (create) — its data locks method + unit. */
  compound: Compound | null
  /** An existing stack compound (edit) — pre-fills everything and saves by id. */
  editCompound?: StackCompound | null
  /**
   * Re-adding a compound the user previously DELETED (Spec 02). The form is a
   * first-time add in every visible respect — nothing pre-filled, dose, schedule
   * and start date all set fresh — but the save writes back to THIS record id, so
   * the compound keeps one identity and its logged history stays attached rather
   * than being orphaned behind a second record with the same name.
   */
  reuseId?: string | null
  /** Scopes the device-local stack in localStorage. */
  userId: string
  onOpenChange: (open: boolean) => void
  /** Called after the compound is saved (created or edited). */
  onAdded: () => void
}

type CadenceType = Cadence["type"]
const CADENCE_OPTIONS: { value: CadenceType; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "everyOtherDay", label: "Every other day" },
  { value: "everyNDays", label: 'Every "X" Days' },
  { value: "daysOfWeek", label: "Specific days" },
]
const DOW: { letter: string; day: number }[] = [
  { letter: "S", day: 0 },
  { letter: "M", day: 1 },
  { letter: "T", day: 2 },
  { letter: "W", day: 3 },
  { letter: "T", day: 4 },
  { letter: "F", day: 5 },
  { letter: "S", day: 6 },
]

// How many past years the start-date picker offers, on top of the current year + 2.
const PAST_START_YEARS = 5

// Start date uses Day / Month / Year dropdowns — the SAME pattern as the sign-up
// date-of-birth picker (app/welcome/gate-form.tsx), styled to match the form.
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
const SELECT_CLASS =
  "h-11 w-full min-w-0 rounded-xl border border-border-default bg-bg-input px-2 text-base text-foreground shadow-xs outline-none transition-colors [color-scheme:dark] focus-visible:border-border-strong"

const ROUTES: InjectionMethod[] = ["im", "subq", "po", "nasal"]
/** Method is taken verbatim from the compound's route — never chosen by the user. */
function toMethod(route: string): InjectionMethod {
  return ROUTES.includes(route as InjectionMethod)
    ? (route as InjectionMethod)
    : "po"
}

/** Local 24h "HH:mm" for a Date. */
function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`
}


/** Normalised form source — from a catalogue pick (create) or a stack compound (edit). */
interface Source {
  /** null = creating a new entry; set = editing this id. */
  id: string | null
  /** The record being edited — or, on a re-add, the deleted record being written
   *  back to. Needed to seed the schedule-version trail from the OUTGOING values,
   *  so days before this change keep the rule that was in force then. Null when
   *  creating a compound the user has never added. */
  prior: StackCompound | null
  /** Re-adding a previously deleted compound: presents as a first-time add, but
   *  saves onto the existing record id (Spec 02). */
  readd: boolean
  name: string
  category: CompoundCategory
  /** Selectable routes, default first. >1 ⇒ the Add sheet shows a route picker. */
  routeForms: RouteForm[]
  /** The compound's base unit — its family drives the unit dropdown. */
  unitDefault: string
  dose: string
  unit: string
  schedule: Schedule | null
  rotationSites: string[]
  rotationIndex: number
}

function toSource(
  compound: Compound | null,
  editCompound: StackCompound | null | undefined,
  reAdded: StackCompound | null
): Source | null {
  // A re-add reads from the CATALOGUE pick, not the deleted record — the user sets
  // dose, schedule and start date fresh — and carries the old record only as the id
  // to save onto and the prior rule to version behind the new one.
  if (compound && reAdded) {
    return {
      id: reAdded.id,
      prior: reAdded,
      readd: true,
      name: compound.name,
      category: compound.category,
      routeForms: routesOf(compound),
      unitDefault: compound.defaultUnit || "mg",
      dose: "",
      unit: compound.defaultUnit || "mg",
      schedule: null,
      rotationSites: [],
      rotationIndex: 0,
    }
  }
  if (editCompound) {
    return {
      id: editCompound.id,
      prior: editCompound,
      readd: false,
      name: editCompound.name,
      category: editCompound.category,
      // An edit keeps its saved route — the route picker is a create-time choice.
      routeForms: [{ route: editCompound.method, inventoryType: "" }],
      unitDefault: editCompound.unit,
      dose: String(editCompound.dose),
      unit: editCompound.unit,
      schedule: editCompound.schedule,
      rotationSites: editCompound.rotationSites,
      rotationIndex: editCompound.rotationIndex,
    }
  }
  if (compound) {
    return {
      id: null,
      prior: null,
      readd: false,
      name: compound.name,
      category: compound.category,
      routeForms: routesOf(compound),
      unitDefault: compound.defaultUnit || "mg",
      dose: "",
      unit: compound.defaultUnit || "mg",
      schedule: null,
      rotationSites: [],
      rotationIndex: 0,
    }
  }
  return null
}

/** Schedule → initial form fields (defaults to daily/today/now when absent). */
function initSchedule(schedule: Schedule | null, now: Date) {
  if (!schedule) {
    return {
      cadenceType: "daily" as CadenceType,
      everyN: "3",
      days: [] as number[],
      daysLocked: false,
      sDay: String(now.getDate()),
      sMonth: String(now.getMonth() + 1),
      sYear: String(now.getFullYear()),
      timeOfDay: hhmm(now),
    }
  }
  const cad = schedule.cadence
  let cadenceType: CadenceType = "daily"
  let everyN = "3"
  let days: number[] = []
  let daysLocked = false
  if (cad.type === "everyNDays") {
    cadenceType = "everyNDays"
    everyN = String(cad.n)
  } else if (cad.type === "daysOfWeek") {
    cadenceType = "daysOfWeek"
    days = [...cad.days]
    daysLocked = true
  } else if (cad.type === "everyOtherDay") {
    cadenceType = "everyOtherDay"
  }
  const [y, m, d] = schedule.startDate.split("-")
  return {
    cadenceType,
    everyN,
    days,
    daysLocked,
    sDay: String(Number(d)),
    sMonth: String(Number(m)),
    sYear: y,
    timeOfDay: schedule.timeOfDay,
  }
}

/**
 * "Add to log" / "Edit compound" — captures dose and schedule (with a start date
 * so the cycle can be planned). The injection site is no longer set per compound
 * (Spec 19) — it's chosen at log time from the user's working set.
 * Method and unit are locked to the compound's database values (the unit can be
 * switched within its measurement family). Saves a StackCompound to the device-
 * local log — appending a new one, or updating the one being edited.
 */
export function AddCompoundSheet({
  open,
  compound,
  editCompound,
  reuseId,
  userId,
  onOpenChange,
  onAdded,
}: AddCompoundSheetProps) {
  // The deleted record a re-add writes back to. Read from the device stack here so
  // the picker only has to pass an id (it has no reason to hold the whole record).
  // Memoised: this is a synchronous localStorage read + JSON.parse, and the parent
  // re-renders on a timer.
  const reAdded = useMemo(
    () =>
      reuseId
        ? ((loadStack(userId) ?? []).find((c) => c.id === reuseId) ?? null)
        : null,
    [reuseId, userId]
  )
  // Retain the source through the close animation so the body doesn't blank.
  const [shown, setShown] = useState<Source | null>(() =>
    toSource(compound, editCompound, reAdded)
  )
  const next = toSource(compound, editCompound, reAdded)
  if (
    next !== null &&
    (next.id !== shown?.id || next.name !== shown?.name)
  ) {
    setShown(next)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        // Don't auto-focus a field on open — keeps the keypad from popping over the
        // form/dropdowns before the user taps a field.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="h-[92dvh] gap-0 border-t-0 bg-transparent p-0 shadow-none"
      >
        {shown ? (
          <AddCompoundBody
            key={shown.id ?? shown.name}
            source={shown}
            userId={userId}
            onCancel={() => onOpenChange(false)}
            onAdded={onAdded}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function AddCompoundBody({
  source,
  userId,
  onCancel,
  onAdded,
}: {
  source: Source
  userId: string
  onCancel: () => void
  onAdded: () => void
}) {
  // Re-adding a deleted compound: an in-place upsert (keeps the id, drops the
  // deleted flag → active) presented as a first-time add — empty dose, default
  // schedule, start date today. It is NOT an "edit": nothing carries over.
  const isReadd = source.readd
  const isEdit = source.id !== null && !isReadd
  const meta = CATEGORY_META[source.category] ?? FALLBACK_CATEGORY_META
  const routeForms = source.routeForms
  // Compounds with more than one route (e.g. Glutathione: subQ or oral) let the
  // user pick at add-time; single-route compounds lock to their one route.
  const multiRoute = routeForms.length > 1
  const unitOptions = unitOptionsFor(source.unitDefault)

  // Blend overlap heads-up (create only): adding a compound a blend you track
  // already contains — or a blend covering something you already track — gets a
  // non-blocking note (Adrian's call: stacking another dose on purpose is fine).
  const [overlapNote] = useState<string | null>(() =>
    isEdit
      ? null
      : describeBlendOverlap(
          source.name,
          findBlendOverlaps(
            source.name,
            // Deleted compounds aren't tracked any more — don't flag them.
            (loadStack(userId) ?? [])
              .filter((c) => c.archived !== true)
              .map((c) => c.name)
          )
        )
  )

  const { notice, show, dismiss } = useAmberNotice()
  // `method` is the chosen route. Switching route resets the rotation, because
  // the available injection sites differ by route (IM vs SubQ vs none).
  const [method, setMethod] = useState<InjectionMethod>(
    toMethod(routeForms[0]?.route ?? "po")
  )

  // Optional "stock on hand" entry (create only). The vial type comes from the
  // selected catalogue route, so we show just that type's fields.
  const stockType = (routeForms.find((f) => toMethod(f.route) === method)?.inventoryType ??
    "") as "" | "reconstituted" | "preconcentrated" | "oral_solid"
  // Only compounds that come in a VIAL get the stock step (Spec 03). The test is
  // the selected route's inventory FORM, never the category — so a future oral
  // compound in any category behaves correctly, and Creatine or Berberine (po →
  // oral_solid) never get asked "how much is left in the vial?". Tabs/caps stock
  // still exists in the Protocol → Stock tab; it is only dropped from this form.
  const canStock = !isEdit && isVialForm(stockType)
  // The cycle being built here. Held in form state until the compound exists,
  // then written through the same `setCompoundCycle` Protocol → Cycles uses.
  // A RE-ADD presents as a first-time add in every visible respect (Spec 02), so
  // it starts with no cycle — carrying the old one over would restore a rule that
  // has usually already ended, and the compound would read "Ended" the moment it
  // was added back.
  const [cycleDraft, setCycleDraft] = useState<CycleRule | null>(
    source.readd ? null : (source.prior?.cycle ?? null)
  )
  const [cycleSheetOpen, setCycleSheetOpen] = useState(false)
  const [addStockOn, setAddStockOn] = useState(false)
  const [stPowder, setStPowder] = useState("")
  const [stPowderUnit, setStPowderUnit] = useState<"mg" | "iu">("mg")
  const [stBac, setStBac] = useState("")
  const [stMl, setStMl] = useState("")
  const [stConc, setStConc] = useState("")
  // "How much is in it?" — same part-used estimate as the Stock tab (Full/¾/½/¼ or an
  // exact amount-left). Default Full = no offset, the prior full-vial behaviour.
  const [stFillPreset, setStFillPreset] = useState(1)
  const [stExactLeft, setStExactLeft] = useState("")

  const [now] = useState(() => new Date())
  // A re-add carries NOTHING over from the deleted record (`source.schedule` is
  // already null for it), so it opens on the same defaults as a first-time add —
  // daily, starting today, empty dose, and the clock-tracking time every new
  // compound gets.
  const [initial] = useState(() => initSchedule(source.schedule, now))

  const [dose, setDose] = useState(source.dose)
  // The unit starts at the compound's own catalogue default (peptides in mcg,
  // anabolics in mg, …), UNLESS the user has overridden it for this compound
  // before — then their choice is the default (Spec 03). An edit always shows the
  // unit the record is actually stored in; a preference must never restate it.
  const [unit, setUnit] = useState(() =>
    isEdit
      ? source.unit
      : (loadUnitPref(userId, source.name, unitOptions) ?? source.unit)
  )
  const [cadenceType, setCadenceType] = useState<CadenceType>(initial.cadenceType)
  const [everyN, setEveryN] = useState(initial.everyN)
  const [days, setDays] = useState<number[]>(initial.days)
  const [daysLocked, setDaysLocked] = useState(initial.daysLocked)
  const [sDay, setSDay] = useState(initial.sDay)
  const [sMonth, setSMonth] = useState(initial.sMonth)
  const [sYear, setSYear] = useState(initial.sYear)
  // The default dose time live-tracks the clock (ticking each minute) for a NEW
  // compound until the user sets one; an edit starts frozen at its saved time.
  // `manualTime === null` ⇒ live. Picking a time freezes it; clearing resumes.
  // (Spec 01 made this start empty and required; reverted at Adrian's request,
  // 2026-07-29 — a pre-filled, overridable time is the faster add.)
  const [manualTime, setManualTime] = useState<string | null>(
    isEdit ? initial.timeOfDay : null
  )
  const [clock, setClock] = useState(() => now)
  useEffect(() => {
    if (manualTime !== null) return
    const id = window.setInterval(() => setClock(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [manualTime])
  const timeOfDay = manualTime ?? hhmm(clock)

  const todayKey = toDateKey(now)
  // The day an alteration takes effect FROM. The spec's rule is "from the selected
  // day onward", and the only screen with a day selection (the dashboard week
  // strip, and now the calendar) publishes it — everywhere else there is no day
  // context, so today is the right answer. Clamped to the compound's own start:
  // a version can't take effect before the compound existed.
  const selectedDayKey = getSelectedDayOrToday(todayKey)
  const alterFrom =
    source.schedule && selectedDayKey < source.schedule.startDate
      ? source.schedule.startDate
      : selectedDayKey
  // Past years are offered because a compound can start in the past (you add it to
  // the app after you've already been running it). PAST_START_YEARS is a dropdown
  // bound, not a rule — nothing rejects an older date, it's just how far back the
  // picker reaches without becoming a scroll.
  const startYears = Array.from(
    { length: PAST_START_YEARS + 3 },
    (_, i) => now.getFullYear() - PAST_START_YEARS + i
  )
  // An edit may reach back further than the picker offers — keep its year
  // selectable so it still shows correctly.
  if (!startYears.includes(Number(sYear))) startYears.unshift(Number(sYear))
  // Days available for the chosen month/year (so Feb never offers 30/31).
  const startDaysInMonth = new Date(Number(sYear), Number(sMonth), 0).getDate()
  const safeStartDay =
    Number(sDay) > startDaysInMonth ? String(startDaysInMonth) : sDay
  const startDate = `${sYear}-${String(sMonth).padStart(2, "0")}-${safeStartDay.padStart(2, "0")}`
  // Both are "YYYY-MM-DD", so a string compare is a date compare. A cycle starting
  // EARLIER TODAY is a past start too — its first dose has already been and gone —
  // so it gets the same confirmation. While the time is still live-tracking,
  // `timeOfDay` IS hhmm(clock), so this can't fire on its own as the clock ticks;
  // it takes a deliberate earlier time. An unset time makes no claim about when
  // today's dose was, so it can't put the start in the past either.
  const startedEarlierToday =
    startDate === todayKey && hasTime(timeOfDay) && timeOfDay < hhmm(clock)
  const startsInPast = startDate < todayKey || startedEarlierToday

  function toggleDay(day: number) {
    setDays((cur) =>
      cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day]
    )
  }

  function handleRouteChange(route: string) {
    const next = toMethod(route)
    if (next === method) return
    setMethod(next)
  }

  function buildCadence(): Cadence {
    if (cadenceType === "everyNDays") {
      return { type: "everyNDays", n: Math.max(1, Math.round(Number(everyN) || 1)) }
    }
    if (cadenceType === "daysOfWeek") {
      return { type: "daysOfWeek", days: [...days].sort((a, b) => a - b) }
    }
    if (cadenceType === "everyOtherDay") return { type: "everyOtherDay" }
    return { type: "daily" }
  }

  const previewSchedule: Schedule = {
    cadence: buildCadence(),
    timeOfDay,
    startDate,
  }
  const upcoming =
    cadenceType === "daysOfWeek" && days.length === 0
      ? []
      : upcomingDoseDates(previewSchedule, dateKeyToDate(startDate), 4, cycleDraft)

  // The part-used estimate for the inline vial (mirrors the Stock tab). When the
  // compound isn't stockable (stockType ""), the control is hidden and the insert is
  // null, so the fallback type here is inert.
  const stockFill = resolveFill(
    stockType === "" ? "reconstituted" : stockType,
    {
      powder: amt(stPowder),
      bacWater: amt(stBac),
      oilMl: amt(stMl),
      concentration: amt(stConc),
      // Tabs/caps can't be reached from this form (vials only, Spec 03), but the
      // shared helper's shape covers every inventory type.
      count: 0,
      strength: 0,
    },
    stExactLeft,
    stFillPreset,
  )
  // Vials only on this form (Spec 03), so the part-used amount is always in mL.
  const stFillUnit = "mL"

  function buildStockInsert():
    | Omit<StockInsert, "id" | "protocol_compound_id">
    | null {
    const n = amt
    const prior_used_base = stockFill.priorUsed
    if (stockType === "reconstituted") {
      if (n(stPowder) <= 0 || n(stBac) <= 0) return null
      return {
        inventory_type: "reconstituted",
        base_unit: stPowderUnit,
        total_amount: n(stPowder),
        total_amount_unit: stPowderUnit,
        bac_water_ml: n(stBac),
        reconstituted_on: todayKey,
        prior_used_base,
      }
    }
    if (stockType === "preconcentrated") {
      if (n(stMl) <= 0 || n(stConc) <= 0) return null
      return {
        inventory_type: "preconcentrated",
        base_unit: "mg",
        total_amount: n(stMl),
        total_amount_unit: "ml",
        concentration_mg_per_ml: n(stConc),
        prior_used_base,
      }
    }
    // No `oral_solid` branch: the step is gated to vials (see `canStock`). Tabs and
    // caps are still fully supported by Protocol → Stock's own sheet.
    return null
  }

  async function handleSave() {
    const doseValue = Number(dose)
    if (dose.trim() === "" || !Number.isFinite(doseValue) || doseValue <= 0) {
      show("Enter a dose greater than 0.")
      return
    }
    // When the time is still live-tracking, resolve it at SAVE (a fresh now), so
    // the saved default matches what the field last showed. A time is NOT required
    // (Adrian's call, 2026-07-29) — clearing the field stores an unset time, which
    // `formatTimeLabel` renders as "Not set".
    const effectiveTime = manualTime ?? hhmm(new Date())
    // A start date in the past is allowed, deliberately. You often only add a
    // compound to the app AFTER you've started running it, and the doses you
    // already took need somewhere to land — a compound that didn't exist on Tuesday
    // can't have a Tuesday dose logged against it (`isDueOn` gates on the start).
    // The past start is confirmed in the sheet instead of blocked (see the notice by
    // the date picker), so back-dating stays a choice you can see rather than a
    // silent one. Same reason the time is no longer forced later than now.
    if (cadenceType === "daysOfWeek" && days.length === 0) {
      show("Select at least one day for the schedule.")
      return
    }
    // No duplicates: a compound can only be in the log once. Adding one that's
    // already there (by name) just clutters the log — block it. An edit and a
    // re-add both keep the SAME id, so the name they'd collide with is their own
    // record; only a genuinely new add is checked.
    if (!isEdit && !isReadd) {
      const name = source.name.trim().toLowerCase()
      if ((loadStack(userId) ?? []).some((c) => c.name.trim().toLowerCase() === name)) {
        show(`${source.name} is already in your log.`)
        return
      }
    }
    // ALTERING an existing compound versions the schedule instead of overwriting
    // it: the new dose/cadence/time apply from `alterFrom` FORWARD, and every day
    // before that keeps the rule that was actually in force then (Spec 01 →
    // Altering a dose or schedule). Without this, changing a cadence rewrote what
    // had been due on every past day — turning correct rest days into "missed".
    //
    // A RE-ADD versions the same way, effective from its new start date: the run
    // before the deletion keeps the rule it was actually run under, and the new
    // schedule governs from the start date forward. Nothing is back-filled — the
    // days it sat deleted are simply not covered by either rule.
    // A first-time add starts clean: there is no earlier rule to keep.
    const versionedFrom = isReadd ? previewSchedule.startDate : alterFrom
    const history =
      (isEdit || isReadd) && source.prior
        ? recordScheduleVersion(
            source.prior,
            {
              cadence: previewSchedule.cadence,
              timeOfDay: effectiveTime,
              dose: doseValue,
              unit,
              // The cycle MUST ride this version. `resolveScheduleOn` reads the
              // cycle off the version in force, so a version written without one
              // switches the gate off from that day forward — an edit that only
              // changed the dose would silently un-cycle the compound, putting it
              // back in Today's Log on every off-day and marking those days
              // missed, while the Cycles tab still showed the cycle.
              ...(cycleDraft ? { cycle: cycleDraft } : {}),
            },
            versionedFrom
          )
        : undefined

    const saved: StackCompound = {
      id: source.id ?? newId(),
      name: source.name,
      category: source.category,
      method,
      dose: doseValue,
      unit,
      schedule: { ...previewSchedule, timeOfDay: effectiveTime },
      // Per-compound injection-site config was retired (Spec 19, Step 3): the site
      // is now chosen at log time from the user's working set. Any legacy value is
      // cleared on save. These fields remain vestigial on the model/sync.
      rotationSites: [],
      rotationIndex: 0,
      ...(history ? { scheduleHistory: history } : {}),
      // The compound's CURRENT cycle. On an edit the version above carries the
      // same rule from `versionedFrom`, so the two agree and the change lands on
      // the day being edited — not on today, which would leave the days between
      // ungated and read them back as missed.
      ...(cycleDraft ? { cycle: cycleDraft } : {}),
    }
    if (!upsertStack(userId, saved)) {
      show("Couldn't save to this device. Storage may be full or off.")
      return
    }
    // Remember the unit for this compound and put it at the head of "Recently
    // used" (Spec 03). Both are conveniences layered over the save — neither is
    // allowed to fail it, so they run after the write has already succeeded.
    recordUnitPref(userId, saved.name, unit)
    recordRecentCompound(userId, saved.name)
    // Optionally record the vial they have on hand. Ensure the protocol_compound
    // exists in Postgres first (idempotent) so the inventory FK resolves, then add
    // it. Best-effort + backgrounded so the user isn't kept waiting.
    const stock = canStock && addStockOn ? buildStockInsert() : null
    onAdded()
    if (stock) {
      // Use the RESOLVED protocol_compound id (it can differ from saved.id for a
      // non-uuid client id) so the inventory FK always resolves.
      const r = await pushProtocolCompound(saved)
      if (r.ok && r.protocolCompoundId) {
        await addStockItem({ ...stock, id: newId(), protocol_compound_id: r.protocolCompoundId })
      }
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-t-3xl hairline-t bg-bg-surface shadow-lg">
      <AmberNotice notice={notice} onDismiss={dismiss} />

      {/* Header */}
      <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4 pt-4 pb-3">
        <button
          type="button"
          onClick={onCancel}
          className="justify-self-start text-base text-text-muted transition-colors hover:text-text-primary"
        >
          Cancel
        </button>
        <SheetTitle className="justify-self-center text-base font-medium text-foreground">
          {isEdit ? "Edit compound" : "Add to log"}
        </SheetTitle>
        <button
          type="button"
          onClick={handleSave}
          className="justify-self-end text-base font-medium text-foreground transition-colors hover:opacity-80"
        >
          {isEdit ? "Save" : "Add"}
        </button>
      </div>
      <SheetDescription className="sr-only">
        Set this compound&apos;s dose and schedule. Choose a method or unit when
        multiple options are available.
      </SheetDescription>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 pt-1 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        {/* Compound — method + unit are locked, shown here. */}
        <div
          className="animate-home-up flex items-center gap-3 rounded-xl bg-bg-surface-raised px-4 py-3"
          style={{ animationDelay: "0ms" }}
        >
          <CategoryIcon category={source.category} className="h-3.5 w-3.5" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-medium text-foreground">
              {source.name}
            </p>
            <p className="truncate text-sm text-text-muted">
              {meta.label} · {methodLabel(method)} ·{" "}
              <span className="font-mono">{unit}</span>
            </p>
          </div>
        </div>

        {/* Blend overlap — a non-blocking heads-up that this compound is already
            covered by a blend you track (or vice versa). Add it anyway only if you
            want the extra dose; the blend itself logs as one unit. */}
        {overlapNote && (
          <div className="animate-home-up flex gap-2.5 rounded-xl border border-accent-amber/40 bg-accent-amber/10 p-3">
            <Warning
              className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber"
              aria-hidden
            />
            <p className="text-xs leading-relaxed text-foreground">
              {overlapNote}{" "}
              <span className="text-text-muted">
                For personal tracking only, not medical or dosing advice.
              </span>
            </p>
          </div>
        )}

        {/* Route — only when the compound supports more than one. Picking a route
            sets the method and shows/hides the injection-site rotation below. */}
        {multiRoute && (
          <div className="animate-home-up" style={{ animationDelay: "30ms" }}>
            <FieldLabel>Route</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {routeForms.map((f) => {
                const active = toMethod(f.route) === method
                const label =
                  ROUTE_OPTIONS.find((o) => o.value === f.route)?.label ?? f.route
                return (
                  <button
                    key={f.route}
                    type="button"
                    onClick={() => handleRouteChange(f.route)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "border-transparent bg-accent-primary font-medium text-bg-base"
                        : "border-border-default bg-bg-input text-text-muted hover:text-text-primary"
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Dose — the unit is fixed to the compound's measurement family; if it can
            be measured more than one way (e.g. mg ↔ mcg) a dropdown lets you switch. */}
        <div className="animate-home-up" style={{ animationDelay: "60ms" }}>
          <FieldLabel>Dose</FieldLabel>
          <div className="flex gap-2">
            <Input
              inputMode="decimal"
              value={dose}
              onChange={(e) => setDose(sanitizeDoseInput(e.target.value))}
              placeholder="e.g. 100"
              aria-label={`Dose in ${unit}`}
              className="h-12 flex-1 rounded-xl border-border-default bg-bg-input font-mono text-base dark:bg-bg-input"
            />
            {unitOptions.length > 1 ? (
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                aria-label="Dose unit"
                className={cn(SELECT_CLASS, "w-24 shrink-0 font-mono")}
              >
                {unitOptions.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            ) : (
              <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-xl border border-border-default bg-bg-input font-mono text-sm text-text-muted">
                {unit}
              </span>
            )}
          </div>
          {/* Per-dose entry hint (Spec 22 · 4): a minimal, neutral field
              annotation — the amount is one dose. Not a warning; blocks nothing. */}
          <p className="mt-1.5 px-1 text-xs text-text-subtle">per dose</p>
        </div>

        {/* Changing the dose (amount or unit) while EDITING — a non-alarming
            heads-up that the change applies going forward, with the disclaimer. */}
        {isEdit && (Number(dose) !== Number(source.dose) || unit !== source.unit) && (
          <div className="animate-home-up flex gap-2.5 rounded-xl border border-accent-amber/40 bg-accent-amber/10 p-3">
            <Warning
              className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber"
              aria-hidden
            />
            <p className="text-xs leading-relaxed text-foreground">
              You&apos;re changing your dose to{" "}
              <span className="font-mono text-accent-amber">
                {dose || "0"} {unit}
              </span>
              . This applies to your upcoming doses. Anything already logged stays
              as it was.{" "}
              <span className="text-text-muted">
                For personal tracking only, not medical or dosing advice.
              </span>
            </p>
          </div>
        )}

        {/* Schedule */}
        <div className="animate-home-up" style={{ animationDelay: "120ms" }}>
          <FieldLabel>Schedule</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {CADENCE_OPTIONS.map((o) => {
              const active = o.value === cadenceType
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setCadenceType(o.value)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "border-transparent bg-accent-primary font-medium text-bg-base"
                      : "border-border-default bg-bg-input text-text-muted hover:text-text-primary"
                  )}
                >
                  {o.label}
                </button>
              )
            })}
          </div>

          {cadenceType === "everyNDays" && (
            <label className="mt-3 flex items-center gap-3">
              <span className="text-sm text-text-muted">Every</span>
              <Input
                inputMode="numeric"
                value={everyN}
                onChange={(e) => setEveryN(e.target.value)}
                aria-label="Number of days between doses"
                className="h-11 w-20 rounded-xl border-border-default bg-bg-input text-center font-mono text-base dark:bg-bg-input"
              />
              <span className="text-sm text-text-muted">days</span>
            </label>
          )}

          {cadenceType === "daysOfWeek" && (
            <div className="mt-3">
              {!daysLocked && (
                <p className="animate-shortcut-fade mb-2 text-xs text-text-muted">
                  Select all days that apply
                </p>
              )}
              <div
                className={cn(
                  "flex gap-2 transition-opacity",
                  daysLocked && "opacity-50"
                )}
              >
                {DOW.map((d, i) => {
                  const active = days.includes(d.day)
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={daysLocked}
                      onClick={() => toggleDay(d.day)}
                      aria-pressed={active}
                      aria-label={`Toggle day ${d.day}`}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-full border text-sm transition-colors",
                        daysLocked && "cursor-not-allowed",
                        active
                          ? "border-transparent bg-accent-primary font-medium text-bg-base"
                          : "border-border-default bg-bg-input text-text-muted hover:text-text-primary"
                      )}
                    >
                      {d.letter}
                    </button>
                  )
                })}
              </div>
              <div className="mt-2">
                {daysLocked ? (
                  <button
                    type="button"
                    onClick={() => setDaysLocked(false)}
                    className="flex items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-text-primary"
                  >
                    <PencilSimple className="h-3.5 w-3.5" aria-hidden />
                    Edit days
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => days.length > 0 && setDaysLocked(true)}
                    disabled={days.length === 0}
                    className="text-xs font-medium text-foreground transition-opacity hover:opacity-80 disabled:text-text-subtle"
                  >
                    Done
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Start date — Day / Month / Year dropdowns (same as the sign-up DOB
              picker). Past dates are allowed and confirmed below, not blocked. */}
          <div className="mt-3">
            <span className="mb-1.5 block text-xs text-text-muted">Starts on</span>
            <div className="grid grid-cols-[1fr_1.5fr_1.1fr] gap-2">
              <select
                aria-label="Start day"
                value={safeStartDay}
                onChange={(e) => setSDay(e.target.value)}
                className={SELECT_CLASS}
              >
                {Array.from({ length: startDaysInMonth }, (_, i) => i + 1).map(
                  (d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  )
                )}
              </select>
              <select
                aria-label="Start month"
                value={sMonth}
                onChange={(e) => setSMonth(e.target.value)}
                className={SELECT_CLASS}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                aria-label="Start year"
                value={sYear}
                onChange={(e) => setSYear(e.target.value)}
                className={SELECT_CLASS}
              >
                {startYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <label className="mt-3 flex items-center gap-2">
              <span className="text-sm text-text-muted">at</span>
              <Input
                type="time"
                value={timeOfDay}
                // No `min`: a cycle can start earlier today (or on a past day), so
                // the time isn't forced later than now.
                // Empty resumes live tracking; any value freezes it.
                onChange={(e) => setManualTime(e.target.value || null)}
                aria-label="Default dose time"
                className="h-11 w-32 max-w-[45%] rounded-xl border-border-default bg-bg-input px-4 font-mono text-base dark:bg-bg-input"
              />
            </label>

            {/* Past start — a quiet confirmation of the date it's landing on, so a
                back-dated cycle is deliberate rather than a mis-set dropdown. Muted,
                not amber: this is a supported thing to do, not a warning. */}
            {startsInPast && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-bg-surface-raised px-3 py-2">
                <CalendarDots
                  className="h-3.5 w-3.5 shrink-0 text-text-muted"
                  aria-hidden
                />
                <p className="text-xs text-text-muted">
                  {startedEarlierToday ? (
                    <>
                      Starting today at{" "}
                      <span className="font-mono text-foreground">
                        {formatTimeLabel(timeOfDay)}
                      </span>
                      , already passed, so you can log the dose you&apos;ve already
                      taken.
                    </>
                  ) : (
                    <>
                      Starting on{" "}
                      <span className="font-mono text-foreground">
                        {formatDateKeyShort(startDate)}
                      </span>
                      , in the past, so you can log the doses you&apos;ve already
                      taken.
                    </>
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Date preview — what days this actually lands on. */}
          {upcoming.length > 0 ? (
            <p className="mt-2 px-1 text-xs text-text-subtle">
              Starts{" "}
              <span className="font-mono text-text-muted">
                {formatDateKeyShort(upcoming[0])}
              </span>
              {upcoming.length > 1 && (
                <>
                  {" "}
                  · then{" "}
                  <span className="font-mono text-text-muted">
                    {upcoming.slice(1).map(formatDateKeyShort).join(", ")}
                  </span>
                </>
              )}
            </p>
          ) : (
            <p className="mt-2 px-1 text-xs text-text-subtle">
              Pick days above to preview the dates.
            </p>
          )}
        </div>

        {/* Cycle — optional (Spec 06 · part two). The SECOND entry point for
            creating a cycle, so a compound can be set up as one from the start.
            The sheet is the same component Protocol → Cycles uses, and the write
            goes through the same `setCompoundCycle`. */}
        <div className="animate-home-up" style={{ animationDelay: "205ms" }}>
          <FieldLabel>Cycle (optional)</FieldLabel>
          <button
            type="button"
            onClick={() => setCycleSheetOpen(true)}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-3 text-sm transition-colors",
              cycleDraft
                ? "border-border-default bg-bg-input text-foreground"
                : "border-dashed border-border-strong bg-bg-input text-text-muted hover:text-foreground"
            )}
          >
            {cycleDraft ? (
              <>
                <span className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ background: cycleColourVar(cycleDraft.colour) }}
                    aria-hidden
                  />
                  {formatCyclePattern(cycleDraft.pattern)}
                </span>
                <PencilSimple className="h-4 w-4 text-text-subtle" aria-hidden />
              </>
            ) : (
              <span className="flex w-full items-center justify-center gap-1.5">
                <Plus className="h-4 w-4" aria-hidden /> Run this on a cycle
              </span>
            )}
          </button>
        </div>

        {/* Stock on hand — optional. Type comes from the compound's route, so we
            show just that vial's fields. Starts full; counts down as doses log. */}
        {canStock && (
          <div className="animate-home-up" style={{ animationDelay: "210ms" }}>
            <FieldLabel>Stock on hand (optional)</FieldLabel>
            {!addStockOn ? (
              <button
                type="button"
                onClick={() => setAddStockOn(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-strong bg-bg-input py-3 text-sm text-text-muted transition-colors hover:text-foreground"
              >
                <Plus className="h-4 w-4" aria-hidden /> Got a vial? Log how much you have left
              </button>
            ) : (
              <div className="space-y-3 rounded-xl border border-border-default bg-bg-input/40 p-3">
                {stockType === "reconstituted" && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-xs text-text-muted">Powder in vial</span>
                      <div className="flex gap-1.5">
                        <Input inputMode="decimal" value={stPowder} onChange={(e) => setStPowder(sanitizeDoseInput(e.target.value))} placeholder="5" className="h-11 min-w-0 flex-1 rounded-xl border-border-default bg-bg-input font-mono dark:bg-bg-input" />
                        <div className="flex gap-1">
                          <button type="button" onClick={() => setStPowderUnit("mg")} className={cn(STOCK_PILL, stPowderUnit === "mg" ? STOCK_PILL_ON : STOCK_PILL_OFF)}>mg</button>
                          <button type="button" onClick={() => setStPowderUnit("iu")} className={cn(STOCK_PILL, stPowderUnit === "iu" ? STOCK_PILL_ON : STOCK_PILL_OFF)}>iu</button>
                        </div>
                      </div>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-text-muted">BAC water (mL)</span>
                      <Input inputMode="decimal" value={stBac} onChange={(e) => setStBac(sanitizeDoseInput(e.target.value))} placeholder="2" className="h-11 rounded-xl border-border-default bg-bg-input font-mono dark:bg-bg-input" />
                    </label>
                  </div>
                )}
                {stockType === "preconcentrated" && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-xs text-text-muted">Volume (mL)</span>
                      <Input inputMode="decimal" value={stMl} onChange={(e) => setStMl(sanitizeDoseInput(e.target.value))} placeholder="10" className="h-11 rounded-xl border-border-default bg-bg-input font-mono dark:bg-bg-input" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-text-muted">Strength (mg/mL)</span>
                      <Input inputMode="decimal" value={stConc} onChange={(e) => setStConc(sanitizeDoseInput(e.target.value))} placeholder="250" className="h-11 rounded-xl border-border-default bg-bg-input font-mono dark:bg-bg-input" />
                    </label>
                  </div>
                )}
                {/* No tabs/caps fields here: this step is gated to vials (Spec 03),
                    so `stockType` can only be reconstituted or preconcentrated. Oral
                    solids still have full stock support in Protocol → Stock. */}
                {/* How much is in it?— always shown when the vial panel is open (not
                    hidden until the amounts are typed), so the part-full option is
                    discoverable straight away. The presets/bar light up once there's a
                    capacity to take a fraction of. */}
                <div className="space-y-2 hairline-t border-border-default/60 pt-3">
                  <FieldLabel>How much is in it?</FieldLabel>
                  {stockFill.basis ? (
                    <>
                      {/* Neutral fullness gauge — the same calm bar as the Stock card. */}
                      <div
                        className="h-1.5 overflow-hidden rounded-full bg-bg-surface-raised"
                        role="progressbar"
                        aria-valuenow={Math.round(stockFill.percent ?? 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Vial fullness"
                      >
                        <div
                          className="h-full rounded-full bg-foreground/80 transition-[width] duration-300 ease-out"
                          style={{ width: `${stockFill.percent ?? 100}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {FILL_PRESETS.map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => {
                              setStFillPreset(p.f)
                              setStExactLeft("")
                            }}
                            className={cn(
                              STOCK_PILL,
                              !stockFill.exactActive && stFillPreset === p.f
                                ? STOCK_PILL_ON
                                : STOCK_PILL_OFF,
                            )}
                          >
                            {p.label}
                          </button>
                        ))}
                        <span className="text-xs text-text-subtle">or</span>
                        <Input
                          inputMode="decimal"
                          value={stExactLeft}
                          onChange={(e) => setStExactLeft(sanitizeDoseInput(e.target.value))}
                          placeholder={String(round3(stockFill.basis.fullNative))}
                          className="h-10 w-16 rounded-xl border-border-default bg-bg-input font-mono dark:bg-bg-input"
                        />
                        <span className="whitespace-nowrap text-xs text-text-subtle">{stFillUnit} left</span>
                      </div>
                      <p className="text-xs text-text-subtle">
                        ≈ {Math.round(stockFill.percent ?? 100)}% full · counts down as you log doses.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-text-subtle">
                      Set how full it is. Defaults to full.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <p className="px-1 text-xs leading-relaxed text-text-subtle">
          Saved to this device for you only.
        </p>
      </div>

      <CycleRuleSheet
        open={cycleSheetOpen}
        onOpenChange={setCycleSheetOpen}
        compoundName={source.name}
        cycle={cycleDraft}
        vialTracked={isVialForm(stockType)}
        onSave={setCycleDraft}
      />
    </div>
  )
}

/** Parse a numeric input string to a finite number (0 when blank/invalid). */
function amt(s: string): number {
  const v = Number.parseFloat(s)
  return Number.isFinite(v) ? v : 0
}

const STOCK_PILL = "rounded-full border px-2.5 py-1 text-sm transition-colors"
const STOCK_PILL_ON = "border-transparent bg-accent-primary font-medium text-bg-base"
const STOCK_PILL_OFF = "border-border-default bg-bg-input text-text-muted hover:text-text-primary"

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-xs font-medium tracking-wider text-text-muted uppercase">
      {children}
    </span>
  )
}
