import { describe, expect, it } from "vitest"

import type { StockItem } from "@/lib/db/inventory"
import { mixWaterDefault, runsDryText, stockSubLine } from "./stockPage"

const item = (over: Partial<StockItem>): StockItem =>
  ({
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
    remainingDisplay: 1.2,
    ...over,
  }) as StockItem

describe("runs dry", () => {
  it("counts down, amber, within a week", () => {
    expect(runsDryText(0, "2026-09-24")).toEqual({ text: "Today", low: true })
    expect(runsDryText(1, "2026-09-24")).toEqual({ text: "Tomorrow", low: true })
    expect(runsDryText(3, "2026-09-24")).toEqual({ text: "In 3 days", low: true })
    expect(runsDryText(7, "2026-09-24")).toEqual({ text: "In 7 days", low: true })
  })

  it("gives the date further out", () => {
    expect(runsDryText(36, "2026-09-24")).toEqual({ text: "30 Oct", low: false })
  })

  it("has nothing to say without a runway", () => {
    expect(runsDryText(null, "2026-09-24")).toBeNull()
  })
})

describe("the line under the name", () => {
  it("counts open vials and spares", () => {
    const open = [item({ id: "a" }), item({ id: "b" })]
    expect(stockSubLine(open, [item({ id: "s" })], open[0])).toBe("2 open · 1 spare")
  })

  it("says what is left in the one in use", () => {
    const one = item({ inventoryType: "preconcentrated", remainingDisplay: 8.5, totalAmountUnit: "ml" })
    expect(stockSubLine([one], [], one)).toBe("8.5 mL left")
  })
})

describe("the water a Mix offers", () => {
  it("takes the latest mix, else 2 mL", () => {
    expect(mixWaterDefault([item({ bacWaterMl: 3, reconstitutedOn: "2026-09-10" }), item({ bacWaterMl: 2.5, reconstitutedOn: "2026-09-01" })])).toBe(3)
    expect(mixWaterDefault([])).toBe(2)
  })
})
