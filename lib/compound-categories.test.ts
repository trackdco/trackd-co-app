import { describe, expect, it } from "vitest"

import {
  CATEGORY_DISPLAY_ORDER,
  CATEGORY_META,
  categoryRank,
  type CompoundCategory,
} from "./compound-categories"

/**
 * The order compound groups are shown in, everywhere. It is BY CONSEQUENCE, not
 * by how many of each the user holds (Adrian, 2026-07-31) — the Protocol row
 * used to sort by volume, so five supplements pushed a single anabolic off the
 * end and adding a sixth vitamin silently reordered the screen.
 */
describe("CATEGORY_DISPLAY_ORDER", () => {
  it("covers every category exactly once", () => {
    const known = Object.keys(CATEGORY_META) as CompoundCategory[]
    expect([...CATEGORY_DISPLAY_ORDER].sort()).toEqual([...known].sort())
    expect(new Set(CATEGORY_DISPLAY_ORDER).size).toBe(CATEGORY_DISPLAY_ORDER.length)
  })

  it("leads with anabolics and peptides", () => {
    expect(CATEGORY_DISPLAY_ORDER[0]).toBe("anabolic")
    expect(CATEGORY_DISPLAY_ORDER[1]).toBe("peptide")
  })

  it("puts supplements last, which is the whole point", () => {
    expect(CATEGORY_DISPLAY_ORDER.at(-1)).toBe("supplement")
    expect(categoryRank("anabolic")).toBeLessThan(categoryRank("supplement"))
    expect(categoryRank("peptide")).toBeLessThan(categoryRank("supplement"))
  })

  it("sorts an unknown category after every known one", () => {
    for (const c of CATEGORY_DISPLAY_ORDER) {
      expect(categoryRank(c)).toBeLessThan(categoryRank("not-a-category"))
    }
  })

  it("is stable regardless of how many are in each group", () => {
    // The regression in one line: one anabolic among five supplements still
    // sorts first.
    const rows = [
      ...Array.from({ length: 5 }, () => "supplement"),
      "anabolic",
    ]
    const sorted = [...rows].sort((a, b) => categoryRank(a) - categoryRank(b))
    expect(sorted[0]).toBe("anabolic")
  })
})
