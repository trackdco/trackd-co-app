/**
 * The user's protocol "stack" — the per-compound dosing, schedule, and
 * injection-site rotation model (Context/Feature Specs/05-compound-rotation-
 * mechanics.md §3.1). Rotation is a property of each compound: the user picks
 * the sites and their cycle order once (in the add flow); the pointer advances
 * only when a dose is logged. There is no global rotation.
 *
 * Persisted device-local in `localStorage` keyed `trackd.stack.<userId>` — the
 * same interim pattern as the custom compounds (see `architecture.md` → Storage
 * Model). No backend this pass; migrates to Postgres `protocol_compounds` when
 * the cycle feature lands.
 *
 * Pure data + pure helpers + guarded storage only; no React, no other side
 * effects (Context/code-standards.md).
 */
import type { CompoundCategory } from "@/lib/compound-categories"
import { isCustomName } from "@/lib/compound-lookup"
import { coerceDoseUnit } from "@/lib/db/doseUnits"
import { isInventoryForm } from "@/lib/containers/form"
import {
  activePause,
  dayBefore,
  effectiveCadenceStart,
  isPausedOn,
  normalizePause,
  pausedDaysBetween,
  type Pause,
} from "@/lib/home/pauses"
import type { InventoryType } from "@/lib/db/types"
import { pushStackCompound } from "@/lib/home/syncActions"
import {
  archiveProtocolCompound,
  pushCompoundPause,
  pushPauseDelete,
  pushPauseEnd,
  pushPauseGroupEnd,
  pushProtocolCompound,
  pushScheduleVersions,
} from "@/lib/home/protocolSync"
import { trackCriticalSync, trackSync } from "@/lib/home/syncStatus"
import { dropMember } from "@/lib/home/stacks"
import {
  cycleRuleFromColumns,
  cycleRuleToColumns,
  cycleStatusOn,
  DEFAULT_CYCLE_COLOUR,
  isCycleColour,
  isOnCycle,
  type CycleColumns,
  type CycleContext,
  type CycleEnd,
  type CyclePattern,
  type CycleRule,
} from "@/lib/protocol/cycleRule"

/**
 * How a compound is administered. Defaults to the compound's primary `route`;
 * when a compound offers more than one route (e.g. Glutathione: subQ or oral),
 * the user picks one in the Add sheet. Only `im`/`subq` have a site rotation.
 */
export type InjectionMethod = "im" | "subq" | "po" | "nasal"

/** When a compound is due. `daysOfWeek` is 0=Sun..6=Sat. */
export type Cadence =
  | { type: "daily" }
  | { type: "everyOtherDay" }
  | { type: "everyNDays"; n: number }
  | { type: "daysOfWeek"; days: number[] }

export interface Schedule {
  cadence: Cadence
  /**
   * Dose time, 24h "HH:mm". **Pre-filled and optional** (Adrian, 2026-07-29):
   * the add form opens on the clock and the log form on the clock (today) or the
   * compound's scheduled time (back-dated), and neither blocks a save without one.
   * Spec 01 briefly made it start empty and be mandatory; that was reverted.
   *
   * May be `""` — on records written while it was optional, on anything the user
   * cleared, and on a Postgres row whose `dose_times` holds NULL. Display those
   * through {@link formatTimeLabel} (which words it once, as "Not set") and test
   * with {@link hasTime}; never substitute a default at the call site.
   */
  timeOfDay: string
  /**
   * The times of the day's SECOND and subsequent doses, 24h "HH:mm"
   * (Spec w2b-13, Step 5). Absent or empty = once a day, which is every record
   * written before this existed.
   *
   * Slot 0's time stays in {@link timeOfDay} rather than moving into this array,
   * and that is deliberate: dozens of call sites read `timeOfDay` as "the time
   * this compound is due", and folding it into an array would have made every
   * one of them a migration. Read the whole day through {@link doseTimesOf}.
   */
  laterTimes?: string[]
  /**
   * Per-slot planned amounts for slots 1..n, parallel to {@link laterTimes}
   * (`supabase/protocol/021`). `laterDoses[i]` is the amount for
   * `laterTimes[i]`, in the compound's own unit.
   *
   * A `null` element — or a short/absent array — means "the compound's own
   * dose", which is why this needed no migration of existing records. Slot 0
   * always takes the compound's dose and is deliberately not represented here.
   *
   * NEVER a per-slot unit. One compound, one `dose_unit`: 100 mg AM and 50 mg
   * PM, never 100 mg AM and 5000 iu PM.
   *
   * ⚠️ This is scope the spec deferred, added on Adrian's call (2026-08-07)
   * after being told it was deferred. See `supabase/protocol/021`'s header.
   */
  laterDoses?: (number | null)[]
  /** Cycle start, "YYYY-MM-DD". Anchors EOD / every-N-days and gates due dates. */
  startDate: string
}

/**
 * The planned amount for every slot, in slot order — `doseAmountsOf(s, d)[n]` is
 * what slot `n` delivers.
 *
 * Reads {@link Schedule.laterDoses} DEFENSIVELY: a missing element, a null one,
 * a short array and an absent array all mean "the compound's own dose". They are
 * all legitimate states rather than corruption, so there is nothing here to
 * repair or warn about.
 */
export function doseAmountsOf(schedule: Schedule, dose: number): number[] {
  const later = schedule.laterDoses ?? []
  return doseTimesOf(schedule).map((_, i) => {
    if (i === 0) return dose
    const own = later[i - 1]
    return typeof own === "number" && own > 0 ? own : dose
  })
}

/**
 * Every time this compound is due on a day it is due at all, slot order —
 * `doseTimesOf(s)[n]` is the time of slot `n`.
 *
 * Always at least one element, so a caller never has to special-case a
 * once-daily compound. That single element may be `""` (a deliberate "no time
 * set"); see {@link Schedule.timeOfDay}.
 */
export function doseTimesOf(schedule: Schedule): string[] {
  return [schedule.timeOfDay, ...(schedule.laterTimes ?? [])]
}

/** How many doses a day this compound is due — the device model's answer to
 *  `protocol_compounds.times_per_day`. Never below 1. */
export function timesPerDayOf(schedule: Schedule): number {
  return 1 + (schedule.laterTimes?.length ?? 0)
}

/** Whether a schedule / log time has actually been set. The field is optional, so
 *  a false here is a legitimate "no time chosen", not corrupt data. */
export function hasTime(time24: string | null | undefined): boolean {
  return typeof time24 === "string" && /^\d{1,2}:\d{2}$/.test(time24)
}

/* --------------------------------------------------- schedule versioning */

/**
 * One version of a compound's dose + schedule, effective from a given day.
 *
 * **An alteration applies from the chosen day FORWARD and never earlier**
 * (Spec 01 → Altering a dose or schedule). Editing used to mutate the single
 * schedule in place, so changing a cadence retroactively rewrote what had been
 * due on every past day — a Tuesday you correctly rested could become "missed"
 * because of a change you made in August. Versions make "what was due on date D"
 * answerable: find the version active on D.
 *
 * Nothing is back-filled or compensated. Raising a dose adds no catch-up dose for
 * the days before the change; it simply doesn't apply to them.
 */
