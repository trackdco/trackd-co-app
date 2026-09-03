/**
 * Canonical Postgres model types + the local→Postgres mapping (Protocol Cutover,
 * Step 1). These mirror `supabase/trackd_schema_v0_4_2.sql` exactly — `cycles`,
 * `protocol_compounds`, and `dose_logs` are the source of truth for the compound
 * stack and dose logging once the Home flip (Step 3) lands.
 *
 * The mapping helpers from the interim device-local shapes (`StackCompound` in
 * `lib/home/stack.ts`, the local `DoseLog` in `lib/home/mockHomeData.ts`) are
 * **defined here** but **applied in the Step 2 migration** — Step 1 only stands up
 * the data + sync layer; no existing data is moved and no screen changes.
 *
 * Pure types + pure helpers only; no React, no side effects (code-standards.md).
 */
import { doseTimesOf, hasTime, isInjectable } from "@/lib/home/stack"
import type { Cadence, InjectionMethod, StackCompound } from "@/lib/home/stack"
import type { CompoundCategory } from "@/lib/compound-categories"
import { cycleRuleFromColumns, cycleRuleToColumns } from "@/lib/protocol/cycleRule"

// The cycle column mapping lives in `cycleRule.ts`, not here: `stack.ts` needs it
// for schedule VERSION rows and this file already imports `stack.ts`, so defining
// it here would close an import cycle. Re-exported for existing callers.
export {
  CYCLE_COLUMNS,
  cycleRuleToColumns,
  cycleRuleFromColumns,
  type CycleColumns,
} from "@/lib/protocol/cycleRule"

/* ----------------------------------------------------------------- enums */
// Each union mirrors a Postgres ENUM in the schema (byte-for-byte values).

/** `schedule_type` enum. */
export type ScheduleType = "every_day" | "specific_days" | "every_n_days"

/** `dose_unit` enum + its normaliser. (`g` was appended to the live enum during
 *  catalogue seeding — the live DB is the source of truth for shape, so it's
 *  mirrored even though the base `trackd_schema_v0_4_2.sql` predates it.)
 *  Declared in `doseUnits.ts` and re-exported here so `lib/home/stack.ts` can use
 *  the SAME coercion without closing an import cycle back through this file. */
export { coerceDoseUnit, DOSE_UNITS, type DoseUnit } from "@/lib/db/doseUnits"
import { coerceDoseUnit, type DoseUnit } from "@/lib/db/doseUnits"

/** `admin_route` enum. */
export type AdminRoute = "po" | "subq" | "im" | "nasal" | "topical"

/** `inventory_type` enum (wired in Step 5). `bulk_powder` joined the other three
 *  with `supabase/protocol/014` — a tub of something scooped and weighed in
 *  grams, which no route can imply (creatine is `po`, same as a capsule). */
export type InventoryType =
  | "reconstituted"
  | "preconcentrated"
  | "oral_solid"
  | "bulk_powder"

/** `log_status` enum. */
export type LogStatus = "taken" | "skipped"

/** `injection_site` enum — the 13 medically-scoped sites. */
export type InjectionSite =
  | "glute_left"
  | "glute_right"
  | "delt_left"
  | "delt_right"
  | "quad_left"
  | "quad_right"
  | "ventroglute_left"
  | "ventroglute_right"
  | "abdomen_left"
  | "abdomen_right"
  | "lovehandle_left"
  | "lovehandle_right"
  // Added by supabase/sites/011 so the enum can hold every site the body map
  // offers. Before it, 22 of the 36 collapsed to `other` and read back as NULL —
  // "Trap - Left" was erased and "Front Quad - Left" came back as "Outer Quad -
  // Left", a different muscle. Sides that genuinely share a muscle still share a
  // value (im/sq glute), because route already disambiguates them.
  | "quad_front_left"
  | "quad_front_right"
  | "bicep_left"
  | "bicep_right"
  | "tricep_left"
  | "tricep_right"
  | "lat_left"
  | "lat_right"
  | "pec_left"
  | "pec_right"
  | "trap_left"
  | "trap_right"
  | "calf_left"
  | "calf_right"
  | "abdomen_lower_left"
  | "abdomen_lower_right"
  | "thigh_upper_left"
  | "thigh_upper_right"
  | "thigh_lower_left"
  | "thigh_lower_right"
  | "arm_left"
  | "arm_right"
  | "other"

