import { describe, expect, it } from "vitest"

import type { CompoundStock, StockItem } from "@/lib/db/inventory"
import type { StackCompound } from "@/lib/home/stack"
import { cardStockLine, compoundStockViews, extraFill, withRunway } from "./stockPage"

const item = (over: Partial<StockItem>): StockItem =>
  ({
    id: "i",
    createdAt: null,
    protocolCompoundId: "pc-bpc",
    compoundName: "BPC-157",
    category: "peptide",
    inventoryType: "reconstituted",
    baseUnit: "mg",
    acquiredOn: "2026-09-01",
    reconstitutedOn: "2026-09-01",
    totalAmount: 10,
    totalAmountUnit: "mg",
    bacWaterMl: 2,
    remainingDisplay: 1.2,
    dosesRemaining: null,
    daysToEmpty: null,
    remainingBase: 5,
    totalBase: 10,
    ...over,
  }) as StockItem

const bpc = (over: Partial<StackCompound> = {}): StackCompound => ({
  id: "c-bpc",
  name: "BPC-157",
  category: "peptide",
  method: "subq",
  dose: 250,
  unit: "mcg",
  schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-09-01" },
  rotationSites: [],
  rotationIndex: 0,
  ...over,
})

// Cold review F1's shape: two open vials, the older with 5 doses left and one
// mixed later with 19. The compound holds 24.
const OLD = item({ id: "old", acquiredOn: "2026-09-10", dosesRemaining: 5, remainingBase: 1.25 })
const NEW = item({ id: "new", acquiredOn: "2026-09-20", dosesRemaining: 19, remainingBase: 4.75 })
const HELD: CompoundStock = { protocolCompoundId: "pc-bpc", dosesReady: 24, openCount: 2, sparesHeld: 0 }
const MAP = new Map([["pc-bpc", "c-bpc"]])

// 2026-09-23 is a Wednesday.
const WED = "2026-09-23"
const THU = "2026-09-24"

describe("the sheet's Current vial is the vial in use (cold review F1)", () => {
  it("keeps the in-use vial's own doses, not the compound's total", () => {
    const view = compoundStockViews({ items: [NEW, OLD], compounds: [HELD] }, MAP).get("c-bpc")!
    expect(view.inUse.id).toBe("old")
    expect(withRunway(view, bpc(), WED, WED).dosesRemaining).toBe(5)
  })

  it("walks the runway from every open vial: 24 daily doses, not 5", () => {
    const view = compoundStockViews({ items: [NEW, OLD], compounds: [HELD] }, MAP).get("c-bpc")!
    expect(withRunway(view, bpc(), WED, WED).daysToEmpty).toBe(24)
  })

  it("counts the vial beyond the one in use", () => {
    const view = compoundStockViews({ items: [NEW, OLD], compounds: [HELD] }, MAP).get("c-bpc")!
    expect(view.others).toBe(1)
  })

  it("leaves out a compound it cannot map to the client id", () => {
    expect(compoundStockViews({ items: [OLD], compounds: [HELD] }, new Map()).size).toBe(0)
  })
})

