import { describe, expect, it } from "vitest"

import {
  MIX_PROMPT,
  doseInPowderUnit,
  formatDrawUnits,
  mixDrawLine,
  mixDrawText,
  mixFillLevel,
  parseAmount,
  unitsToDraw,
} from "./mixDraw"

const base = { powderUnit: "mg", dose: 250, doseUnit: "mcg" }

describe("units to draw", () => {
  it("is the calculator's U-100 arithmetic", () => {
    // 10 mg in 2 mL is 5 mg/mL; 2.5 mg is 0.5 mL, which is 50 units.
    expect(unitsToDraw({ powder: 10, powderUnit: "mg", waterMl: 2, dose: 2.5, doseUnit: "mg" })).toBeCloseTo(50, 9)
    // 5 mg in 2.5 mL is 2 mg/mL; 1 mg is 0.5 mL.
    expect(unitsToDraw({ powder: 5, powderUnit: "mg", waterMl: 2.5, dose: 1, doseUnit: "mg" })).toBeCloseTo(50, 9)
  })

  it("converts a dose in mcg to the powder's mg", () => {
    // 5 mg in 2 mL is 2.5 mg/mL; 250 mcg is 0.25 mg, so 0.1 mL, 10 units.
    expect(unitsToDraw({ ...base, powder: 5, waterMl: 2 })).toBeCloseTo(10, 9)
    // The 1000x slip the other way round: the same dose written in mg is 1000 units.
    expect(unitsToDraw({ ...base, powder: 5, waterMl: 2, dose: 250, doseUnit: "mg" })).toBeCloseTo(10_000, 6)
  })

  it("reads IU against IU, and only against IU", () => {
    expect(unitsToDraw({ powder: 10, powderUnit: "iu", waterMl: 1, dose: 2, doseUnit: "iu" })).toBeCloseTo(20, 9)
    expect(unitsToDraw({ powder: 10, powderUnit: "mg", waterMl: 1, dose: 2, doseUnit: "iu" })).toBeNull()
    expect(unitsToDraw({ powder: 10, powderUnit: "iu", waterMl: 1, dose: 2, doseUnit: "mg" })).toBeNull()
  })

  it("is null while an input is missing", () => {
    expect(unitsToDraw({ ...base, powder: null, waterMl: 2 })).toBeNull()
    expect(unitsToDraw({ ...base, powder: 5, waterMl: null })).toBeNull()
    expect(unitsToDraw({ ...base, powder: 0, waterMl: 2 })).toBeNull()
    expect(unitsToDraw({ ...base, powder: 5, waterMl: 0 })).toBeNull()
  })

  it("is null without a planned dose or with a unit that has no volume", () => {
    expect(unitsToDraw({ ...base, powder: 5, waterMl: 2, dose: 0 })).toBeNull()
    expect(unitsToDraw({ ...base, powder: 5, waterMl: 2, dose: Number.NaN })).toBeNull()
    expect(unitsToDraw({ ...base, powder: 5, waterMl: 2, doseUnit: "tab" })).toBeNull()
  })
})

describe("dose in the powder's unit", () => {
  it("converts between mg, mcg and g", () => {
    expect(doseInPowderUnit(250, "mcg", "mg")).toBeCloseTo(0.25, 12)
    expect(doseInPowderUnit(0.5, "mg", "mcg")).toBeCloseTo(500, 9)
    expect(doseInPowderUnit(0.002, "g", "mg")).toBeCloseTo(2, 12)
    expect(doseInPowderUnit(3, "mg", "mg")).toBe(3)
  })
})

describe("the line under the vial", () => {
  it("asks for both inputs until both are in", () => {
    expect(mixDrawLine({ ...base, powder: null, waterMl: 2 })).toEqual({ kind: "prompt" })
    expect(mixDrawLine({ ...base, powder: 5, waterMl: null })).toEqual({ kind: "prompt" })
    expect(mixDrawText({ kind: "prompt" })).toBe(MIX_PROMPT)
    expect(MIX_PROMPT).toBe("Add the powder and water to see the draw")
  })

  it("reports the draw for the planned dose", () => {
    const line = mixDrawLine({ ...base, powder: 5, waterMl: 2 })
    expect(line).toEqual({ kind: "draw", units: "10", noun: "units", dose: "250 mcg" })
    expect(mixDrawText(line)).toBe("Draw 10 units for 250 mcg")
  })

  it("rounds like the calculator, to one decimal", () => {
    // 6 mg in 2 mL is 3 mg/mL; 0.25 mg is 0.0833 mL, 8.33 units.
    expect(mixDrawText(mixDrawLine({ ...base, powder: 6, waterMl: 2 }))).toBe("Draw 8.3 units for 250 mcg")
  })

  it("says one unit, and IU in capitals", () => {
    expect(
      mixDrawText(mixDrawLine({ powder: 10, powderUnit: "iu", waterMl: 1, dose: 0.1, doseUnit: "iu" })),
    ).toBe("Draw 1 unit for 0.1 IU")
  })

  it("stays empty when there is no honest figure", () => {
    const line = mixDrawLine({ ...base, powder: 5, waterMl: 2, dose: 0 })
    expect(line).toEqual({ kind: "none" })
    expect(mixDrawText(line)).toBe("")
  })
})

describe("display", () => {
  it("never shows a real draw as zero", () => {
    expect(formatDrawUnits(0.04)).toBe("0.04")
    expect(formatDrawUnits(12)).toBe("12")
    expect(formatDrawUnits(8.3333)).toBe("8.3")
  })

  it("reads only positive typed amounts", () => {
    expect(parseAmount("")).toBeNull()
    expect(parseAmount(".")).toBeNull()
    expect(parseAmount("0")).toBeNull()
    expect(parseAmount("2.5")).toBe(2.5)
  })
})

describe("the vial's level", () => {
  it("is dry until both powder and water are in", () => {
    expect(mixFillLevel(null, 2)).toBe(0)
    expect(mixFillLevel(5, null)).toBe(0)
  })

  it("rises with the water and stops short of the cap", () => {
    expect(mixFillLevel(5, 1)).toBeLessThan(mixFillLevel(5, 2))
    expect(mixFillLevel(5, 3.2)).toBeCloseTo(0.82, 9)
    expect(mixFillLevel(5, 10)).toBeCloseTo(0.82, 9)
  })
})
