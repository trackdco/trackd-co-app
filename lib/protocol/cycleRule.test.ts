import { describe, expect, it } from "vitest"

import {
  CYCLE_COLOURS,
  availableCycleEnds,
  cyclePeriod,
  cycleStatusOn,
  formatCyclePattern,
  isCycleColour,
  isOnCycle,
  type CycleRule,
} from "./cycleRule"

const sevenOnSevenOff = (end: CycleRule["end"] = { type: "never" }): CycleRule => ({
  pattern: { type: "onOff", onDays: 7, offDays: 7 },
  end,
  colour: "slate",
  anchor: "2026-01-01",
})

describe("no cycle", () => {
  it("is always on — the feature costs nothing until it is used", () => {
    expect(isOnCycle(undefined, "2026-01-01")).toBe(true)
    expect(isOnCycle(null, "2030-06-15")).toBe(true)
  })
})

describe("on/off resolution", () => {
  const cycle = sevenOnSevenOff()

  it("is on for the first seven days from the anchor", () => {
    for (const d of ["2026-01-01", "2026-01-04", "2026-01-07"]) {
      expect(isOnCycle(cycle, d)).toBe(true)
    }
  })

  it("is off for the next seven", () => {
    for (const d of ["2026-01-08", "2026-01-11", "2026-01-14"]) {
      expect(isOnCycle(cycle, d)).toBe(false)
    }
  })

  it("repeats — day 15 starts the second on-period", () => {
    expect(isOnCycle(cycle, "2026-01-15")).toBe(true)
    expect(cycleStatusOn(cycle, "2026-01-15").round).toBe(1)
  })

  it("is off before the anchor, and says so as pending rather than ended", () => {
    const s = cycleStatusOn(cycle, "2025-12-28")
    expect(s.on).toBe(false)
    expect(s.pending).toBe(true)
    expect(s.ended).toBe(false)
  })

  it("counts down the current stretch", () => {
    expect(cycleStatusOn(cycle, "2026-01-01").daysLeftInPhase).toBe(7)
    expect(cycleStatusOn(cycle, "2026-01-07").daysLeftInPhase).toBe(1)
    expect(cycleStatusOn(cycle, "2026-01-08").daysLeftInPhase).toBe(7)
  })

  it("survives a DST boundary — phase is counted in local days", () => {
    // Sydney DST ends 2026-04-05; a naive ms-division would drift a day here.
    const c: CycleRule = { ...sevenOnSevenOff(), anchor: "2026-03-30" }
    expect(isOnCycle(c, "2026-04-05")).toBe(true) // day 6, still on
    expect(isOnCycle(c, "2026-04-06")).toBe(false) // day 7, off
  })
})

describe("end conditions", () => {
  it("5 · never ends — still cycling decades later", () => {
    const far = cycleStatusOn(sevenOnSevenOff(), "2099-01-01")
    expect(far.ended).toBe(false)
    expect(far.pending).toBe(false)
    // Still alternating, not stuck: some day in that week is on.
    const week = ["2099-01-01", "2099-01-02", "2099-01-03", "2099-01-04",
      "2099-01-05", "2099-01-06", "2099-01-07", "2099-01-08"]
    expect(week.some((d) => isOnCycle(sevenOnSevenOff(), d))).toBe(true)
  })

  it("2 · ends on a date, inclusive of that day", () => {
    const c = sevenOnSevenOff({ type: "onDate", date: "2026-01-05" })
    expect(isOnCycle(c, "2026-01-05")).toBe(true)
    expect(isOnCycle(c, "2026-01-06")).toBe(false)
    expect(cycleStatusOn(c, "2026-01-06").ended).toBe(true)
  })

  it("4 · ends after X rounds, a round being one on plus one off", () => {
    const c = sevenOnSevenOff({ type: "afterRounds", rounds: 2 })
    expect(isOnCycle(c, "2026-01-15")).toBe(true) // round 1, on
    expect(isOnCycle(c, "2026-01-29")).toBe(false) // round 2 — done
    expect(cycleStatusOn(c, "2026-01-29").ended).toBe(true)
  })

  it("3 · ends when the vial ran dry, the day after its last dose", () => {
    const c = sevenOnSevenOff({ type: "whenVialEmpty" })
    const ctx = { vialEmptyOn: "2026-01-04" }
    expect(isOnCycle(c, "2026-01-04", ctx)).toBe(true)
    expect(isOnCycle(c, "2026-01-05", ctx)).toBe(false)
  })

  it("3 · has not ended while the vial still has doses", () => {
    const c = sevenOnSevenOff({ type: "whenVialEmpty" })
    expect(cycleStatusOn(c, "2026-06-01", {}).ended).toBe(false)
    expect(cycleStatusOn(c, "2026-06-01", { vialEmptyOn: null }).ended).toBe(false)
    // An on-day inside that window is genuinely on.
    expect(isOnCycle(c, "2026-01-02", { vialEmptyOn: null })).toBe(true)
  })

  it("an ended cycle stays ended — it never resumes on the next round", () => {
    const c = sevenOnSevenOff({ type: "afterRounds", rounds: 1 })
    expect(isOnCycle(c, "2026-01-15")).toBe(false)
    expect(isOnCycle(c, "2026-02-15")).toBe(false)
    expect(isOnCycle(c, "2027-01-15")).toBe(false)
  })
})

