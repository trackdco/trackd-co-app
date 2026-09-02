import { describe, expect, it } from "vitest"

import { WEIGHT_RANGES, defaultRangeFor, rangesForSpan } from "./weight"

const ids = (spanDays: number | null) => rangesForSpan(spanDays).map((r) => r.id)

describe("rangesForSpan", () => {
  it("offers everything when unscoped", () => {
    // `/weight` covers the user's whole history and always has.
    expect(ids(null)).toEqual(WEIGHT_RANGES.map((r) => r.id))
    expect(defaultRangeFor(null)).toBe("3m")
  })

  it("offers All alone for a block shorter than a week", () => {
    // Nothing to unlock yet: 1W would draw the same picture as All while
    // implying there is more of the block to see.
    expect(ids(5)).toEqual(["all"])
    expect(defaultRangeFor(5)).toBe("all")
  })

  it("unlocks progressively as the block gets longer", () => {
    expect(ids(20)).toEqual(["1w", "all"])
    expect(ids(40)).toEqual(["1w", "1m", "all"])
    expect(ids(100)).toEqual(["1w", "1m", "3m", "all"])
    expect(ids(200)).toEqual(["1w", "1m", "3m", "6m", "all"])
  })

  it("reveals 3M but not 6M just past ninety days", () => {
    // Adrian's case, stated exactly: a block over ninety days shows the ninety,
    // and does not offer a window it does not contain.
    expect(ids(91)).toEqual(["1w", "1m", "3m", "all"])
    expect(ids(91)).not.toContain("6m")
  })

  it("treats a range equal to the span as All wearing another label", () => {
    // A 30 day block's "1M" and "All" would be the same picture twice.
    expect(ids(30)).toEqual(["1w", "all"])
    expect(ids(7)).toEqual(["all"])
  })

  it("always ends on All", () => {
    for (const span of [1, 7, 30, 90, 180, 365, 5000]) {
      const list = ids(span)
      expect(list[list.length - 1]).toBe("all")
      expect(list.filter((id) => id === "all")).toHaveLength(1)
    }
  })
})
