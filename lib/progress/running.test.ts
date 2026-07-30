import { describe, expect, it } from "vitest"

import { compoundsRunningOn } from "./running"
import type { StackCompound } from "@/lib/home/stack"

/**
 * The distinction this file exists to protect: RUNNING is not LOGGED, and it is
 * not DUE either. Someone injecting testosterone every third day is running it
 * on the two days in between, and a photo taken on one of those days has to say
 * so (Adrian, 2026-07-30). The first build read the dose log and silently
 * under-reported every compound that is not daily.
 */

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
    const running = compoundsRunningOn([base()], "2026-01-05")
    expect(running.map((c) => c.name)).toEqual(["Testosterone E"])
  })

  it("excludes a compound whose protocol had not started yet", () => {
    expect(compoundsRunningOn([base()], "2025-12-31")).toEqual([])
    expect(compoundsRunningOn([base()], "2026-01-01")).toHaveLength(1)
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
    expect(compoundsRunningOn([cycled], "2026-01-03")).toHaveLength(1)
    expect(compoundsRunningOn([cycled], "2026-01-10")).toHaveLength(0)
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
    expect(compoundsRunningOn([edited], "2026-02-01")[0].amount).toBe("250")
    expect(compoundsRunningOn([edited], "2026-04-01")[0].amount).toBe("500")
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
    expect(compoundsRunningOn([stopped], "2026-01-15")).toHaveLength(1)
    expect(compoundsRunningOn([stopped], "2026-02-15")).toHaveLength(0)
  })

  it("does NOT retro-erase an archived compound from past days", () => {
    // `archived` carries no date, so it can only mean "not running now".
    // Applying it backwards would delete it from a photo it was really under.
    const archived = base({ archived: true })
    expect(compoundsRunningOn([archived], "2026-01-05")).toHaveLength(1)
  })

  it("sorts by name so the list is stable between renders", () => {
    const list = [
      base({ id: "b", name: "Zinc" }),
      base({ id: "a", name: "Anastrozole" }),
      base({ id: "c", name: "MK-677" }),
    ]
    expect(compoundsRunningOn(list, "2026-01-05").map((c) => c.name)).toEqual([
      "Anastrozole",
      "MK-677",
      "Zinc",
    ])
  })

  it("marks which of them actually had a dose due, when asked", () => {
    const running = compoundsRunningOn([base()], "2026-01-04", {
      dueOn: () => true,
    })
    expect(running[0].dueThatDay).toBe(true)
    expect(compoundsRunningOn([base()], "2026-01-04")[0].dueThatDay).toBe(false)
  })
})
