import { describe, expect, it } from "vitest"

import { compoundsRunningOn, firstLoggedDays } from "./running"
import type { DayLogs } from "@/lib/home/doseLog"
import type { StackCompound } from "@/lib/home/stack"

/**
 * Two distinctions this file exists to protect, pulling in opposite directions.
 *
 * RUNNING is not LOGGED-THAT-DAY, and it is not DUE either. Someone injecting
 * testosterone every third day is running it on the two days in between, and a
 * photo taken on one of those days has to say so (Adrian, 2026-07-30). The first
 * build read the dose log per-day and under-reported every non-daily compound.
 *
 * But RUNNING is not merely PLANNED either (Adrian, 2026-07-31, from his own
 * photos). The run is bounded at its start by the first dose actually taken, so
 * a compound added and deleted without ever being used is never claimed, and one
 * added last week is not claimed under a photo from last month.
 */

/** A log with one dose of `id` on `day` — the run's beginning. */
const loggedFrom = (day: string, id = "c1"): DayLogs => ({
  [day]: { [id]: { amount: "250", unit: "mg", time24: "08:00", siteId: null } },
})

const base = (over: Partial<StackCompound> = {}): StackCompound => ({
  id: "c1",
  name: "Testosterone E",
  category: "anabolic",
  method: "im",
  dose: 250,
  unit: "mg",
  schedule: {
    cadence: { type: "everyNDays", n: 3 },
    timeOfDay: "08:00",
    startDate: "2026-01-01",
  },
  rotationSites: [],
  rotationIndex: 0,
  ...over,
})

describe("compoundsRunningOn", () => {
  it("includes a compound on a day NO dose was due", () => {
    // Every third day from 1 Jan: due on the 1st, 4th, 7th. The 5th is a gap.
    const running = compoundsRunningOn([base()], "2026-01-05", loggedFrom("2026-01-01"))
    expect(running.map((c) => c.name)).toEqual(["Testosterone E"])
  })

  it("excludes a compound whose protocol had not started yet", () => {
    const log = loggedFrom("2026-01-01")
    expect(compoundsRunningOn([base()], "2025-12-31", log)).toEqual([])
    expect(compoundsRunningOn([base()], "2026-01-01", log)).toHaveLength(1)
  })

  it("excludes an off-cycle day, matching Today's Log", () => {
    const cycled = base({
      cycle: {
        pattern: { type: "onOff", onDays: 7, offDays: 7 },
        end: { type: "never" },
        colour: "moss",
        anchor: "2026-01-01",
      },
    })
    // Days 1-7 on, 8-14 off.
    const log = loggedFrom("2026-01-01")
    expect(compoundsRunningOn([cycled], "2026-01-03", log)).toHaveLength(1)
    expect(compoundsRunningOn([cycled], "2026-01-10", log)).toHaveLength(0)
  })

  it("reports the dose that was in force THEN, not the current one", () => {
    const edited = base({
      dose: 500,
      scheduleHistory: [
        {
          effectiveFrom: "2026-01-01",
          cadence: { type: "everyNDays", n: 3 },
          timeOfDay: "08:00",
          dose: 250,
          unit: "mg",
        },
        {
          effectiveFrom: "2026-03-01",
          cadence: { type: "everyNDays", n: 3 },
          timeOfDay: "08:00",
          dose: 500,
          unit: "mg",
        },
      ],
    })
    const log = loggedFrom("2026-01-01")
    expect(compoundsRunningOn([edited], "2026-02-01", log)[0].amount).toBe("250")
    expect(compoundsRunningOn([edited], "2026-04-01", log)[0].amount).toBe("500")
  })

  it("excludes a stopped stretch", () => {
    const stopped = base({
      scheduleHistory: [
        {
          effectiveFrom: "2026-01-01",
          cadence: { type: "everyNDays", n: 3 },
          timeOfDay: "08:00",
          dose: 250,
          unit: "mg",
        },
        {
          effectiveFrom: "2026-02-01",
          cadence: { type: "everyNDays", n: 3 },
          timeOfDay: "08:00",
          dose: 250,
          unit: "mg",
          stopped: true,
        },
      ],
    })
    const log = loggedFrom("2026-01-01")
    expect(compoundsRunningOn([stopped], "2026-01-15", log)).toHaveLength(1)
    expect(compoundsRunningOn([stopped], "2026-02-15", log)).toHaveLength(0)
  })

  it("does NOT retro-erase an archived compound from past days", () => {
    // `archived` carries no date, so it can only mean "not running now".
    // Applying it backwards would delete it from a photo it was really under.
    const archived = base({ archived: true })
    expect(
      compoundsRunningOn([archived], "2026-01-05", loggedFrom("2026-01-01")),
    ).toHaveLength(1)
  })

  it("orders by CATEGORY first, then name, with no headings to carry it", () => {
    // A supplement, an ancillary and a peptide. The peptide leads however many
    // supplements sit beside it — the whole point of the fixed order.
    const list = [
      base({ id: "b", name: "Zinc", category: "supplement" }),
      base({ id: "a", name: "Anastrozole", category: "ancillary" }),
      base({ id: "c", name: "BPC-157", category: "peptide" }),
    ]
    const log: DayLogs = {
      "2026-01-01": {
        a: { amount: "1", unit: "mg", time24: "08:00", siteId: null },
        b: { amount: "1", unit: "mg", time24: "08:00", siteId: null },
        c: { amount: "1", unit: "mg", time24: "08:00", siteId: null },
      },
    }
    expect(compoundsRunningOn(list, "2026-01-05", log).map((c) => c.name)).toEqual([
      "BPC-157",
      "Anastrozole",
      "Zinc",
    ])
  })
})

