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
import { isInjectable } from "@/lib/home/stack"
import type { Cadence, InjectionMethod, StackCompound } from "@/lib/home/stack"
import type { CompoundCategory } from "@/lib/compound-categories"

/* ----------------------------------------------------------------- enums */
// Each union mirrors a Postgres ENUM in the schema (byte-for-byte values).

/** `schedule_type` enum. */
export type ScheduleType = "every_day" | "specific_days" | "every_n_days"

/** `dose_unit` enum. (`g` was appended to the live enum during catalogue
 *  seeding — the live DB is the source of truth for shape, so it's mirrored here
 *  even though the base `trackd_schema_v0_4_2.sql` predates it.) */
export type DoseUnit = "mg" | "mcg" | "iu" | "ml" | "tab" | "capsule" | "g"

/** `admin_route` enum. */
export type AdminRoute = "po" | "subq" | "im" | "nasal" | "topical"

/** `inventory_type` enum (the 3-way discriminated union; wired in Step 5). */
export type InventoryType = "reconstituted" | "preconcentrated" | "oral_solid"

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
  | "other"

/** ISO weekday: Mon=1 … Sun=7 (the schema's `days_of_week` convention). */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

/** A raw dose-log row from a Postgres pull, for the client to fold into `DayLogs`
 *  using its local timezone (the local day key + clock time are device-tz bound).
 *  Lives here (not the `"use server"` adapter, which may only export functions). */
export interface DoseRow {
  compoundId: string
  takenAt: string
  amount: string
  injectionSite: string | null
  /** The vial this dose was logged against, so the "From vial" link survives a
   *  Postgres round-trip (the runway in v_inventory_math always uses it). */
  inventoryItemId: string | null
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
  compound_id: string
  dose_amount: number
  dose_unit: DoseUnit
  route: AdminRoute
  schedule_type: ScheduleType
  days_of_week: number[] | null
  interval_days: number | null
  times_per_day: number
  dose_times: string[]
  first_dose_on: string
  end_date: string | null
  is_active: boolean
  /** The injection-site rotation plan — ordered local site ids (the order IS the
   *  cycle order). Empty for orals. (`supabase/protocol/001_*.sql`.) */
  rotation_sites: string[]
  /** Pointer to the NEXT rotation site; advanced only by logging a dose. */
  rotation_index: number
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
  compound_id: string
  dose_amount: number
  dose_unit: DoseUnit
  route: AdminRoute
  schedule_type: ScheduleType
  days_of_week?: number[] | null
  interval_days?: number | null
  times_per_day?: number
  dose_times?: string[]
  first_dose_on: string
  end_date?: string | null
  is_active?: boolean
  rotation_sites?: string[]
  rotation_index?: number
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
  scheduled_for?: string | null
  note?: string | null
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
  "im-quad-front-r": "quad_right", "im-quad-front-l": "quad_left",
  // SubQ
  "sq-abdo-lr": "abdomen_right", "sq-abdo-ll": "abdomen_left",
  "sq-abdo-r": "abdomen_right", "sq-abdo-l": "abdomen_left",
  "sq-flank-r": "lovehandle_right", "sq-flank-l": "lovehandle_left",
  "sq-glute-r": "glute_right", "sq-glute-l": "glute_left",
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
 * name → catalogue id. `inventory_item_id` stays unset until Step 5.
 */
export function stackCompoundToProtocolInsert(
  c: StackCompound,
  args: { id: string; cycleId: string; compoundId: string }
): ProtocolCompoundInsert {
  const schedule = cadenceToSchedule(c.schedule.cadence)
  const rotation = isInjectable(c.method) ? c.rotationSites : []
  return {
    id: args.id,
    cycle_id: args.cycleId,
    compound_id: args.compoundId,
    dose_amount: c.dose > 0 ? c.dose : 0.001, // dose_positive CHECK; 0 shouldn't occur
    dose_unit: coerceDoseUnit(c.unit),
    route: methodToRoute(c.method),
    schedule_type: schedule.schedule_type,
    days_of_week: schedule.days_of_week,
    interval_days: schedule.interval_days,
    times_per_day: 1,
    dose_times: [`${c.schedule.timeOfDay}:00`],
    first_dose_on: c.schedule.startDate,
    end_date: null,
    is_active: !c.archived,
    rotation_sites: rotation,
    rotation_index:
      rotation.length > 0
        ? ((c.rotationIndex % rotation.length) + rotation.length) % rotation.length
        : 0,
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
      timeOfDay: (pc.dose_times[0] ?? "08:00:00").slice(0, 5),
      startDate: pc.first_dose_on,
    },
    rotationSites: pc.rotation_sites ?? [],
    rotationIndex: pc.rotation_index ?? 0,
    archived: !pc.is_active,
  }
}

const DOSE_UNITS: readonly DoseUnit[] = ["mg", "mcg", "iu", "ml", "tab", "capsule", "g"]

/** Coerce the live store's free-string `unit` to a valid `dose_unit` (fallback
 *  `mg`). The Add flow already locks the unit to the compound's catalogue value,
 *  so this is a defensive normaliser for the migration. */
export function coerceDoseUnit(unit: string): DoseUnit {
  return (DOSE_UNITS as readonly string[]).includes(unit) ? (unit as DoseUnit) : "mg"
}
