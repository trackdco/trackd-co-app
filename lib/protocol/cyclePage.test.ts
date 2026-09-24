import { describe, expect, it } from "vitest"

import type { CycleRule } from "@/lib/protocol/cycleRule"
import { cycleFacts } from "./cyclePage"

const rule = (over: Partial<CycleRule>): CycleRule => ({
  pattern: { type: "onOff", onDays: 5, offDays: 2 },
  end: { type: "never" },
  colour: "steel",
  anchor: "2026-09-21",
  ...over,
})

describe("a cycle row's figures", () => {
  it("places today in the round and counts the days on left", () => {
    // Anchor Mon 21 Sep; Thu 24 is day 3 of 5 on.
    const f = cycleFacts(rule({}), "2026-09-24")
    expect(f.on).toBe(true)
    expect(f.at).toBe(3)
    expect(f.daysLeft).toBe(2)
    expect(f.end).toEqual({ value: "No end", label: "Ends" })
  })

  it("counts the days off left in an off stretch", () => {
    const f = cycleFacts(rule({}), "2026-09-26")
    expect(f.on).toBe(false)
    expect(f.at).toBe(5)
    expect(f.daysLeft).toBe(2)
  })

  it("reads rounds as '1 of 3' over 'Round', never wrapped", () => {
    const f = cycleFacts(rule({ end: { type: "afterRounds", rounds: 3 } }), "2026-09-24")
    expect(f.end).toEqual({ value: "1 of 3", label: "Round" })
  })

  it("gives an end date as the date", () => {
    expect(cycleFacts(rule({ end: { type: "onDate", date: "2026-11-30" } }), "2026-09-24").end).toEqual({ value: "30 Nov", label: "Ends" })
  })

  it("knows when a cycle has ended", () => {
    expect(cycleFacts(rule({ end: { type: "afterRounds", rounds: 1 } }), "2026-10-05").ended).toBe(true)
  })
})
