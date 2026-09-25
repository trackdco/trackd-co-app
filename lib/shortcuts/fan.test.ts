import { describe, expect, it } from "vitest"

import { fanHit, fanOffset } from "@/lib/shortcuts/fan"

describe("the + fan", () => {
  it("sets the four items on a 132px arc from the left round to straight up", () => {
    expect(fanOffset(0)).toEqual({ x: -132, y: 0 })
    expect(fanOffset(3)).toEqual({ x: 0, y: -132 })
    expect(Math.hypot(fanOffset(1).x, fanOffset(1).y)).toBeCloseTo(132, 0)
  })

  it("picks the item a finger slid toward, and none too close, too far or below", () => {
    expect(fanHit(-120, -5)).toBe(0)
    expect(fanHit(-2, -130)).toBe(3)
    expect(fanHit(-66, -114)).toBe(2)
    expect(fanHit(-20, -10)).toBeNull()
    expect(fanHit(-300, 0)).toBeNull()
    expect(fanHit(-100, 60)).toBeNull()
    expect(fanHit(100, -100)).toBeNull()
  })
})
