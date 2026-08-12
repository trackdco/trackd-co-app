"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarDots, CaretDown, PencilSimple, Plus, Trash, Warning } from "@/components/icons"

import { cn } from "@/lib/utils"
import {
  STOCK_FIELD,
  STOCK_FIELD_LABEL,
  STOCK_PILL,
  STOCK_PILL_OFF,
  STOCK_PILL_ON,
} from "@/lib/ui-presets"
import { CompoundHeader } from "@/components/compounds/CompoundHeader"
import { isInventoryForm, isStockableForm } from "@/lib/containers/form"
import { containerNoun } from "@/lib/containers/labels"
import { needsIuFromMgHint, powderUnitsFor, resolvePowderUnit } from "@/lib/protocol/stockUnits"
import { Input } from "@/components/ui/input"
import { addStockItem, type StockInsert } from "@/lib/db/inventory"
import type { InventoryType } from "@/lib/db/types"
import { resolveFill, FILL_PRESETS, round3 } from "@/lib/protocol/vialFill"
import {
  availableCycleEnds,
  CYCLE_COLOURS,
  CYCLE_COLOUR_LABELS,
  cycleColourVar,
  DEFAULT_CYCLE_COLOUR,
  type CycleColour,
  type CycleEnd,
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
import {
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
  /** Called after the compound is saved (created or edited), with the saved
   *  record — so a caller that opened this flow for a reason (adding straight
   *  into a stack) knows which compound to act on. */
  onAdded: (saved: StackCompound) => void
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
    // Slots 1..n, so editing a twice-daily compound opens on both its times
    // rather than silently dropping the second one on save.
    laterTimes: schedule.laterTimes ?? [],
    // Their amounts, as input strings. A null (meaning "same as the dose
    // above") becomes an empty field rather than a repeated number, so the
    // default stays visibly the default.
    laterDoses: (schedule.laterTimes ?? []).map((_, i) => {
      const d = schedule.laterDoses?.[i]
      return typeof d === "number" && d > 0 ? String(d) : ""
    }),
  }
}

/**
 * How many doses a day before the save ASKS, and before it refuses (Adrian,
 * 2026-08-07).
 *
 * Six covers every realistic protocol — 4x daily orals, 3x daily peptides — with
 * headroom, so it is the point at which more is worth a question rather than the
 * point at which it is wrong. Ten is the hard stop: past that the list is
 * unusable and the far likelier explanation is a stuck finger on "Add".
 *
 * Deliberately two numbers and not one. A single cap either blocks a legitimate
 * regimen or lets a mis-tap through silently; this does neither.
 */
/** `HH:mm` moved on by `hours`, wrapping at midnight. Used to space a newly
 *  added dose from the one above it. */