/** ISO weekday: Mon=1 … Sun=7 (the schema's `days_of_week` convention). */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

/** A raw dose-log row from a Postgres pull, for the client to fold into `DayLogs`
 *  using its local timezone (the local day key + clock time are device-tz bound).
 *  Lives here (not the `"use server"` adapter, which may only export functions). */
export interface DoseRow {
  /**
   * `dose_logs.id`. Not decoration: the id is `deterministicUuid("dl:<user>:<day>:<pc>")`,
   * so it is a DURABLE record of the local day the row was first written under —
   * the one piece of that fact which survives even when `logged_for` is null.
   * Hydration uses it to recover the true day instead of re-deriving one from
   * `takenAt` in whatever timezone the device happens to be in now.
   */
  id: string
  compoundId: string
  takenAt: string
  /** The stored local day (`dose_logs.logged_for`). Preferred over re-deriving a
   *  day from `takenAt`, which changes answer when the device changes timezone. */
  loggedFor: string | null
  /**
   * The local day RECOVERED from this row's own id, when `logged_for` is null.
   *
   * Not a guess and not a backfill: the id is a hash of the day the row was
   * first written under, so a candidate day either reproduces the id exactly or
   * it does not. The server tries the instant's UTC day and the day either side
   * (no timezone shifts a calendar day by more than one) and reports a match, or
   * null when the row predates the scheme.
   *
   * This exists because `supabase/protocol/012` correctly nulled `logged_for`,
   * which left every historical dose falling back to re-deriving a day from the
   * CURRENT device timezone — so changing zone re-bucketed history and the same
   * dose could be written back under two different days as two rows.
   */
  recoveredDay: string | null
  /** Which of the day's scheduled doses this row is (`supabase/protocol/017`).
   *  0 on every row written before that migration, and on every once-daily
   *  compound. Without it the pull keys two doses of one day to the same slot
   *  and they collapse into one. */
  slotIndex: number
  /** Taken, or deliberately skipped. A skipped row must not read back as a
   *  dose that was taken. */
  status: "taken" | "skipped"
  /** The dose's own note (`dose_logs.note`), or null. */
  note: string | null
  amount: string
  /** The unit this dose was logged in (`dose_logs.dose_unit`) — per-log, so it
   *  survives a later change to the compound's unit. Null on rows that predate it. */
  doseUnit: string | null
  injectionSite: string | null
  /** The vial this dose was logged against, so the "From vial" link survives a
   *  Postgres round-trip (the runway in v_inventory_math always uses it). */
  inventoryItemId: string | null
}

/** One logged dose, flattened for the batched device→Postgres migration backfill.
 *  `takenAtIso` is computed CLIENT-side (the server can't know the device tz), so
 *  the client pre-resolves it before the single batched server-action round-trip.
 *  The compound's unit/amount/method are derived server-side from the matching
 *  `StackCompound`, so they aren't carried here. */
export interface BatchDoseEntry {
  clientCompoundId: string
  dateKey: string
  amount: string
  siteId: string | null
  takenAtIso: string
}

/* ---------------------------------------------------------------- rows */
// Row shapes as returned by PostgREST. Dates/timestamps come back as strings
// ("YYYY-MM-DD" for `date`, ISO-8601 for `timestamptz`, "HH:MM:SS" for `time`).

