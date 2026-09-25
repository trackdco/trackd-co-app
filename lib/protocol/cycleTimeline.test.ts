import { describe, expect, it } from "vitest"

import type { CycleRule } from "@/lib/protocol/cycleRule"
import {
  earliestOffset,
  nextTurn,
  nowWords,
  onDaysIn,
  onRuns,
  rangeEndLabel,
  timelineRange,
} from "@/lib/protocol/cycleTimeline"

const TODAY = "2026-09-26"
const fiveTwo = (anchor: string): CycleRule => ({
  pattern: { type: "onOff", onDays: 5, offDays: 2 },
  end: { type: "never" },
  colour: "steel",
  anchor,
})

describe("timelineRange", () => {
  it("gives each zoom its window, All reaching back to the earliest start", () => {
    expect(timelineRange("1m")).toEqual([-7, 23])
    expect(timelineRange("3m")).toEqual([-30, 60])
    expect(timelineRange("1y")).toEqual([-120, 245])
    expect(timelineRange("all", -400)).toEqual([-400, 245])
    expect(timelineRange("all", -10)).toEqual([-120, 245])
  })
})

describe("onDaysIn and onRuns", () => {
  it("reads 5 on, 2 off from the anchor, and nothing before it", () => {
    const on = onDaysIn(fiveTwo("2026-09-26"), undefined, TODAY, [-2, 12])
    expect(on).toEqual([false, false, true, true, true, true, true, false, false, true, true, true, true, true])
    expect(onRuns(on)).toEqual([
      [2, 7],
      [9, 14],
    ])
  })

  it("leaves a paused day off and holds the clock", () => {
    const on = onDaysIn(fiveTwo("2026-09-26"), [{ id: "p", startedOn: "2026-09-27", endsOn: "2026-09-27" }], TODAY, [0, 7])
    // Day 2 is paused; the five on-days then run to the 1 Oct.
    expect(on).toEqual([true, false, true, true, true, true, false])
  })
})

describe("nowWords", () => {
  it("counts days in a short on-period and weeks in a long one", () => {
    expect(nowWords(fiveTwo("2026-09-24"), undefined, TODAY)).toBe("Day 3 of 5")
    const long: CycleRule = { ...fiveTwo("2026-09-12"), pattern: { type: "onOff", onDays: 56, offDays: 28 } }
    expect(nowWords(long, undefined, TODAY)).toBe("Week 3 of 8")
  })

  it("says how long an off-period has left, and when a cycle starts", () => {
    expect(nowWords(fiveTwo("2026-09-20"), undefined, TODAY)).toBe("Off, 1 day left")
    expect(nowWords(fiveTwo("2026-10-12"), undefined, TODAY)).toBe("Starts 12 Oct")
  })
})

describe("nextTurn", () => {
  it("names the next day it goes off, or back on", () => {
    expect(nextTurn(fiveTwo("2026-09-24"), undefined, TODAY)).toBe("29 Sep")
    expect(nextTurn(fiveTwo("2026-09-20"), undefined, TODAY)).toBe("27 Sep")
  })
})

describe("earliestOffset and rangeEndLabel", () => {
  it("finds the earliest start, and labels the ends with the year on long views", () => {
    expect(earliestOffset([fiveTwo("2026-09-20"), fiveTwo("2026-08-27")], TODAY)).toBe(-30)
    expect(earliestOffset([], TODAY)).toBeNull()
    expect(rangeEndLabel(TODAY, -7, 30)).toBe("19 Sep")
    expect(rangeEndLabel(TODAY, 244, 365)).toBe("May ’27")
  })
})
