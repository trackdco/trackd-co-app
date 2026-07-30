import { describe, expect, it } from "vitest"

import {
  VIAL_FILL_BOTTOM,
  VIAL_FILL_SPAN,
  VIAL_FILL_TOP,
  VIAL_MENISCUS_HEIGHT,
  clampFill,
  vialLiquid,
} from "./geometry"
import { inventoryTypeForCompound } from "./form"

describe("vialLiquid", () => {
  it("is empty at 0% — floor height, nothing drawn above it", () => {
    expect(vialLiquid(0)).toEqual({
      y: VIAL_FILL_BOTTOM,
      height: 0,
      meniscusHeight: 0,
    })
  })

  it("sits halfway at 50%", () => {
    const { y, height } = vialLiquid(0.5)
    expect(height).toBe(VIAL_FILL_SPAN / 2)
    expect(height).toBe(32.25)
    expect(y).toBe(54.25)
    // The surface is exactly midway between empty and full.
    expect(y).toBe((VIAL_FILL_TOP + VIAL_FILL_BOTTOM) / 2)
  })

  it("reaches the shoulder at 100%", () => {
    expect(vialLiquid(1)).toEqual({
      y: VIAL_FILL_TOP,
      height: VIAL_FILL_SPAN,
      meniscusHeight: VIAL_MENISCUS_HEIGHT,
    })
    expect(VIAL_FILL_SPAN).toBe(64.5)
  })

  it("keeps the floor still at every level — y + height is always the floor", () => {
    for (const fill of [0, 0.13, 0.25, 0.5, 0.75, 0.99, 1]) {
      const { y, height } = vialLiquid(fill)
      expect(y + height).toBeCloseTo(VIAL_FILL_BOTTOM, 10)
    }
  })

  it("never lets the meniscus outgrow the liquid it sits on", () => {
    const shallow = vialLiquid(0.02)
    expect(shallow.height).toBeLessThan(VIAL_MENISCUS_HEIGHT)
    expect(shallow.meniscusHeight).toBe(shallow.height)
  })

  it("clamps out-of-range and non-finite fills rather than overflowing the glass", () => {
    expect(vialLiquid(1.4).height).toBe(VIAL_FILL_SPAN)
    expect(vialLiquid(-0.3).height).toBe(0)
    expect(vialLiquid(Number.NaN).height).toBe(0)
  })
})

describe("clampFill", () => {
  it("passes an in-range fill through untouched", () => {
    expect(clampFill(0.42)).toBe(0.42)
  })

  it("treats a non-finite fill as empty — garbage must not draw a full vial", () => {
    expect(clampFill(Number.NaN)).toBe(0)
    expect(clampFill(Number.POSITIVE_INFINITY)).toBe(0)
    expect(clampFill(Number.NEGATIVE_INFINITY)).toBe(0)
  })
})

describe("inventoryTypeForCompound — one answer for every surface", () => {
  it("resolves a catalogue compound by name and route", () => {
    expect(inventoryTypeForCompound("Testosterone Enanthate", "im")).toBe(
      "preconcentrated",
    )
  })

  it("falls back to the ROUTE off-catalogue, so a custom injectable is a vial", () => {
    // Protocol did this and the other screens returned null, so the same custom
    // compound drew a vial on one screen and a bottle on another.
    expect(inventoryTypeForCompound("My Secret Blend", "subq")).toBe(
      "preconcentrated",
    )
    expect(inventoryTypeForCompound("My Secret Blend", "im")).toBe(
      "preconcentrated",
    )
    expect(inventoryTypeForCompound("Some Custom Tablet", "po")).toBe("oral_solid")
  })

  it("never returns null, so no caller has to invent its own fallback", () => {
    for (const [n, m] of [["", "po"], ["  ", "im"], ["Unknown", "subq"]] as const) {
      expect(inventoryTypeForCompound(n, m)).not.toBeNull()
    }
  })

  it("ignores case and surrounding whitespace in the name", () => {
    expect(inventoryTypeForCompound("  testosterone enanthate  ", "im")).toBe(
      inventoryTypeForCompound("Testosterone Enanthate", "im"),
    )
  })
})