export interface ScheduleVersion {
  /** Local "YYYY-MM-DD". This version governs days >= this, until the next one. */
  effectiveFrom: string
  cadence: Cadence
  timeOfDay: string
  /**
   * The day's SECOND and later dose times under this version (Spec w2b-13,
   * Step 5). Absent = once a day.
   *
   * It rides the version for the same reason the cycle does, and the failure it
   * prevents is specific: a SLOT is an index into `dose_times`, so resolving an
   * old log against TODAY's times would relabel history — reorder your times, or
   * drop from 3x to 2x daily, and a dose logged at 20:00 starts displaying as
   * 14:00.
   */
  laterTimes?: string[]
  /** The per-slot amounts in force under this version, parallel to
   *  {@link laterTimes}. Rides the version for the same reason the times do:
   *  raising the evening dose today must not restate the evening doses already
   *  taken last month. */
  laterDoses?: (number | null)[]
  dose: number
  unit: string
  /**
   * This version records a STOP, not a rule: the compound was deleted on this day
   * and dosed nothing until the next version resumes it (Spec 02 → the gap).
   *
   * Without it, deleting and later re-adding a compound left the days in between
   * covered by the rule that was in force before the delete, so a break the user
   * deliberately took read as a run of missed doses. The cadence values are still
   * carried so the row round-trips, but nothing reads them while `stopped`.
   */
  stopped?: boolean
  /**
   * The on/off cycle in force under this version, if any (Spec 06 · part two).
   *
   * The cycle rides the VERSION rather than the compound so a mid-cycle edit is
   * the same "effective from today forward" write every other alteration is —
   * past on- and off-periods keep the rule they were actually run under, with no
   * rewriting and no back-fill. Absent = no cycle, i.e. always on.
   */
  cycle?: CycleRule
}

/** The dose + schedule that were in force on `dateKey`. */
export interface ResolvedSchedule {
  schedule: Schedule
  dose: number
  unit: string
  /** True when the compound was deleted on this date and not yet re-added. */
  stopped: boolean
  /** The cycle governing this date, or undefined when the compound has none. */
  cycle?: CycleRule
}

/**
 * What this compound's rule ACTUALLY was on `dateKey`.
 *
 * With no version history (every compound until one is edited) this returns the
 * compound's current values unchanged — so behaviour is identical to before
 * versioning existed, and the feature costs nothing until it's used.
 */
export function resolveScheduleOn(
  c: StackCompound,
  dateKey: string
): ResolvedSchedule {
  const current: ResolvedSchedule = {
    schedule: c.schedule,
    dose: c.dose,
    unit: c.unit,
    stopped: false,
    cycle: c.cycle,
  }
  const versions = c.scheduleHistory
  if (!versions || versions.length === 0) return current

  const sorted = [...versions].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom)
  )
  /**
   * The run's REAL beginning: the earliest recorded version, which
   * `recordScheduleVersion` seeds from the compound's start date at the first
   * edit. The compound's CURRENT `startDate` can be later than that — re-adding a
   * deleted compound sets a new one, and an edit can move it forward — and
   * `isDueOn` hard-gates on whatever start it is given. Handing it the current
   * start would drop every day of the original run out of "due", quietly removing
   * a completed run from consistency. Using the earliest version keeps the gate
   * AND the cadence phase (`isDueOn` anchors every-N-day maths on this date), so
   * neither shifts under a re-add.
   */
  const origin = sorted[0].effectiveFrom
  const startDate =
    origin < c.schedule.startDate ? origin : c.schedule.startDate

  // The version in force on this day: the latest one that had taken effect. A day
  // that predates every version falls back to the earliest, because that is the
  // oldest rule we know of — never the current one, which is exactly the
  // retroactive rewrite versioning exists to stop.
  let best: ScheduleVersion | null = null
  for (const v of sorted) {
    if (v.effectiveFrom > dateKey) continue
    if (!best || v.effectiveFrom > best.effectiveFrom) best = v
  }
  const version = best ?? sorted[0]

  return {
    schedule: {
      cadence: version.cadence,
      timeOfDay: version.timeOfDay,
      ...(version.laterTimes && version.laterTimes.length > 0
        ? { laterTimes: version.laterTimes }
        : {}),
      ...(version.laterDoses && version.laterDoses.some((d) => d != null)
        ? { laterDoses: version.laterDoses }
        : {}),
      startDate,
    },
    dose: version.dose,
    unit: version.unit,
    stopped: version.stopped === true,
    cycle: version.cycle,
  }
}

/**
 * Whether the compound was due on a date, judged by the rule in force THEN.
 *
 * Three gates, in order: the compound was being run at all, its cycle was in an
 * ON period, and its schedule put a dose on that day. The cycle sits ABOVE the
 * schedule — it never changes which days the cadence picks, only whether the
 * compound is being run at all — so an off-period day is not a rest day within a
 * schedule and cannot be missed.
 */
export function isDueOnFor(
  c: StackCompound,
  date: Date,
  ctx?: CycleContext
): boolean {
  const dateKey = toDateKeyLocal(date)
  const resolved = resolveScheduleOn(c, dateKey)
  // A stopped stretch is not a rest day within a schedule — the compound wasn't
  // being run at all, so nothing was due and nothing can be missed.
  if (resolved.stopped) return false
  // PAUSED. Nothing was due, so the day reads as `none` rather than `missed` —
  // which is exactly why backdating a pause needs no backfill: the days
  // reclassify themselves at the next render. Sits ABOVE the cycle check
  // because the cycle arithmetic below needs to know the day was paused.
  if (isPausedOn(c.pauses, dateKey)) return false
  // Off-cycle means the user is not taking it: there is nothing to track, and
  // nothing to miss.
  if (!isOnCycle(resolved.cycle, dateKey, pauseContext(c, resolved.cycle, dateKey, ctx))) {
    return false
  }
  // The cadence RE-ANCHORS to the day the last pause ended, so an
  // every-third-day compound is due on the day it comes back rather than on
  // whatever day the untouched grid would have picked. See
  // `effectiveCadenceStart` for the trade this accepts.
  return isDueOn(withCadenceStart(resolved.schedule, c.pauses, dateKey), date)
}

/**
 * The schedule with its cadence anchor moved to the last resume day, when there
 * has been one. Returns the schedule UNCHANGED when there are no pauses, so a
 * compound that has never been paused allocates nothing and behaves identically.
 */
function withCadenceStart(
  schedule: Schedule,
  pauses: readonly Pause[] | undefined,
  dateKey: string
): Schedule {
  if (!pauses || pauses.length === 0) return schedule
  const startDate = effectiveCadenceStart(schedule.startDate, pauses, dateKey)
  return startDate === schedule.startDate ? schedule : { ...schedule, startDate }
}

/**
 * The cycle context for this compound on this day, with its paused days counted.
 *
 * Kept here rather than inside `cycleStatusOn` because that function is shared
 * with surfaces that have no compound in hand, and because THIS is the layer
 * that knows where the pauses live. Both counts are half-open — see
 * `pausedDaysBetween` for why counting the day itself would take one day too
 * many off every cycle.
 *
 * Cheap on the common path: a compound with no pauses and no cycle returns the
 * caller's own context untouched, so `isDueOnFor` costs exactly what it did
 * before pauses existed.
 */
export function pauseContext(
  c: StackCompound,
  cycle: CycleRule | undefined,
  dateKey: string,
  base?: CycleContext
): CycleContext | undefined {
  if (!c.pauses || c.pauses.length === 0 || !cycle) return base
  const pausedDays = pausedDaysBetween(c.pauses, cycle.anchor, dateKey)
  const pausedBeforeEnd =
    cycle.end.type === "onDate"
      ? pausedDaysBetween(c.pauses, cycle.anchor, cycle.end.date)
      : 0
  return { ...base, pausedDays, pausedBeforeEnd }
}

/**
 * Record an alteration effective from `effectiveFrom`, returning the new version
 * list. The compound's own `schedule`/`dose`/`unit` still carry the CURRENT rule
 * (forward-looking UI is unchanged); this is the trail behind it.
 *
 * Seeds a baseline from the OUTGOING values the first time a compound is edited —
 * without it the days before the change would have no recorded rule and would
 * fall through to the new one, which is the exact retroactive rewrite being
 * fixed. Re-editing on the same day replaces that day's version rather than
 * stacking duplicates.
 */