describe("Runs dry follows the date, not the read (cold review B37)", () => {
  // 3 doses held, daily, read on Wednesday.
  const held: CompoundStock = { protocolCompoundId: "pc-bpc", dosesReady: 3, openCount: 1, sparesHeld: 0 }

  it("reads the runway on the day of the read", () => {
    // Nothing logged yet: Wed, Thu, Fri covered, Saturday short.
    const view = compoundStockViews({ items: [OLD], compounds: [held] }, MAP).get("c-bpc")!
    expect(withRunway(view, bpc(), WED, WED).daysToEmpty).toBe(3)
    // Wednesday's dose logged when it landed: Thu, Fri, Sat covered, Sunday short.
    const after = compoundStockViews({ items: [OLD], compounds: [held] }, MAP, () => 1).get("c-bpc")!
    expect(withRunway(after, bpc(), WED, WED).daysToEmpty).toBe(4)
  })

  it("still names Sunday the next morning, with no new read", () => {
    // The read from after Wednesday's dose, rendered on Thursday before any
    // sync: Thu, Fri, Sat covered, Sunday short, 3 days. Baked at read time it
    // stayed 4, which from Thursday is Monday: a day late.
    const view = compoundStockViews({ items: [OLD], compounds: [held] }, MAP, () => 1).get("c-bpc")!
    expect(withRunway(view, bpc(), THU, WED).daysToEmpty).toBe(3)
  })

  it("does not count yesterday's logged dose against today's", () => {
    // Nothing logged at the read, then Thursday comes: every one of Thursday's
    // doses is still to take out of the 3 (Thu, Fri, Sat; Sunday short).
    const view = compoundStockViews({ items: [OLD], compounds: [held] }, MAP).get("c-bpc")!
    expect(withRunway(view, bpc(), THU, WED).daysToEmpty).toBe(3)
  })
})

describe("the containers held beyond the one in use", () => {
  it("lists the other open vials, then the spares", () => {
    const spare = item({ id: "s", acquiredOn: null, reconstitutedOn: null, remainingBase: null })
    const view = compoundStockViews({ items: [spare, NEW, OLD], compounds: [HELD] }, MAP).get("c-bpc")!
    expect(view.extras.map((x) => x.id)).toEqual(["new", "s"])
    expect(view.others).toBe(2)
  })

  it("counts every spare beside a used-up vial (it is in neither list)", () => {
    const empty = item({ id: "done", acquiredOn: "2026-09-01", dosesRemaining: 0, remainingBase: 0 })
    const s1 = item({ id: "s1", acquiredOn: null, reconstitutedOn: null, remainingBase: null })
    const s2 = item({ id: "s2", acquiredOn: null, reconstitutedOn: null, remainingBase: null })
    const held: CompoundStock = { protocolCompoundId: "pc-bpc", dosesReady: null, openCount: 0, sparesHeld: 2 }
    const view = compoundStockViews({ items: [empty, s1, s2], compounds: [held] }, MAP).get("c-bpc")!
    expect(view.inUse.id).toBe("done")
    expect(view.others).toBe(2)
  })

  it("draws an open one at its level, a sealed spare full, a powder spare empty", () => {
    expect(extraFill(NEW)).toBeCloseTo(0.475)
    expect(extraFill(item({ acquiredOn: null, inventoryType: "preconcentrated" }))).toBe(1)
    expect(extraFill(item({ acquiredOn: null }))).toBe(0)
  })
})

describe("the card's foot", () => {
  it("says Runs dry, amber within a week", () => {
    expect(cardStockLine(item({ daysToEmpty: 3 }), false, WED)).toEqual({ label: "Runs dry", text: "In 3 days", low: true })
    expect(cardStockLine(item({ daysToEmpty: 36 }), false, "2026-09-24")).toEqual({ label: "Runs dry", text: "30 Oct", low: false })
  })

  it("says Paused rather than a runway it does not have", () => {
    expect(cardStockLine(item({ daysToEmpty: 3 }), true, WED)).toEqual({ label: "Runs dry", text: "Paused", low: false })
  })

  it("says Empty for a used-up vial", () => {
    expect(cardStockLine(item({ remainingBase: 0, daysToEmpty: 0 }), false, WED)).toEqual({ label: "Runs dry", text: "Empty", low: true })
  })

  it("names a spare that is not started, with no runway", () => {
    expect(cardStockLine(item({ acquiredOn: null }), false, WED)).toEqual({ label: null, text: "Not mixed", low: false })
    expect(cardStockLine(item({ acquiredOn: null, inventoryType: "preconcentrated" }), false, WED)).toEqual({
      label: null,
      text: "Not opened",
      low: false,
    })
  })

  it("says nothing without a runway", () => {
    expect(cardStockLine(item({ daysToEmpty: null }), false, WED)).toBeNull()
  })
})
