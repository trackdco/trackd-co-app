import { describe, expect, it } from "vitest"

import { sparkGeometry, sparkLastPoint } from "./spark"

/**
 * The reason this is monotone and not a plain spline: a smoothing curve that
 * overshoots draws a weight the user never recorded. On a bodyweight chart that
 * is a measurement that did not happen, which the categorical-never-evaluative
 * rule's sibling principle — never state a fact you do not have — rules out.
 */
describe("sparkGeometry", () => {
  const W = 132
  const H = 40

  it("has nothing to draw with fewer than two readings", () => {
    expect(sparkGeometry([], W, H)).toEqual({ line: "", area: "" })
    expect(sparkGeometry([84], W, H)).toEqual({ line: "", area: "" })
  })

  it("spans the full width and closes the area on the baseline", () => {
    const { line, area } = sparkGeometry([80, 82, 81, 85], W, H)
    expect(line.startsWith("M 0,")).toBe(true)
    expect(line).toContain(`${W},`)
    // The fill drops to the bottom edge at both ends and closes.
    expect(area.endsWith("Z")).toBe(true)
    expect(area).toContain(`L ${W},${H}`)
    expect(area).toContain(`L 0,${H}`)
  })

  it("never leaves the band the readings occupy", () => {
    // A spike between two flat readings is where a cardinal spline dips below
    // the lower neighbour. Every y in the path must stay within [pad, H - pad].
    const { line } = sparkGeometry([80, 80, 95, 80, 80], W, H)
    const ys = [...line.matchAll(/[ ,](-?\d+(?:\.\d+)?)(?=[ ]|$)/g)]
      .map((m) => Number(m[1]))
      .filter((n) => Number.isFinite(n))
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(-0.01)
      expect(y).toBeLessThanOrEqual(H + 0.01)
    }
  })

  it("puts a flat series on a single horizontal line", () => {
    const { line } = sparkGeometry([84, 84, 84], W, H)
    const ys = [...line.matchAll(/,(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]))
    expect(new Set(ys).size).toBe(1)
  })
})

describe("sparkLastPoint", () => {
  it("sits at the right edge, at the newest reading's height", () => {
    // Newest is the maximum, so it sits at the top of the padded band.
    expect(sparkLastPoint([80, 90], 132, 40)).toEqual({ x: 132, y: 2 })
    // Newest is the minimum, so it sits at the bottom of it.
    expect(sparkLastPoint([90, 80], 132, 40)).toEqual({ x: 132, y: 38 })
  })

  it("has no point with no readings", () => {
    expect(sparkLastPoint([], 132, 40)).toBeNull()
  })
})
