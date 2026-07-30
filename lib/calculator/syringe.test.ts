import { describe, expect, it } from "vitest"

import {
  BARREL_W,
  BARREL_X,
  MIN_READABLE_UNITS,
  SYRINGE_SIZES,
  barrelX,
  fillFraction,
  graduations,
  misuseKind,
  syringeSize,
} from "./syringe"

describe("SYRINGE_SIZES", () => {
  it("offers exactly the three sizes the spec names, smallest first", () => {
    expect(SYRINGE_SIZES.map((s) => s.id)).toEqual(["0.3", "0.5", "1"])
    expect(SYRINGE_SIZES.map((s) => s.label)).toEqual(["0.3 mL", "0.5 mL", "1 mL"])
  })

  it("marks each barrel in U-100 units (1 mL = 100 U)", () => {
    for (const s of SYRINGE_SIZES) expect(s.units).toBe(s.ml * 100)
  })

  it("uses the labelling intervals Adrian approved: 5 / 5 / 10", () => {
    expect(SYRINGE_SIZES.map((s) => s.labelStep)).toEqual([5, 5, 10])
    expect(SYRINGE_SIZES.map((s) => s.minorStep)).toEqual([1, 1, 2])
  })

  it("labels the capacity itself on every size, so the barrel end is never blank", () => {
    for (const s of SYRINGE_SIZES) expect(s.units % s.labelStep).toBe(0)
  })
})

describe("graduations", () => {
  it("runs from 0 to the capacity inclusive", () => {
    for (const s of SYRINGE_SIZES) {
      const g = graduations(s)
      expect(g[0]).toEqual({ units: 0, fraction: 0, labelled: true })
      expect(g[g.length - 1]).toEqual({ units: s.units, fraction: 1, labelled: true })
    }
  })

  it("steps by minorStep with no float drift off the end", () => {
    for (const s of SYRINGE_SIZES) {
      const g = graduations(s)
      expect(g.length).toBe(s.units / s.minorStep + 1)
      // Every tick is an exact multiple, not 29.999999999.
      for (const tick of g) expect(tick.units % s.minorStep).toBe(0)
    }
  })

  it("keeps the 10-40 unit band readable on every size (the spec's bar)", () => {
    for (const s of SYRINGE_SIZES) {
      const labelled = graduations(s)
        .filter((t) => t.labelled && t.units >= 10 && t.units <= 40)
        .map((t) => t.units)
      // At least four printed numbers inside the band, so no value in it is
      // more than half a label-step away from a number.
      expect(labelled.length).toBeGreaterThanOrEqual(4)
    }
    expect(
      graduations(syringeSize("1"))
        .filter((t) => t.labelled && t.units >= 10 && t.units <= 40)
        .map((t) => t.units),
    ).toEqual([10, 20, 30, 40])
  })

  it("puts fractions in step with the units", () => {
    const half = graduations(syringeSize("0.5")).find((t) => t.units === 25)
    expect(half?.fraction).toBe(0.5)
  })
})

describe("fillFraction — the proportionality the graphic exists for", () => {
  it("draws the SAME dose differently on a different barrel", () => {
    expect(fillFraction(10, syringeSize("0.5"))).toBeCloseTo(0.2, 10)
    expect(fillFraction(10, syringeSize("1"))).toBeCloseTo(0.1, 10)
    expect(fillFraction(10, syringeSize("0.3"))).toBeCloseTo(1 / 3, 10)
  })

  it("is empty with no result", () => {
    expect(fillFraction(null, syringeSize("1"))).toBe(0)
    expect(fillFraction(Number.NaN, syringeSize("1"))).toBe(0)
  })

  it("clamps rather than overflowing the barrel", () => {
    expect(fillFraction(250, syringeSize("1"))).toBe(1)
    expect(fillFraction(-5, syringeSize("1"))).toBe(0)
  })

  it("fills the barrel exactly at capacity", () => {
    for (const s of SYRINGE_SIZES) expect(fillFraction(s.units, s)).toBe(1)
  })
})

describe("misuseKind", () => {
  it("says nothing until there is a result", () => {
    expect(misuseKind(null, syringeSize("1"))).toBeNull()
  })

  it("fires under 2 units, and not at exactly 2", () => {
    expect(misuseKind(1.9, syringeSize("1"))).toBe("under")
    expect(misuseKind(0, syringeSize("1"))).toBe("under")
    expect(misuseKind(MIN_READABLE_UNITS, syringeSize("1"))).toBeNull()
  })

  it("fires over the SELECTED capacity, not a fixed number", () => {
    expect(misuseKind(40, syringeSize("0.3"))).toBe("over")
    expect(misuseKind(40, syringeSize("0.5"))).toBeNull()
    expect(misuseKind(60, syringeSize("0.5"))).toBe("over")
    expect(misuseKind(60, syringeSize("1"))).toBeNull()
  })

  it("does not fire at exactly capacity — a full barrel is drawable", () => {
    for (const s of SYRINGE_SIZES) expect(misuseKind(s.units, s)).toBeNull()
  })
})

describe("barrelX", () => {
  it("maps 0 and 1 to the barrel's ends", () => {
    expect(barrelX(0)).toBe(BARREL_X)
    expect(barrelX(1)).toBe(BARREL_X + BARREL_W)
  })
})

describe("syringeSize", () => {
  it("resolves each id", () => {
    for (const s of SYRINGE_SIZES) expect(syringeSize(s.id)).toBe(s)
  })
})