export function recordScheduleVersion(
  previous: StackCompound,
  next: {
    cadence: Cadence
    timeOfDay: string
    laterTimes?: string[]
    laterDoses?: (number | null)[]
    dose: number
    unit: string
    stopped?: boolean
    cycle?: CycleRule
  },
  effectiveFrom: string
): ScheduleVersion[] {
  const history = [...(previous.scheduleHistory ?? [])]
  if (history.length === 0) {
    history.push({
      effectiveFrom: previous.schedule.startDate,
      cadence: previous.schedule.cadence,
      timeOfDay: previous.schedule.timeOfDay,
      ...(previous.schedule.laterTimes && previous.schedule.laterTimes.length > 0
        ? { laterTimes: previous.schedule.laterTimes }
        : {}),
      ...(previous.schedule.laterDoses && previous.schedule.laterDoses.some((d) => d != null)
        ? { laterDoses: previous.schedule.laterDoses }
        : {}),
      dose: previous.dose,
      unit: previous.unit,
      // The baseline carries the OUTGOING cycle too, so the stretch before a
      // cycle edit keeps the pattern it was actually run under.
      ...(previous.cycle ? { cycle: previous.cycle } : {}),
    })
  }
  const version: ScheduleVersion = { effectiveFrom, ...next }
  // EVERY LATER VERSION IS SUPERSEDED. "Effective from D" means this is the rule
  // from D forward, so anything already recorded after D is a rule the user has
  // just replaced.
  //
  // Without this, a version with a LATER `effectiveFrom` survived and silently
  // took over on its own date, forever, while every card kept showing the new
  // rule — the compound's own dose and schedule said one thing and
  // `resolveScheduleOn` answered another. Two taps reached it: add a compound
  // starting next week, delete it today (the stop clamps to today, so the
  // future-dated baseline sorts AFTER it), re-add it. From next week onward the
  // abandoned baseline governed. Editing while parked on a future day, or
  // back-dating a second edit, both did the same thing.
  //
  // This also subsumes what a `resume` flag used to do by hand: a re-add
  // effective from D drops the delete's stop marker if it fell after D, and
  // keeps one that fell before D, because that older stop still correctly
  // describes the gap between the two runs.
  const kept = history.filter((v) => v.effectiveFrom <= effectiveFrom)
  const at = kept.findIndex((v) => v.effectiveFrom === effectiveFrom)
  if (at >= 0) kept[at] = version
  else kept.push(version)
  return kept.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
}

/**
 * Record that the compound STOPPED on `effectiveFrom` — what Delete writes
 * (Spec 02 → the gap). Everything from that day until a later version resumes it
 * is not dosed, so those days are neither due nor missed.
 *
 * Carries the outgoing cadence values so the version round-trips through storage
 * unchanged; nothing reads them while `stopped` is set. Deleting a compound that
 * has never been edited seeds the baseline first, exactly like an alteration, so
 * the run BEFORE the delete keeps the rule it was actually run under.
 */
export function recordScheduleStop(
  previous: StackCompound,
  effectiveFrom: string
): ScheduleVersion[] {
  return recordScheduleVersion(
    previous,
    {
      cadence: previous.schedule.cadence,
      timeOfDay: previous.schedule.timeOfDay,
      ...(previous.schedule.laterTimes && previous.schedule.laterTimes.length > 0
        ? { laterTimes: previous.schedule.laterTimes }
        : {}),
      ...(previous.schedule.laterDoses && previous.schedule.laterDoses.some((d) => d != null)
        ? { laterDoses: previous.schedule.laterDoses }
        : {}),
      dose: previous.dose,
      unit: previous.unit,
      stopped: true,
    },
    effectiveFrom
  )
}

/** A version in the shape `protocol_compound_schedules` stores (ISO weekdays,
 *  `HH:mm:ss`), so the local↔Postgres mapping lives in ONE place. */
export function scheduleVersionToRow(v: ScheduleVersion) {
  const cad = v.cadence
  return {
    effectiveFrom: v.effectiveFrom,
    dose: v.dose,
    // The SAME coercion `protocol_compounds` rows get, so a version row can't
    // disagree with the compound it belongs to. A hand-rolled mcg/iu-or-mg check
    // here silently rewrote every tablet, capsule, mL and gram dose as mg.
    unit: coerceDoseUnit(v.unit),
    scheduleType:
      cad.type === "daysOfWeek"
        ? "specific_days"
        : cad.type === "daily"
          ? "every_day"
          : "every_n_days",
    // Local 0=Sun..6=Sat → ISO Mon=1..Sun=7, matching protocol_compounds.
    daysOfWeek:
      cad.type === "daysOfWeek" ? cad.days.map((d) => (d === 0 ? 7 : d)) : null,
    // Clamped exactly as `cadenceToSchedule` clamps the compound's own row. Raw
    // here meant a malformed local `n` (0, a negative, a fraction) failed the
    // column's `interval_days >= 1` CHECK and took the whole version write with
    // it — so the two paths disagreed about the same cadence, and the one that
    // records HISTORY was the one that broke.
    intervalDays:
      cad.type === "everyOtherDay"
        ? 2
        : cad.type === "everyNDays"
          ? Math.max(1, Math.floor(cad.n))
          : null,
    time: hasTime(v.timeOfDay) ? `${v.timeOfDay}:00` : null,
    // Slots 1..n, for `dose_times`. Slot 0 stays in `time` above, so a
    // once-daily version writes exactly what it always did.
    //
    // MAPPED, NOT FILTERED. Position IS the slot, and `laterDoses` below is not
    // compacted — dropping an unset time here shifted every later dose onto the
    // wrong slot's amount. An unset slot writes NULL and holds its place, the
    // same thing `stackCompoundToProtocolInsert` does.
    laterTimes: (v.laterTimes ?? []).map((t) => (hasTime(t) ? `${t}:00` : null)),
    // Per-slot amounts for slots 1..n. Position IS the slot, so nulls are kept
    // in place rather than compacted.
    laterDoses: v.laterDoses ?? null,
    stopped: v.stopped === true,
    // The cycle in force under THIS version. Without it a Postgres round-trip
    // (a PWA reinstall, say) returns the trail with every cycle stripped, so a
    // past off-period resolves as always-on and a break the user chose to take
    // reads back as a run of missed doses — the exact retroactive rewrite
    // versioning exists to prevent.
    ...cycleRuleToColumns(v.cycle),
  }
}

/** The inverse — a stored version row back into the local shape. */
export function scheduleVersionFromRow(
  r: {
    effectiveFrom: string
    dose: number
    unit: string
    scheduleType: string
    daysOfWeek: number[] | null
    intervalDays: number | null
    time: string | null
    /** Slots 1..n, `HH:mm:ss`. A NULL element is an unset time holding its
     *  slot's place — position IS the slot. Optional so a pre-Step-5 row
     *  round-trips. */
    laterTimes?: (string | null)[] | null
    laterDoses?: (number | null)[] | null
    stopped?: boolean | null
  } & Partial<CycleColumns>
): ScheduleVersion {
  let cadence: Cadence = { type: "daily" }
  if (r.scheduleType === "specific_days") {
    cadence = {
      type: "daysOfWeek",
      days: (r.daysOfWeek ?? []).map((d) => (d === 7 ? 0 : d)),
    }
  } else if (r.scheduleType === "every_n_days") {
    cadence =
      r.intervalDays === 2
        ? { type: "everyOtherDay" }
        : { type: "everyNDays", n: r.intervalDays ?? 1 }
  }
  const cycle = cycleRuleFromColumns(r)
  return {
    effectiveFrom: r.effectiveFrom,
    cadence,
    timeOfDay: r.time ? r.time.slice(0, 5) : "",
    ...(() => {
      const later = (r.laterTimes ?? []).map((t) => (t ? t.slice(0, 5) : ""))
      return later.length > 0 ? { laterTimes: later } : {}
    })(),
    ...(() => {
      const doses = (r.laterDoses ?? []).map((d) =>
        typeof d === "number" && d > 0 ? d : null,
      )
      return doses.some((d) => d != null) ? { laterDoses: doses } : {}
    })(),
    dose: r.dose,
    unit: r.unit,
    ...(r.stopped ? { stopped: true } : {}),
    ...(cycle ? { cycle } : {}),
  }
}

