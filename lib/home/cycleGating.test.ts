/**
 * Regression suite for Spec 06 · Cycles — the gating half.
 *
 * `cycleRule.test.ts` pins the pure on/off maths. This file pins how that maths
 * reaches the app: through the SINGLE `isDueOnFor` gate that the week strip,
 * calendar cells, consistency and Next Dose all already route through. If the
 * gate moves or a caller starts bypassing it, an off-period compound reappears
 * in Today's Log and these go red.
 */
import { describe, expect, it } from "vitest"

import { dateKeyToDate } from "@/lib/home/mockHomeData"
import {
  isCycleEnded,
  isDueOnFor,
  isRunning,
  recordScheduleVersion,
  resolveScheduleOn,
  scheduleVersionFromRow,
  scheduleVersionToRow,
  upcomingDoseDates,
  type Schedule,
  type StackCompound,
} from "@/lib/home/stack"
import { sameCycle, type CycleRule } from "@/lib/protocol/cycleRule"

function schedule(over: Partial<Schedule> = {}): Schedule {
  return {
    cadence: { type: "daily" },
    timeOfDay: "09:00",
    startDate: "2026-01-01",
    ...over,
  }
}

function compound(over: Partial<StackCompound> = {}): StackCompound {
  return {
    id: "c1",
    name: "Test E",
    category: "anabolic",
    method: "im",
    dose: 250,
    unit: "mg",
    schedule: schedule(),
    rotationSites: [],
    rotationIndex: 0,
    ...over,
  }
}

const cycle7on7off: CycleRule = {
  pattern: { type: "onOff", onDays: 7, offDays: 7 },
  end: { type: "never" },
  colour: "slate",
  anchor: "2026-01-01",
}

const on = (key: string, c: StackCompound) => isDueOnFor(c, dateKeyToDate(key))

describe("a compound with no cycle is unchanged", () => {
  it("stays due every day its schedule says so", () => {
    const c = compound()
    for (const d of ["2026-01-01", "2026-01-09", "2026-02-20"]) {
      expect(on(d, c)).toBe(true)
    }
  })
})

describe("off-period compounds disappear from the log", () => {
  const c = compound({ cycle: cycle7on7off })

  it("is due through the on-period", () => {
    expect(on("2026-01-01", c)).toBe(true)
    expect(on("2026-01-07", c)).toBe(true)
  })

  it("is NOT due through the off-period — nothing to show, nothing to miss", () => {
    expect(on("2026-01-08", c)).toBe(false)
    expect(on("2026-01-14", c)).toBe(false)
  })

  it("returns on the next round without being re-added", () => {
    expect(on("2026-01-15", c)).toBe(true)
  })

  it("gates a specific-days cadence too — the cycle sits ABOVE the schedule", () => {
    // Mondays only. 2026-01-05 and 2026-01-12 are both Mondays; the second falls
    // in the off-period, so the cadence says due and the cycle overrules it.
    const mondays = compound({
      cycle: cycle7on7off,
      schedule: schedule({ cadence: { type: "daysOfWeek", days: [1] } }),
    })
    expect(on("2026-01-05", mondays)).toBe(true)
    expect(on("2026-01-12", mondays)).toBe(false)
  })
})

describe("nothing is marked missed during an off period", () => {
  it("an unlogged off-day is not due, so it cannot be counted missed", () => {
    const c = compound({ cycle: cycle7on7off })
    // Consistency and the calendar both derive "missed" from due-and-unlogged.
    // No due, no missed — the assertion the spec asks to verify.
    const offDays = ["2026-01-08", "2026-01-09", "2026-01-10", "2026-01-11"]
    expect(offDays.every((d) => !on(d, c))).toBe(true)
  })

  it("an ended cycle produces no due days at all", () => {
    const c = compound({
      cycle: { ...cycle7on7off, end: { type: "afterRounds", rounds: 1 } },
    })
    expect(on("2026-01-15", c)).toBe(false)
    expect(on("2026-06-01", c)).toBe(false)
  })
})

