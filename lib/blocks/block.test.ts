import { describe, expect, it } from "vitest"

import {
  activeBlock,
  blockProgress,
  blockWindow,
  formatDuration,
  isWithinWindow,
  pastBlocks,
  targetProgress,
  weekLabel,
  type Block,
} from "./block"

const block = (over: Partial<Block> = {}): Block => ({
  id: "b1",
  name: "First prep",
  startedOn: "2026-01-01",
  endsOn: "2026-04-15", // 105 days = 15 weeks
  targets: [],
  status: "active",
  closedOn: null,
  reflection: null,
  ...over,
})

describe("blockProgress — time is the primary measure", () => {
  it("counts the first day as day 1, week 1", () => {
    const p = blockProgress(block(), "2026-01-01")
    expect(p.daysElapsed).toBe(1)
    expect(p.week).toBe(1)
  })

  it("rolls to week 2 on day 8, not day 7", () => {
    expect(blockProgress(block(), "2026-01-07").week).toBe(1)
    expect(blockProgress(block(), "2026-01-08").week).toBe(2)
  })

  it("reports the total weeks the window spans", () => {
    expect(blockProgress(block(), "2026-01-01").totalWeeks).toBe(15)
  })

  it("counts days remaining, and never goes negative past the end", () => {
    expect(blockProgress(block(), "2026-04-14").daysRemaining).toBe(1)
    expect(blockProgress(block(), "2026-04-15").daysRemaining).toBe(0)
    expect(blockProgress(block(), "2026-05-01").daysRemaining).toBe(0)
  })

  it("clamps the fraction at 1 — a block left open never reads 112%", () => {
    expect(blockProgress(block(), "2026-04-15").fraction).toBe(1)
    expect(blockProgress(block(), "2026-06-01").fraction).toBe(1)
  })

  it("flags an overrun so the UI can offer to close it", () => {
    expect(blockProgress(block(), "2026-04-15").overrun).toBe(false)
    expect(blockProgress(block(), "2026-04-16").overrun).toBe(true)
  })

  it("has no total, no remaining and no fraction when open ended", () => {
    const p = blockProgress(block({ endsOn: null }), "2026-03-01")
    expect(p.week).toBe(9)
    expect(p.totalWeeks).toBeNull()
    expect(p.daysRemaining).toBeNull()
    expect(p.fraction).toBeNull()
  })
})

describe("targetProgress", () => {
  it("measures a cut toward a lower weight", () => {
    const t = targetProgress(
      { variable: "weight", value: 84, direction: "down" },
      92,
      88,
    )
    expect(t.fraction).toBeCloseTo(0.5, 10)
    expect(t.remaining).toBe(4)
  })

  it("measures a bulk toward a higher weight", () => {
    const t = targetProgress(
      { variable: "weight", value: 100, direction: "up" },
      92,
      94,
    )
    expect(t.fraction).toBeCloseTo(0.25, 10)
    expect(t.remaining).toBe(6)
  })

  it("reads moving the WRONG way as zero covered, never as a negative or a verdict", () => {
    const t = targetProgress(
      { variable: "weight", value: 84, direction: "down" },
      92,
      95,
    )
    expect(t.fraction).toBe(0)
    expect(t.remaining).toBe(11)
  })

  it("caps at 1 once the target is passed", () => {
    const t = targetProgress(
      { variable: "weight", value: 84, direction: "down" },
      92,
      80,
    )
    expect(t.fraction).toBe(1)
    expect(t.remaining).toBe(0)
  })

  it("has no fraction when there was no distance to cover", () => {
    const t = targetProgress(
      { variable: "weight", value: 92, direction: "down" },
      92,
      92,
    )
    expect(t.fraction).toBeNull()
  })
})