/** Display label for a method (e.g. for the locked method on the add sheet). */
export function methodLabel(method: InjectionMethod): string {
  switch (method) {
    case "im":
      return "IM"
    case "subq":
      return "SubQ"
    case "po":
      return "Oral"
    case "nasal":
      return "Nasal"
  }
}

/** True for the two injectable methods that rotate through sites. */
export function isInjectable(method: InjectionMethod): boolean {
  return method === "im" || method === "subq"
}

/**
 * Which route the injection-site views should open on, by counting the
 * injectable compounds in the stack: run mostly Sub-Q and you land on Sub-Q.
 * Counted per compound, NOT per dose — one daily Sub-Q peptide does not
 * outvote two weekly IM compounds. IM wins a tie and an all-oral / empty
 * stack, matching the map's pre-protocol default.
 *
 * Callers pass the ACTIVE stack; archived compounds are no longer dosed and
 * must not sway the default.
 */
export function majorityInjectionRoute(
  stack: StackCompound[],
): Extract<InjectionMethod, "im" | "subq"> {
  let im = 0
  let subq = 0
  for (const c of stack) {
    if (c.archived) continue
    if (c.method === "im") im++
    else if (c.method === "subq") subq++
  }
  return subq > im ? "subq" : "im"
}

/**
 * One compound in the user's active protocol.
 *  - `rotationSites` — ordered ticked site ids; **the order IS the cycle order**.
 *    Empty for oral compounds.
 *  - `rotationIndex` — internal pointer to the NEXT site. 0 for oral. Advanced
 *    only by logging a dose (never by date).
 */
export interface StackCompound {
  id: string
  name: string
  /** Drives the legend dot already used across the app. */
  category: CompoundCategory
  method: InjectionMethod
  dose: number
  unit: string
  schedule: Schedule
  rotationSites: string[]
  rotationIndex: number
  /** Archived = no longer dosed (hidden from present/future) but history kept.
   *  Reversible. Absent/false = active. */
  archived?: boolean
  /** Past + current dose/schedule versions, each effective from a day (see
   *  {@link ScheduleVersion}). Absent/empty on a compound never edited, in which
   *  case the fields above ARE the whole history. */
  scheduleHistory?: ScheduleVersion[]
  /** The compound's CURRENT on/off cycle (Spec 06 · part two), or absent when it
   *  runs uncycled. Forward-looking UI reads this; {@link resolveScheduleOn}
   *  answers what the cycle was on any past day. One cycle, one compound. */
  cycle?: CycleRule
  /**
   * The form this compound is held in — `reconstituted | preconcentrated |
   * oral_solid | bulk_powder` — as the user stated it, mirroring
   * `protocol_compounds.inventory_form` (`supabase/protocol/023`).
   *
   * Absent on every compound added before that migration, and on every one the
   * user never answered for. Absent does NOT mean unknown: `containerFormFor`
   * falls back to deriving it from name + route exactly as it always has. The
   * column exists because that derivation cannot see a scooped powder — creatine
   * is `po`, which derives `oral_solid` for tubs and capsules alike.
   */
  inventoryForm?: InventoryType | null
  /**
   * Stretches during which this compound is not being taken (Spec w2b-13,
   * Step 6 · `supabase/protocol/018`). Absent/empty = never paused.
   *
   * An INTERVAL list, not a "paused" flag: a compound is paused many times over
   * its life, and a flag would make each new pause retroactively convert the
   * previous one's days back into missed ones.
   */
  pauses?: Pause[]
}

// `v2` bump: abandons any earlier-seeded device data so the app starts as a
// clean blank template (no demo compounds) for everyone.
const storageKey = (userId: string) => `trackd.stack.v2.${userId}`

/* ----------------------------------------------------------------- storage */

/**
 * Load the saved stack for this user, or `null` when nothing is stored, storage
 * is unavailable, or the value is unusable — callers fall back to the seed.
 * Every record is normalised so a corrupt / hand-edited entry can't crash the
 * Home screen (mirrors `loadCustoms` in the Add-to-Stack menu).
 */
export function loadStack(userId: string): StackCompound[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const out: StackCompound[] = []
    for (const item of parsed) {
      const c = normalizeCompound(item)
      if (c) out.push(c)
    }
    return out.length > 0 ? out : null
  } catch {
    return null
  }
}

/** Save the stack. Returns false if the write failed (quota full / disabled). */
export function saveStack(userId: string, stack: StackCompound[]): boolean {
  if (typeof window === "undefined") return false
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(stack))
    return true
  } catch {
    return false
  }
}

/** Add a new compound, or replace the existing one with the same id. Persists +
 *  notifies. Returns false if the write failed. */
export function upsertStack(userId: string, compound: StackCompound): boolean {
  const cur = loadStack(userId) ?? []
  const exists = cur.some((c) => c.id === compound.id)
  const next = exists
    ? cur.map((c) => (c.id === compound.id ? compound : c))
    : [...cur, compound]
  const ok = saveStack(userId, next)
  if (ok) {
    notifyStackChanged()
    // Catalogue compounds are canonical in Postgres; the jsonb mirror is now a
    // CUSTOMS-ONLY backup (writing catalogue copies there was the reinstall
    // resurrection source) — the mirror is the custom's durable metadata store.
    // Both kinds ALSO get a protocol_compounds row now (supabase/protocol/004):
    // a custom is stored as compound_id NULL + custom_name, so it can carry vials
    // + stock runway exactly like a catalogue compound.
    if (isCustomName(compound.name)) void pushStackCompound(compound)
    void trackSync(pushProtocolCompound(compound)) // Postgres (custom or catalogue)
    // Schedule versions (Spec 01). Skipped silently until supabase/protocol/005 is
    // applied — the device store keeps them meanwhile, so no intent is lost.
    if (compound.scheduleHistory?.length) {
      void trackSync(
        pushScheduleVersions(
          compound.id,
          compound.name,
          compound.scheduleHistory.map(scheduleVersionToRow)
        )
      )
    }
  }
  return ok
}

/**
 * Set a compound's deleted flag. `archived: true` IS the app's Delete (Spec 02 —
 * two states, active or deleted): future doses stop, every logged dose is kept.
 * The `false` direction is not a user action any more — re-adding a deleted
 * compound goes through the normal add, which rewrites the record active.
 */
export function archiveInStack(
  userId: string,
  id: string,
  archived: boolean,
  /** The day the delete takes effect. Defaults to today; the caller passes the
   *  selected day where a screen owns one, so deleting while parked on another
   *  day stops it there rather than here. */
  effectiveFrom?: string
): boolean {
  const cur = loadStack(userId) ?? []
  const updated = cur.find((c) => c.id === id)
  // Deleting RECORDS THE STOP (Spec 02 → the gap): without it, re-adding later
  // leaves the days in between governed by the rule in force before the delete,
  // so a break the user chose to take reads back as missed doses.
  // ALWAYS TODAY. Deleting while parked on a past day used to stamp the stop on
  // THAT day, which retroactively erased the run between it and now: weeks the
  // user actually ran, and logged, turned into days on which nothing had been
  // due. A FUTURE selected day was briefly honoured as a "scheduled stop", but
  // that was incoherent — `archived` is written immediately, so the compound
  // vanished from the app now while its trail said it was still running, and
  // every day in between read back as due-and-unlogged, i.e. missed.
  //
  // Delete means now. `effectiveFrom` is kept in the signature for callers that
  // pass the selected day, and deliberately ignored.
  void effectiveFrom
  const stopFrom = toDateKeyLocal(new Date())
  const history =
    archived && updated ? recordScheduleStop(updated, stopFrom) : null
  const ok = saveStack(
    userId,
    cur.map((c) =>
      c.id === id
        ? { ...c, archived, ...(history ? { scheduleHistory: history } : {}) }
        : c
    )
  )
  if (ok) {
    notifyStackChanged()
    // Custom archive state lives in the mirror (no Postgres row); catalogue archive
    // state lives in Postgres (is_active), so only customs write to the mirror.
    if (updated && isCustomName(updated.name)) void pushStackCompound({ ...updated, archived })
    if (history) {
      // Same skipped-until-005 treatment as an alteration's versions.
      void trackSync(
        pushScheduleVersions(id, updated?.name ?? null, history.map(scheduleVersionToRow))
      )
    }
    // The NAME is passed so the server can RESOLVE the row rather than derive its
    // id from this one: the two diverge, and a derived id that matches nothing
    // used to make this a silent no-op — leaving Postgres holding the compound as
    // active, ready for the next hydration to bring it back (see protocolSync's
    // `findProtocolCompoundId`).
    void trackCriticalSync(archiveProtocolCompound(id, updated?.name ?? null, archived))
    // A deleted compound leaves its stack, but the STACK SURVIVES with one fewer
    // member and every logged dose is untouched (Spec 05). Done here rather than
    // at each call site so no delete path can forget it.
    if (archived) dropMember(userId, id)
  }
  return ok
}

