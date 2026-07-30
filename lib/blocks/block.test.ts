import { describe, expect, it } from "vitest"

import {
  activeBlock,
  blockProgress,
  formatDuration,
  isWithinBlock,
  pastBlocks,
  targetProgress,
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

describe("isWithinBlock — the window every look-back query uses", () => {
  it("includes both ends", () => {
    expect(isWithinBlock(block(), "2026-01-01")).toBe(true)
    expect(isWithinBlock(block(), "2026-04-15")).toBe(true)
  })

  it("excludes outside", () => {
    expect(isWithinBlock(block(), "2025-12-31")).toBe(false)
    expect(isWithinBlock(block(), "2026-04-16")).toBe(false)
  })

  it("uses the CLOSE date over the planned end when one exists", () => {
    // Closed early: days after the close are not part of what you ran.
    const closed = block({ status: "completed", closedOn: "2026-02-01" })
    expect(isWithinBlock(closed, "2026-02-01")).toBe(true)
    expect(isWithinBlock(closed, "2026-02-02")).toBe(false)
  })

  it("has no upper bound while open ended and unclosed", () => {
    expect(isWithinBlock(block({ endsOn: null }), "2030-01-01")).toBe(true)
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
