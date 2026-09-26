import { describe, expect, it } from "vitest"

import {
  MAX_DRAWN_EXTRAS,
  ROW_ENTER_OFFSET_PX,
  ROW_STAGGER_CAP,
  ROW_STAGGER_MS,
  cardName,
  effectiveType,
  extrasDrawn,
  orderByCategory,
  rowEntrance,
  rowGroups,
} from "./compoundRow"

const c = (name: string, category: string) => ({ name, category }) as { name: string; category: never }

const ROW = [
  c("Semaglutide", "peptide"),
  c("Anastrozole", "ancillary"),
  c("Testosterone Enanthate", "anabolic"),
  c("BPC-157", "peptide"),
  c("Nandrolone", "anabolic"),
]

describe("the row's type groups (W16)", () => {
  it("groups under type titles, anabolics first, names in order", () => {
    const groups = rowGroups(ROW, "all")
    expect(groups.map((g) => [g.label, g.compounds.map((x) => x.name)])).toEqual([
      ["Anabolics", ["Nandrolone", "Testosterone Enanthate"]],
      ["Peptides", ["BPC-157", "Semaglutide"]],
      ["Ancillaries", ["Anastrozole"]],
    ])
  })

  it("numbers each group's first card in the whole row", () => {
    expect(rowGroups(ROW, "all").map((g) => g.start)).toEqual([0, 2, 4])
  })

  it("shows one group when a type is chosen", () => {
    expect(rowGroups(ROW, "peptide").map((g) => g.key)).toEqual(["peptide"])
  })

  it("titles a category it does not know Other", () => {
    expect(rowGroups([c("Mystery", "unknown")], "all")[0].label).toBe("Other")
  })

  it("keeps the old order for its callers", () => {
    expect(orderByCategory(ROW).map((x) => x.name)[0]).toBe("Nandrolone")
  })
})

describe("the chosen type", () => {
  it("falls back to All when its last compound is gone, so the row is never empty behind a hidden chip", () => {
    expect(effectiveType("sarm", ROW)).toBe("all")
    expect(effectiveType("peptide", ROW)).toBe("peptide")
    expect(effectiveType("all", [])).toBe("all")
  })
})

describe("a card's name, in full (cold review D10)", () => {
  it("reads a blend as its name over what it holds, nothing dropped", () => {
    expect(cardName("Glow (BPC-157 + TB-500 + GHK-Cu)")).toEqual({ head: "Glow", parts: ["BPC-157", "TB-500", "GHK-Cu"] })
  })

  it("leaves any other name as it stands", () => {
    expect(cardName("Testosterone Enanthate")).toEqual({ head: "Testosterone Enanthate", parts: null })
  })
})

describe("the containers drawn behind (W18)", () => {
  it("draws one per container beyond the one in use, up to the cap", () => {
    expect(extrasDrawn(0)).toEqual([])
    expect(extrasDrawn(2)).toHaveLength(2)
    expect(extrasDrawn(9)).toHaveLength(MAX_DRAWN_EXTRAS)
  })

  it("steps each one further back and fainter", () => {
    const [a, b] = extrasDrawn(2)
    expect(b.offsetX).toBeGreaterThan(a.offsetX)
    expect(b.opacity).toBeLessThan(a.opacity)
    expect(b.opacity).toBeGreaterThan(0)
  })
})

describe("the type switch's entrance (W46)", () => {
  it("slides each card in after the one before, from the right", () => {
    expect(rowEntrance(0, false)).toMatchObject({ delay: 0, fromX: ROW_ENTER_OFFSET_PX })
    expect(rowEntrance(3, false).delay).toBe(3 * ROW_STAGGER_MS)
  })

  it("keeps the stagger in the house's 40 to 60ms", () => {
    expect(ROW_STAGGER_MS).toBeGreaterThanOrEqual(40)
    expect(ROW_STAGGER_MS).toBeLessThanOrEqual(60)
  })

  it("brings the Add card in last, and never keeps a long row waiting", () => {
    const cards = 20
    const add = rowEntrance(cards, false).delay
    for (let i = 0; i < cards; i++) expect(add).toBeGreaterThanOrEqual(rowEntrance(i, false).delay)
    expect(add).toBe(ROW_STAGGER_CAP * ROW_STAGGER_MS)
  })

  it("is one fade under reduced motion: no slide, no stagger", () => {
    expect(rowEntrance(5, true)).toMatchObject({ delay: 0, fromX: 0 })
    expect(rowEntrance(5, true).duration).toBeLessThanOrEqual(200)
  })
})
