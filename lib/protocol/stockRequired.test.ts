import { describe, expect, it } from "vitest"

import {
  firstEmptyStockField,
  holdsUnmixed,
  requiredStockFields,
  showsBoxCount,
  spareMixFields,
  type EditedContainer,
  type StockShape,
} from "@/lib/protocol/stockRequired"

const shape = (s: Partial<StockShape>): StockShape => ({
  type: "reconstituted",
  unmixed: false,
  strengthRequired: true,
  dropMode: "ml",
  ...s,
})

describe("requiredStockFields", () => {
  it("asks a powder vial held unmixed for its powder only", () => {
    expect(requiredStockFields(shape({ unmixed: true }))).toEqual(["powder"])
  })

  it("asks a mixed powder vial for its powder and its water", () => {
    expect(requiredStockFields(shape({ unmixed: false }))).toEqual(["powder", "bacWater"])
  })

  it("asks an oil vial for its volume and strength", () => {
    expect(requiredStockFields(shape({ type: "preconcentrated" }))).toEqual(["oilMl", "concentration"])
  })

  it("asks tablets for a strength only when the compound is dosed by weight", () => {
    expect(requiredStockFields(shape({ type: "oral_solid" }))).toEqual(["count", "strength"])
    expect(requiredStockFields(shape({ type: "oral_solid", strengthRequired: false }))).toEqual(["count"])
  })

  it("asks a tub for its weight and never its serving", () => {
    expect(requiredStockFields(shape({ type: "bulk_powder" }))).toEqual(["tubGrams"])
  })

  it("asks a dropper by how it is measured", () => {
    expect(requiredStockFields(shape({ type: "dropper", dropMode: "ml" }))).toEqual(["oilMl", "concentration"])
    expect(requiredStockFields(shape({ type: "dropper", dropMode: "drops" }))).toEqual(["drops"])
  })
})

describe("firstEmptyStockField", () => {
  it("names the first empty field in the order they appear", () => {
    const s = shape({ type: "preconcentrated" })
    expect(firstEmptyStockField(s, {})).toBe("oilMl")
    expect(firstEmptyStockField(s, { oilMl: "10" })).toBe("concentration")
    expect(firstEmptyStockField(s, { concentration: "250" })).toBe("oilMl")
  })

  it("treats a zero or a lone point as empty", () => {
    const s = shape({ type: "bulk_powder" })
    expect(firstEmptyStockField(s, { tubGrams: "0" })).toBe("tubGrams")
    expect(firstEmptyStockField(s, { tubGrams: "." })).toBe("tubGrams")
  })

  it("is null once every required field holds a number", () => {
    expect(firstEmptyStockField(shape({ unmixed: true }), { powder: "5" })).toBeNull()
    expect(firstEmptyStockField(shape({}), { powder: "5", bacWater: "2" })).toBeNull()
  })

  it("ignores an empty optional field", () => {
    expect(firstEmptyStockField(shape({ type: "dropper", dropMode: "drops" }), { drops: "600" })).toBeNull()
  })
})

describe("holdsUnmixed (cold review S5, W17)", () => {
  const spare = { acquiredOn: null }
  const started = { acquiredOn: "2026-09-20" }

  it("holds a new powder vial unmixed, unless the database refused one", () => {
    expect(holdsUnmixed("reconstituted", null, false)).toBe(true)
    expect(holdsUnmixed("reconstituted", null, true)).toBe(false)
  })

  it("holds a corrected SPARE unmixed, whatever form it had", () => {
    expect(holdsUnmixed("reconstituted", spare, false)).toBe(true)
    // The S5 path: a sealed oil spare switched to Reconstituted was asked for
    // water and saved mixed with no start. It stays a dry spare now, even on a
    // database that refused spares (that save is refused and says so).
    expect(holdsUnmixed("reconstituted", spare, true)).toBe(true)
  })

  it("asks a started vial for its water", () => {
    expect(holdsUnmixed("reconstituted", started, false)).toBe(false)
  })

  it("is never true for anything but a powder vial", () => {
    expect(holdsUnmixed("preconcentrated", spare, false)).toBe(false)
    expect(holdsUnmixed("oral_solid", null, false)).toBe(false)
  })
})

describe("spareMixFields (S5)", () => {
  const edited = (over: Partial<EditedContainer>): EditedContainer => ({
    inventoryType: "reconstituted",
    acquiredOn: null,
    bacWaterMl: null,
    reconstitutedOn: null,
    ...over,
  })

  it("gives a new vial and a dry spare no water", () => {
    expect(spareMixFields(null)).toEqual({ bac_water_ml: null, reconstituted_on: null })
    expect(spareMixFields(edited({}))).toEqual({ bac_water_ml: null, reconstituted_on: null })
  })

  it("never gives a spare switched from another form any water", () => {
    expect(spareMixFields(edited({ inventoryType: "preconcentrated" }))).toEqual({
      bac_water_ml: null,
      reconstituted_on: null,
    })
  })

  it("keeps the water an already-wet powder vial has, rather than clearing it", () => {
    expect(spareMixFields(edited({ bacWaterMl: 2, reconstitutedOn: "2026-09-01" }))).toEqual({
      bac_water_ml: 2,
      reconstituted_on: "2026-09-01",
    })
  })
})

describe("showsBoxCount (W17)", () => {
  it("offers several vials held unmixed where the database can store them", () => {
    expect(showsBoxCount("reconstituted", false, false)).toBe(true)
  })

  it("offers no count for a powder vial the database cannot hold unmixed", () => {
    expect(showsBoxCount("reconstituted", false, true)).toBe(false)
  })

  it("keeps the count for every other form, whose spares any database holds", () => {
    expect(showsBoxCount("preconcentrated", false, true)).toBe(true)
    expect(showsBoxCount("oral_solid", false, true)).toBe(true)
  })

  it("never shows it on a correction, which is one container", () => {
    expect(showsBoxCount("preconcentrated", true, false)).toBe(false)
  })
})
