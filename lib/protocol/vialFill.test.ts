import { describe, expect, it } from "vitest"

import {
  formatGrams,
  resolveFill,
  vialBasis,
  type VialAmounts,
} from "./vialFill"

/** Every field zeroed — each test names only the ones its form actually uses,
 *  which is also how the sheets build it. */
const NONE: VialAmounts = {
  powder: 0,
  bacWater: 0,
  oilMl: 0,
  concentration: 0,
  count: 0,
  strength: 0,
  tubGrams: 0,
}
const amounts = (over: Partial<VialAmounts>): VialAmounts => ({ ...NONE, ...over })

/**
 * The presets resolve to `prior_used_base`, a STORED value the view subtracts
 * from remaining forever. A basis computed for the wrong form does not merely
 * look odd — it writes an offset at the wrong scale. Hence a case per form.
 */
describe("vialBasis — one basis per form", () => {
  it("bases a tub on its weight, with grams as their own native measure", () => {
    const basis = vialBasis("bulk_powder", amounts({ tubGrams: 1000 }))
    expect(basis).toEqual({ totalBase: 1000, perNative: 1, fullNative: 1000 })
  })

  it("bases an oral WITH a stated strength on count × strength", () => {
    const basis = vialBasis("oral_solid", amounts({ count: 100, strength: 1000 }))
    expect(basis).toEqual({ totalBase: 100_000, perNative: 1000, fullNative: 100 })
  })

  it("bases an oral with NO stated strength on the count itself", () => {
    // A multivitamin: the tablet is the unit. Before `016` this returned null
    // and the whole fill control vanished for anything without a strength.
    const basis = vialBasis("oral_solid", amounts({ count: 60 }))
    expect(basis).toEqual({ totalBase: 60, perNative: 1, fullNative: 60 })
  })

  it("still refuses a form whose inputs are genuinely absent", () => {
    expect(vialBasis("bulk_powder", NONE)).toBeNull()
    expect(vialBasis("oral_solid", NONE)).toBeNull()
    expect(vialBasis("reconstituted", amounts({ powder: 5 }))).toBeNull()
  })
})

describe("resolveFill — the preset lands on the right stored offset", () => {
  it("puts a half-full 1 kg tub at 500 g used", () => {
    const fill = resolveFill("bulk_powder", amounts({ tubGrams: 1000 }), "", 0.5)
    expect(fill.priorUsed).toBe(500)
    expect(fill.percent).toBe(50)
  })

  it("puts a half-full 100-tab bottle at 50 tabs used", () => {
    const fill = resolveFill("oral_solid", amounts({ count: 100 }), "", 0.5)
    expect(fill.priorUsed).toBe(50)
  })

  it("writes no offset for a full container of any form", () => {
    expect(resolveFill("bulk_powder", amounts({ tubGrams: 1000 }), "", 1).priorUsed).toBeNull()
    expect(resolveFill("oral_solid", amounts({ count: 60 }), "", 1).priorUsed).toBeNull()
  })

  it("lets an exact amount-left override the preset, in the tub's own grams", () => {
    const fill = resolveFill("bulk_powder", amounts({ tubGrams: 1000 }), "250", 1)
    expect(fill.exactActive).toBe(true)
    expect(fill.priorUsed).toBe(750)
  })

  it("clamps an over-typed amount rather than going negative-used", () => {
    const fill = resolveFill("bulk_powder", amounts({ tubGrams: 1000 }), "9999", 1)
    expect(fill.priorUsed).toBeNull()
    expect(fill.remaining).toBe(1000)
  })
})

describe("formatGrams — display only, storage stays in grams", () => {
  it("words a sub-kilo weight the way the tub is labelled", () => {
    expect(formatGrams(900)).toBe("900 g")
    expect(formatGrams(990.5)).toBe("990.5 g")
  })

  it("does not round 900 g up into a fraction of a kilo it never claimed", () => {
    expect(formatGrams(900)).not.toContain("kg")
  })

  it("switches to kilograms at a kilo and above", () => {
    expect(formatGrams(1000)).toBe("1 kg")
    expect(formatGrams(1500)).toBe("1.5 kg")
    expect(formatGrams(2270)).toBe("2.27 kg")
  })

  it("caps the decimals so a derived remainder can't print eight of them", () => {
    expect(formatGrams(990.4823)).toBe("990.5 g")
  })

  it("survives a non-finite value rather than printing NaN", () => {
    expect(formatGrams(Number.NaN)).toBe("0 g")
  })
})

describe("formatGrams — the kilo boundary", () => {
  it("does not print a sub-kilo weight as '1000 g'", () => {
    // Rounding happened AFTER the threshold test, so 999.96 was under the cutoff
    // and printed as a four-digit gram figure.
    expect(formatGrams(999.96)).toBe("1 kg")
    expect(formatGrams(999.9)).toBe("999.9 g")
  })
})

/**
 * The scale trap behind the strengthless oral shape.
 *
 * `v_inventory_math` sizes a strengthless oral row as `total_base = count` —
 * the tablet IS the unit. `vialBasis` sizes it as `count × strength` whenever a
 * strength is supplied. So a caller that still has a strength in hand for a row
 * it is about to save WITHOUT one writes `prior_used_base` at strength× the
 * right scale, and the view subtracts that from remaining for the life of the
 * bottle.
 *
 * Reachable through the add-stock sheets: the strength field is hidden for a
 * compound dosed in tablets, but its state survives a change of compound. Both
 * sheets therefore pass `strength: 0` unless the row will really store one.
 */
describe("an oral's basis follows the shape the row is SAVED in", () => {
  const oral = (strength: number) =>
    vialBasis("oral_solid", {
      powder: 0, bacWater: 0, oilMl: 0, concentration: 0,
      count: 100, strength, tubGrams: 0,
    })

  it("sizes a strengthless bottle by the COUNT — one tab is one base unit", () => {
    expect(oral(0)).toEqual({ totalBase: 100, perNative: 1, fullNative: 100 })
  })

  it("sizes a stated-strength bottle by count × strength", () => {
    expect(oral(500)).toEqual({ totalBase: 50_000, perNative: 500, fullNative: 100 })
  })

  it("a leaked strength would store a half-full bottle 500× out", () => {
    // What the bug looked like: the row saves strengthless (base 100), so half
    // used is 50 — but a basis built with the stale strength calls it 25,000.
    const half = 0.5
    const correct = resolveFill(
      "oral_solid",
      { powder: 0, bacWater: 0, oilMl: 0, concentration: 0, count: 100, strength: 0, tubGrams: 0 },
      "",
      half,
    )
    const leaked = resolveFill(
      "oral_solid",
      { powder: 0, bacWater: 0, oilMl: 0, concentration: 0, count: 100, strength: 500, tubGrams: 0 },
      "",
      half,
    )
    expect(correct.priorUsed).toBe(50)
    expect(leaked.priorUsed).toBe(25_000)
  })
})