/**
 * Set (or clear) a compound's cycle — **the single write path both entry points
 * use** (Spec 06 · part two). Protocol → Cycles and the add-compound form both
 * call this; there is deliberately not a second implementation.
 *
 * The cycle is recorded as a schedule VERSION effective from `effectiveFrom`
 * (today, unless a screen owns a selected day), reusing the effective-from
 * machinery from Spec 01 rather than reimplementing it. So a mid-cycle change
 * takes effect from that day forward and never rewrites a past on- or
 * off-period — the same rule as altering a dose, and nothing is back-filled.
 *
 * Pass `cycle: null` to take the compound off cycles entirely; it then runs on
 * its schedule alone from that day forward, with past periods untouched.
 */
export function setCompoundCycle(
  userId: string,
  id: string,
  cycle: CycleRule | null,
  effectiveFrom?: string
): boolean {
  const cur = loadStack(userId) ?? []
  const previous = cur.find((c) => c.id === id)
  if (!previous) return false

  const from = effectiveFrom ?? toDateKeyLocal(new Date())
  const scheduleHistory = recordScheduleVersion(
    previous,
    {
      cadence: previous.schedule.cadence,
      timeOfDay: previous.schedule.timeOfDay,
      // ⚠️ The later doses ride this version too. Omitting them wrote a version
      // saying the compound is dosed ONCE a day, so from the cycle's effective
      // date forward its evening dose lost its time, took the morning dose's
      // amount, and could not be logged at all.
      ...(previous.schedule.laterTimes && previous.schedule.laterTimes.length > 0
        ? { laterTimes: previous.schedule.laterTimes }
        : {}),
      ...(previous.schedule.laterDoses && previous.schedule.laterDoses.some((d) => d != null)
        ? { laterDoses: previous.schedule.laterDoses }
        : {}),
      dose: previous.dose,
      unit: previous.unit,
      ...(cycle ? { cycle } : {}),
    },
    from
  )

  const next: StackCompound = {
    ...previous,
    scheduleHistory,
    ...(cycle ? { cycle } : {}),
  }
  // A cleared cycle must be genuinely absent, not an undefined key that
  // `JSON.stringify` would drop inconsistently.
  if (!cycle) delete next.cycle

  return upsertStack(userId, next)
}

/* ------------------------------------------------------------------ pauses */

/**
 * Pause a compound from `startedOn` until `endsOn` (inclusive), or indefinitely
 * when `endsOn` is null.
 *
 * **Pausing something already paused EDITS that pause; it is never additive.**
 * A new pause whose range overlaps an existing one extends that row rather than
 * inserting a second, because two overlapping pauses would double-count in the
 * cycle arithmetic — ten days of rest would take twenty days off the clock.
 *
 * Backdating costs nothing: nothing derived from a pause is stored, so days
 * already showing as missed simply stop resolving that way at the next render.
 */
export function pauseCompound(
  userId: string,
  id: string,
  pause: { id: string; startedOn: string; endsOn: string | null; groupId?: string | null }
): boolean {
  const cur = loadStack(userId) ?? []
  const previous = cur.find((c) => c.id === id)
  if (!previous) return false

  const existing = previous.pauses ?? []
  // Anything this new range touches is absorbed rather than left beside it.
  // Adjacency counts as overlap: a pause ending Tuesday and one starting
  // Wednesday are one unbroken break, and leaving them as two rows would make
  // "resume" ambiguous.
  const overlapping = existing.filter((p) => rangesTouch(p, pause))
  const kept = existing.filter((p) => !rangesTouch(p, pause))
  const merged =
    overlapping.length === 0
      ? pause
      : {
          // Keep the OLDEST row's id, so the extension updates a row that
          // already exists instead of orphaning it and inserting a new one.
          id: overlapping[0].id,
          startedOn: [pause.startedOn, ...overlapping.map((p) => p.startedOn)].sort()[0],
          endsOn: latestEnd([pause, ...overlapping]),
          ...(pause.groupId ? { groupId: pause.groupId } : {}),
        }

  const next: StackCompound = { ...previous, pauses: [...kept, merged] }
  if (!upsertStack(userId, next)) return false
  void trackSync(pushCompoundPause(id, previous.name, merged))
  // The rows this one ABSORBED are gone locally; they must go from Postgres too.
  // Leaving them there meant the next hydration pulled a pause the user had
  // merged away and the compound went quiet again on days it had been resumed.
  // CRITICAL for the same reason a resume is: losing the race with a pull
  // reinstates something the user deliberately removed.
  for (const p of overlapping) {
    if (p.id === merged.id) continue
    void trackCriticalSync(pushPauseDelete(p.id))
  }
  return true
}

/** Do these two ranges overlap or sit end to end? An indefinite pause has no
 *  end, so it touches anything at or after its start. */
function rangesTouch(
  a: { startedOn: string; endsOn: string | null },
  b: { startedOn: string; endsOn: string | null }
): boolean {
  const aEnd = a.endsOn === null ? null : shiftKey(a.endsOn, 1)
  const bEnd = b.endsOn === null ? null : shiftKey(b.endsOn, 1)
  if (aEnd !== null && aEnd < b.startedOn) return false
  if (bEnd !== null && bEnd < a.startedOn) return false
  return true
}

/** The latest end among these ranges — null (indefinite) wins over any date. */
function latestEnd(rs: { endsOn: string | null }[]): string | null {
  if (rs.some((r) => r.endsOn === null)) return null
  return rs.map((r) => r.endsOn as string).sort().at(-1) ?? null
}

/** `YYYY-MM-DD` shifted by n days, in UTC so no local offset applies. */
function shiftKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/**
 * Resume a paused compound from `on` — so `on` itself is due again.
 *
 * Writes `endsOn = the day before`, because both ends of a pause are inclusive.
 * A pause that had not started yet is DELETED rather than ended: ending it would
 * leave a zero-length break the user never took.
 *
 * CRITICAL sync, not ordinary. A resume is a delete in effect, and an ordinary
 * push that loses its race with a pull would have the pause reinstated — the
 * compound would silently go quiet again after the user had brought it back.
 */
export function resumeCompound(userId: string, id: string, on: string): boolean {
  const cur = loadStack(userId) ?? []
  const previous = cur.find((c) => c.id === id)
  if (!previous) return false
  const active = activePause(previous.pauses, on)
  if (!active) return false

  const endsOn = dayBefore(on)
  const dropped = endsOn < active.startedOn
  const pauses = dropped
    ? (previous.pauses ?? []).filter((p) => p.id !== active.id)
    : (previous.pauses ?? []).map((p) => (p.id === active.id ? { ...p, endsOn } : p))

  if (!upsertStack(userId, { ...previous, pauses })) return false
  void trackCriticalSync(
    dropped ? pushPauseDelete(active.id) : pushPauseEnd(active.id, endsOn)
  )
  return true
}