describe("the run begins at the first dose, not at the plan", () => {
  it("never lists a compound that has not once been taken", () => {
    // Adrian added two compounds to try a feature out and deleted them without
    // ever dosing. Both were listed under a photo from that stretch.
    expect(compoundsRunningOn([base()], "2026-01-05", {})).toEqual([])
  })

  it("does not list it on days BEFORE the first dose", () => {
    const log = loggedFrom("2026-01-20")
    expect(compoundsRunningOn([base()], "2026-01-19", log)).toEqual([])
    expect(compoundsRunningOn([base()], "2026-01-20", log)).toHaveLength(1)
    expect(compoundsRunningOn([base()], "2026-02-01", log)).toHaveLength(1)
  })

  it("still covers the gap days once the run has begun", () => {
    // The whole point of the original rule: every third day from 1 Jan means the
    // 5th is a gap, and the photo taken on it still says the compound was run.
    const log = loggedFrom("2026-01-01")
    expect(compoundsRunningOn([base()], "2026-01-05", log)).toHaveLength(1)
  })

  it("takes the EARLIEST logged day when doses came out of order", () => {
    const log: DayLogs = {
      "2026-03-01": { c1: { amount: "250", unit: "mg", time24: "08:00", siteId: null } },
      "2026-01-10": { c1: { amount: "250", unit: "mg", time24: "08:00", siteId: null } },
    }
    expect(firstLoggedDays(log).get("c1")).toBe("2026-01-10")
    expect(compoundsRunningOn([base()], "2026-01-15", log)).toHaveLength(1)
  })

  it("bounds each compound by its OWN first dose", () => {
    const list = [base({ id: "c1", name: "Creatine" }), base({ id: "c2", name: "Vitamin C" })]
    const log: DayLogs = {
      "2026-01-01": { c1: { amount: "5", unit: "g", time24: "08:00", siteId: null } },
      "2026-02-01": { c2: { amount: "2000", unit: "mg", time24: "08:00", siteId: null } },
    }
    // Before the vitamin was ever taken, only the creatine was being run.
    expect(compoundsRunningOn(list, "2026-01-15", log).map((c) => c.name)).toEqual([
      "Creatine",
    ])
    expect(compoundsRunningOn(list, "2026-02-15", log).map((c) => c.name)).toEqual([
      "Creatine",
      "Vitamin C",
    ])
  })
})
