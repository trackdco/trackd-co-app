/**
 * W20: the Add compound pad shows only its own section's fields. A dose
 * shows the doses; Stock on hand shows its own amounts (Volume and Strength
 * for a ready-made vial), the way "mL left" already had a pad of its own.
 */
import { describe, expect, it } from "vitest"

import { fieldsInSection, liveSection, padSectionLabel, padSectionOf } from "./padSections"

/** The sheet's fields in its order, for a ready-made vial with two doses a
 *  day, a cycle, every few days, and stock on hand. */
const SHEET = [
  "dose",
  "everyN",
  "later-0",
  "later-1",
  "cycleOn",
  "cycleOff",
  "cycleRounds",
  "stMl",
  "stConc",
].map((id) => ({ id }))

const ids = (fs: { id: string }[]) => fs.map((f) => f.id)

describe("padSectionOf", () => {
  it("puts every dose in the dose section", () => {
    expect(["dose", "later-0", "later-9"].map(padSectionOf)).toEqual(["dose", "dose", "dose"])
  })
  it("puts every stock amount in the stock section", () => {
    for (const id of ["stPowder", "stBac", "stMl", "stConc", "stCount", "stStrength", "stTubGrams", "stServingG"]) {
      expect(padSectionOf(id)).toBe("stock")
    }
  })
  it("keeps the cycle and the how-often number in their own sections", () => {
    expect(padSectionOf("cycleOn")).toBe("cycle")
    expect(padSectionOf("everyN")).toBe("often")
  })
  it("gives an unknown field a section of its own, never another's", () => {
    expect(padSectionOf("stExactLeft")).toBe("own:stExactLeft")
    expect(padSectionOf("later-x")).toBe("own:later-x")
  })
})

describe("fieldsInSection", () => {
  it("a dose shows Dose, Dose 2 and Dose 3 only, in the sheet's order", () => {
    expect(ids(fieldsInSection(SHEET, "dose"))).toEqual(["dose", "later-0", "later-1"])
  })
  it("Stock on hand shows Volume and Strength only", () => {
    expect(ids(fieldsInSection(SHEET, "stock"))).toEqual(["stMl", "stConc"])
  })
  it("the cycle shows its own numbers", () => {
    expect(ids(fieldsInSection(SHEET, "cycle"))).toEqual(["cycleOn", "cycleOff", "cycleRounds"])
  })
  it("no section yet is no fields", () => {
    expect(fieldsInSection(SHEET, null)).toEqual([])
  })
})

describe("liveSection", () => {
  it("follows the open field in the same render (so the pad is never handed a list without it)", () => {
    expect(liveSection("stMl", "dose")).toBe("stock")
    // The field that opened the pad is always in what the pad is given.
    for (const { id } of SHEET) {
      expect(ids(fieldsInSection(SHEET, liveSection(id, null)))).toContain(id)
    }
  })
  it("holds the last section while the pad slides away", () => {
    expect(liveSection(null, "stock")).toBe("stock")
    expect(liveSection(null, null)).toBeNull()
  })
})

describe("padSectionLabel", () => {
  it("names the pad for its section", () => {
    expect(padSectionLabel("dose")).toBe("Dose")
    expect(padSectionLabel("stock")).toBe("Stock on hand")
    expect(padSectionLabel(null)).toBe("Compound numbers")
  })
})
