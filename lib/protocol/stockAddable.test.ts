import { describe, expect, it } from "vitest"

import { COMPOUNDS } from "@/lib/compounds-catalogue"
import { unitFamilyOk } from "@/lib/db/doseUnits"
import { oralStockRule, powderUnitsFor, resolvePowderUnit } from "@/lib/protocol/stockUnits"

/**
 * **Can every compound in the catalogue still have its stock recorded?**
 *
 * The narrowing work (`stockUnits.ts`) removed choices from the add-stock forms
 * to stop them producing rows the database rejects. The risk of that kind of
 * change is the opposite failure: narrowing so far that something legitimate can
 * no longer be entered at all. Four cold reviews asked this question by hand;
 * this asks it of all 205 compounds on every run.
 *
 * It reproduces what the two sheets actually write for a compound's DEFAULT
 * form, then asserts the row would satisfy every constraint that guards
 * `inventory_items`:
 *
 *  - `inv_type_fields` (`supabase/protocol/016`) — the per-form field shape.
 *  - `strength_positive` (`trackd_schema_v0_4_2.sql`) — a stated strength is > 0.
 *  - `check_inventory_unit_family` — `base_unit` pairs with the compound's
 *    `dose_unit`, via `unit_family_compatible`.
 *
 * A failure here means a real user cannot record stock for a real compound, and
 * would find that out as a save that fails with no way forward.
 */

/** What the sheets write for a compound, given its catalogue defaults. */
function rowFor(name: string, doseUnit: string, inventoryType: string) {
  switch (inventoryType) {
    case "reconstituted": {
      const offered = powderUnitsFor(name, { doseUnit })
      // Both sheets resolve the selection against the offer at save time.
      const base = resolvePowderUnit("mg", offered)
      return { baseUnit: base, totalAmountUnit: base, strength: null as number | null }
    }
    case "preconcentrated":
      // `base_unit` is fixed at `mg` by `inv_type_fields`; the amount is mL.
      return { baseUnit: "mg", totalAmountUnit: "ml", strength: null as number | null }
    case "bulk_powder":
      // A tub is grams in, grams out.
      return { baseUnit: "g", totalAmountUnit: "g", strength: null as number | null }
    case "oral_solid": {
      const rule = oralStockRule(name, { doseUnit })
      if (rule.baseUnit === null) return null
      return rule.strengthRequired
        ? { baseUnit: rule.baseUnit, totalAmountUnit: "tab", strength: 5 }
        : { baseUnit: rule.baseUnit, totalAmountUnit: rule.baseUnit, strength: null }
    }
    default:
      return null
  }
}

/** `inv_type_fields`, transcribed from `supabase/protocol/016_oral_units.sql`. */
function satisfiesTypeFields(
  inventoryType: string,
  row: { baseUnit: string; totalAmountUnit: string; strength: number | null },
): boolean {
  const { baseUnit: b, totalAmountUnit: t, strength: s } = row
  if (inventoryType === "reconstituted") {
    return s === null && (b === "mg" || b === "iu") && t === b
  }
  if (inventoryType === "preconcentrated") return s === null && b === "mg" && t === "ml"
  if (inventoryType === "bulk_powder") return s === null && b === "g" && t === "g"
  if (inventoryType === "oral_solid") {
    // Strength stated: base is the strength's unit, the count is tabs or caps.
    if (s !== null) return s > 0 && (b === "mg" || b === "iu") && (t === "tab" || t === "capsule")
    // Strength absent: the tablet IS the unit, so the two columns must agree.
    return (b === "tab" || b === "capsule") && t === b
  }
  return false
}

describe("every catalogue compound can still have stock added", () => {
  const cases = COMPOUNDS.map((c) => ({
    name: c.name,
    doseUnit: c.defaultUnit,
    inventoryType: c.defaultInventoryType,
  }))

  it("covers the whole catalogue", () => {
    expect(cases.length).toBeGreaterThan(200)
  })

  it("produces a row that satisfies every constraint, for every compound", () => {
    const blocked: string[] = []
    const invalid: string[] = []

    for (const { name, doseUnit, inventoryType } of cases) {
      const row = rowFor(name, doseUnit, inventoryType)
      if (row === null) {
        blocked.push(`${name} (${doseUnit}, ${inventoryType})`)
        continue
      }
      if (!satisfiesTypeFields(inventoryType, row)) {
        invalid.push(`${name}: inv_type_fields — ${JSON.stringify(row)}`)
      }
      if (!unitFamilyOk(row.baseUnit, doseUnit)) {
        invalid.push(`${name}: unit family — base ${row.baseUnit} vs dose ${doseUnit}`)
      }
      if (row.strength !== null && !(row.strength > 0)) {
        invalid.push(`${name}: strength_positive`)
      }
    }

    // Named individually rather than counted, so a regression says WHICH
    // compound a user can no longer record.
    expect({ blocked, invalid }).toEqual({ blocked: [], invalid: [] })
  })

  it("names the forms each dose unit resolves to, so a change is visible here", () => {
    const seen = new Map<string, string>()
    for (const { name, doseUnit, inventoryType } of cases) {
      const row = rowFor(name, doseUnit, inventoryType)
      if (row) seen.set(`${inventoryType}/${doseUnit}`, row.baseUnit)
    }
    expect(Object.fromEntries([...seen].sort())).toMatchInlineSnapshot(`
      {
        "bulk_powder/g": "g",
        "oral_solid/capsule": "capsule",
        "oral_solid/iu": "iu",
        "oral_solid/mcg": "mg",
        "oral_solid/mg": "mg",
        "preconcentrated/mg": "mg",
        "reconstituted/iu": "iu",
        "reconstituted/mcg": "mg",
        "reconstituted/mg": "mg",
      }
    `)
  })
})