describe("combinations the spec requires", () => {
  it("1 + 5 — on/off with no end repeats indefinitely", () => {
    const c = sevenOnSevenOff({ type: "never" })
    expect(isOnCycle(c, "2027-01-01")).toBe(true) // 365 days on = round 26, phase 1
    expect(isOnCycle(c, "2027-01-08")).toBe(false)
  })

  it("1 + 4 — on/off bounded by rounds", () => {
    const c = sevenOnSevenOff({ type: "afterRounds", rounds: 3 })
    expect(cycleStatusOn(c, "2026-01-29").round).toBe(2)
    expect(isOnCycle(c, "2026-01-29")).toBe(true)
    expect(isOnCycle(c, "2026-02-12")).toBe(false) // round 3
  })

  it("continuous carries the non-round end conditions", () => {
    const c: CycleRule = {
      pattern: { type: "continuous" },
      end: { type: "onDate", date: "2026-03-01" },
      colour: "teal",
      anchor: "2026-01-01",
    }
    expect(isOnCycle(c, "2026-02-28")).toBe(true)
    expect(isOnCycle(c, "2026-03-02")).toBe(false)
    expect(cycleStatusOn(c, "2026-02-28").daysLeftInPhase).toBeNull()
  })
})

describe("offerable end conditions", () => {
  it("offers rounds only with an on/off pattern", () => {
    const onOff = availableCycleEnds(
      { type: "onOff", onDays: 7, offDays: 7 },
      { vialTracked: false }
    )
    expect(onOff).toContain("afterRounds")

    const continuous = availableCycleEnds({ type: "continuous" }, { vialTracked: false })
    expect(continuous).not.toContain("afterRounds")
  })

  it("offers the vial condition only where storage is tracked", () => {
    const tracked = availableCycleEnds({ type: "continuous" }, { vialTracked: true })
    expect(tracked).toContain("whenVialEmpty")

    const untracked = availableCycleEnds({ type: "continuous" }, { vialTracked: false })
    expect(untracked).not.toContain("whenVialEmpty")
  })

  it("never offers a sixth condition", () => {
    const all = availableCycleEnds(
      { type: "onOff", onDays: 5, offDays: 2 },
      { vialTracked: true }
    )
    expect(all.sort()).toEqual(
      ["afterRounds", "never", "onDate", "whenVialEmpty"].sort()
    )
  })
})

describe("palette", () => {
  it("has exactly twelve colours", () => {
    expect(CYCLE_COLOURS).toHaveLength(12)
    expect(new Set(CYCLE_COLOURS).size).toBe(12)
  })

  it("rejects anything outside the palette", () => {
    expect(isCycleColour("slate")).toBe(true)
    expect(isCycleColour("amber")).toBe(false)
    expect(isCycleColour("#56687F")).toBe(false)
  })
})

describe("display", () => {
  it("reads as its pattern", () => {
    expect(formatCyclePattern({ type: "onOff", onDays: 7, offDays: 7 })).toBe(
      "7 on / 7 off"
    )
    expect(formatCyclePattern({ type: "continuous" })).toBe("Continuous")
  })

  it("has no period when continuous", () => {
    expect(cyclePeriod({ type: "continuous" })).toBeNull()
    expect(cyclePeriod({ type: "onOff", onDays: 5, offDays: 2 })).toBe(7)
  })
})