function shiftHours(time: string, hours: number): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!m) return time
  const total = (Number(m[1]) * 60 + Number(m[2]) + hours * 60 + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

const DOSES_SOFT_CAP = 6
const DOSES_HARD_CAP = 10

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
  /**
   * The source's CONTENT, as a comparable string.
   *
   * `toSource` builds a fresh object every render, so identity says nothing —
   * comparing by it re-set state on every render and crashed the sheet with
   * "maximum update depth exceeded". Comparing by id and name alone was the
   * other failure: those stay identical across a dose or schedule edit, so the
   * sheet kept serving the values captured the FIRST time it opened and saving
   * wrote them back, reverting the edit.
   *
   * The fields listed are exactly the ones the form seeds from. Anything added
   * to `Source` that the form reads must be added here too.
   */
  const sourceKey = (s: Source | null): string =>
    s === null
      ? ""
      : JSON.stringify([
          s.id,
          s.name,
          s.category,
          s.readd,
          s.dose,
          s.unit,
          s.unitDefault,
          s.schedule,
          s.rotationSites,
          s.rotationIndex,
          s.routeForms,
        ])
  // While OPEN, take the newest source whenever its content differs. While
  // closed, hold the last one so the body does not blank mid-animation.
  if (next !== null && (open ? sourceKey(next) !== sourceKey(shown) : next.id !== shown?.id)) {
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
  onAdded: (saved: StackCompound) => void
}) {
  // Re-adding a deleted compound: an in-place upsert (keeps the id, drops the
  // deleted flag → active) presented as a first-time add — empty dose, default
  // schedule, start date today. It is NOT an "edit": nothing carries over.
  const isReadd = source.readd
  const isEdit = source.id !== null && !isReadd
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
  /**
   * Set when a save is held back to ask about an unusual number of doses a day
   * (Adrian, 2026-08-07). Cleared on cancel and on the confirmed save, so the
   * question is asked once per attempt rather than remembered.
   */
  const [confirmManyDoses, setConfirmManyDoses] = useState(false)
  // `method` is the chosen route. Switching route resets the rotation, because
  // the available injection sites differ by route (IM vs SubQ vs none).
  const [method, setMethod] = useState<InjectionMethod>(
    toMethod(routeForms[0]?.route ?? "po")
  )

  // Optional "stock on hand" entry (create only). The vial type comes from the
  // selected catalogue route, so we show just that type's fields.
  const stockType = (routeForms.find((f) => toMethod(f.route) === method)?.inventoryType ??
    "") as "" | InventoryType
  // ~~Only compounds that come in a VIAL get the stock step (Spec 03)~~ — that
  // restriction existed because this form had no fields for anything else, and
  // asking "how much is left in the vial?" about a tub of creatine was worse
  // than not asking. **Spec w2b-13, Step 4 gives all four forms their own
  // fields**, so the gate is now simply "is this a thing with stock", which is
  // every form there is. Adding creatine from scratch offers a stock step and
  // never mentions BAC water.
  const canStock = !isEdit && isStockableForm(stockType)
  // The cycle being built here. Held in form state until the compound exists,
  // then written through the same `setCompoundCycle` Protocol → Cycles uses.
  // A RE-ADD presents as a first-time add in every visible respect (Spec 02), so
  // it starts with no cycle — carrying the old one over would restore a rule that
  // has usually already ended, and the compound would read "Ended" the moment it
  // was added back.
  const [cycleDraft, setCycleDraft] = useState<CycleRule | null>(
    source.readd ? null : (source.prior?.cycle ?? null)
  )
  const [addStockOn, setAddStockOn] = useState(false)
  // Validation messages, keyed by the ROW they belong to (spec 10 step 9). They
  // used to land as a block at the bottom of the sheet, a long scroll away from
  // the field that caused them. Cleared as soon as the user touches that field,
  // so an error never outlives the mistake.
  const [errors, setErrors] = useState<{
    dose?: string
    days?: string
    stock?: string
    cycle?: string
  }>({})
  // The Starts row's expansion. Collapsed by default: the date is usually today
  // and three dropdowns to confirm that is three too many.
  const [startOpen, setStartOpen] = useState(false)
  const [stPowder, setStPowder] = useState("")
  const [stPowderUnit, setStPowderUnit] = useState<"mg" | "iu">("mg")
  const [stBac, setStBac] = useState("")
  const [stMl, setStMl] = useState("")
  const [stConc, setStConc] = useState("")
  // oral_solid — a count, and a strength that is OPTIONAL and not always in mg
  // (`supabase/protocol/016`).
  const [stCount, setStCount] = useState("")
  const [stOralForm, setStOralForm] = useState<"tab" | "capsule">("tab")
  const [stStrength, setStStrength] = useState("")
  const [stStrengthUnit, setStStrengthUnit] = useState<"mg" | "iu">("mg")
  // bulk_powder — the tub's weight in grams, and an optional serving size.
  const [stTubGrams, setStTubGrams] = useState("")
  const [stServingG, setStServingG] = useState("")
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
  /**
   * The day's SECOND and later dose times (Spec w2b-13, Step 5). Empty = once a
   * day, which is how every compound starts and how nearly all of them stay.
   *
   * Slot 0's time is `timeOfDay` above and is NOT in here — see
   * `Schedule.laterTimes` for why the two are kept apart.
   */
  const [laterTimes, setLaterTimes] = useState<string[]>(
    isEdit ? (initial.laterTimes ?? []) : []
  )
  /**
   * The AMOUNT for each later dose, as a raw input string. `""` means "same as
   * the dose above", which is both the default and the common case.
   *
   * ⚠️ Per-slot amounts are scope the spec deferred, added on Adrian's call
   * (2026-08-07). See `supabase/protocol/021`'s header.
   */
  const [laterDoses, setLaterDoses] = useState<string[]>(
    isEdit ? (initial.laterDoses ?? []) : []
  )

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

  /**
   * The later times as they will be STORED: only real, set times.
   *
   * A blank row is dropped rather than kept as `""`, because an empty later time
   * is not the same meaningful "no time set" that slot 0's may be — slot 0
   * always exists, so `""` there says "this compound has no set time", whereas a
   * blank second row just says the user added a row and did not fill it in.
   */
  const cleanLaterTimes = laterTimes.filter((t) => hasTime(t))
  /**
   * The per-slot amounts as they will be STORED, aligned to `cleanLaterTimes`.
   *
   * Aligned to the CLEANED times, not the raw ones: position is the slot, so an
   * amount left beside a blank time would otherwise attach itself to whichever
   * dose happened to survive filtering. A blank or non-positive amount becomes
   * null, which reads as "the compound's own dose".
   */
  const cleanLaterDoses = laterTimes
    .map((t, i) => ({ t, d: laterDoses[i] ?? "" }))
    .filter(({ t }) => hasTime(t))
    .map(({ d }) => {
      const n = Number.parseFloat(d)
      return Number.isFinite(n) && n > 0 ? n : null
    })

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
      count: amt(stCount),
      strength: amt(stStrength),
      tubGrams: amt(stTubGrams),
    },
    stExactLeft,
    stFillPreset,
  )
  // The part-used amount is entered in the container's OWN measure, which is no
  // longer always millilitres now that this form covers all four types.
  const stFillUnit =
    stockType === "oral_solid" ? stOralForm : stockType === "bulk_powder" ? "g" : "mL"
  // What the thing being filled is CALLED, so the fullness gauge isn't announced
  // as a vial when it is a tub. The visible heading ("How much is in it?") was
  // already form-neutral; only the screen-reader label was not.
  const stContainerNoun = containerNoun({
    inventoryType: stockType || null,
    category: source.category,
    name: source.name,
  })
  // Driven by the dose unit BEING CHOSEN on this form, not by the catalogue —
  // "Make your own" lets a compound be dosed in `iu`, and such a compound must
  // be able to hold an `iu` vial or its doses can never link to it. This is an
  // ADD, so there is no existing row's unit to preserve.
  const stPowderUnits = powderUnitsFor(source.name, { doseUnit: unit })
  const stPowderUnitToSave = resolvePowderUnit(stPowderUnit, stPowderUnits)
  // The oral strength writes the SAME `base_unit` column under the same DB
  // trigger — see `AddStockSheet`. Left free, a Vitamin D3 bottle defaulted to
  // `mg` against an iu dose and could not be saved at all.
  const stStrengthUnits = stPowderUnits
  const stStrengthUnitToSave = resolvePowderUnit(stStrengthUnit, stStrengthUnits)
  /** An iu-dosed oral must state a strength: the strengthless form stores the
   *  tablet as the base unit, which cannot pair with an iu dose. */
  const stStrengthRequired =
    stStrengthUnits.length === 1 && stStrengthUnits[0] === "iu"
  const showStIuFromMgHint = needsIuFromMgHint(source.name, stPowderUnits)

  function buildStockInsert():
    | Omit<StockInsert, "id" | "protocol_compound_id">
    | null {
    const n = amt
    const prior_used_base = stockFill.priorUsed
    if (stockType === "reconstituted") {
      if (n(stPowder) <= 0 || n(stBac) <= 0) return null
      return {
        inventory_type: "reconstituted",
        // Resolved, not trusted — a hidden `iu` must never reach `base_unit`,
        // or the vial silently never decrements. See `stockUnits.ts`.
        base_unit: stPowderUnitToSave,
        total_amount: n(stPowder),
        total_amount_unit: stPowderUnitToSave,
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
    if (stockType === "bulk_powder") {
      // A tub is a weight and nothing else (`supabase/protocol/014`).
      if (n(stTubGrams) <= 0) return null
      return {
        inventory_type: "bulk_powder",
        base_unit: "g",
        total_amount: n(stTubGrams),
        total_amount_unit: "g",
        serving_size_g: n(stServingG) > 0 ? n(stServingG) : null,
        prior_used_base,
      }
    }
    if (stockType === "oral_solid") {
      if (n(stCount) <= 0) return null
      // No stated strength: the tablet is the unit (`supabase/protocol/016`).
      // A complete item, not a half-filled form — but NOT available to an
      // iu-dosed compound, whose `base_unit` would then be `tab` and be
      // rejected by the DB trigger. See `stStrengthRequired`.
      if (n(stStrength) <= 0 && !stStrengthRequired) {
        return {
          inventory_type: "oral_solid",
          base_unit: stOralForm,
          total_amount: n(stCount),
          total_amount_unit: stOralForm,
          strength_per_unit: null,
          prior_used_base,
        }
      }
      return {
        inventory_type: "oral_solid",
        base_unit: stStrengthUnitToSave,
        total_amount: n(stCount),
        total_amount_unit: stOralForm,
        strength_per_unit: n(stStrength),
        prior_used_base,
      }
    }
    return null
  }

  /**
   * The stock step is optional, but a HALF-filled one is not the same as an
   * empty one. `buildStockInsert` returns null for both, so typing a powder
   * amount and leaving BAC water blank saved the compound, closed the sheet, and
   * threw the vial away without a word — the user believed they had recorded
   * their stock and had not.
   */
  function stockError(): string | undefined {
    if (!canStock || !addStockOn) return undefined
    if (stockType === "reconstituted") {
      const started = stPowder.trim() !== "" || stBac.trim() !== ""
      if (started && buildStockInsert() === null) {
        return "Enter both the powder amount and the BAC water, or clear them."
      }
    }
    if (stockType === "preconcentrated") {
      const started = stMl.trim() !== "" || stConc.trim() !== ""
      if (started && buildStockInsert() === null) {
        return "Enter both the volume and the concentration, or clear them."
      }
    }
    if (stockType === "oral_solid") {
      // Strength is optional here, so only a started-but-empty COUNT is an
      // error. Typing a strength and no count is the half-filled case.
      const started = stCount.trim() !== "" || stStrength.trim() !== ""
      if (started && buildStockInsert() === null) {
        // An iu-dosed oral has a SECOND way to be incomplete, and saying "how
        // many are in the bottle" when the count is already filled in would send
        // the user to the wrong field.
        return stStrengthRequired && amt(stStrength) <= 0
          ? `Enter the strength of one ${stOralForm === "tab" ? "tablet" : "capsule"} — ${source.name} is dosed in iu.`
          : "Enter how many are in the bottle, or clear this."
      }
    }
    if (stockType === "bulk_powder") {
      const started = stTubGrams.trim() !== "" || stServingG.trim() !== ""
      if (started && buildStockInsert() === null) {
        return "Enter the tub weight in grams, or clear this."
      }
    }
    return undefined
  }

  /** `confirmed` is passed by the over-six dialog's own button. It is a
   *  PARAMETER rather than a read of `confirmManyDoses`, because clearing that
   *  state and calling this in the same handler would have this function read
   *  the stale closure value — correct today by accident, and a trap for the
   *  next edit. */
  async function handleSave(confirmed = false) {
    const doseValue = Number(dose)
    if (dose.trim() === "" || !Number.isFinite(doseValue) || doseValue <= 0) {
      setErrors((p) => ({ ...p, dose: "Enter a dose greater than 0." }))
      return
    }
    const stockMsg = stockError()
    if (stockMsg) {
      setErrors((p) => ({ ...p, stock: stockMsg }))
      setAddStockOn(true)
      return
    }
    const cycleMsg = cycleProblem(cycleDraft)
    if (cycleMsg) {
      setErrors((p) => ({ ...p, cycle: cycleMsg }))
      return
    }
    // More doses a day than anything realistic needs. Not blocked — some
    // regimens genuinely are frequent — but asked about once, because the far
    // likelier explanation is a stuck finger on "Add another dose". The hard cap
    // is enforced by the Add row disappearing, not here.
    const dosesPerDay = cleanLaterTimes.length + 1
    if (dosesPerDay > DOSES_SOFT_CAP && !confirmed) {
      setConfirmManyDoses(true)
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
      setErrors((p) => ({ ...p, days: "Pick at least one day." }))
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
              // The later times ride the VERSION too: a slot is an index into
              // that day's times, so history resolved against today's array
              // would relabel doses already taken.
              ...(cleanLaterTimes.length > 0 ? { laterTimes: cleanLaterTimes } : {}),
              ...(cleanLaterDoses.some((d) => d != null)
                ? { laterDoses: cleanLaterDoses }
                : {}),
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
      schedule: {
        ...previewSchedule,
        timeOfDay: effectiveTime,
        // Only written when there IS more than one dose, so a once-daily
        // compound's stored record is byte-for-byte what it always was.
        ...(cleanLaterTimes.length > 0 ? { laterTimes: cleanLaterTimes } : {}),
        ...(cleanLaterDoses.some((d) => d != null)
          ? { laterDoses: cleanLaterDoses }
          : {}),
      },
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
      // The selected route's inventory form, RECORDED rather than re-derived
      // (Spec w2b-13, Step 1 · `supabase/protocol/023`). For a "Make your own"
      // compound this is the Inventory type answer the form has always asked for
      // and always thrown away; for a catalogue compound it is the chosen route's
      // own form. An edit has no route picker and carries `inventoryType: ""`
      // (see `toSource`), so it keeps whatever was stored rather than clearing it.
      ...(isInventoryForm(stockType)
        ? { inventoryForm: stockType }
        : source.prior?.inventoryForm
          ? { inventoryForm: source.prior.inventoryForm }
          : {}),
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
    onAdded(saved)
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
    <div className="relative flex h-full flex-col overflow-hidden rounded-t-3xl hairline-t bg-bg-surface shadow-lg">
      <AmberNotice notice={notice} onDismiss={dismiss} />

      {/* "That is a lot of doses" — a real question, not a toast, because it
          needs an answer before the save can go through. */}
      {confirmManyDoses && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm the number of doses"
          // Escape DISMISSES THE CONFIRM, not the sheet. Without this it fell
          // through to Radix and closed the whole form, discarding everything
          // typed — the worst possible answer to "are you sure".
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault()
              e.stopPropagation()
              setConfirmManyDoses(false)
            }
          }}
          className="absolute inset-0 z-50 flex items-center justify-center bg-bg-base/70 px-6 backdrop-blur-sm"
        >
          <div className="w-full max-w-xs space-y-3 rounded-2xl bg-bg-surface-raised p-5 shadow-lg">
            <p className="text-sm font-medium text-foreground">
              {cleanLaterTimes.length + 1} doses a day?
            </p>
            <p className="text-sm leading-relaxed text-text-muted">
              That is more than most protocols ask for. It will show as{" "}
              {cleanLaterTimes.length + 1} separate rows to tick off each day.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                // Focused on open, so a keyboard or screen-reader user lands
                // inside the dialog rather than in the form behind the scrim.
                // The SAFE choice takes focus, not the destructive one.
                autoFocus
                onClick={() => setConfirmManyDoses(false)}
                className="flex-1 rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-bg-surface-raised"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmManyDoses(false)
                  void handleSave(true)
                }}
                className="flex-1 rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-bg-base transition-opacity hover:opacity-90"
              >
                Yes, save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4 pt-4 pb-3">
        <button
          type="button"
          onClick={onCancel}
          className="-m-2 flex min-h-11 items-center justify-self-start p-2 text-base text-text-muted transition-colors hover:text-text-primary"
        >
          Cancel
        </button>
        <SheetTitle className="justify-self-center text-base font-medium text-foreground">
          {isEdit ? "Edit compound" : "Add to log"}
        </SheetTitle>
        <button
          type="button"
          onClick={() => void handleSave()}
          className="-m-2 flex min-h-11 items-center justify-self-end p-2 text-base font-medium text-foreground transition-colors hover:opacity-80"
        >
          {isEdit ? "Save" : "Add"}
        </button>
      </div>
      <SheetDescription className="sr-only">
        Set the dose and schedule.
      </SheetDescription>

      <div
        // Unreachable while the confirm is up. `aria-modal` alone is a claim,
        // not an enforcement — Tab still walked into the form behind it.
        inert={confirmManyDoses}
        className="flex-1 space-y-5 overflow-y-auto px-4 pt-1 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
      >
        {/* Compound header — the container, the name, and one detail line.
            Replaces the bordered name card (spec 10). The container is the thing
            that identifies a compound at a glance, and it is the same header
            spec 11 reuses on the log form. */}
        <div className="animate-home-up" style={{ animationDelay: "0ms" }}>
          <CompoundHeader
            name={source.name}
            category={source.category}
            method={method}
            unit={unit}
          />
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

        {/* ── Card one: the dose ─────────────────────────────────────
            Rows, not labelled sections. Label left, control right, one height
            and one divider throughout. A control that genuinely cannot fit on a
            row (the day-of-week picker, the date selects) expands BENEATH its
            row rather than being pulled out into its own section, so the rhythm
            holds and nothing about the field changes. */}
        <div
          className="animate-home-up overflow-hidden rounded-2xl bg-bg-surface-raised"
          style={{ animationDelay: "40ms" }}
        >
          {/* Route — only when the compound supports more than one. */}
          {multiRoute && (
            <>
              <FormRow label="Route">
                <div className="flex flex-wrap justify-end gap-1.5">
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
                        className={cn(ROW_PILL, active ? ROW_PILL_ON : ROW_PILL_OFF)}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </FormRow>
              <RowDivider />
            </>
          )}

          {/* Dose. The "per dose" qualifier STAYS. Spec 10 says to drop helper
              text a row label already carries, and this one does not: "Dose"
              does not say "per single administration, not your weekly total",
              which is the exact confusion spec 22 added it for ("the error is
              silent and costly, so keep the hint always visible"). Carried as a
              hint on the label rather than a line under the row, so it obeys
              both specs at once. */}
          <FormRow label="Dose" hint="per dose" error={errors.dose}>
            <div className="flex items-center justify-end gap-2">
              <Input
                inputMode="decimal"
                value={dose}
                onChange={(e) => {
                  setDose(sanitizeDoseInput(e.target.value))
                  if (errors.dose) setErrors((p) => ({ ...p, dose: undefined }))
                }}
                placeholder="100"
                aria-label={`Dose in ${unit}`}
                aria-invalid={errors.dose ? true : undefined}
                className={cn(
                  // 44px tall and wide enough for the five characters the
                  // sanitiser permits. It was 40x80, which failed the tap target
                  // AND clipped "99999.999" by 29px.
                  "h-11 w-24 rounded-lg border-border-default bg-bg-input text-right font-mono text-base dark:bg-bg-input",
                  errors.dose && "border-state-error",
                )}
              />
              {unitOptions.length > 1 ? (
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  aria-label="Dose unit"
                  className={cn(ROW_SELECT, "w-[4.5rem] font-mono")}
                >
                  {unitOptions.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="w-[4.5rem] shrink-0 text-right font-mono text-sm text-text-muted">
                  {unit}
                </span>
              )}
            </div>
          </FormRow>
          <RowDivider />

          {/* Schedule. The cadence pills sit on the row; the two cadences that
              need more (every N days, specific days) expand beneath it. */}
          <FormRow label="Schedule" error={errors.days}>
            <div className="flex flex-wrap justify-end gap-1.5">
              {CADENCE_OPTIONS.map((o) => {
                const active = o.value === cadenceType
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      setCadenceType(o.value)
                      if (errors.days) setErrors((p) => ({ ...p, days: undefined }))
                    }}
                    aria-pressed={active}
                    className={cn(ROW_PILL, active ? ROW_PILL_ON : ROW_PILL_OFF)}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          </FormRow>

          {cadenceType === "everyNDays" && (
            <label className="flex items-center justify-end gap-2 px-4 pb-3">
              <span className="text-sm text-text-muted">Every</span>
              <Input
                inputMode="numeric"
                value={everyN}
                // Digits only. It took anything: "0", "-4" and "abc" were all
                // kept in the field and all silently became DAILY, with no error
                // and no clue that the schedule was not what had been typed.
                onChange={(e) => setEveryN(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                aria-label="Number of days between doses"
                className="h-11 w-16 rounded-lg border-border-default bg-bg-input text-center font-mono text-base dark:bg-bg-input"
              />
              <span className="text-sm text-text-muted">days</span>
            </label>
          )}

          {cadenceType === "daysOfWeek" && (
            <div className="px-4 pb-3">
              <div
                className={cn(
                  "flex justify-end gap-1.5 transition-opacity",
                  daysLocked && "opacity-50",
                )}
              >
                {DOW.map((d, i) => {
                  const active = days.includes(d.day)
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={daysLocked}
                      onClick={() => {
                        toggleDay(d.day)
                        if (errors.days) setErrors((p) => ({ ...p, days: undefined }))
                      }}
                      aria-pressed={active}
                      aria-label={`Toggle day ${d.day}`}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-full border text-sm transition-colors",
                        daysLocked && "cursor-not-allowed",
                        active
                          ? "border-transparent bg-accent-primary font-medium text-bg-base"
                          : "border-border-default bg-bg-input text-text-muted hover:text-text-primary",
                      )}
                    >
                      {d.letter}
                    </button>
                  )
                })}
              </div>
              <div className="mt-2 flex justify-end">
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
          <RowDivider />

          {/* Starts. The row shows the date; tapping it reveals the SAME
              day/month/year selects the sign-up picker uses. The control is
              unchanged on purpose — spec 10 restructures the layout and says
              explicitly not to change what a field does. */}
          <FormRow
            label="Starts"
            onPress={() => setStartOpen((o) => !o)}
            value={formatDateKeyShort(startDate)}
            expanded={startOpen}
          />
          {startOpen && (
            <div className="grid grid-cols-[1fr_1.5fr_1.1fr] gap-2 px-4 pb-3">
              <select
                aria-label="Start day"
                value={safeStartDay}
                onChange={(e) => setSDay(e.target.value)}
                className={ROW_SELECT}
              >
                {Array.from({ length: startDaysInMonth }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                aria-label="Start month"
                value={sMonth}
                onChange={(e) => setSMonth(e.target.value)}
                className={ROW_SELECT}
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
                className={ROW_SELECT}
              >
                {startYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          )}
          <RowDivider />

          {/* Time. Reads "Set time" only when it is genuinely unset — clearing
              the field is what gets you there. It still PRE-FILLS and tracks the
              clock (Adrian, 2026-07-29, reverting spec 01), which is why the
              placeholder is rarely what you see. Flagged: spec 10's Out of Scope
              still describes the reverted behaviour. */}
          <FormRow label="Time">
            <div className="flex items-center justify-end gap-2">
              {!hasTime(timeOfDay) && (
                <span className="text-sm text-text-subtle">Set time</span>
              )}
              <Input
                type="time"
                value={timeOfDay}
                // No `min`: a cycle can start earlier today (or on a past day), so
                // the time isn't forced later than now.
                // Empty resumes live tracking; any value freezes it.
                onChange={(e) => setManualTime(e.target.value || null)}
                aria-label="Default dose time"
                // w-36, not w-28. A 12-hour locale renders "08:00 am" plus the
                // native picker glyph, which needs ~92px of content box; 112px of
                // control with px-3 gave it 88 and cut the meridiem in half, so an
                // Australian user could not tell AM from PM.
                className="h-11 w-36 rounded-lg border-border-default bg-bg-input px-3 font-mono text-base dark:bg-bg-input"
              />
            </div>
          </FormRow>

          {/* Later doses. A compound taken twice a day has had `times_per_day`
              in the schema since v0.4.2 and no way to say so until now — the log
              was one row per compound per day at both ends, so the second dose
              overwrote the first. Each time added here becomes its own tickable
              row on the day's log. */}
          {laterTimes.map((t, i) => (
            // `animate-home-up` is the app's own enter animation (a fade and a
            // small rise), so a dose added here arrives the way every other new
            // row in the app does rather than snapping into place.
            <div key={i} className="animate-home-up">
              <RowDivider />
              <FormRow label={`Dose ${i + 2}`}>
                <div className="flex items-center justify-end gap-1.5">
                  {/* Its own AMOUNT. Blank = the same dose as above, which is
                      what the placeholder says and what gets stored (null).
                      Per-slot amounts are Adrian's addition over the spec —
                      see `supabase/protocol/021`. */}
                  <Input
                    inputMode="decimal"
                    value={laterDoses[i] ?? ""}
                    onChange={(e) =>
                      setLaterDoses((prev) => {
                        const next = [...prev]
                        while (next.length < laterTimes.length) next.push("")
                        next[i] = sanitizeDoseInput(e.target.value)
                        return next
                      })
                    }
                    // Blank means "the same as the dose above", so the placeholder IS
                    // that dose rather than the word "optional".
                    placeholder={dose || "same"}
                    aria-label={`Dose ${i + 2} amount`}
                    className="h-11 w-20 rounded-lg border-border-default bg-bg-input px-3 text-right font-mono text-base dark:bg-bg-input"
                  />
                  <span className="font-mono text-xs text-text-muted">{unit}</span>
                  <Input
                    type="time"
                    value={t}
                    onChange={(e) =>
                      setLaterTimes((prev) =>
                        prev.map((v, j) => (j === i ? e.target.value : v))
                      )
                    }
                    aria-label={`Dose ${i + 2} time`}
                    className="h-11 w-36 rounded-lg border-border-default bg-bg-input px-3 font-mono text-base dark:bg-bg-input"
                  />
                  {/* A BIN, not the word "Remove" — the row already carries an
                      amount, a unit and a time picker, and the word was being
                      clipped off the end (Adrian, 2026-08-07).

                      Removing the LAST one only. A slot is an index, so dropping
                      one from the middle would renumber every dose after it and
                      silently re-point logs already written against those
                      slots. */}
                  <button
                    type="button"
                    onClick={() => {
                      setLaterTimes((prev) => prev.slice(0, -1))
                      setLaterDoses((prev) => prev.slice(0, -1))
                    }}
                    disabled={i !== laterTimes.length - 1}
                    aria-label={`Remove dose ${i + 2}`}
                    className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:text-accent-destructive disabled:opacity-25 disabled:hover:text-text-muted"
                  >
                    <Trash className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </FormRow>
            </div>
          ))}
          {/* The row disappears at the HARD cap. Between the soft and hard caps
              it still adds, and the save is what asks whether you meant it —
              see `DOSES_SOFT_CAP`. */}
          {laterTimes.length + 1 < DOSES_HARD_CAP && (
            <>
              <RowDivider />
              <FormRow
                label="Another dose"
                noCaret
                plus
                hint={
                  laterTimes.length === 0
                    ? "Optional"
                    : `${laterTimes.length + 1} a day`
                }
                onPress={() => {
                  // Offset EIGHT HOURS from the dose above rather than repeating
                  // it. Seeding the same time meant saving unchanged gave you two
                  // slots at 08:00, which is never what anyone means by "another
                  // dose" and reads as a bug.
                  setLaterTimes((prev) => [
                    ...prev,
                    shiftHours(prev.at(-1) ?? timeOfDay, 8),
                  ])
                  setLaterDoses((prev) => [...prev, ""])
                }}
              />
            </>
          )}
        </div>

        {/* Past start — a quiet confirmation of the date it's landing on, so a
            back-dated cycle is deliberate rather than a mis-set dropdown. Muted,
            not amber: this is a supported thing to do, not a warning. */}
        {startsInPast && (
          <div className="animate-home-up flex items-center gap-2 rounded-xl bg-bg-surface-raised px-3 py-2">
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

        {/* Date preview — SHORTENED (spec 10 · step 5). It was
            "Starts Thu 23 Jul · then Fri 24 Jul, Sat 25 Jul, Sun 26 Jul", the
            largest block of text on the sheet. The four dates were answering a
            question one date and the pattern already answer, and the cadence
            pills above say the pattern. Proposed wording, flagged for approval:
            the first date, then the next one, and nothing else. */}
        {upcoming.length > 0 ? (
          <p className="animate-home-up px-1 text-xs text-text-subtle">
            First dose{" "}
            <span className="font-mono text-text-muted">
              {formatDateKeyShort(upcoming[0])}
            </span>
            {upcoming.length > 1 && (
              <>
                , then{" "}
                <span className="font-mono text-text-muted">
                  {formatDateKeyShort(upcoming[1])}
                </span>
              </>
            )}
          </p>
        ) : (
          <p className="animate-home-up px-1 text-xs text-text-subtle">
            Pick days above to preview the dates.
          </p>
        )}

        {/* ── Card two: the cycle ────────────────────────────────────
            Collapsed to ONE row by default. Someone who does not cycle sees one
            extra row and nothing more, which is the entire point of collapsing
            it.

            Turning it on DROPS THE WHOLE THING DOWN, in place (Adrian,
            2026-07-30). It used to open a separate sheet — a second surface, on
            top of the one you were already filling in, for four fields. Every
            variable is here now, condensed into the same row language as the
            rest of the form: pattern, the on/off lengths, when it starts, how it
            ends, and its colour. Nothing about the RULE changed, only where you
            set it: the draft is a `CycleRule` exactly as before, and Protocol →
            Cycles still uses `CycleRuleSheet` for editing one after the fact. */}
        <div
          className="animate-home-up overflow-hidden rounded-2xl bg-bg-surface-raised"
          style={{ animationDelay: "80ms" }}
        >
          <FormRow label="Cycle this" error={errors.cycle}>
            <button
              type="button"
              role="switch"
              aria-checked={cycleDraft !== null}
              aria-label="Run this compound on a cycle"
              onClick={() => {
                if (errors.cycle) setErrors((p) => ({ ...p, cycle: undefined }))
                setCycleDraft((cur) =>
                  cur
                    ? null
                    : // A sensible cycle, immediately valid, rather than an empty
                      // form: 7 on / 7 off from today, no end, the default colour.
                      // Everything is visible below and can be changed in a tap.
                      {
                        pattern: { type: "onOff", onDays: 7, offDays: 7 },
                        end: { type: "never" },
                        colour: DEFAULT_CYCLE_COLOUR,
                        anchor: todayKey,
                      },
                )
              }}
              // Amber when on, white knob (Adrian, 2026-07-30). Amber is what
              // "live / on" means everywhere else in this app; `accent-primary`
              // resolves to white, which put a white track under a white knob.
              // Geometry, knob colour and the OFF hairline all match the two
              // settings switches exactly. The rule in ui-context.md says "no
              // exceptions and no per-screen variants", and this one was the
              // exception: a #F0EFE9 knob where the doc says #FFFFFF, no OFF
              // border at all, and a track 4px shorter than every other switch.
              className={cn(
                "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200",
                cycleDraft
                  ? "bg-accent-amber"
                  : "border border-border-strong bg-bg-input",
              )}
            >
              <span
                className={cn(
                  "absolute top-1 h-5 w-5 rounded-full bg-primary transition-[left] duration-200 ease-out motion-reduce:transition-none",
                  cycleDraft ? "left-[1.625rem]" : "left-1",
                )}
                aria-hidden
              />
            </button>
          </FormRow>

          {/* The expansion. Grid-rows rather than height, so it animates from
              nothing to its own content height without a magic number. */}
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
              cycleDraft ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="overflow-hidden">
              {cycleDraft && (
                <CycleFields
                  cycle={cycleDraft}
                  vialTracked={canStock}
                  onChange={(next) => {
                    setCycleDraft(next)
                    if (errors.cycle) setErrors((p) => ({ ...p, cycle: undefined }))
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── Card three: stock ──────────────────────────────────────
            Injectables only (Spec 03's gate, unchanged) — absent entirely
            otherwise rather than shown disabled. */}
        {canStock && (
          <div
            className="animate-home-up overflow-hidden rounded-2xl bg-bg-surface-raised"
            style={{ animationDelay: "120ms" }}
          >
            <FormRow
              label="Stock on hand"
              hint="Optional"
              plus
              onPress={() => {
                setAddStockOn((o) => !o)
                if (errors.stock) setErrors((p) => ({ ...p, stock: undefined }))
              }}
              expanded={addStockOn}
              error={errors.stock}
            />
            {addStockOn && (
              <div className="space-y-3 px-4 pb-4">
                {stockType === "reconstituted" && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className={STOCK_FIELD_LABEL}>Powder in vial</span>
                      <div className="flex items-center gap-1.5">
                        <Input inputMode="decimal" value={stPowder} onChange={(e) => setStPowder(sanitizeDoseInput(e.target.value))} placeholder={stPowderUnits[0] === "iu" ? "5000" : "5"} className={cn(STOCK_FIELD, "flex-1")} />
                        {/* One unit ⇒ state it rather than ask. */}
                        {stPowderUnits.length === 1 ? (
                          <span className="shrink-0 text-sm text-text-muted">{stPowderUnits[0]}</span>
                        ) : (
                          <div className="flex gap-1">
                            {stPowderUnits.map((u) => (
                              <button key={u} type="button" onClick={() => setStPowderUnit(u)} className={cn(STOCK_PILL, stPowderUnit === u ? STOCK_PILL_ON : STOCK_PILL_OFF)}>{u}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* HGH is dosed in iu and sold in mg — see
                          `needsIuFromMgHint`. */}
                      {showStIuFromMgHint && (
                        <p className="mt-1 text-xs text-text-subtle">
                          Boxes often state mg — 1 mg is about 3 iu.
                        </p>
                      )}
                    </label>
                    <label className="block">
                      <span className={STOCK_FIELD_LABEL}>BAC water (mL)</span>
                      <Input inputMode="decimal" value={stBac} onChange={(e) => setStBac(sanitizeDoseInput(e.target.value))} placeholder="2" className={STOCK_FIELD} />
                    </label>
                  </div>
                )}
                {stockType === "preconcentrated" && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className={STOCK_FIELD_LABEL}>Volume (mL)</span>
                      <Input inputMode="decimal" value={stMl} onChange={(e) => setStMl(sanitizeDoseInput(e.target.value))} placeholder="10" className={STOCK_FIELD} />
                    </label>
                    <label className="block">
                      <span className={STOCK_FIELD_LABEL}>Strength (mg/mL)</span>
                      <Input inputMode="decimal" value={stConc} onChange={(e) => setStConc(sanitizeDoseInput(e.target.value))} placeholder="250" className={STOCK_FIELD} />
                    </label>
                  </div>
                )}
                {stockType === "oral_solid" && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className={STOCK_FIELD_LABEL}>Count</span>
                      <div className="flex gap-1.5">
                        <Input inputMode="numeric" value={stCount} onChange={(e) => setStCount(sanitizeDoseInput(e.target.value))} placeholder="100" className={cn(STOCK_FIELD, "flex-1")} />
                        <div className="flex gap-1">
                          <button type="button" onClick={() => setStOralForm("tab")} className={cn(STOCK_PILL, stOralForm === "tab" ? STOCK_PILL_ON : STOCK_PILL_OFF)}>tab</button>
                          <button type="button" onClick={() => setStOralForm("capsule")} className={cn(STOCK_PILL, stOralForm === "capsule" ? STOCK_PILL_ON : STOCK_PILL_OFF)}>cap</button>
                        </div>
                      </div>
                    </label>
                    <label className="block">
                      {/* Optional, and not always mg — see `supabase/protocol/016`. */}
                      <span className={STOCK_FIELD_LABEL}>Strength each</span>
                      <div className="flex items-center gap-1.5">
                        <Input inputMode="decimal" value={stStrength} onChange={(e) => setStStrength(sanitizeDoseInput(e.target.value))} placeholder={stStrengthRequired ? "5000" : "optional"} className={cn(STOCK_FIELD, "flex-1")} />
                        {stStrengthUnits.length === 1 ? (
                          <span className="shrink-0 text-sm text-text-muted">{stStrengthUnits[0]}</span>
                        ) : (
                          <div className="flex gap-1">
                            {stStrengthUnits.map((u) => (
                              <button key={u} type="button" onClick={() => setStStrengthUnit(u)} className={cn(STOCK_PILL, stStrengthUnit === u ? STOCK_PILL_ON : STOCK_PILL_OFF)}>{u}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    </label>
                  </div>
                )}
                {stStrengthRequired && amt(stStrength) <= 0 && amt(stCount) > 0 && (
                  <p className="text-xs text-text-subtle">
                    {source.name} is dosed in iu, so state the strength of one{" "}
                    {stOralForm === "tab" ? "tablet" : "capsule"}.
                  </p>
                )}
                {stockType === "bulk_powder" && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className={STOCK_FIELD_LABEL}>Tub weight (g)</span>
                      <Input inputMode="decimal" value={stTubGrams} onChange={(e) => setStTubGrams(sanitizeDoseInput(e.target.value))} placeholder="1000" className={STOCK_FIELD} />
                    </label>
                    <label className="block">
                      <span className={STOCK_FIELD_LABEL}>Serving (g)</span>
                      <Input inputMode="decimal" value={stServingG} onChange={(e) => setStServingG(sanitizeDoseInput(e.target.value))} placeholder="optional" className={STOCK_FIELD} />
                    </label>
                  </div>
                )}
                {/* How much is in it? — always shown when the vial panel is open (not
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
                        aria-label={`How full the ${stContainerNoun} is`}
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
          Saved to your account. Only you can see it.
        </p>
      </div>

    </div>
  )
}

/** Bounds on both cycle date fields. Advisory on their own — `cycleProblem` is
 *  what actually refuses a save — but they keep the picker honest. */
const CYCLE_MIN_DATE = "2015-01-01"
const CYCLE_MAX_DATE = "2100-12-31"

/**
 * What is wrong with this cycle, if anything — or null when it is fine.
 *
 * `min={cycle.anchor}` on the date input is ADVISORY. Nothing form-validates
 * these fields, so the browser itself reported the input invalid while the sheet
 * saved it anyway: an end date before the start writes a cycle that has already
 * ended, which reads "Ended" on the card, flips every day of the schedule grid
 * to nothing-due, and takes the compound out of Today's Log with no way back
 * except finding the cycle and removing it. `CycleRuleSheet` has always had a
 * real gate; this copy had none.
 */
function cycleProblem(cycle: CycleRule | null): string | null {
  if (!cycle) return null
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(cycle.anchor) ||
    cycle.anchor < CYCLE_MIN_DATE ||
    cycle.anchor > CYCLE_MAX_DATE
  ) {
    return "Give the cycle a real start date."
  }
  if (cycle.pattern.type === "onOff") {
    if (cycle.pattern.onDays < 1) return "A cycle needs at least one day on."
    // `smallint` in `protocol_compounds`; anything larger fails the upsert with
    // 22003, so the compound saves on the device and silently never syncs.
    if (cycle.pattern.onDays > 999 || cycle.pattern.offDays > 999) {
      return "Keep the on and off periods under 1000 days."
    }
  }
  if (cycle.end.type === "onDate") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cycle.end.date)) {
      return "Give the cycle an end date."
    }
    if (cycle.end.date < cycle.anchor) {
      return "The cycle ends before it starts."
    }
    if (cycle.end.date > CYCLE_MAX_DATE) {
      return "Give the cycle a real end date."
    }
  }
  if (cycle.end.type === "afterRounds") {
    if (cycle.end.rounds < 1) return "A cycle runs for at least one round."
    if (cycle.end.rounds > 999) return "Keep the rounds under 1000."
  }
  return null
}

/** Parse a numeric input string to a finite number (0 when blank/invalid). */
function amt(s: string): number {
  const v = Number.parseFloat(s)
  return Number.isFinite(v) ? v : 0
}


/* ── The row language of the restructured form (spec 10) ────────────
   Label on the left, value or control on the right, ONE height and ONE divider
   throughout. Co-located rather than shared: spec 10 says not to create shared
   components without asking, and spec 11 will decide for itself whether it wants
   the same rows on the log form. */

/** Every row is at least 52px tall, so the card reads as one rhythm even when a
 *  row holds nothing but text. */
const ROW_BASE = "flex w-full min-h-14 items-center justify-between gap-3 px-4 py-1.5 text-left"
/** Rows that ARE the control get the press compression `ui-context.md` requires
 *  of a borderless row, since there is no border to say they are tappable. */
const ROW_PRESSABLE =
  "transition-transform duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none"

// px-3 py-2, not px-2.5 py-1: spec 10 shrank these to 26px tall, below both the
// 44px guideline and the ~34px they had been. 36px is what fits four cadence
// pills across a 360px row without a third line.
const ROW_PILL =
  "rounded-full border px-3 py-2 text-xs transition-colors active:scale-[0.98]"
const ROW_PILL_ON = "border-transparent bg-accent-primary font-medium text-bg-base"
const ROW_PILL_OFF = "border-border-default bg-bg-input text-text-muted hover:text-text-primary"
const ROW_SELECT =
  "h-11 min-w-0 rounded-lg border border-border-default bg-bg-input px-2 text-sm text-foreground outline-none transition-[color,box-shadow] [color-scheme:dark] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"

function RowDivider() {
  return <div className="mx-4 hairline-t" aria-hidden />
}

/**
 * One row of the form.
 *
 * `onPress` makes the whole row the control (used where the real control is an
 * expansion beneath it), `children` puts a control on the right, and `value`
 * renders a read-only right-hand value. `error` puts the message ON THE ROW,
 * which is spec 10 step 9 — errors used to appear as a block at the bottom of
 * the sheet, a long scroll away from the field that caused them.
 */
function FormRow({
  label,
  hint,
  value,
  swatch,
  error,
  expanded,
  noCaret,
  plus,
  onPress,
  children,
}: {
  label: string
  /** A quiet qualifier beside the label, e.g. "Optional". */
  hint?: string
  value?: string
  /** A cycle colour dot before the value. */
  swatch?: string
  error?: string
  /** Rotates the caret when the row owns an expansion. */
  expanded?: boolean
  /** Hide the caret on a row that ACTS rather than expands. "Add another dose"
   *  appends a row below itself; a chevron there promised a disclosure that was
   *  never going to open (Adrian, 2026-08-07). */
  noCaret?: boolean
  /**
   * A `+` in the caret's place, for a row that ADDS something.
   *
   * The word "Add" was doing this job in two different ways — inside the label
   * on one row and as the `value` on another — and neither read as a control
   * (Adrian, 2026-08-07). One glyph, on the right, where every other row keeps
   * its affordance. On a row that also expands it rotates 45° into an ×, so the
   * state the caret used to carry is not lost.
   */
  plus?: boolean
  onPress?: () => void
  children?: React.ReactNode
}) {
  const inner = (
    <>
      <span className="flex min-w-0 shrink-0 items-baseline gap-1.5">
        <span className="text-sm text-text-muted">{label}</span>
        {hint && <span className="text-xs text-text-subtle">{hint}</span>}
      </span>
      {children ?? (
        <span className="flex min-w-0 items-center gap-2">
          {swatch && (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: swatch }}
              aria-hidden
            />
          )}
          {value && (
            <span className="truncate text-sm text-foreground">{value}</span>
          )}
          {onPress && plus && (
            <Plus
              className={cn(
                // WHITE, not subtle (Adrian, 2026-08-07). It is the only thing
                // on the row that acts, and at `--text-subtle` it read as
                // decoration beside a label that is itself muted.
                "h-4 w-4 shrink-0 text-foreground transition-transform duration-200 motion-reduce:transition-none",
                expanded && "rotate-45",
              )}
              aria-hidden
            />
          )}
          {onPress && !noCaret && !plus && (
            <CaretDown
              className={cn(
                "h-4 w-4 shrink-0 text-text-subtle transition-transform duration-200 motion-reduce:transition-none",
                expanded && "rotate-180",
              )}
              aria-hidden
            />
          )}
        </span>
      )}
    </>
  )

  return (
    <>
      {onPress ? (
        <button
          type="button"
          onClick={onPress}
          // A rotating caret is not an announcement. Without these a screen
          // reader was told nothing about a row that opens an expansion, or
          // about whether it is currently open.
          aria-expanded={expanded === undefined ? undefined : expanded}
          className={cn(ROW_BASE, ROW_PRESSABLE)}
        >
          {inner}
        </button>
      ) : (
        <div className={ROW_BASE}>{inner}</div>
      )}
      {error && (
        <p role="alert" className="-mt-1 px-4 pb-2.5 text-xs text-state-error">
          {error}
        </p>
      )}
    </>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-xs font-medium tracking-wider text-text-muted uppercase">
      {children}
    </span>
  )
}

/* ── The cycle, inline ─────────────────────────────────────────────
   Every variable the old `CycleRuleSheet` asked for, in this form's own row
   language, editing the draft LIVE (Adrian, 2026-07-30 — "it drops down and has
   all of the variables… in the same sheet"). There is no save button because
   there is nothing to save to: the draft is the value, and Add commits it with
   the rest of the compound.

   The RULE is unchanged — same `CycleRule`, same validity conditions, same
   `availableCycleEnds` gate — so nothing downstream can tell where it was set. */

function CycleFields({
  cycle,
  vialTracked,
  onChange,
}: {
  cycle: CycleRule
  /** Gates the "when the vial runs out" end condition. */
  vialTracked: boolean
  onChange: (next: CycleRule) => void
}) {
  // Narrowed once, so the fields below read the lengths without re-testing the
  // union on every line. A continuous cycle keeps sensible defaults in the
  // inputs, so flipping to on/off does not start from zero.
  // Remembered across end-type switches. Tapping "After rounds" and back used to
  // reset the date to the anchor, silently discarding a date the user had
  // chosen — and the seed for a fresh "On a date" WAS the anchor, which is a
  // cycle that ends on the day it starts.
  const [lastEndDate, setLastEndDate] = useState<string | null>(
    cycle.end.type === "onDate" ? cycle.end.date : null,
  )
  const today = toDateKey(new Date())
  const onOff = cycle.pattern.type === "onOff" ? cycle.pattern : null
  const repeats = onOff !== null
  const onDays = onOff?.onDays ?? 7
  const offDays = onOff?.offDays ?? 7
  const offerable = availableCycleEnds(cycle.pattern, { vialTracked })
  // Turning the repeat off takes "after rounds" with it — a round needs an
  // off-period to exist — so an impossible rule falls back rather than saving.
  // The fallback is the first OFFERABLE end, not a hardcoded "never": since
  // "never" stopped being offered for a continuous pattern, hardcoding it here
  // would have quietly saved the one combination we just removed.
  const endType = offerable.includes(cycle.end.type) ? cycle.end.type : offerable[0]

  const setPattern = (next: boolean) =>
    onChange({
      ...cycle,
      pattern: next
        ? { type: "onOff", onDays: Math.max(1, onDays), offDays: Math.max(0, offDays) }
        : { type: "continuous" },
      // Continuous has no rounds to count.
      end: next || cycle.end.type !== "afterRounds" ? cycle.end : { type: "never" },
    })

  const setEnd = (next: CycleEnd) => onChange({ ...cycle, end: next })

  return (
    <>
      <RowDivider />
      <FormRow label="Pattern">
        <div className="flex gap-1.5">
          {[
            { on: false, label: "Continuous" },
            { on: true, label: "On / off" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setPattern(o.on)}
              aria-pressed={repeats === o.on}
              className={cn(ROW_PILL, repeats === o.on ? ROW_PILL_ON : ROW_PILL_OFF)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </FormRow>

      {repeats && (
        <>
          <RowDivider />
          <FormRow label="Days on / off">
            <div className="flex items-center gap-1.5">
              <Input
                inputMode="numeric"
                value={String(onDays)}
                onChange={(e) =>
                  onChange({
                    ...cycle,
                    pattern: {
                      type: "onOff",
                      onDays: Math.max(1, Number(e.target.value.replace(/[^0-9]/g, "")) || 1),
                      offDays,
                    },
                  })
                }
                aria-label="Days on"
                className="h-11 w-14 rounded-lg border-border-default bg-bg-input text-center font-mono text-base dark:bg-bg-input"
              />
              <span className="text-sm text-text-subtle">/</span>
              <Input
                inputMode="numeric"
                value={String(offDays)}
                onChange={(e) =>
                  onChange({
                    ...cycle,
                    pattern: {
                      type: "onOff",
                      onDays,
                      offDays: Math.max(0, Number(e.target.value.replace(/[^0-9]/g, "")) || 0),
                    },
                  })
                }
                aria-label="Days off"
                className="h-11 w-14 rounded-lg border-border-default bg-bg-input text-center font-mono text-base dark:bg-bg-input"
              />
            </div>
          </FormRow>
        </>
      )}

      {/* The day the on/off phase counts FROM. A cleared date would make the
          cycle off on every day and the compound would vanish from the log with
          nothing to explain it, so an empty input falls back to what it was. */}
      <RowDivider />
      <FormRow label="Cycle starts">
        <Input
          type="date"
          value={cycle.anchor}
          onChange={(e) =>
            onChange({ ...cycle, anchor: e.target.value || cycle.anchor })
          }
          aria-label="Cycle starts on"
          min={CYCLE_MIN_DATE}
          max={CYCLE_MAX_DATE}
          className="h-11 w-44 rounded-lg border-border-default bg-bg-input px-3 font-mono text-base dark:bg-bg-input"
        />
      </FormRow>

      <RowDivider />
      <FormRow label="Ends">
        <div className="flex flex-wrap justify-end gap-1.5">
          {offerable.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() =>
                setEnd(
                  t === "onDate"
                    ? {
                        type: "onDate",
                        // What they picked before, else a sensible span ahead of
                        // the anchor — never the anchor itself.
                        // Eight weeks from the anchor OR from today, whichever
                        // is later. Anchored alone it produced a date in the
                        // PAST for any cycle running longer than that, i.e. a
                        // cycle that had already ended the moment it was saved.
                        date:
                          lastEndDate ??
                          addDaysKey(
                            cycle.anchor > today ? cycle.anchor : today,
                            8 * 7,
                          ),
                      }
                    : t === "afterRounds"
                      ? { type: "afterRounds", rounds: 4 }
                      : t === "whenVialEmpty"
                        ? { type: "whenVialEmpty" }
                        : { type: "never" },
                )
              }
              aria-pressed={endType === t}
              className={cn(ROW_PILL, endType === t ? ROW_PILL_ON : ROW_PILL_OFF)}
            >
              {END_LABELS[t]}
            </button>
          ))}
        </div>
      </FormRow>

      {endType === "onDate" && (
        <>
          <RowDivider />
          <FormRow label="End date">
            <Input
              type="date"
              value={cycle.end.type === "onDate" ? cycle.end.date : ""}
              onChange={(e) => {
                const next = e.target.value || cycle.anchor
                setLastEndDate(next)
                setEnd({ type: "onDate", date: next })
              }}
              aria-label="Cycle end date"
              min={cycle.anchor}
              max={CYCLE_MAX_DATE}
              className="h-11 w-44 rounded-lg border-border-default bg-bg-input px-3 font-mono text-base dark:bg-bg-input"
            />
          </FormRow>
        </>
      )}

      {endType === "afterRounds" && (
        <>
          <RowDivider />
          <FormRow label="Rounds">
            <Input
              inputMode="numeric"
              value={cycle.end.type === "afterRounds" ? String(cycle.end.rounds) : "4"}
              onChange={(e) =>
                setEnd({
                  type: "afterRounds",
                  rounds: Math.max(1, Number(e.target.value.replace(/[^0-9]/g, "")) || 1),
                })
              }
              aria-label="Number of rounds"
              className="h-11 w-14 rounded-lg border-border-default bg-bg-input text-center font-mono text-base dark:bg-bg-input"
            />
          </FormRow>
        </>
      )}

      {/* The colour the calendar draws this cycle in. */}
      <RowDivider />
      <FormRow label="Colour">
        <div className="flex flex-wrap justify-end gap-1.5">
          {CYCLE_COLOURS.map((c: CycleColour) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ ...cycle, colour: c })}
              aria-pressed={cycle.colour === c}
              aria-label={CYCLE_COLOUR_LABELS[c]}
              className={cn(
                "h-7 w-7 rounded-full border-2 transition-transform active:scale-90",
                cycle.colour === c ? "border-foreground" : "border-transparent",
              )}
              style={{ background: cycleColourVar(c) }}
            />
          ))}
        </div>
      </FormRow>
    </>
  )
}

/**
 * A date key N days on, in UTC so a DST change cannot shift it.
 *
 * Guarded at both ends. A year typed into a date input can reach Chrome's
 * 275760 ceiling, and `new Date(...).toISOString()` THROWS `RangeError` past the
 * maximum date — which killed the "On a date" pill silently, leaving it a no-op
 * that never revealed its field. Years above 9999 also serialise as `+275760-…`,
 * so slicing ten characters yields a garbage key.
 */
function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number)
  if (!y || !m || !d || y < 1000 || y > 9000) return key
  const at = Date.UTC(y, m - 1, d) + days * 86_400_000
  if (!Number.isFinite(at)) return key
  const out = new Date(at)
  if (Number.isNaN(out.getTime())) return key
  return out.toISOString().slice(0, 10)
}

const END_LABELS: Record<CycleEnd["type"], string> = {
  never: "No end",
  onDate: "On a date",
  afterRounds: "After rounds",
  whenVialEmpty: "Vial runs out",
}