describe("mid-cycle edits apply from today forward, never backwards", () => {
  it("keeps past periods on the pattern they were actually run under", () => {
    const before = compound({ cycle: cycle7on7off })

    // On 2026-02-01 the user switches to 5 on / 2 off.
    const nextCycle: CycleRule = {
      pattern: { type: "onOff", onDays: 5, offDays: 2 },
      end: { type: "never" },
      colour: "slate",
      anchor: "2026-02-01",
    }
    const after = compound({
      cycle: nextCycle,
      scheduleHistory: recordScheduleVersion(
        before,
        {
          cadence: before.schedule.cadence,
          timeOfDay: before.schedule.timeOfDay,
          dose: before.dose,
          unit: before.unit,
          cycle: nextCycle,
        },
        "2026-02-01"
      ),
    })

    // January still resolves to the ORIGINAL 7/7 rule.
    const jan = resolveScheduleOn(after, "2026-01-08")
    expect(jan.cycle?.pattern).toEqual({ type: "onOff", onDays: 7, offDays: 7 })
    expect(on("2026-01-08", after)).toBe(false) // off under 7/7
    expect(on("2026-01-05", after)).toBe(true) // on under 7/7

    // February onwards resolves to the new rule.
    const feb = resolveScheduleOn(after, "2026-02-10")
    expect(feb.cycle?.pattern).toEqual({ type: "onOff", onDays: 5, offDays: 2 })
  })

  it("seeds a baseline carrying the OUTGOING cycle on the first edit", () => {
    const before = compound({ cycle: cycle7on7off })
    const history = recordScheduleVersion(
      before,
      {
        cadence: before.schedule.cadence,
        timeOfDay: before.schedule.timeOfDay,
        dose: 300,
        unit: "mg",
      },
      "2026-03-01"
    )
    // Without this the days before the edit would fall through to the new
    // version and lose the cycle they were run under.
    expect(history[0].cycle?.pattern).toEqual({
      type: "onOff",
      onDays: 7,
      offDays: 7,
    })
  })
})

describe("ending a cycle behaves like a delete", () => {
  const ended = compound({
    cycle: { ...cycle7on7off, end: { type: "afterRounds", rounds: 1 } },
  })

  it("reports as ended once the condition is met", () => {
    expect(isCycleEnded(ended, "2026-01-05")).toBe(false)
    expect(isCycleEnded(ended, "2026-01-20")).toBe(true)
  })

  it("stops running — the single test the picker and the log both use", () => {
    expect(isRunning(ended, "2026-01-05")).toBe(true)
    expect(isRunning(ended, "2026-01-20")).toBe(false)
  })

  it("treats a deleted compound the same way, so the two paths stay consistent", () => {
    expect(isRunning(compound({ archived: true }), "2026-01-05")).toBe(false)
  })

  it("an uncycled compound never reads as ended", () => {
    expect(isCycleEnded(compound(), "2099-01-01")).toBe(false)
    expect(isRunning(compound(), "2099-01-01")).toBe(true)
  })
})

describe("sameCycle", () => {
  it("matches identical rules and separates different ones", () => {
    expect(sameCycle(cycle7on7off, { ...cycle7on7off })).toBe(true)
    expect(sameCycle(null, null)).toBe(true)
    expect(sameCycle(cycle7on7off, null)).toBe(false)
    expect(
      sameCycle(cycle7on7off, {
        ...cycle7on7off,
        pattern: { type: "onOff", onDays: 5, offDays: 2 },
      })
    ).toBe(false)
    expect(sameCycle(cycle7on7off, { ...cycle7on7off, colour: "teal" })).toBe(false)
  })

  it("separates end conditions that differ only in their payload", () => {
    const a: CycleRule = { ...cycle7on7off, end: { type: "onDate", date: "2026-05-01" } }
    const b: CycleRule = { ...cycle7on7off, end: { type: "onDate", date: "2026-06-01" } }
    expect(sameCycle(a, b)).toBe(false)
    expect(sameCycle(a, { ...a })).toBe(true)
  })
})

