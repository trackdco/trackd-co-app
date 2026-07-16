"use client"

import { useEffect, useState } from "react"
import { CalendarDays, Pencil, Plus, TriangleAlert } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { addStockItem, type StockInsert } from "@/lib/db/inventory"
import { resolveFill, FILL_PRESETS, round3 } from "@/lib/protocol/vialFill"
import { newId } from "@/lib/home/id"
import { pushProtocolCompound } from "@/lib/home/protocolSync"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
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
import {
  formatDateKeyShort,
  loadStack,
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

interface AddCompoundSheetProps {
  open: boolean
  /** Catalogue pick (create) — its data locks method + unit. */
  compound: Compound | null
  /** An existing stack compound (edit) — pre-fills everything and saves by id. */
  editCompound?: StackCompound | null
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
  "h-11 w-full min-w-0 rounded-xl border border-border-default bg-bg-input px-2 text-base text-foreground shadow-xs outline-none transition-colors [color-scheme:dark] focus-visible:border-accent-amber"

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
  /** Reactivating an archived compound: resume from today + relabel "Reactivate". */
  reactivate: boolean
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
  editCompound: StackCompound | null | undefined
): Source | null {
  if (editCompound) {
    return {
      id: editCompound.id,
      // An archived compound being edited IS a reactivation (resume from today).
      reactivate: editCompound.archived === true,
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
      reactivate: false,
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
  userId,
  onOpenChange,
  onAdded,
}: AddCompoundSheetProps) {
  // Retain the source through the close animation so the body doesn't blank.
  const [shown, setShown] = useState<Source | null>(() =>
    toSource(compound, editCompound)
  )
  const next = toSource(compound, editCompound)
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
  // Reactivating an archived compound: an in-place upsert (keeps the id, drops the
  // archived flag → active) that defaults the start to TODAY. It's NOT a plain
  // "edit" — it resumes a stopped compound, so it takes the create-style start.
  const isReactivate = source.reactivate
  const isEdit = source.id !== null && !isReactivate
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
    isEdit || isReactivate
      ? null
      : describeBlendOverlap(
          source.name,
          findBlendOverlaps(
            source.name,
            // Archived compounds aren't tracked any more — don't flag them.
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
  const canStock =
    !isEdit &&
    !isReactivate &&
    (stockType === "reconstituted" ||
      stockType === "preconcentrated" ||
      stockType === "oral_solid")
  const [addStockOn, setAddStockOn] = useState(false)
  const [stPowder, setStPowder] = useState("")
  const [stPowderUnit, setStPowderUnit] = useState<"mg" | "iu">("mg")
  const [stBac, setStBac] = useState("")
  const [stMl, setStMl] = useState("")
  const [stConc, setStConc] = useState("")
  const [stCount, setStCount] = useState("")
  const [stForm, setStForm] = useState<"tab" | "capsule">("tab")
  const [stStrength, setStStrength] = useState("")
  // "How much is in it?" — same part-used estimate as the Stock tab (Full/¾/½/¼ or an
  // exact amount-left). Default Full = no offset, the prior full-vial behaviour.
  const [stFillPreset, setStFillPreset] = useState(1)
  const [stExactLeft, setStExactLeft] = useState("")

  const [now] = useState(() => new Date())
  // Reactivation keeps the old cadence/sites but RE-ANCHORS the start to today, so
  // the days it sat archived aren't back-filled. The user can still change it below.
  const [initial] = useState(() =>
    initSchedule(
      isReactivate && source.schedule
        ? { ...source.schedule, startDate: toDateKey(now) }
        : source.schedule,
      now
    )
  )

  const [dose, setDose] = useState(source.dose)
  const [unit, setUnit] = useState(source.unit)
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
  const [manualTime, setManualTime] = useState<string | null>(
    isEdit || isReactivate ? initial.timeOfDay : null
  )
  const [clock, setClock] = useState(() => now)
  useEffect(() => {
    if (manualTime !== null) return
    const id = window.setInterval(() => setClock(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [manualTime])
  const timeOfDay = manualTime ?? hhmm(clock)

  const todayKey = toDateKey(now)
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
  // Both are "YYYY-MM-DD", so a string compare is a date compare.
  const startsInPast = startDate < todayKey

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
      : upcomingDoseDates(previewSchedule, dateKeyToDate(startDate), 4)

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
    },
    stExactLeft,
    stFillPreset,
  )
  const stFillUnit = stockType === "oral_solid" ? stForm : "mL"

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
    if (stockType === "oral_solid") {
      if (n(stCount) <= 0 || n(stStrength) <= 0) return null
      return {
        inventory_type: "oral_solid",
        base_unit: "mg",
        total_amount: n(stCount),
        total_amount_unit: stForm,
        strength_per_unit_mg: n(stStrength),
        prior_used_base,
      }
    }
    return null
  }

  async function handleSave() {
    const doseValue = Number(dose)
    if (dose.trim() === "" || !Number.isFinite(doseValue) || doseValue <= 0) {
      show("Enter a dose greater than 0.")
      return
    }
    // When the time is still live-tracking, resolve it at SAVE (a fresh now), so
    // the saved default matches what the field last showed.
    const nowAtSave = new Date()
    const effectiveTime = manualTime ?? hhmm(nowAtSave)
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
    // already there (by name) just clutters the log — block it (an edit, which
    // keeps the same id, is exempt). To change its dose/schedule, edit the existing
    // one; to re-run a stopped compound, reactivate it from the Archive.
    if (!isEdit && !isReactivate) {
      const name = source.name.trim().toLowerCase()
      if ((loadStack(userId) ?? []).some((c) => c.name.trim().toLowerCase() === name)) {
        show(`${source.name} is already in your log.`)
        return
      }
    }
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
    }
    if (!upsertStack(userId, saved)) {
      show("Couldn't save to this device. Storage may be full or off.")
      return
    }
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
    <div className="flex h-full flex-col overflow-hidden rounded-t-3xl border-t border-border-default bg-bg-surface shadow-lg">
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
        <SheetTitle className="justify-self-center text-base font-semibold text-foreground">
          {isReactivate ? "Reactivate compound" : isEdit ? "Edit compound" : "Add to log"}
        </SheetTitle>
        <button
          type="button"
          onClick={handleSave}
          className="justify-self-end text-base font-medium text-accent-amber transition-colors hover:opacity-80"
        >
          {isReactivate ? "Reactivate" : isEdit ? "Save" : "Add"}
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
          <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} />
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

        {/* Reactivation heads-up — you can re-tune everything before it resumes. */}
        {isReactivate && (
          <p className="animate-home-up -mt-2 px-1 text-xs leading-relaxed text-text-subtle">
            Reactivating — adjust the dose or schedule, then save. It resumes from
            the start date below (today by default); the days it sat archived stay
            empty and your past entries are kept.
          </p>
        )}

        {/* Blend overlap — a non-blocking heads-up that this compound is already
            covered by a blend you track (or vice versa). Add it anyway only if you
            want the extra dose; the blend itself logs as one unit. */}
        {overlapNote && (
          <div className="animate-home-up flex gap-2.5 rounded-xl border border-accent-amber/40 bg-accent-amber/10 p-3">
            <TriangleAlert
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
                        ? "border-accent-amber bg-accent-amber/15 text-foreground"
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
        </div>

        {/* Changing the dose (amount or unit) while EDITING — a non-alarming
            heads-up that the change applies going forward, with the disclaimer. */}
        {isEdit && (Number(dose) !== Number(source.dose) || unit !== source.unit) && (
          <div className="animate-home-up flex gap-2.5 rounded-xl border border-accent-amber/40 bg-accent-amber/10 p-3">
            <TriangleAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber"
              aria-hidden
            />
            <p className="text-xs leading-relaxed text-foreground">
              You&apos;re changing your dose to{" "}
              <span className="font-mono text-accent-amber">
                {dose || "0"} {unit}
              </span>
              . This applies to your upcoming doses — anything already logged stays
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
                      ? "border-accent-amber bg-accent-amber/15 text-foreground"
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
                          ? "border-accent-amber bg-accent-amber/15 text-foreground"
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
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Edit days
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => days.length > 0 && setDaysLocked(true)}
                    disabled={days.length === 0}
                    className="text-xs font-medium text-accent-amber transition-opacity hover:opacity-80 disabled:text-text-subtle"
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
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-border-default bg-bg-surface-raised px-3 py-2">
                <CalendarDays
                  className="h-3.5 w-3.5 shrink-0 text-text-muted"
                  aria-hidden
                />
                <p className="text-xs text-text-muted">
                  Starting on{" "}
                  <span className="font-mono text-foreground">
                    {formatDateKeyShort(startDate)}
                  </span>
                  , in the past — so you can log the doses you&apos;ve already taken.
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

        {/* Stock on hand — optional. Type comes from the compound's route, so we
            show just that vial's fields. Starts full; counts down as doses log. */}
        {canStock && (
          <div className="animate-home-up" style={{ animationDelay: "210ms" }}>
            <FieldLabel>Stock on hand — optional</FieldLabel>
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
                {stockType === "oral_solid" && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-xs text-text-muted">Count</span>
                      <div className="flex gap-1.5">
                        <Input inputMode="numeric" value={stCount} onChange={(e) => setStCount(sanitizeDoseInput(e.target.value))} placeholder="100" className="h-11 min-w-0 flex-1 rounded-xl border-border-default bg-bg-input font-mono dark:bg-bg-input" />
                        <div className="flex gap-1">
                          <button type="button" onClick={() => setStForm("tab")} className={cn(STOCK_PILL, stForm === "tab" ? STOCK_PILL_ON : STOCK_PILL_OFF)}>tab</button>
                          <button type="button" onClick={() => setStForm("capsule")} className={cn(STOCK_PILL, stForm === "capsule" ? STOCK_PILL_ON : STOCK_PILL_OFF)}>cap</button>
                        </div>
                      </div>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-text-muted">Strength (mg each)</span>
                      <Input inputMode="decimal" value={stStrength} onChange={(e) => setStStrength(sanitizeDoseInput(e.target.value))} placeholder="25" className="h-11 rounded-xl border-border-default bg-bg-input font-mono dark:bg-bg-input" />
                    </label>
                  </div>
                )}
                {/* How much is in it? — always shown when the vial panel is open (not
                    hidden until the amounts are typed), so the part-full option is
                    discoverable straight away. The presets/bar light up once there's a
                    capacity to take a fraction of. */}
                <div className="space-y-2 border-t border-border-default/60 pt-3">
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
                      Enter the vial’s details above, then set how full it is — defaults to full.
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
    </div>
  )
}

/** Parse a numeric input string to a finite number (0 when blank/invalid). */
function amt(s: string): number {
  const v = Number.parseFloat(s)
  return Number.isFinite(v) ? v : 0
}

const STOCK_PILL = "rounded-full border px-2.5 py-1 text-sm transition-colors"
const STOCK_PILL_ON = "border-accent-amber bg-accent-amber/15 text-foreground"
const STOCK_PILL_OFF = "border-border-default bg-bg-input text-text-muted hover:text-text-primary"

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-xs font-medium tracking-wider text-text-muted uppercase">
      {children}
    </span>
  )
}
