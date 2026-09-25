import type { InventoryType } from "@/lib/db/types"

/**
 * The number fields the Add stock sheet cannot save without, in the order they
 * appear, so a refused "Add" can shake and open the FIRST empty one
 * (build-brief-final §3.12: "'Add' won't save with an empty field (it shakes and
 * focuses it)").
 *
 * Mirrors the sheet's `buildInsert`: every container stores an amount
 * (`total_amount` is NOT NULL), and each shape adds only what its maths needs.
 * Optional fields (a tub's serving, a drop's strength, the edit-only amount
 * left) are never listed.
 *
 * Pure; no React.
 */
export type StockFieldId =
  | "powder"
  | "bacWater"
  | "oilMl"
  | "concentration"
  | "count"
  | "strength"
  | "drops"
  | "tubGrams"

export interface StockShape {
  type: InventoryType
  /** A powder vial held unmixed (a spare): it has no water to ask for. */
  unmixed: boolean
  /** An oral that states a strength (dosed in mg or iu, not by the tablet). */
  strengthRequired: boolean
  /** How a dropper is measured. */
  dropMode: "ml" | "drops"
}

export function requiredStockFields(s: StockShape): StockFieldId[] {
  switch (s.type) {
    case "reconstituted":
      return s.unmixed ? ["powder"] : ["powder", "bacWater"]
    case "preconcentrated":
      return ["oilMl", "concentration"]
    case "oral_solid":
      return s.strengthRequired ? ["count", "strength"] : ["count"]
    case "bulk_powder":
      return ["tubGrams"]
    case "dropper":
      return s.dropMode === "ml" ? ["oilMl", "concentration"] : ["drops"]
  }
}

/** The first required field without a positive number in it, or null when
 *  every one is filled. A zero counts as empty: no container holds nothing. */
export function firstEmptyStockField(
  s: StockShape,
  values: Partial<Record<StockFieldId, string>>,
): StockFieldId | null {
  for (const id of requiredStockFields(s)) {
    const n = Number.parseFloat(values[id] ?? "")
    if (!(Number.isFinite(n) && n > 0)) return id
  }
  return null
}