describe("blockWindow — the window every look-back query uses", () => {
  it("runs from the start to TODAY while the block is live", () => {
    // Not to `endsOn`: the planned end is an intention, and a block in week two
    // must not read as though it had already spanned fifteen.
    const w = blockWindow(block(), "2026-01-15")
    expect(w).toEqual({ from: "2026-01-01", to: "2026-01-15", days: 15 })
  })

  it("uses the CLOSE date over the planned end once it is closed", () => {
    // Closed early: the days after the close are not part of what you ran, and
    // the days before the planned end that never happened are not either.
    const closed = block({ status: "completed", closedOn: "2026-02-01" })
    const w = blockWindow(closed, "2026-06-01")
    expect(w).toEqual({ from: "2026-01-01", to: "2026-02-01", days: 32 })
  })

  it("counts a single day as one day, not zero", () => {
    expect(blockWindow(block(), "2026-01-01").days).toBe(1)
  })

  it("clamps a block that starts in the future rather than going negative", () => {
    const w = blockWindow(block({ startedOn: "2026-03-01" }), "2026-01-01")
    expect(w).toEqual({ from: "2026-03-01", to: "2026-03-01", days: 1 })
  })

  it("is open ended in the sense that today keeps moving, not that it is unbounded", () => {
    const open = block({ endsOn: null })
    expect(blockWindow(open, "2030-01-01").to).toBe("2030-01-01")
  })

  it("survives a malformed date rather than throwing", () => {
    const w = blockWindow(block({ startedOn: "not-a-date" }), "2026-01-01")
    expect(w).toEqual({ from: "not-a-date", to: "not-a-date", days: 1 })
  })
})

describe("isWithinWindow", () => {
  const w = { from: "2026-01-01", to: "2026-04-15", days: 105 }

  it("includes both ends", () => {
    expect(isWithinWindow(w, "2026-01-01")).toBe(true)
    expect(isWithinWindow(w, "2026-04-15")).toBe(true)
  })

  it("excludes outside", () => {
    expect(isWithinWindow(w, "2025-12-31")).toBe(false)
    expect(isWithinWindow(w, "2026-04-16")).toBe(false)
  })
})

describe("activeBlock / pastBlocks", () => {
  it("finds the live one", () => {
    const a = block({ id: "a", status: "completed" })
    const b = block({ id: "b" })
    expect(activeBlock([a, b])?.id).toBe("b")
  })

  it("is null when nothing is live", () => {
    expect(activeBlock([block({ status: "completed" })])).toBeNull()
    expect(activeBlock([])).toBeNull()
  })

  it("repairs a data state with two live blocks by taking the newest start", () => {
    const older = block({ id: "old", startedOn: "2026-01-01" })
    const newer = block({ id: "new", startedOn: "2026-03-01" })
    expect(activeBlock([older, newer])?.id).toBe("new")
    expect(activeBlock([newer, older])?.id).toBe("new")
  })

  it("lists past blocks newest first and excludes the live one", () => {
    const list = [
      block({ id: "live" }),
      block({ id: "old", status: "completed", startedOn: "2025-01-01" }),
      block({ id: "mid", status: "abandoned", startedOn: "2025-06-01" }),
    ]
    expect(pastBlocks(list).map((b) => b.id)).toEqual(["mid", "old"])
  })
})

describe("formatDuration", () => {
  it("stays in days below a fortnight", () => {
    expect(formatDuration(1)).toBe("1 day")
    expect(formatDuration(5)).toBe("5 days")
    expect(formatDuration(13)).toBe("13 days")
  })

  it("switches to weeks at a fortnight", () => {
    expect(formatDuration(14)).toBe("2 weeks")
    expect(formatDuration(17)).toBe("2 weeks, 3 days")
    expect(formatDuration(105)).toBe("15 weeks")
    expect(formatDuration(106)).toBe("15 weeks, 1 day")
  })
})

describe("weekLabel — the headline reading", () => {
  const b = (over: Partial<Block> = {}) => block(over)

  it("reads N of M while the block is inside its window", () => {
    expect(weekLabel(blockProgress(b(), "2026-02-01"))).toEqual({
      value: 5,
      suffix: "of 15 weeks",
    })
  })

  it("DROPS the denominator once the block runs past its end", () => {
    // "Week 31 of 9" is not a reading, it is a broken one — and it is the state
    // "leave running" exists to produce, so it is not an edge case either.
    expect(weekLabel(blockProgress(b(), "2026-07-30"))).toEqual({
      value: 31,
      suffix: "weeks in",
    })
  })

  it("still reads N of M on the final day, which is not an overrun", () => {
    expect(weekLabel(blockProgress(b(), "2026-04-15"))).toEqual({
      value: 15,
      suffix: "of 15 weeks",
    })
  })

  it("has no denominator for an open-ended block", () => {
    expect(weekLabel(blockProgress(b({ endsOn: null }), "2026-03-01"))).toEqual({
      value: 9,
      suffix: "weeks in",
    })
  })

  it("says 'week in', singular, in the first week of an open-ended block", () => {
    expect(weekLabel(blockProgress(b({ endsOn: null }), "2026-01-01")).suffix).toBe(
      "week in",
    )
  })
})