/**
 * Pause several compounds as ONE action, sharing a fresh group id.
 *
 * **A stack pause is N compound pauses, not a pause on the stack.**
 * `stack_members` holds a pairing and an integer and nothing else, deliberately
 * (`supabase/protocol/007_stacks.sql:9-17`); a stack has nowhere to store a
 * pause and should not gain one.
 *
 * The group id is what lets Resume restore only what THIS action paused. A
 * member the user had already paused separately carries no group id, so it stays
 * paused when the stack resumes — which is the behaviour that makes ticking
 * members off the list meaningful in the first place.
 */
export function pauseCompounds(
  userId: string,
  ids: string[],
  range: { startedOn: string; endsOn: string | null },
  groupId: string,
  newPauseId: () => string
): boolean {
  let allOk = ids.length > 0
  for (const id of ids) {
    const ok = pauseCompound(userId, id, {
      id: newPauseId(),
      startedOn: range.startedOn,
      endsOn: range.endsOn,
      groupId,
    })
    if (!ok) allOk = false
  }
  return allOk
}

/**
 * Resume every compound paused by one group action, on `on`.
 *
 * Resolves the group from the device store rather than taking a list, so it
 * cannot resume a member that action never paused. The single cloud write ends
 * the whole group in one statement; the local writes are per compound because
 * that is where the pauses live.
 */
export function resumePauseGroup(
  userId: string,
  groupId: string,
  on: string
): boolean {
  const cur = loadStack(userId) ?? []
  const endsOn = dayBefore(on)
  let touched = false
  for (const c of cur) {
    const mine = (c.pauses ?? []).filter((p) => p.groupId === groupId)
    if (mine.length === 0) continue
    const pauses = (c.pauses ?? []).flatMap((p) => {
      if (p.groupId !== groupId) return [p]
      // ALREADY OVER — leave it exactly as it is. Rewriting `endsOn` on a pause
      // that ended weeks ago EXTENDED it to today, so the days the user actually
      // ran and logged in between retroactively became not-due and left the
      // calendar and their adherence. Reachable by resuming one member early and
      // the stack later.
      if (p.endsOn !== null && p.endsOn < on) return [p]
      // A pause that had not started yet is dropped, not ended — ending it
      // would leave a zero-length break the user never took.
      if (endsOn < p.startedOn) return []
      return [{ ...p, endsOn }]
    })
    if (upsertStack(userId, { ...c, pauses })) touched = true
  }
  if (!touched) return false
  // CRITICAL: a resume is a delete in effect, and losing the race with a pull
  // would silently re-pause everything the user just brought back.
  void trackCriticalSync(pushPauseGroupEnd(groupId, endsOn))
  return true
}

/**
 * Has this compound's cycle finished by `dateKey`? **Derived, never stored**
 * (Invariant 1) — an end condition is a rule, and asking it on a date is the
 * only honest way to answer, since no background job exists to flip a flag the
 * moment a date passes or a vial empties.
 *
 * An ended compound stops producing doses but keeps every logged dose, and is
 * offered back in the picker with a normal plus — exactly like a deleted
 * compound (Spec 02), which is the consistency Spec 06 asks for.
 */
export function isCycleEnded(
  c: StackCompound,
  dateKey: string,
  ctx?: CycleContext
): boolean {
  const resolved = resolveScheduleOn(c, dateKey)
  if (!resolved.cycle) return false
  // WITH the pause context. This was the one gate in the file that did not have
  // it, so a paused run reported ENDED on the tail the pause had just pushed
  // out — the compound vanished from Today's Log and was offered back as a fresh
  // add, while the calendar and consistency still counted it as due.
  return cycleStatusOn(
    resolved.cycle,
    dateKey,
    pauseContext(c, resolved.cycle, dateKey, ctx)
  ).ended
}

/** Active = not deleted and not finished. What the log and pickers filter on. */
export function isRunning(
  c: StackCompound,
  dateKey: string,
  ctx?: CycleContext
): boolean {
  return !c.archived && !isCycleEnded(c, dateKey, ctx)
}

// There is deliberately NO hard delete here (Spec 02): a compound has two states,
// active and deleted, and `archiveInStack` IS the delete — it stops future doses
// and keeps every logged dose. Erasing a compound and its history outright is not
// offered anywhere in the app, which is also Invariant 8 (archive, never
// hard-delete user history). Adding one back is a normal add onto the same record.

/**
 * A same-tab signal that the stack changed, so a sibling (the Home screen) can
 * re-read it without a full reload. `storage` events only fire across tabs, so
 * we dispatch our own.
 */
export const STACK_CHANGED_EVENT = "trackd:stack-changed"

export function notifyStackChanged() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(STACK_CHANGED_EVENT))
}

/* --------------------------------------- useSyncExternalStore integration */

/**
 * Subscribe to stack changes — same-tab (our custom event) and cross-tab (the
 * native `storage` event). Pairs with `getStackSnapshot` for `useSyncExternalStore`.
 */
export function subscribeStack(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(STACK_CHANGED_EVENT, callback)
  window.addEventListener("storage", callback)
  return () => {
    window.removeEventListener(STACK_CHANGED_EVENT, callback)
    window.removeEventListener("storage", callback)
  }
}

// `useSyncExternalStore` requires a STABLE snapshot reference between reads when
// nothing changed, or it loops. We cache by the raw stored string and only build
// a fresh array when that string (or the user) changes.
let snapshotCache: {
  userId: string
  raw: string | null
  value: StackCompound[]
} | null = null

/**
 * The current stack for `useSyncExternalStore`'s client snapshot: the stored
 * stack, or `fallback` (the seed) when nothing is stored. Returns the same
 * reference until the underlying storage actually changes.
 */
export function getStackSnapshot(
  userId: string,
  fallback: StackCompound[]
): StackCompound[] {
  if (typeof window === "undefined") return fallback
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(storageKey(userId))
  } catch {
    raw = null
  }
  if (snapshotCache && snapshotCache.userId === userId && snapshotCache.raw === raw) {
    return snapshotCache.value
  }
  const value = loadStack(userId) ?? fallback
  snapshotCache = { userId, raw, value }
  return value
}

/* ----------------------------------------------------------- rotation engine */

/** True for an injectable compound with at least one rotation site. */
export function hasRotation(c: StackCompound): boolean {
  return isInjectable(c.method) && c.rotationSites.length > 0
}

/** Keep the pointer in range after the sites array is edited. */
export function clampIndex(c: StackCompound): StackCompound {
  const len = c.rotationSites.length
  if (len === 0) return c.rotationIndex === 0 ? c : { ...c, rotationIndex: 0 }
  const idx = ((c.rotationIndex % len) + len) % len
  return idx === c.rotationIndex ? c : { ...c, rotationIndex: idx }
}

/** The site id the next dose should go into, or null when there's no rotation. */
export function nextSiteId(c: StackCompound): string | null {
  if (!hasRotation(c)) return null
  const len = c.rotationSites.length
  const idx = ((c.rotationIndex % len) + len) % len
  return c.rotationSites[idx] ?? null
}

/**
 * Advance the pointer to the slot AFTER the site actually logged (§3.7): find
 * the logged site in `rotationSites`, set index = (thatIndex + 1) % length.
 * Deterministic from the logged site, so editing a log re-derives correctly
 * (no double-advance). A site not in the list (or no rotation) leaves it as-is.
 */
export function advanceRotation(
  c: StackCompound,
  loggedSiteId: string | null
): StackCompound {
  if (!hasRotation(c) || !loggedSiteId) return c
  const i = c.rotationSites.indexOf(loggedSiteId)
  if (i < 0) return c
  const rotationIndex = (i + 1) % c.rotationSites.length
  return rotationIndex === c.rotationIndex ? c : { ...c, rotationIndex }
}

/* ------------------------------------------------- per-day site resolution */