/** A `cycles` row — the container every `protocol_compound` hangs off. */
export interface Cycle {
  id: string
  user_id: string
  name: string
  started_on: string | null
  ended_on: string | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

/** A `protocol_compounds` row — a compound the user is running, with its dose
 *  + schedule, inside a cycle. */
export interface ProtocolCompound {
  id: string
  user_id: string
  cycle_id: string
  /** Catalogue compound id, or NULL for a custom "Make your own" compound
   *  (which carries its identity in custom_name/custom_category instead). */
  compound_id: string | null
  /** Set only on a custom compound (compound_id NULL) — its display name/category,
   *  since there's no catalogue row to join. (supabase/protocol/004.) */
  custom_name: string | null
  custom_category: string | null
  dose_amount: number
  dose_unit: DoseUnit
  route: AdminRoute
  schedule_type: ScheduleType
  days_of_week: number[] | null
  interval_days: number | null
  times_per_day: number
  /** One time per `times_per_day`. An element may be NULL — that is the stored
   *  "no dose time set" state (see `stackCompoundToProtocolInsert`). */
  dose_times: (string | null)[]
  first_dose_on: string
  end_date: string | null
  is_active: boolean
  /** The injection-site rotation plan — ordered local site ids (the order IS the
   *  cycle order). Empty for orals. (`supabase/protocol/001_*.sql`.) */
  rotation_sites: string[]
  /** Pointer to the NEXT rotation site; advanced only by logging a dose. */
  rotation_index: number
  /** On/off cycle columns (Spec 06, `supabase/protocol/006`). All NULL = no
   *  cycle. Optional because a pre-006 row does not carry them at all. */
  cycle_anchor?: string | null
  cycle_on_days?: number | null
  cycle_off_days?: number | null
  cycle_end_type?: string | null
  cycle_end_date?: string | null
  cycle_end_rounds?: number | null
  cycle_colour?: string | null
  /** The form this compound is actually held in, as the user stated it
   *  (`supabase/protocol/023`). NULL — every row added before it — means derive
   *  it from name + route, which is what `containerFormFor` still does
   *  underneath. Optional because a pre-023 row does not carry the column. */
  inventory_form?: InventoryType | null
  /** Per-slot planned dose, parallel to `dose_times` (`supabase/protocol/021`).
   *  A null element, a short array or a null column all mean "use dose_amount". */
  slot_doses?: (number | null)[] | null
  created_at: string
  updated_at: string
}

/** A `dose_logs` row — a dose taken (or a due dose explicitly skipped). */
export interface DoseLog {
  id: string
  user_id: string
  protocol_compound_id: string
  inventory_item_id: string | null
  status: LogStatus
  dose_amount: number
  dose_unit: DoseUnit
  injection_site: InjectionSite | null
  taken_at: string
  scheduled_for: string | null
  /** The user's LOCAL calendar day for this dose (`supabase/protocol/011`).
   *  Authoritative for WHICH DAY a dose belongs to; `taken_at` stays
   *  authoritative for the instant. Null on rows the backfill could not reach. */
  logged_for: string | null
  note: string | null
  created_at: string
}

/* --------------------------------------------------------------- inserts */
// Payloads the data layer accepts. `user_id` is NEVER part of an insert — it is
// always injected server-side from the verified session (RLS is the backstop).
// `id` is client-generated (a uuid) so optimistic writes are id-stable and
// re-flushing the offline outbox is idempotent (upsert on the primary key).

export interface CycleInsert {
  id?: string
  name?: string
  started_on?: string | null
  ended_on?: string | null
  is_active?: boolean
  notes?: string | null
}

export interface ProtocolCompoundInsert {
  id: string
  cycle_id: string
  /** Catalogue id, or NULL for a custom compound (then set custom_name/category). */
  compound_id: string | null
  custom_name?: string | null
  custom_category?: string | null
  dose_amount: number
  dose_unit: DoseUnit
  route: AdminRoute
  schedule_type: ScheduleType
  days_of_week?: number[] | null
  interval_days?: number | null
  times_per_day?: number
  dose_times?: (string | null)[]
  first_dose_on: string
  end_date?: string | null
  is_active?: boolean
  rotation_sites?: string[]
  rotation_index?: number
  /** On/off cycle columns (Spec 06, `supabase/protocol/006`). All NULL = no
   *  cycle. Stripped and retried if the migration has not been applied yet. */
  cycle_anchor?: string | null
  cycle_on_days?: number | null
  cycle_off_days?: number | null
  cycle_end_type?: string | null
  cycle_end_date?: string | null
  cycle_end_rounds?: number | null
  cycle_colour?: string | null
  /** The compound's stated inventory form (`supabase/protocol/023`). Stripped
   *  and retried alongside the cycle columns if the migration is not applied. */
  inventory_form?: InventoryType | null
  /** Per-slot planned dose, parallel to `dose_times` (`supabase/protocol/021`).
   *  Stripped and retried alongside the other pending columns. */
  slot_doses?: (number | null)[] | null
}

export interface DoseLogInsert {
  id: string
  protocol_compound_id: string
  inventory_item_id?: string | null
  status?: LogStatus
  dose_amount: number
  dose_unit: DoseUnit
  injection_site?: InjectionSite | null
  taken_at?: string
  /** The device's own local date, "YYYY-MM-DD". Sent on every write, because the
   *  server cannot know which day the user was standing in. */
  logged_for?: string | null
  scheduled_for?: string | null
  note?: string | null
  /** Which of the day's scheduled doses this is (`supabase/protocol/017`).
   *  Omitted or 0 = the day's first dose, which is every row written before that
   *  migration. Stripped and retried when the column is not there yet. */
  slot_index?: number
}

/* ----------------------------------------- local ↔ Postgres mapping (Step 2) */
// Defined here so the types + the migration share ONE source of truth. APPLIED
// in `lib/migration/migrateDeviceState.ts` (Step 2) and by the Home flip reads
// (Step 3). Step 1 ships these helpers but wires nothing.

/**
 * Local weekday (0 = Sun … 6 = Sat, JS `Date.getDay()`) → ISO (Mon = 1 … Sun = 7).
 * The live store numbers Sunday 0; Postgres `days_of_week` numbers Monday 1.
 */
export function localDowToIso(localDay: number): IsoWeekday {
  // 0(Sun)→7, 1(Mon)→1, … 6(Sat)→6
  return (localDay === 0 ? 7 : localDay) as IsoWeekday
}

/** ISO weekday (Mon = 1 … Sun = 7) → local (0 = Sun … 6 = Sat). The inverse of
 *  {@link localDowToIso}, for Step 3 reads. */
export function isoDowToLocal(iso: number): number {
  return iso === 7 ? 0 : iso
}

/** The schedule columns a {@link Cadence} maps onto. */
export interface ScheduleShape {
  schedule_type: ScheduleType
  days_of_week: number[] | null
  interval_days: number | null
}

/**
 * Live `Cadence` → the schema's `schedule_type` / `interval_days` /
 * `days_of_week` triplet:
 *   - `daily`          → every_day
 *   - `everyOtherDay`  → every_n_days, interval_days = 2
 *   - `everyNDays(n)`  → every_n_days, interval_days = n
 *   - `daysOfWeek`     → specific_days, days_of_week renumbered to ISO
 */
export function cadenceToSchedule(cadence: Cadence): ScheduleShape {
  switch (cadence.type) {
    case "daily":
      return { schedule_type: "every_day", days_of_week: null, interval_days: null }
    case "everyOtherDay":
      return { schedule_type: "every_n_days", days_of_week: null, interval_days: 2 }
    case "everyNDays":
      return {
        schedule_type: "every_n_days",
        days_of_week: null,
        // clamp to the schema's interval_days >= 1 (smallint) so malformed local
        // data can't silently fail the insert's CHECK
        interval_days: Math.max(1, Math.floor(cadence.n)),
      }
    case "daysOfWeek":
      return {
        schedule_type: "specific_days",
        days_of_week: [...cadence.days].sort((a, b) => a - b).map(localDowToIso),
        interval_days: null,
      }
  }
}

/** The schema columns → a live `Cadence` (the inverse, for Step 3 reads). */
export function scheduleToCadence(s: ScheduleShape): Cadence {
  switch (s.schedule_type) {
    case "every_day":
      return { type: "daily" }
    case "every_n_days":
      return s.interval_days === 2
        ? { type: "everyOtherDay" }
        : { type: "everyNDays", n: s.interval_days ?? 1 }
    case "specific_days":
      return { type: "daysOfWeek", days: (s.days_of_week ?? []).map(isoDowToLocal) }
  }
}

/**
 * Live injection method → `admin_route`. The live methods are a subset of the
 * enum (`im`/`subq`/`po`/`nasal`); the schema additionally has `topical`.
 */
export function methodToRoute(method: InjectionMethod): AdminRoute {
  return method // identical string values; the union is a subset of AdminRoute
}

/**
 * Local granular site id (`lib/home/siteCatalog.ts`) → the `injection_site` enum.
 * The enum is coarser than the local catalogue (no bicep/tricep/lat/pec/calf/
 * thigh/back-of-arm), so the unmapped sites collapse to `other`. The full
 * granular plan is preserved separately in `protocol_compounds.rotation_sites`;
 * this map is only for the per-dose `dose_logs.injection_site` history. Null for
 * an absent/oral site.
 */
const LOCAL_SITE_TO_ENUM: Record<string, InjectionSite> = {
  // IM
  "im-vglute-r": "ventroglute_right", "im-vglute-l": "ventroglute_left",
  "im-glute-r": "glute_right", "im-glute-l": "glute_left",
  "im-delt-r": "delt_right", "im-delt-l": "delt_left",
  "im-quad-out-r": "quad_right", "im-quad-out-l": "quad_left",
  // SubQ
  "sq-abdo-lr": "abdomen_lower_right", "sq-abdo-ll": "abdomen_lower_left",
  "sq-abdo-r": "abdomen_right", "sq-abdo-l": "abdomen_left",
  "sq-flank-r": "lovehandle_right", "sq-flank-l": "lovehandle_left",
  "sq-glute-r": "glute_right", "sq-glute-l": "glute_left",
  // Every remaining catalogue site now has its own enum member (011), so nothing
  // falls through to `other` and no site is lost or renamed on a round-trip.
  "im-quad-front-r": "quad_front_right", "im-quad-front-l": "quad_front_left",
  "im-bicep-r": "bicep_right", "im-bicep-l": "bicep_left",
  "im-tricep-r": "tricep_right", "im-tricep-l": "tricep_left",
  "im-lat-r": "lat_right", "im-lat-l": "lat_left",
  "im-pec-r": "pec_right", "im-pec-l": "pec_left",
  "im-trap-r": "trap_right", "im-trap-l": "trap_left",
  "im-calf-r": "calf_right", "im-calf-l": "calf_left",
  "sq-thigh-up-r": "thigh_upper_right", "sq-thigh-up-l": "thigh_upper_left",
  "sq-thigh-lo-r": "thigh_lower_right", "sq-thigh-lo-l": "thigh_lower_left",
  "sq-arm-r": "arm_right", "sq-arm-l": "arm_left",
}

export function localSiteToInjectionSite(siteId: string | null): InjectionSite | null {
  if (!siteId) return null
  return LOCAL_SITE_TO_ENUM[siteId] ?? "other"
}

/**
 * A {@link StackCompound} → a `protocol_compounds` insert. The catalogue
 * `compound_id` (a uuid in the read-only `compounds` table) and the row `id`
 * are resolved by the **caller** — the live stack carries a client-generated id
 * and a compound *name*, not the catalogue uuid; Step 2's migration resolves the
 * name → catalogue id. A custom "Make your own" compound has no catalogue row, so
 * the caller passes `compoundId: null` and the row carries its name/category in
 * `custom_name`/`custom_category` instead (the identity CHECK enforces exactly one
 * source). `inventory_item_id` stays unset until Step 5.
 */
export function stackCompoundToProtocolInsert(
  c: StackCompound,
  args: { id: string; cycleId: string; compoundId: string | null }
): ProtocolCompoundInsert {
  const schedule = cadenceToSchedule(c.schedule.cadence)
  const rotation = isInjectable(c.method) ? c.rotationSites : []
  const custom = args.compoundId === null
  return {
    id: args.id,
    cycle_id: args.cycleId,
    compound_id: args.compoundId,
    custom_name: custom ? c.name : null,
    custom_category: custom ? c.category : null,
    dose_amount: c.dose > 0 ? c.dose : 0.001, // dose_positive CHECK; 0 shouldn't occur
    dose_unit: coerceDoseUnit(c.unit),
    route: methodToRoute(c.method),
    schedule_type: schedule.schedule_type,
    days_of_week: schedule.days_of_week,
    interval_days: schedule.interval_days,
    // Both of these were hardcoded to a single daily dose until Spec w2b-13,
    // Step 5. `times_per_day` has existed since v0.4.2 and nothing could ever
    // satisfy it, because the device model had no way to say "twice".
    times_per_day: doseTimesOf(c.schedule).length,
    // An UNSET dose time is stored as a NULL ELEMENT, not as a substituted
    // default (Spec 01 → Dose time). That satisfies both DB rules without a
    // migration: `dose_times` is NOT NULL (the ARRAY itself isn't null) and
    // `dose_times_match` counts array LENGTH, which a NULL element still
    // contributes to. Writing a placeholder time here instead would put a number
    // in the DB that the user never chose, and nothing downstream could tell it
    // apart from a real one.
    //
    // The ARRAY POSITION is the slot (`supabase/protocol/017`), so a null must
    // hold its place rather than be filtered out — dropping it would shift every
    // later dose onto the wrong slot.
    dose_times: doseTimesOf(c.schedule).map((t) => (hasTime(t) ? `${t}:00` : null)),
    // Per-slot amounts, same array position as `dose_times`. Only written when
    // the user actually set one, so a compound whose doses are all the same
    // stores nothing and keeps reading `dose_amount` (`supabase/protocol/021`).
    ...(c.schedule.laterDoses && c.schedule.laterDoses.some((d) => d != null)
      ? { slot_doses: [null, ...c.schedule.laterDoses] }
      : {}),
    first_dose_on: c.schedule.startDate,
    end_date: null,
    is_active: !c.archived,
    rotation_sites: rotation,
    rotation_index:
      rotation.length > 0
        ? ((c.rotationIndex % rotation.length) + rotation.length) % rotation.length
        : 0,
    ...cycleRuleToColumns(c.cycle),
    // Only written when the user actually stated a form. `undefined` (not null)
    // when they did not, so an upsert of a compound added before 013 leaves any
    // value already in the column alone rather than clearing it.
    ...(c.inventoryForm ? { inventory_form: c.inventoryForm } : {}),
  }
}

/** `admin_route` → live injection method (the Home model has no `topical`, so it
 *  folds to `po`). The inverse of {@link methodToRoute}, for Step 3 reads. */
export function routeToMethod(route: AdminRoute): InjectionMethod {
  return (route === "topical" ? "po" : route) as InjectionMethod
}

/**
 * `injection_site` enum → a representative local site id (`lib/home/siteCatalog.ts`),
 * for displaying a historical logged dose after a Postgres round-trip. The enum is
 * coarser than the local catalogue, so this is best-effort: the method
 * disambiguates `glute` (IM vs SubQ), and `other` / non-applicable combinations
 * return null. The "next site" itself is driven by `rotation_index`, not this.
 */
export function injectionSiteToLocal(
  site: InjectionSite | null,
  method: InjectionMethod
): string | null {
  if (!site || site === "other") return null
  const im = method === "im"
  const sq = method === "subq"
  switch (site) {
    case "glute_left": return im ? "im-glute-l" : sq ? "sq-glute-l" : null
    case "glute_right": return im ? "im-glute-r" : sq ? "sq-glute-r" : null
    case "delt_left": return im ? "im-delt-l" : null
    case "delt_right": return im ? "im-delt-r" : null
    case "quad_left": return im ? "im-quad-out-l" : null
    case "quad_right": return im ? "im-quad-out-r" : null
    case "ventroglute_left": return im ? "im-vglute-l" : null
    case "ventroglute_right": return im ? "im-vglute-r" : null
    case "abdomen_left": return sq ? "sq-abdo-l" : null
    case "abdomen_right": return sq ? "sq-abdo-r" : null
    case "lovehandle_left": return sq ? "sq-flank-l" : null
    case "lovehandle_right": return sq ? "sq-flank-r" : null
    // 011's additions. Each is one muscle on one side, so no route test is needed
    // beyond keeping IM sites off a Sub-Q compound and vice versa.
    case "quad_front_left": return im ? "im-quad-front-l" : null
    case "quad_front_right": return im ? "im-quad-front-r" : null
    case "bicep_left": return im ? "im-bicep-l" : null
    case "bicep_right": return im ? "im-bicep-r" : null
    case "tricep_left": return im ? "im-tricep-l" : null
    case "tricep_right": return im ? "im-tricep-r" : null
    case "lat_left": return im ? "im-lat-l" : null
    case "lat_right": return im ? "im-lat-r" : null
    case "pec_left": return im ? "im-pec-l" : null
    case "pec_right": return im ? "im-pec-r" : null
    case "trap_left": return im ? "im-trap-l" : null
    case "trap_right": return im ? "im-trap-r" : null
    case "calf_left": return im ? "im-calf-l" : null
    case "calf_right": return im ? "im-calf-r" : null
    case "abdomen_lower_left": return sq ? "sq-abdo-ll" : null
    case "abdomen_lower_right": return sq ? "sq-abdo-lr" : null
    case "thigh_upper_left": return sq ? "sq-thigh-up-l" : null
    case "thigh_upper_right": return sq ? "sq-thigh-up-r" : null
    case "thigh_lower_left": return sq ? "sq-thigh-lo-l" : null
    case "thigh_lower_right": return sq ? "sq-thigh-lo-r" : null
    case "arm_left": return sq ? "sq-arm-l" : null
    case "arm_right": return sq ? "sq-arm-r" : null
    default: return null
  }
}

/**
 * A `protocol_compounds` row (+ its joined catalogue name/category) → a live
 * `StackCompound`, so the Home flip can present Postgres data through the existing
 * store shape with no UI change. The inverse of {@link stackCompoundToProtocolInsert}.
 */
export function protocolCompoundToStack(
  pc: ProtocolCompound,
  catalogue: { name: string; category: CompoundCategory }
): StackCompound {
  const cycle = cycleRuleFromColumns(pc)
  return {
    id: pc.id,
    name: catalogue.name,
    category: catalogue.category,
    method: routeToMethod(pc.route),
    dose: Number(pc.dose_amount),
    unit: pc.dose_unit,
    schedule: {
      cadence: scheduleToCadence({
        schedule_type: pc.schedule_type,
        days_of_week: pc.days_of_week,
        interval_days: pc.interval_days,
      }),
      // A NULL element (or an absent array) is the stored "unset" state and must
      // round-trip as unset — substituting a default here would silently hand the
      // user a dose time they never set, on every rehydrate.
      timeOfDay: (pc.dose_times?.[0] ?? "").slice(0, 5),
      startDate: pc.first_dose_on,
    },
    rotationSites: pc.rotation_sites ?? [],
    rotationIndex: pc.rotation_index ?? 0,
    archived: !pc.is_active,
    // The day the RECORD appeared, which Postgres has always stamped and the
    // device store had no field for. It is the app's own evidence floor: no day
    // before it can be called a missed dose, because there was nothing here to
    // miss it with (see `wasObservedOn`). Sliced off the timestamp rather than
    // derived from it in the device's timezone — a row created at 23:40 UTC
    // would otherwise be stamped a day late in Sydney and blank the compound's
    // first day, and a floor is only useful if it never moves.
    ...(typeof pc.created_at === "string" && pc.created_at.length >= 10
      ? { createdAt: pc.created_at.slice(0, 10) }
      : {}),
    // The cycle must come BACK as well as go out. Without this the pulled row has
    // no cycle, hydration overwrites the local record with it, and a cycle the
    // user just set disappears on the next mount/focus.
    ...(cycle ? { cycle } : {}),
  }
}

/* --------------------------------------- injection-site catalogue (Spec 19) */
// `injection_sites` is a read-only, coordinate-bearing catalogue (promoted from the
// free-standing `lib/home/siteCatalog.ts` list). Sites are picked ad-hoc when
// logging a dose — there is no per-user working set. SQL: `supabase/sites/`.

/** The two injectable routes the site catalogue covers (a subset of AdminRoute). */
export type InjectionSiteRoute = Extract<AdminRoute, "im" | "subq">

/** `profiles.sex` — the `sex_type` enum. Nullable in the DB: rows created before
 *  the welcome quiz collected it never set one. */
export type Sex = "male" | "female"

/** Which figure the injection-site body map draws. Always concrete — a profile
 *  with no sex still has to render something. */
export type BodySex = Sex

/**
 * The body to draw for a profile's `sex`. The welcome quiz makes sex a required
 * choice, so this only falls back for the legacy rows that predate it (and for a
 * value the enum somehow doesn't cover) — those get the male figure.
 */
export function bodySexFor(sex: string | null | undefined): BodySex {
  return sex === "female" ? "female" : "male"
}

/** Which body side a site sits on. */
export type InjectionSiteSide = "left" | "right" | "n_a"

/** Which silhouette a site renders on (front / back). */
export type InjectionSiteAspect = "anterior" | "posterior"

/**
 * An `injection_sites` catalogue row — one physical site plus the metadata the
 * body map needs. `id` is the stable code (e.g. "im-glute-r"), shared with the
 * legacy `lib/home/siteCatalog.ts` ids and `protocol_compounds.rotation_sites`.
 * `x`/`y` are 0–100 normalized coordinates on the `aspect` silhouette (Step 2's
 * SVG is drawn to the same grid).
 */
export interface InjectionSiteRow {
  id: string
  label: string
  route: InjectionSiteRoute
  side: InjectionSiteSide
  aspect: InjectionSiteAspect
  x: number
  y: number
  sort_order: number
}

