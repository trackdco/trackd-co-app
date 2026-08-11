import { describe, expect, it } from "vitest"

import {
  catalogueDoseUnit,
  powderUnitsFor,
  resolvePowderUnit,
} from "@/lib/protocol/stockUnits"

describe("powderUnitsFor", () => {
  it("offers iu for the three injectables actually sold in it", () => {
    expect(powderUnitsFor("HCG")).toEqual(["mg", "iu"])
    expect(powderUnitsFor("hMG")).toEqual(["mg", "iu"])
    expect(powderUnitsFor("Somatropin (HGH)")).toEqual(["mg", "iu"])
  })

  it("offers mg alone for a peptide — the noise Adrian reported", () => {
    expect(powderUnitsFor("BPC-157")).toEqual(["mg"])
    expect(powderUnitsFor("TB-500")).toEqual(["mg"])
    expect(powderUnitsFor("Semaglutide")).toEqual(["mg"])
  })

  it("offers mg alone for an off-catalogue compound", () => {
    expect(powderUnitsFor("My Own Blend")).toEqual(["mg"])
    expect(powderUnitsFor(null)).toEqual(["mg"])
    expect(powderUnitsFor("")).toEqual(["mg"])
  })

  it("matches the catalogue case- and space-insensitively", () => {
    expect(powderUnitsFor("  hcg  ")).toEqual(["mg", "iu"])
  })

  it("keeps iu for stock ALREADY saved in it, whatever the catalogue says", () => {
    // Correcting an unrelated number on an existing vial must not silently
    // relabel what is on the user's shelf.
    expect(powderUnitsFor("BPC-157", "iu")).toEqual(["mg", "iu"])
  })

  it("does not widen the offer for stock saved in mg", () => {
    expect(powderUnitsFor("BPC-157", "mg")).toEqual(["mg"])
    expect(powderUnitsFor("BPC-157", null)).toEqual(["mg"])
  })
})

describe("resolvePowderUnit", () => {
  it("keeps a selection that is still on offer", () => {
    expect(resolvePowderUnit("iu", ["mg", "iu"])).toBe("iu")
    expect(resolvePowderUnit("mg", ["mg"])).toBe("mg")
  })

  it("falls back to mg when the selection is no longer offered", () => {
    // Switching the sheet from HCG to BPC-157 with `iu` selected must not write
    // `base_unit: "iu"` to a peptide — that link never decrements (016).
    expect(resolvePowderUnit("iu", ["mg"])).toBe("mg")
  })
})

describe("catalogueDoseUnit", () => {
  it("reads the unit off the bundled catalogue", () => {
    expect(catalogueDoseUnit("HCG")).toBe("iu")
    expect(catalogueDoseUnit("Creatine Monohydrate")).toBe("g")
    expect(catalogueDoseUnit("BPC-157")).toBe("mcg")
  })

  it("is null off-catalogue", () => {
    expect(catalogueDoseUnit("My Own Blend")).toBeNull()
  })
})