/**
 * The site a compound resolves to on a given day: the site it was LOGGED at if
 * logged, otherwise its real next rotation site. **No auto-dodging** — this is
 * exactly what the rotation says, even if it clashes with another compound. The
 * app observes clashes and flags them; it never silently moves the user (per the
 * "tracking, not coaching" decision). Null for oral / nasal / no rotation.
 */
export function resolvedDaySite(
  c: StackCompound,
  loggedSiteId: string | null
): string | null {
  if (!hasRotation(c)) return null
  return loggedSiteId ?? nextSiteId(c)
}

/* ---------------------------------------------------------------- schedule */

/**
 * Whether a compound is due on a given local date. Nothing is due before the
 * start date; EOD / every-N-days count FROM the start date (so "every other day
 * from Tuesday" = Tue/Thu/Sat…). Deterministic and stable across renders.
 */
export function isDueOn(schedule: Schedule, date: Date): boolean {
  const start = parseDateKey(schedule.startDate)
  const dayN = daysSinceEpoch(date)
  if (start && dayN < daysSinceEpoch(start)) return false
  const anchor = start ? daysSinceEpoch(start) : 0
  const { cadence } = schedule
  switch (cadence.type) {
    case "daily":
      return true
    case "everyOtherDay":
      return mod(dayN - anchor, 2) === 0
    case "everyNDays":
      return cadence.n > 0 ? mod(dayN - anchor, cadence.n) === 0 : false
    case "daysOfWeek":
      return cadence.days.includes(date.getDay())
  }
}

/** The next `count` due dates on/after `from` (local), as "YYYY-MM-DD" keys. */
export function upcomingDoseDates(
  schedule: Schedule,
  from: Date,
  count: number,
  /** The cycle to respect, if any. Without it the preview would list dates that
   *  fall inside an off-period — days the user is deliberately not dosing. */
  cycle?: CycleRule | null,
  /** Pauses to skip over (Spec w2b-13, Step 6). Without them the "Next" line
   *  lists dates that fall INSIDE a pause — telling the user their next three
   *  doses are on days they have deliberately stopped taking it. */
  pauses?: readonly Pause[]
): string[] {
  const out: string[] = []
  const start = parseDateKey(schedule.startDate)
  let cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  if (start && cursor.getTime() < start.getTime()) {
    cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  }
  for (let i = 0; i < 400 && out.length < count; i++) {
    const key = toDateKeyLocal(cursor)
    const paused = isPausedOn(pauses, key)
    // Paused days are skipped AND do not advance the cycle clock, so the dates
    // after a pause are the ones the cycle will actually land on. `pausedBeforeEnd`
    // rides along too, or an `onDate` cycle's preview stops earlier than
    // `isDueOnFor` says it does.
    const cycleCtx =
      cycle && pauses && pauses.length > 0
        ? {
            pausedDays: pausedDaysBetween(pauses, cycle.anchor, key),
            pausedBeforeEnd:
              cycle.end.type === "onDate"
                ? pausedDaysBetween(pauses, cycle.anchor, cycle.end.date)
                : 0,
          }
        : undefined
    // ⚠️ THE RE-ANCHORED grid, the same one `isDueOnFor` walks. Walking the
    // original one made every date on the "Next" line disagree with the week
    // strip and the calendar for any compound that had ever been paused.
    const onDay = withCadenceStart(schedule, pauses, key)
    if (!paused && isDueOn(onDay, cursor) && isOnCycle(cycle, key, cycleCtx)) {
      out.push(key)
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
  }
  return out
}

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MON_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/** "2026-06-16" → "Tue 16 Jun". Falls back to the raw key if unparseable. */
export function formatDateKeyShort(key: string): string {
  const d = parseDateKey(key)
  if (!d) return key
  return `${DOW_SHORT[d.getDay()]} ${d.getDate()} ${MON_SHORT[d.getMonth()]}`
}

/** A short human label for a cadence, e.g. "Every other day", "Mon · Thu". */
/**
 * The soonest ACTIVE compound whose start date is still ahead of `dayKey`.
 *
 * A compound added with a future start is due on no day yet, so Today's Log read
 * "nothing scheduled" while the first-run onboarding card had already gone (it
 * is gated on an empty stack). The compound then appeared in exactly one place
 * in the whole app, and a new user's only reasonable reading was that the add
 * had failed. Naming it, and when it begins, is the fix.
 *
 * Ties break on name so the answer is stable rather than dependent on insert
 * order. Returns null when nothing is waiting.
 */
export function nextStartingCompound(
  stack: StackCompound[],
  dayKey: string
): { name: string; startDate: string } | null {
  const waiting = stack
    .filter((c) => !c.archived && c.schedule.startDate > dayKey)
    .sort(
      (a, b) =>
        a.schedule.startDate.localeCompare(b.schedule.startDate) ||
        a.name.localeCompare(b.name)
    )
  const first = waiting[0]
  return first ? { name: first.name, startDate: first.schedule.startDate } : null
}

export function cadenceLabel(cadence: Cadence): string {
  switch (cadence.type) {
    case "daily":
      return "Daily"
    case "everyOtherDay":
      return "Every other day"
    case "everyNDays":
      // n = 2 IS every other day, and Postgres stores both as
      // `interval_days = 2` and cannot tell them apart — so a compound entered
      // as "Every 2 days" came back from a hydration reading "Every other day".
      // Same rule, one wording, and the round trip stops being visible.
      return cadence.n === 2 ? "Every other day" : `Every ${cadence.n} days`
    case "daysOfWeek": {
      const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      const days = [...cadence.days].sort((a, b) => a - b)
      return days.length ? days.map((d) => names[d] ?? "").join(" · ") : "No days"
    }
  }
}

/**
 * Sanitise a typed dose: digits + a single decimal point, capped at 5 whole
 * digits and 3 decimal places (precise enough for peptide dosing, bounded so a
 * fat-fingered entry can't run away).
 */
export function sanitizeDoseInput(raw: string): string {
  let v = raw.replace(/[^0-9.]/g, "")
  const dot = v.indexOf(".")
  if (dot !== -1) {
    v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "")
  }
  const [int = "", dec] = v.split(".")
  const clampedInt = int.slice(0, 5)
  return v.includes(".") ? `${clampedInt}.${(dec ?? "").slice(0, 3)}` : clampedInt
}

/**
 * "07:30" → "7:30 AM". An UNSET time (`""`) reads "Not set" — the single place
 * the app words that state, so every surface says it identically. Falls back to
 * the raw string for anything else that isn't HH:mm.
 */
