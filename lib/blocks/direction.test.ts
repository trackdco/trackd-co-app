import { describe, expect, it } from "vitest"

import { unitToKg } from "@/lib/weight"

import { lockedDirection } from "./block"

/**
 * Adrian's walk, W41: a target weight below your weight means Lose, so Gain
 * cannot be picked (and the reverse).
 */
describe("lockedDirection (W41)", () => {
  it("a target below the latest weigh-in can only be Lose", () => {
    expect(lockedDirection(80, 84.2)).toBe("down")
  })

  it("a target above the latest weigh-in can only be Gain", () => {
    expect(lockedDirection(90, 84.2)).toBe("up")
  })

  it("leaves the choice open with no weigh-in to compare against", () => {
    expect(lockedDirection(80, null)).toBeNull()
    expect(lockedDirection(80, undefined)).toBeNull()
  })

  it("leaves the choice open with no usable target", () => {
    expect(lockedDirection(null, 84.2)).toBeNull()
    expect(lockedDirection(0, 84.2)).toBeNull()
    expect(lockedDirection(Number.NaN, 84.2)).toBeNull()
    expect(lockedDirection(-3, 84.2)).toBeNull()
  })

  it("leaves the choice open when the target is the weigh-in", () => {
    expect(lockedDirection(84.2, 84.2)).toBeNull()
  })

  it("reads a target typed in pounds by its weight in kilograms", () => {
    // 185.6 lbs is 84.19 kg: just under an 84.2 kg weigh-in, so Lose.
    expect(lockedDirection(unitToKg(185.6, "lbs"), 84.2)).toBe("down")
    // The same weight typed back in pounds is not a direction.
    expect(lockedDirection(unitToKg(84.2 / 0.45359237, "lbs"), 84.2)).toBeNull()
  })
})
