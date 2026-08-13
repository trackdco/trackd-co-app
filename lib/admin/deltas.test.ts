import { describe, expect, it } from "vitest"

import { delta, pointsDelta } from "./deltas"

describe("delta", () => {
  it("carries both values, the movement and the percentage", () => {
    expect(delta(123, 100)).toEqual({
      current: 123,
      previous: 100,
      absolute: 23,
      pct: 23,
      direction: "up",
    })
  })

  it("reports a fall as a negative absolute and a negative percentage", () => {
    expect(delta(80, 100)).toEqual({
      current: 80,
      previous: 100,
      absolute: -20,
      pct: -20,
      direction: "down",
    })
  })

  it("calls no movement flat rather than up", () => {
    const out = delta(42, 42)
    expect(out?.direction).toBe("flat")
    expect(out?.absolute).toBe(0)
    expect(out?.pct).toBe(0)
  })

  it("rounds the percentage to a whole number, like percent()", () => {
    expect(delta(4, 3)?.pct).toBe(33)
    expect(delta(5, 3)?.pct).toBe(67)
  })

  // The rule the whole file exists for.
  it("returns null pct — never 0 — when the previous value was zero", () => {
    expect(delta(9, 0)).toEqual({
      current: 9,
      previous: 0,
      absolute: 9,
      pct: null,
      direction: "up",
    })
  })

  it("still returns null pct when both sides are zero", () => {
    const out = delta(0, 0)
    expect(out?.pct).toBeNull()
    expect(out?.direction).toBe("flat")
  })

  it("reports a total collapse as −100%, which is measurable", () => {
    expect(delta(0, 40)?.pct).toBe(-100)
  })

  it("refuses a comparison built out of non-finite numbers", () => {
    expect(delta(NaN, 10)).toBeNull()
    expect(delta(10, NaN)).toBeNull()
    expect(delta(Infinity, 1)).toBeNull()
  })
})

describe("pointsDelta", () => {
  it("measures a rate change in percentage POINTS, not percent", () => {
    const out = pointsDelta(40, 30)
    expect(out?.absolute).toBe(10)
    expect(out?.direction).toBe("up")
  })

  // A points delta must never be renderable as "+33%".
  it("forces pct to null so a percentage of a percentage cannot be printed", () => {
    expect(pointsDelta(40, 30)?.pct).toBeNull()
    expect(pointsDelta(30, 40)?.pct).toBeNull()
    expect(pointsDelta(50, 0)?.pct).toBeNull()
  })

  it("returns null when either rate was itself unmeasured", () => {
    expect(pointsDelta(null, 30)).toBeNull()
    expect(pointsDelta(40, null)).toBeNull()
    expect(pointsDelta(null, null)).toBeNull()
  })

  it("keeps a flat rate flat", () => {
    expect(pointsDelta(25, 25)?.direction).toBe("flat")
  })
})
