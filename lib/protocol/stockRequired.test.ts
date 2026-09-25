import { describe, expect, it } from "vitest"

import {
  firstEmptyStockField,
  requiredStockFields,
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
