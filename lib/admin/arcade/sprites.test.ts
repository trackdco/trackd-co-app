import { describe, expect, it } from "vitest"

import { KYLE } from "./kyle"

/**
 * Sprites are hand-authored strings, so a single mistyped row is a silently
 * skewed image — the renderer just draws a short row and nothing complains.
 * These assertions are the only thing standing between a typo and a Kyle with
 * a dent in him.
 *
 * The chess set lives under `components/` and is checked by the same rule in
 * its own file; this covers the shared arcade sprites in `lib/`.
 */
describe("Kyle's sprite", () => {
  it("is rectangular", () => {
    const widths = new Set(KYLE.rows.map((r) => r.length))
    expect([...widths]).toEqual([KYLE.w])
    expect(KYLE.rows).toHaveLength(KYLE.h)
  })

  it("has both eyes and both catchlights", () => {
    const eyes = KYLE.rows.join("").split("E").length - 1
    const sparks = KYLE.rows.join("").split("S").length - 1
    // 2×2 eyes with one spark each — the fix for "I can see the eyes but I
    // can't really see them".
    expect(eyes).toBeGreaterThanOrEqual(4)
    expect(sparks).toBe(2)
  })

  it("keeps the liquid band inside the body", () => {
    expect(KYLE.liquidFrom).toBeGreaterThan(0)
    expect(KYLE.liquidTo).toBeLessThanOrEqual(KYLE.h)
    expect(KYLE.liquidFrom).toBeLessThan(KYLE.liquidTo)
  })

  it("puts the arms on a row that exists", () => {
    expect(KYLE.armRow).toBeGreaterThanOrEqual(0)
    expect(KYLE.armRow).toBeLessThan(KYLE.h)
  })
})
