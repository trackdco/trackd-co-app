import { describe, expect, it } from "vitest"

import {
  catalogueDoseUnit,
  needsIuFromMgHint,
  powderUnitsFor,
  resolvePowderUnit,
} from "@/lib/protocol/stockUnits"

describe("powderUnitsFor", () => {
  it("offers iu for the three injectables actually sold in it", () => {
    // `iu` ALONE: these are dosed in iu, and an mg vial on an iu dose is the
    // pairing that never links. There is nothing to toggle to.
    expect(powderUnitsFor("HCG")).toEqual(["iu"])
    expect(powderUnitsFor("hMG")).toEqual(["iu"])
    expect(powderUnitsFor("Somatropin (HGH)")).toEqual(["iu"])
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
    expect(powderUnitsFor("  hcg  ")).toEqual(["iu"])
  })

  it("keeps iu for stock ALREADY saved in it, whatever the catalogue says", () => {
    // Correcting an unrelated number on an existing vial must not silently
    // relabel what is on the user's shelf.
    expect(powderUnitsFor("BPC-157", { storedUnit: "iu" })).toEqual(["mg", "iu"])
  })

  it("does not widen the offer for stock saved in mg", () => {
    expect(powderUnitsFor("BPC-157", { storedUnit: "mg" })).toEqual(["mg"])
    expect(powderUnitsFor("BPC-157", { storedUnit: null })).toEqual(["mg"])
  })

  /**
   * The regression the first cold review caught. "Make your own" offers dose
   * unit `iu` and inventory type `Reconstituted` as free choices, so a user's
   * own HGH is off-catalogue AND dosed in iu. Keying the offer off the catalogue
   * alone gave it `mg`, and `unit_family_compatible` pairs `iu` only with `iu` —
   * so every dose logged fine and the vial never went down. That is the exact
   * failure this module exists to prevent, reintroduced for the one case that
   * cannot be fixed by editing `compounds.csv`.
   */
  describe("the compound's own dose unit wins over the catalogue", () => {
    it("offers iu to an OFF-CATALOGUE compound dosed in iu", () => {
      expect(powderUnitsFor("My Own HGH", { doseUnit: "iu" })).toEqual(["iu"])
    })

    it("offers iu ALONE for an iu-dosed compound — mg could never link", () => {
      // `baseUnitsForDose("iu")` is `["iu"]`. Offering mg here would let the
      // user build a vial that silently never depletes.
      expect(powderUnitsFor("HCG", { doseUnit: "iu" })).toEqual(["iu"])
    })

    it("offers mg alone for mg- and mcg-dosed compounds", () => {
      expect(powderUnitsFor("BPC-157", { doseUnit: "mcg" })).toEqual(["mg"])
      expect(powderUnitsFor("My Own Peptide", { doseUnit: "mg" })).toEqual(["mg"])
    })

    it("still preserves a disagreeing stored unit, appended not substituted", () => {
      // A legacy row saved as `iu` on a compound now dosed in mg: the user must
      // still be able to see and keep it.
      expect(powderUnitsFor("BPC-157", { doseUnit: "mg", storedUnit: "iu" }))
        .toEqual(["mg", "iu"])
      expect(powderUnitsFor("HCG", { doseUnit: "iu", storedUnit: "mg" }))
        .toEqual(["iu", "mg"])
    })

    it("falls back to the catalogue when no dose unit is supplied", () => {
      expect(powderUnitsFor("HCG")).toEqual(["iu"])
      expect(powderUnitsFor("BPC-157")).toEqual(["mg"])
    })
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

/**
 * The oral strength field writes the SAME `base_unit` column under the same DB
 * trigger, and fixing only the powder field left Vitamin D3 unsavable: dosed in
 * iu, `mg` pre-selected, `unit_family_compatible('mg','iu')` false, so the
 * insert was rejected with a message the user could do nothing about.
 */
describe("the oral strength unit — the same column", () => {
  it("offers iu alone for the iu-dosed vitamins", () => {
    expect(powderUnitsFor("Vitamin D3", { doseUnit: "iu" })).toEqual(["iu"])
    expect(powderUnitsFor("Vitamin A", { doseUnit: "iu" })).toEqual(["iu"])
    expect(powderUnitsFor("Vitamin E", { doseUnit: "iu" })).toEqual(["iu"])
  })

  it("resolves a stale mg selection onto iu, so the save is never rejected", () => {
    expect(resolvePowderUnit("mg", powderUnitsFor("Vitamin D3"))).toBe("iu")
  })

  it("leaves mg-dosed orals alone", () => {
    expect(powderUnitsFor("Vitamin C", { doseUnit: "mg" })).toEqual(["mg"])
  })
})

describe("units that no vial can supply", () => {
  it("never offers a unit that could not link", () => {
    // A `g`-dosed compound stocked as reconstituted is already broken; the point
    // is that the offer is derived from the shared family rule rather than a
    // hand-rolled `=== "iu"`, which answered `mg` here and called it valid.
    for (const dose of ["g", "tab", "capsule", "ml", ""]) {
      const offered = powderUnitsFor("Whatever", { doseUnit: dose })
      expect(offered).toHaveLength(1)
      expect(["mg", "iu"]).toContain(offered[0])
    }
  })
})

describe("needsIuFromMgHint", () => {
  it("warns on HGH, which is dosed in iu and sold in mg", () => {
    expect(needsIuFromMgHint("Somatropin (HGH)", ["iu"])).toBe(true)
  })

  it("stays quiet for HCG and hMG, whose boxes state iu", () => {
    expect(needsIuFromMgHint("HCG", ["iu"])).toBe(false)
    expect(needsIuFromMgHint("hMG", ["iu"])).toBe(false)
  })

  it("stays quiet wherever mg is the offer anyway", () => {
    expect(needsIuFromMgHint("BPC-157", ["mg"])).toBe(false)
    expect(needsIuFromMgHint("Somatropin (HGH)", ["mg", "iu"])).toBe(false)
    expect(needsIuFromMgHint(null, ["iu"])).toBe(false)
  })
})