export function formatTimeLabel(time24: string): string {
  if (!time24) return "Not set"
  const m = /^(\d{1,2}):(\d{2})$/.exec(time24)
  if (!m) return time24
  let h = Number(m[1])
  const min = m[2]
  const period = h >= 12 ? "PM" : "AM"
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${min} ${period}`
}

/* ----------------------------------------------------------------- internal */

function mod(a: number, n: number): number {
  return ((a % n) + n) % n
}

/**
 * Whole days since the epoch for a date, counted in UTC.
 *
 * Dividing a LOCAL midnight by a UTC day length only holds where the offset never
 * crosses zero. In Europe/London 29 and 30 March 2026 collapse onto the SAME day
 * number and 26 October skips one, so an every-other-day protocol showed a 3-day
 * gap across the March transition, two consecutive due days across the October
 * one, and its phase permanently inverted after each. A compound could also read
 * as due the day BEFORE its own start date.
 *
 * `cycleRule.ts` already fixed this on the cycle layer and named the same zones;
 * the schedule layer underneath it was missed, so `isDueOnFor` had a UTC-correct
 * gate sitting on top of a drifting one. The date carries no meaningful
 * time-of-day here, so UTC is the right frame to count it in.
 */
function daysSinceEpoch(date: Date): number {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
  )
}

/** Parse a "YYYY-MM-DD" key to a local-midnight Date, or null if malformed. */
function parseDateKey(key: unknown): Date | null {
  if (typeof key !== "string") return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function toDateKeyLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

const METHODS: InjectionMethod[] = ["im", "subq", "po", "nasal"]

function normalizeCompound(item: unknown): StackCompound | null {
  if (!item || typeof item !== "object") return null
  const c = item as Record<string, unknown>
  if (typeof c.id !== "string" || typeof c.name !== "string") return null
  // Legacy "oral" route maps to the database's "po".
  const rawMethod = c.method === "oral" ? "po" : c.method
  const method = METHODS.includes(rawMethod as InjectionMethod)
    ? (rawMethod as InjectionMethod)
    : "po"
  const rotationSites = Array.isArray(c.rotationSites)
    ? c.rotationSites.filter((s): s is string => typeof s === "string")
    : []
  const rawIndex = typeof c.rotationIndex === "number" ? c.rotationIndex : 0
  const cycle = normalizeCycle(c.cycle)
  return clampIndex({
    id: c.id,
    name: c.name,
    category: (typeof c.category === "string"
      ? c.category
      : "anabolic") as CompoundCategory,
    method,
    dose: typeof c.dose === "number" ? c.dose : 0,
    unit: typeof c.unit === "string" ? c.unit : "mg",
    schedule: normalizeSchedule(c.schedule),
    rotationSites: isInjectable(method) ? rotationSites : [],
    rotationIndex: rawIndex,
    archived: c.archived === true,
    ...(normalizeHistory(c.scheduleHistory) ?? {}),
    ...(cycle ? { cycle } : {}),
    // Guarded on the way out of storage so a hand-edited or future-versioned
    // value can't reach `containerFormFor` — an unrecognised form falls through
    // to the name+route derivation, the same answer a compound with nothing
    // stored gets.
    ...(isInventoryForm(c.inventoryForm) ? { inventoryForm: c.inventoryForm } : {}),
    ...(() => {
      const pauses = Array.isArray(c.pauses)
        ? c.pauses.map(normalizePause).filter((p): p is Pause => p !== null)
        : []
      return pauses.length > 0 ? { pauses } : {}
    })(),
  })
}

/**
 * Harden a stored cycle. Anything malformed drops the cycle entirely rather than
 * half-applying it — a compound with no cycle is always on, which is the safe
 * failure (it shows doses) rather than silently hiding a compound from the log.
 */
function normalizeCycle(raw: unknown): CycleRule | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const c = raw as Record<string, unknown>
  if (typeof c.anchor !== "string" || parseDateKey(c.anchor) === null) return undefined

  const p = c.pattern as Record<string, unknown> | undefined
  let pattern: CyclePattern = { type: "continuous" }
  if (
    p?.type === "onOff" &&
    typeof p.onDays === "number" &&
    typeof p.offDays === "number" &&
    p.onDays > 0 &&
    p.offDays >= 0
  ) {
    pattern = {
      type: "onOff",
      onDays: Math.floor(p.onDays),
      offDays: Math.floor(p.offDays),
    }
  }

  const e = c.end as Record<string, unknown> | undefined
  let end: CycleEnd = { type: "never" }
  if (e?.type === "onDate" && typeof e.date === "string" && parseDateKey(e.date)) {
    end = { type: "onDate", date: e.date }
  } else if (
    e?.type === "afterRounds" &&
    typeof e.rounds === "number" &&
    e.rounds > 0 &&
    // A round needs an off-period to exist; without one this is meaningless.
    pattern.type === "onOff"
  ) {
    end = { type: "afterRounds", rounds: Math.floor(e.rounds) }
  } else if (e?.type === "whenVialEmpty") {
    end = { type: "whenVialEmpty" }
  }

  return {
    pattern,
    end,
    colour: isCycleColour(c.colour) ? c.colour : DEFAULT_CYCLE_COLOUR,
    anchor: c.anchor,
  }
}

/** Harden a stored version list; drops anything malformed rather than crashing. */
function normalizeHistory(raw: unknown): { scheduleHistory: ScheduleVersion[] } | null {
  if (!Array.isArray(raw)) return null
  const out: ScheduleVersion[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const v = item as Record<string, unknown>
    if (typeof v.effectiveFrom !== "string") continue
    const s = normalizeSchedule({
      cadence: v.cadence,
      timeOfDay: v.timeOfDay,
      laterTimes: v.laterTimes,
      laterDoses: v.laterDoses,
    })
    const cycle = normalizeCycle(v.cycle)
    out.push({
      effectiveFrom: v.effectiveFrom,
      cadence: s.cadence,
      timeOfDay: s.timeOfDay,
      // Slot times ride the version: without them a Postgres round-trip
      // resolves every historic slot against TODAY's times and relabels the
      // history. See `ScheduleVersion.laterTimes`.
      ...(s.laterTimes && s.laterTimes.length > 0 ? { laterTimes: s.laterTimes } : {}),
      ...(s.laterDoses && s.laterDoses.some((d) => d != null)
        ? { laterDoses: s.laterDoses }
        : {}),
      dose: typeof v.dose === "number" ? v.dose : 0,
      unit: typeof v.unit === "string" ? v.unit : "mg",
      // `stopped` must survive the round-trip or the deleted-compound gap
      // (Spec 02) is lost on every reload and the break reads as missed doses.
      ...(v.stopped === true ? { stopped: true as const } : {}),
      ...(cycle ? { cycle } : {}),
    })
  }
  if (out.length === 0) return null
  out.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
  return { scheduleHistory: out }
}

function normalizeSchedule(raw: unknown): Schedule {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  // `""` round-trips as the deliberate "unset" state and must be preserved — a
  // stored empty string is a choice, not a missing field. Only a genuinely absent
  // or non-string value falls through to unset.
  const timeOfDay = typeof s.timeOfDay === "string" ? s.timeOfDay : ""
  // Later dose times, guarded on the way out of storage. A malformed entry drops
  // rather than shifting every slot after it — a slot is an INDEX, so a silently
  // removed element would relabel the doses that follow it.
  const rawLater = Array.isArray(s.laterTimes) ? s.laterTimes : []
  const rawDoses = Array.isArray(s.laterDoses) ? s.laterDoses : []
  // ⚠️ FILTERED AS PAIRS. Filtering the times and then indexing the amounts by
  // their NEW positions handed a surviving time the dropped one's amount —
  // `["", "20:00"]` with `[25, 50]` made the 20:00 dose 25 mg. Position is the
  // slot on both sides, so they can only be trimmed together.
  const pairs = rawLater
    .map((t, i) => ({ t, d: rawDoses[i] }))
    .filter((p): p is { t: string; d: unknown } => typeof p.t === "string" && hasTime(p.t))
  const laterTimes = pairs.map((p) => p.t)
  const laterDoses = pairs.map((p) =>
    typeof p.d === "number" && Number.isFinite(p.d) && p.d > 0 ? p.d : null
  )
  const extra = {
    ...(laterTimes.length > 0 ? { laterTimes } : {}),
    ...(laterDoses.some((d) => d != null) ? { laterDoses } : {}),
  }
  // Legacy records have no start date; "1970-01-01" reads as "already started"
  // (always due) and keeps EOD/every-N anchored consistently.
  const startDate =
    parseDateKey(s.startDate) !== null ? (s.startDate as string) : "1970-01-01"
  const cad = s.cadence as Record<string, unknown> | undefined
  const type = cad?.type
  if (type === "everyOtherDay")
    return { cadence: { type }, timeOfDay, ...extra, startDate }
  if (type === "everyNDays" && typeof cad?.n === "number")
    return { cadence: { type, n: cad.n }, timeOfDay, ...extra, startDate }
  if (type === "daysOfWeek" && Array.isArray(cad?.days))
    return {
      cadence: {
        type,
        days: (cad.days as unknown[]).filter(
          (d): d is number => typeof d === "number"
        ),
      },
      timeOfDay,
      ...extra,
      startDate,
    }
  return { cadence: { type: "daily" }, timeOfDay, ...extra, startDate }
}
