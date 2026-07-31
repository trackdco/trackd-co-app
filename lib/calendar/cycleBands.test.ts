import { describe, expect, it } from "vitest"

import type { DateKey } from "@/lib/home/mockHomeData"
import type { StackCompound } from "@/lib/home/stack"
import type { CycleRule } from "@/lib/protocol/cycleRule"
import {
  CYCLE_HORIZON_MONTHS,
  cycleBandsForDays,
  cycleKeyRows,
  describeCycleEnd,
  formatKeyShort,
  horizonKey,
} from "./cycleBands"

function compound(over: Partial<StackCompound> = {}): StackCompound {
  return {
    id: "c1",
    name: "Test E",
    category: "anabolic",
    method: "im",
    dose: 250,
    unit: "mg",
    schedule: { cadence: { type: "daily" }, timeOfDay: "09:00", startDate: "2026-01-01" },
    rotationSites: [],
    rotationIndex: 0,
    ...over,
  }
}

const onOff = (over: Partial<CycleRule> = {}): CycleRule => ({
  pattern: { type: "onOff", onDays: 3, offDays: 3 },
  end: { type: "never" },
  colour: "slate",
  anchor: "2026-01-01",
  ...over,
})

/** Every day of January 2026. */
const JAN = Array.from(
  { length: 31 },
  (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}` as DateKey
)

const TODAY = "2026-01-01" as DateKey

describe("bands", () => {
  it("marks only the on-days", () => {
    const bands = cycleBandsForDays([compound({ cycle: onOff() })], JAN, TODAY)
    // 3 on, 3 off, from the 1st.
    expect(bands.has("2026-01-01" as DateKey)).toBe(true)
    expect(bands.has("2026-01-03" as DateKey)).toBe(true)
    expect(bands.has("2026-01-04" as DateKey)).toBe(false)
    expect(bands.has("2026-01-06" as DateKey)).toBe(false)
    expect(bands.has("2026-01-07" as DateKey)).toBe(true)
  })

  it("rounds only the ends of a run, so the middle joins into one band", () => {
    const bands = cycleBandsForDays([compound({ cycle: onOff() })], JAN, TODAY)
    const first = bands.get("2026-01-01" as DateKey)![0]
    const middle = bands.get("2026-01-02" as DateKey)![0]
    const last = bands.get("2026-01-03" as DateKey)![0]

    expect(first.runStart).toBe(true)
    expect(first.runEnd).toBe(false)
    expect(middle.runStart).toBe(false)
    expect(middle.runEnd).toBe(false)
    expect(last.runStart).toBe(false)
    expect(last.runEnd).toBe(true)
  })

  it("does NOT render a continuous cycle — a band across every day says nothing", () => {
    const c = compound({
      cycle: { ...onOff(), pattern: { type: "continuous" } },
    })
    expect(cycleBandsForDays([c], JAN, TODAY).size).toBe(0)
  })

  it("renders nothing for an uncycled or deleted compound", () => {
    expect(cycleBandsForDays([compound()], JAN, TODAY).size).toBe(0)
    expect(
      cycleBandsForDays([compound({ cycle: onOff(), archived: true })], JAN, TODAY).size
    ).toBe(0)
  })

  it("a month with no cycles produces an empty map — the grid is unchanged", () => {
    expect(cycleBandsForDays([], JAN, TODAY).size).toBe(0)
  })
})

describe("overlaps", () => {
  const two = [
    compound({ id: "a", name: "A", cycle: onOff({ anchor: "2026-01-01" }) }),
    compound({ id: "b", name: "B", cycle: onOff({ anchor: "2026-01-01", colour: "teal" }) }),
  ]

  it("returns one segment per overlapping cycle", () => {
    const bands = cycleBandsForDays(two, JAN, TODAY)
    expect(bands.get("2026-01-01" as DateKey)).toHaveLength(2)
  })

  it("orders by cycle start date, so bars never reshuffle between months", () => {
    // Anchored earlier AND in an on-phase on 1 Jan (2 days in, of 3 on).
    const later = compound({
      id: "z",
      name: "Z",
      cycle: onOff({ anchor: "2025-12-30", colour: "plum" }),
    })
    const bands = cycleBandsForDays([...two, later], JAN, TODAY)
    const day = bands.get("2026-01-01" as DateKey)!
    // The 2025 anchor sorts first regardless of its position in the input.
    expect(day[0].compoundId).toBe("z")
    expect(day.map((s) => s.compoundId)).toEqual(["z", "a", "b"])
  })
})

describe("horizon", () => {
  it("stops projecting an indefinite cycle after twelve months", () => {
    expect(CYCLE_HORIZON_MONTHS).toBe(12)
    expect(horizonKey("2026-01-15" as DateKey)).toBe("2027-01-15")
  })

  it("draws nothing past the horizon", () => {
    const far = ["2027-06-01", "2027-06-02"] as DateKey[]
    const bands = cycleBandsForDays([compound({ cycle: onOff() })], far, TODAY)
    expect(bands.size).toBe(0)
  })

  it("still draws inside the horizon", () => {
    const near = ["2026-06-01", "2026-06-02", "2026-06-03"] as DateKey[]
    const bands = cycleBandsForDays([compound({ cycle: onOff() })], near, TODAY)
    expect(bands.size).toBeGreaterThan(0)
  })
})

describe("the key", () => {
  it("reads as its pattern when the cycle repeats with no end", () => {
    const rows = cycleKeyRows([compound({ cycle: onOff() })])
    expect(rows).toHaveLength(1)
    expect(rows[0].summary).toBe("3 on / 3 off")
    expect(rows[0].compoundName).toBe("Test E")
  })

  it("reads as its end date when the cycle has one", () => {
    const rows = cycleKeyRows([
      compound({ cycle: onOff({ end: { type: "onDate", date: "2026-07-26" } }) }),
    ])
    expect(rows[0].summary).toBe("ends 26 Jul")
  })

  it("omits continuous cycles, matching what the grid draws", () => {
    const c = compound({ cycle: { ...onOff(), pattern: { type: "continuous" } } })
    expect(cycleKeyRows([c])).toHaveLength(0)
  })
})

describe("day detail wording", () => {
  it("describes each end condition", () => {
    expect(describeCycleEnd({ end: { type: "never" } })).toBe("no end set")
    expect(describeCycleEnd({ end: { type: "onDate", date: "2026-07-26" } })).toBe(
      "ends 26 Jul"
    )
    expect(describeCycleEnd({ end: { type: "afterRounds", rounds: 4 } })).toBe(
      "ends after 4 rounds"
    )
    expect(describeCycleEnd({ end: { type: "whenVialEmpty" } })).toBe(
      "ends when the vial runs out"
    )
  })

  it("formats a date key short", () => {
    expect(formatKeyShort("2026-07-26", 2026)).toBe("26 Jul")
    expect(formatKeyShort("2026-01-05", 2026)).toBe("5 Jan")
    expect(formatKeyShort("nonsense", 2026)).toBe("nonsense")
  })

  it("prints the year for a date in another year", () => {
    // A cycle ending 5 Aug 2027 read as "5 Aug" on 30 Jul 2026 — six days away
    // rather than a year away, and nothing on screen told them apart.
    expect(formatKeyShort("2027-08-05", 2026)).toBe("5 Aug 2027")
    expect(formatKeyShort("2025-08-05", 2026)).toBe("5 Aug 2025")
  })
})
