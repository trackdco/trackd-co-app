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
  strength: number // oral_solid: mg per tab/cap
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

/** The capacity basis for the chosen type, or null until its inputs are present
 *  (no capacity → a fill estimate is meaningless, so the control stays hidden). */
export function vialBasis(type: InventoryType, v: VialAmounts): VialBasis | null {
  if (type === "reconstituted") {
    if (v.powder <= 0 || v.bacWater <= 0) return null
    return { totalBase: v.powder, perNative: v.powder / v.bacWater, fullNative: v.bacWater }
  }
  if (type === "preconcentrated") {
    if (v.oilMl <= 0 || v.concentration <= 0) return null
    return { totalBase: v.oilMl * v.concentration, perNative: v.concentration, fullNative: v.oilMl }
  }
  if (v.count <= 0 || v.strength <= 0) return null
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
