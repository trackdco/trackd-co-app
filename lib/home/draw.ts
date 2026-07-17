/**
 * Per-Dose Draw (Spec 21) — how much to draw from the vial for one dose.
 *
 * PURE: no React, no I/O. The vial-side facts arrive as a `DrawSource` resolved
 * server-side (`resolveDrawSources` in `lib/home/protocolSync.ts`); this module
 * only formats them against the dose the row is actually showing.
 *
 * WHY THE DIVISION IS HERE AND NOT READ FROM THE VIEW. `v_inventory_math` already
 * exposes `ml_per_dose` / `units_per_dose`, but both are bound to the PLANNED dose
 * (`protocol_compounds.dose_amount`) — the view has no per-log grain. A logged dose
 * carries its own editable `amount`, so rendering the view's figure beside an
 * edited amount would put two disagreeing numbers on one row: exactly the dosing
 * error Design Decision 3 exists to prevent. So the genuinely derived quantity —
 * `concentration_per_ml` (reconstituted: total/bac-water; preconcentrated: the
 * stored figure) — still comes ONLY from the view and is never recomputed here;
 * this module just divides the row's own dose by it. Where the row's dose equals
 * the planned dose the result is identical to `ml_per_dose` (same formula), so
 * there is no drift. See `architecture.md` → Invariant 1.
 *
 * Nothing here is stored. Rounding is display-only and never feeds back into a
 * dose (Design Decision 5).
 */
import type { InventoryType } from "@/lib/db/types"

/** Syringe graduations per mL on a standard U-100 insulin pin (Design Decision 4).
 *  U-40/U-50 pins exist but are non-standard for this use — out of scope for v1. */
const UNITS_PER_ML = 100

/**
 * The backing vial's facts, all read from `v_inventory_math` (except the tab/cap
 * wording, which is a raw `inventory_items` input). Null concentration = the type
 * has no volume (an oral solid), so there is no draw to show.
 */
export interface DrawSource {
  inventoryType: InventoryType
  /** Base-unit per mL — mg/mL, or **iu/mL** for an iu-tracked vial (HGH, hCG).
   *  The view derives this with no unit-specific branch, so the iu path is the
   *  same maths, not a special case. NULL for `oral_solid`. */
  concentrationPerMl: number | null
  /** mg per tab/cap. NULL unless `oral_solid`. */
  strengthPerUnitMg: number | null
  /** "tab" | "capsule" — so an oral reads "2 caps", not "2 tabs". */
  oralForm: string | null
  /** The compound's `dose_unit` as the vial was matched on it, server-side. Passed
   *  back so the formatter can't drift from the unit family the link was made with. */
  doseUnit: string
}

export type Draw =
  /** A volume draw: syringe units primary, mL the precise secondary figure (D2). */
  | { kind: "volume"; units: string; ml: string }
  /** An oral solid: a count, never a volume (D6). */
  | { kind: "count"; label: string }

/**
 * The dose expressed in the vial's base unit — mirrors the view's own
 * `CASE dose_unit WHEN 'mcg' THEN dose_amount / 1000.0 ELSE dose_amount END`.
 *
 * Only mg/mcg/iu can back a vial at all (`baseUnitForDose` in `protocolSync.ts`
 * filters the link on exactly these families), so anything else yields null — no
 * vial, therefore no draw, rather than a guess.
 */
function doseInBaseUnit(amount: number, doseUnit: string): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (doseUnit === "mcg") return amount / 1000
  if (doseUnit === "mg" || doseUnit === "iu") return amount
  return null
}

/** Drop trailing zeros so 0.50 reads "0.5" and 1.00 reads "1". */
function trim(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s
}

/**
 * Syringe units, to the nearest whole graduation (Design Decision 5, confirmed):
 * a pin has no half-ticks, so a decimal would imply a precision you cannot draw.
 *
 * The guard: a real but sub-graduation draw must never render as a flat "0u" — that
 * reads as "draw nothing" for a dose that genuinely has volume. Below half a unit we
 * show a decimal instead, because being unroundable is the honest answer there.
 */
function formatUnits(ml: number): string {
  const u = ml * UNITS_PER_ML
  const whole = Math.round(u)
  if (whole > 0) return String(whole)
  // Sub-graduation. Keep the first significant digit rather than rounding to a flat
  // "0u", which would read as "draw nothing" for a dose that genuinely has volume.
  // Being unroundable on a U-100 pin is the honest answer here.
  return trim(u.toPrecision(1))
}

/** mL to 2dp — the precise reference figure. Keeps the first significant digit
 *  instead when 2dp would round a real volume away to "0.00" (the `formatUnits`
 *  honesty guard, applied to the precise figure). */
function formatMl(ml: number): string {
  const two = ml.toFixed(2)
  if (Number(two) !== 0) return trim(two)
  return trim(ml.toPrecision(1))
}

/** "2 tabs" / "1 cap" — halves are real (people split tabs), so allow 2dp. Carries the
 *  same honesty guard as the volume figures: a real dose below 0.005 of a tab must not
 *  round to "0 tabs", which would read as *take nothing*. */
function formatCount(count: number, oralForm: string | null): string {
  const noun = oralForm === "capsule" ? "cap" : "tab"
  const fixed = count.toFixed(2)
  const n = Number(fixed) === 0 ? trim(count.toPrecision(1)) : trim(fixed)
  return `${n} ${Number(n) === 1 ? noun : `${noun}s`}`
}

/**
 * The draw for one dose from one vial, or null when there is nothing honest to
 * show — no vial, an unusable dose, a missing/zero concentration, or a unit family
 * that can't back a vial. Null renders the empty slot + "add stock" (D1); it never
 * blocks logging.
 *
 * @param amount the dose the ROW is displaying — the logged amount once logged,
 *   else the scheduled dose. Not the planned dose from the view.
 */
export function formatDraw(
  amount: number,
  source: DrawSource | null
): Draw | null {
  if (!source) return null
  const base = doseInBaseUnit(amount, source.doseUnit)
  if (base == null) return null

  if (source.inventoryType === "oral_solid") {
    const strength = source.strengthPerUnitMg
    if (!strength || strength <= 0) return null
    return { kind: "count", label: formatCount(base / strength, source.oralForm) }
  }

  // reconstituted + preconcentrated both resolve to a volume draw (D6).
  const conc = source.concentrationPerMl
  if (!conc || conc <= 0) return null
  const ml = base / conc
  if (!Number.isFinite(ml) || ml <= 0) return null
  return { kind: "volume", units: formatUnits(ml), ml: formatMl(ml) }
}