describe("a version's cycle survives a Postgres round-trip", () => {
  it("carries the cycle out to a row and back", () => {
    const version = {
      effectiveFrom: "2026-02-01",
      cadence: { type: "daily" } as const,
      timeOfDay: "09:00",
      dose: 250,
      unit: "mg",
      cycle: cycle7on7off,
    }
    const row = scheduleVersionToRow(version)
    expect(row.cycle_anchor).toBe("2026-01-01")
    expect(row.cycle_on_days).toBe(7)
    expect(row.cycle_off_days).toBe(7)
    expect(row.cycle_colour).toBe("slate")

    // Without this the trail comes back cycle-less after a PWA reinstall, so a
    // past off-period resolves as always-on and reads as missed doses.
    const back = scheduleVersionFromRow(row)
    expect(back.cycle).toEqual(cycle7on7off)
  })

  it("round-trips each end condition", () => {
    for (const end of [
      { type: "never" },
      { type: "onDate", date: "2026-09-01" },
      { type: "afterRounds", rounds: 3 },
      { type: "whenVialEmpty" },
    ] as CycleRule["end"][]) {
      const row = scheduleVersionToRow({
        effectiveFrom: "2026-02-01",
        cadence: { type: "daily" },
        timeOfDay: "09:00",
        dose: 1,
        unit: "mg",
        cycle: { ...cycle7on7off, end },
      })
      const back = scheduleVersionFromRow(row)
      expect(back.cycle?.end).toEqual(end)
    }
  })

  it("leaves an uncycled version with no cycle", () => {
    const row = scheduleVersionToRow({
      effectiveFrom: "2026-02-01",
      cadence: { type: "daily" },
      timeOfDay: "09:00",
      dose: 1,
      unit: "mg",
    })
    expect(row.cycle_anchor).toBeNull()
  })
})

describe("upcoming dates skip off-periods", () => {
  it("never previews a date the cycle is off for", () => {
    const s = schedule({ cadence: { type: "daily" }, startDate: "2026-01-01" })
    const withCycle = upcomingDoseDates(s, dateKeyToDate("2026-01-01"), 10, cycle7on7off)
    // 7 on from the 1st, so the 8th-14th must not appear.
    expect(withCycle).toContain("2026-01-07")
    expect(withCycle).not.toContain("2026-01-08")
    expect(withCycle).not.toContain("2026-01-14")
    expect(withCycle).toContain("2026-01-15")
  })

  it("is unchanged without a cycle", () => {
    const s = schedule({ cadence: { type: "daily" }, startDate: "2026-01-01" })
    expect(upcomingDoseDates(s, dateKeyToDate("2026-01-01"), 3)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ])
  })
})

describe("the vial-runs-out condition", () => {
  const c = compound({
    cycle: { ...cycle7on7off, end: { type: "whenVialEmpty" } },
  })

  it("runs while the vial has doses left", () => {
    expect(isDueOnFor(c, dateKeyToDate("2026-01-03"), { vialEmptyOn: null })).toBe(
      true
    )
  })

  it("stops the day after the vial's last dose", () => {
    const ctx = { vialEmptyOn: "2026-01-03" }
    expect(isDueOnFor(c, dateKeyToDate("2026-01-03"), ctx)).toBe(true)
    expect(isDueOnFor(c, dateKeyToDate("2026-01-04"), ctx)).toBe(false)
  })

  it("does not retroactively un-due earlier days when the vial later empties", () => {
    // The empty date is a FACT from dose logs, not a moving projection — so a day
    // that was due stays due however much later the vial runs dry.
    expect(
      isDueOnFor(c, dateKeyToDate("2026-01-02"), { vialEmptyOn: "2026-01-06" })
    ).toBe(true)
  })
})
