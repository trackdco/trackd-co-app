/**
 * Shared "how much is in it?" maths for the part-used-vial control, used by both
 * add-stock paths (the Stock tab's AddStockSheet and the inline "Got a vial?" step
 * in AddCompoundSheet). Turns a Full/¾/½/¼ preset OR an exact amount-left (in the
 * vial's own measure) into the stored raw input `inventory_items.prior_used_base`
 * (base-unit amount already gone; null = full). The view derives remaining from it.
 *
 * The capacity maths intentionally mirror v_inventory_math's total_base and
 * concentration_per_ml so the offset lands at the same scale the view subtracts.
 */
import type { InventoryType } from "@/lib/db/types"

export interface VialAmounts {
  powder: number // reconstituted: mg/iu of powder (its mass IS the base)
  bacWater: number // reconstituted: mL of BAC water (the full container measure)
  oilMl: number // preconcentrated: mL of solution
  concentration: number // preconcentrated: stated mg/mL
  count: number // oral_solid: tab/cap count
  /** oral_solid: strength per tab/cap, in the item's base unit (mg OR iu — see
   *  `supabase/protocol/016`). **0 now means "not stated"**, which is a legal
   *  state rather than an incomplete form: the label of a multivitamin names no
   *  single strength, and the tablet itself becomes the unit. */
  strength: number
  /** bulk_powder: the tub's weight in grams. Its mass IS the base, exactly as a
   *  reconstituted vial's powder mass is. */
  tubGrams: number
}

export interface VialBasis {
  /** Full capacity in the base unit (mg/iu) — matches v_inventory_math.total_base. */
  totalBase: number
  /** Base units per ONE native measure (mg/mL concentration, or mg per tab). */
  perNative: number
  /** The full container in its own measure (mL of water/oil, or tab count). */
  fullNative: number
}

export const FILL_PRESETS: { label: string; f: number }[] = [
  { label: "Full", f: 1 },
  { label: "¾", f: 0.75 },
  { label: "½", f: 0.5 },
  { label: "¼", f: 0.25 },
]

export const round3 = (n: number) => Math.round(n * 1000) / 1000

function num(s: string): number {
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

/**
 * The capacity basis for the chosen type, or null until its inputs are present
 * (no capacity → a fill estimate is meaningless, so the control stays hidden).
 *
 * **There is one basis per FORM, and getting that wrong makes the presets store
 * the wrong number rather than merely look odd.** The presets resolve to
 * `prior_used_base`, a real stored value: a ½-full 1 kg tub must land on 500 g
 * used, and a ½-full 100-tab bottle on 50 tabs. A basis computed for the wrong
 * form writes an offset at the wrong scale, and the view then subtracts it from
 * remaining forever.
 */
export function vialBasis(type: InventoryType, v: VialAmounts): VialBasis | null {
  if (type === "reconstituted") {
    if (v.powder <= 0 || v.bacWater <= 0) return null
    return { totalBase: v.powder, perNative: v.powder / v.bacWater, fullNative: v.bacWater }
  }
  if (type === "preconcentrated") {
    if (v.oilMl <= 0 || v.concentration <= 0) return null
    return { totalBase: v.oilMl * v.concentration, perNative: v.concentration, fullNative: v.oilMl }
  }
  if (type === "bulk_powder") {
    // A tub is the simplest of the four: grams in, grams out. Its native measure
    // IS its base, so `perNative` is 1 — the same shape a reconstituted vial
    // would have if you measured it in powder rather than in water.
    if (v.tubGrams <= 0) return null
    return { totalBase: v.tubGrams, perNative: 1, fullNative: v.tubGrams }
  }
  if (v.count <= 0) return null
  // Oral with NO stated strength (`supabase/protocol/016`): the tablet is the
  // unit, so the count is the base and one tab is one base unit. Without this
  // the whole fill control disappeared for a multivitamin, because the old guard
  // required a strength the label does not carry.
  if (v.strength <= 0) {
    return { totalBase: v.count, perNative: 1, fullNative: v.count }
  }
  return { totalBase: v.count * v.strength, perNative: v.strength, fullNative: v.count }
}

export interface FillState {
  basis: VialBasis | null
  /** True when a valid exact amount-left is entered (it overrides the preset). */
  exactActive: boolean
  /** Remaining at the estimated starting fill, in base units (null with no basis). */
  remaining: number | null
  /** What to store: base-unit amount already gone. null = full (no offset written). */
  priorUsed: number | null
  /** 0–100 fullness for the live readout (null with no basis). */
  percent: number | null
}

/**
 * Resolve the whole fill estimate in one pass. `exactLeft` is the raw input string
 * (the vial's own measure); an entered, positive value wins over `fillPreset`.
 * Remaining is clamped to the capacity so an over-typed amount can't go negative-used.
 */
export function resolveFill(
  type: InventoryType,
  amounts: VialAmounts,
  exactLeft: string,
  fillPreset: number,
): FillState {
  const basis = vialBasis(type, amounts)
  if (!basis) {
    return { basis: null, exactActive: false, remaining: null, priorUsed: null, percent: null }
  }
  const exact = num(exactLeft)
  const exactActive = exactLeft.trim() !== "" && exact > 0
  const remaining = exactActive
    ? Math.min(exact * basis.perNative, basis.totalBase)
    : basis.totalBase * fillPreset
  const used = basis.totalBase - remaining
  const priorUsed = used > 0.0005 ? round3(used) : null
  const percent =
    basis.totalBase > 0 ? Math.max(0, Math.min(100, (remaining / basis.totalBase) * 100)) : null
  return { basis, exactActive, remaining, priorUsed, percent }
}

/**
 * A weight in grams, worded the way a label is: `900 g`, `1.5 kg`.
 *
 * **Display only.** Inventory stores grams and nothing but grams — a 1 kg tub is
 * `total_amount = 1000`, `total_amount_unit = 'g'` — because two stored units
 * for one quantity is exactly how a "remaining" figure ends up a thousand times
 * wrong. This converts at the last moment, on the way to the screen.
 *
 * The threshold is 1000 g rather than something lower because a 900 g tub is
 * sold as 900 g, and rounding it to "0.9 kg" would print a number the tub itself
 * does not say.
 */
export function formatGrams(grams: number): string {
  if (!Number.isFinite(grams)) return "0 g"
  // One decimal at most: a kitchen scale reads 990.5 g, not 990.4823 g. Rounded
  // BEFORE the threshold test, or 999.96 rounds to "1000 g" — a number that is
  // simultaneously under the kilo cutoff and printed as one.
  const rounded = Math.round(grams * 10) / 10
  if (Math.abs(rounded) < 1000) return `${rounded} g`
  const kg = Math.round((rounded / 1000) * 100) / 100
  return `${kg} kg`
}
