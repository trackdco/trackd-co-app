import { describe, expect, it } from "vitest"

import { COMPOUNDS } from "@/lib/compounds-catalogue"
import { containerFormFor, isVialForm } from "./form"

/**
 * A supplement's container is resolved from its DOSE UNIT, not its category:
 * grams are scooped, everything else is counted out. Before this, every
 * supplement drew a powder tub, so vitamin C and vitamin D3 were pictured as
 * scoops (Adrian, on his own phone, 2026-07-31).
 */

describe("containerFormFor", () => {
  it("draws an injectable as a vial whatever it holds", () => {
    expect(containerFormFor({ inventoryType: "preconcentrated", category: "anabolic" })).toBe("vial")
    expect(containerFormFor({ inventoryType: "reconstituted", category: "peptide" })).toBe("vial")
    expect(
      containerFormFor({ inventoryType: "reconstituted", category: "supplement", name: "Glutathione" }),
    ).toBe("vial")
  })

  it("draws a gram-dosed supplement as a tub", () => {
    for (const name of [
      "Creatine Monohydrate",
      "Whey Protein",
      "L-Glutamine",
      "Collagen Peptides",
      "Beta-Alanine",
    ]) {
      expect(containerFormFor({ inventoryType: "oral_solid", category: "supplement", name })).toBe("tub")
    }
  })

  it("draws a tablet, capsule or softgel supplement as a bottle", () => {
    for (const name of [
      "Vitamin C",
      "Vitamin D3",
      "Vitamin B Complex",
      "Magnesium",
      "Zinc",
      "Fish Oil (Omega-3)",
      "Melatonin",
      "Ashwagandha",
    ]) {
      expect(containerFormFor({ inventoryType: "oral_solid", category: "supplement", name })).toBe("bottle")
    }
  })

  it("still draws an oral anabolic as a bottle", () => {
    expect(containerFormFor({ inventoryType: "oral_solid", category: "anabolic", name: "Anavar" })).toBe("bottle")
    expect(containerFormFor({ inventoryType: "oral_solid", category: "oral", name: "Anavar" })).toBe("bottle")
  })

  it("keeps the tub for a supplement it cannot identify", () => {
    // A custom "make your own" supplement has no catalogue unit to read. Keeping
    // the old answer means nothing anyone already added silently changes shape.
    expect(containerFormFor({ inventoryType: "oral_solid", category: "supplement" })).toBe("tub")
    expect(
      containerFormFor({ inventoryType: "oral_solid", category: "supplement", name: "My own blend" }),
    ).toBe("tub")
  })

  it("matches the name case-insensitively and ignores surrounding space", () => {
    expect(
      containerFormFor({ inventoryType: "oral_solid", category: "supplement", name: "  vitamin d3 " }),
    ).toBe("bottle")
  })

  it("falls back on a compound with no inventory form recorded", () => {
    expect(containerFormFor({ inventoryType: null, category: "anabolic" })).toBe("vial")
    expect(containerFormFor({ inventoryType: null, category: null })).toBe("bottle")
    expect(
      containerFormFor({ inventoryType: null, category: "supplement", name: "Creatine Monohydrate" }),
    ).toBe("tub")
    expect(
      containerFormFor({ inventoryType: null, category: "supplement", name: "Vitamin D3" }),
    ).toBe("bottle")
  })
})

describe("the catalogue's own supplements", () => {
  it("leaves most of them as counted-out units rather than powders", () => {
    const supplements = COMPOUNDS.filter(
      (c) => c.category === "supplement" && c.defaultInventoryType === "oral_solid",
    )
    const powders = supplements.filter((c) => c.defaultUnit === "g")

    // Sanity: the split is real, and neither side is empty or everything.
    expect(supplements.length).toBeGreaterThan(50)
    expect(powders.length).toBeGreaterThan(4)
    expect(powders.length).toBeLessThan(supplements.length / 2)
  })

  it("prices the vitamins in iu, mg or mcg, never grams", () => {
    for (const c of COMPOUNDS.filter((x) => x.name.startsWith("Vitamin "))) {
      expect(c.defaultUnit).not.toBe("g")
    }
  })
})

describe("isVialForm", () => {
  it("is about the inventory form and nothing else", () => {
    expect(isVialForm("preconcentrated")).toBe(true)
    expect(isVialForm("reconstituted")).toBe(true)
    expect(isVialForm("oral_solid")).toBe(false)
    expect(isVialForm(null)).toBe(false)
    expect(isVialForm(undefined)).toBe(false)
  })
})
