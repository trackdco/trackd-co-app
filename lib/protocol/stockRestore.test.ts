import { describe, expect, it } from "vitest"

import type { StockItem } from "@/lib/db/inventory"
import { stockRowOf } from "./stockRestore"

const item = (over: Partial<StockItem>): StockItem => ({
  id: "i",
  createdAt: null,
  protocolCompoundId: "pc",
  compoundName: "Retatrutide",
  category: "peptide",
  inventoryType: "reconstituted",
  baseUnit: "mg",
  acquiredOn: "2026-09-01",
  reconstitutedOn: "2026-09-01",
  totalAmount: 10,
  totalAmountUnit: "mg",
  bacWaterMl: 2,
  concentrationMgPerMl: null,
  strengthPerUnit: null,
  servingSizeG: null,
  priorUsedBase: 1.5,
  remainingDisplay: 1.2,
  dosesRemaining: 4,
  estEmptyDate: null,
  daysToEmpty: 4,
  mlPerDose: null,
  unitsPerDoseOral: null,
  concentrationPerMl: null,
  remainingBase: 8.5,
  totalBase: 10,
  ...over,
})

describe("stockRowOf", () => {
  it("gives back every raw input of a mixed vial, including its mix date and part-used offset", () => {
    expect(stockRowOf(item({}))).toEqual({
      inventory_type: "reconstituted",
      base_unit: "mg",
      total_amount: 10,
      total_amount_unit: "mg",
      bac_water_ml: 2,
      concentration_mg_per_ml: null,
      strength_per_unit: null,
      serving_size_g: null,
      reconstituted_on: "2026-09-01",
      prior_used_base: 1.5,
    })
  })

  it("keeps an unmixed spare unmixed: no water, no mix date", () => {
    const row = stockRowOf(item({ bacWaterMl: null, reconstitutedOn: null, acquiredOn: null, priorUsedBase: null }))
    expect(row?.bac_water_ml).toBeNull()
    expect(row?.reconstituted_on).toBeNull()
    expect(row?.prior_used_base).toBeNull()
  })

  it("carries an oil's strength and a tub's serving", () => {
    expect(
      stockRowOf(item({ inventoryType: "preconcentrated", totalAmountUnit: "ml", totalAmount: 10, concentrationMgPerMl: 250, bacWaterMl: null })),
    ).toMatchObject({ inventory_type: "preconcentrated", total_amount_unit: "ml", concentration_mg_per_ml: 250 })
    expect(
      stockRowOf(item({ inventoryType: "bulk_powder", baseUnit: "g", totalAmountUnit: "g", totalAmount: 300, servingSizeG: 5 })),
    ).toMatchObject({ inventory_type: "bulk_powder", base_unit: "g", serving_size_g: 5 })
  })

  it("offers nothing when the row cannot be written back whole", () => {
    expect(stockRowOf(item({ totalAmount: null }))).toBeNull()
    expect(stockRowOf(item({ totalAmountUnit: null }))).toBeNull()
    expect(stockRowOf(item({ baseUnit: "" }))).toBeNull()
  })
})
