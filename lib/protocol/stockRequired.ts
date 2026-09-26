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

/** The container a Correct opens on: the fields that say whether it is a spare
 *  and what it was mixed with. A loose shape, so this stays pure. */
export interface EditedContainer {
  inventoryType: InventoryType
  /** NULL: a spare, held but not started (`026`). */
  acquiredOn: string | null
  bacWaterMl: number | null
  reconstitutedOn: string | null
}

/**
 * Whether the form holds a powder vial UNMIXED: no water asked, none saved.
 *
 * - Not a powder vial: never.
 * - A CORRECTION: exactly when the container is a spare (`acquiredOn` NULL),
 *   whatever it held before. Water belongs to Mix, which starts the vial in
 *   the same write, so a spare never gains water here (cold review S5). The
 *   test used to be "a powder vial with no water", so a sealed oil spare
 *   switched to Reconstituted was asked for water and saved as mixed but not
 *   started, a state nothing else makes, and "Mix one" then overwrote it.
 * - A NEW add: unmixed unless the database cannot hold an unmixed vial
 *   (`sparesRefused`, before `026`), when the vial is added mixed.
 */
export function holdsUnmixed(
  type: InventoryType,
  editing: Pick<EditedContainer, "acquiredOn"> | null,
  sparesRefused: boolean,
): boolean {
  if (type !== "reconstituted") return false
  if (editing) return editing.acquiredOn == null
  return !sparesRefused
}

/**
 * The water and mix date a corrected SPARE is saved with: the ones it already
 * has, never new ones (S5). A dry spare has none, so it stays dry. A powder
 * vial that is somehow already wet (written before this rule) keeps what the
 * database accepted for it, rather than having it cleared by an unrelated fix
 * to its powder, which a database without `026` would refuse.
 */
export function spareMixFields(editing: EditedContainer | null): {
  bac_water_ml: number | null
  reconstituted_on: string | null
} {
  if (!editing || editing.inventoryType !== "reconstituted" || editing.bacWaterMl == null) {
    return { bac_water_ml: null, reconstituted_on: null }
  }
  return { bac_water_ml: editing.bacWaterMl, reconstituted_on: editing.reconstitutedOn }
}

/**
 * Whether the "how many" stepper shows (W17). Every form can be added several
 * at a time, the first started and the rest held as spares, EXCEPT a powder
 * vial on a database that cannot hold one unmixed (before `026`): there each
 * spare would be refused, so the one choice that cannot save is not offered.
 * A correction is one container and never shows it.
 */
export function showsBoxCount(type: InventoryType, editing: boolean, sparesRefused: boolean): boolean {
  if (editing) return false
  return !(type === "reconstituted" && sparesRefused)
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
