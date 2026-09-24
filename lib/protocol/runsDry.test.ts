import { describe, expect, it } from "vitest"

import type { StackCompound } from "@/lib/home/stack"
import type { StockItem } from "@/lib/db/inventory"
import { runsDryInDays } from "./runsDry"
import { containersOf } from "./stockView"

const compound = (over: Partial<StackCompound> = {}): StackCompound => ({
  id: "c",
  name: "Retatrutide",
  category: "peptide",
  method: "subq",
  dose: 2,
  unit: "mg",
  schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-09-01" },
  rotationSites: [],
  rotationIndex: 0,
  ...over,
})

// 2026-09-23 is a Wednesday.
const WED = "2026-09-23"

describe("runs dry walks the days a dose is due", () => {
  it("daily: runs dry the day after the last dose held", () => {
    // 3 doses: Wed, Thu, Fri; Sat is short.
    expect(runsDryInDays(compound(), 3, WED)).toBe(3)
  })

  it("counts only today's slots still to take", () => {
    // Today's dose is logged, so the 3 held cover Thu, Fri, Sat.
    expect(runsDryInDays(compound(), 3, WED, 1)).toBe(4)
  })

  it("Mon/Thu from a Wednesday runs out on a Monday, not on an average", () => {
    const monThu = compound({
      schedule: { cadence: { type: "daysOfWeek", days: [1, 4] }, timeOfDay: "08:00", startDate: "2026-09-01" },
    })
    // Thu 24, Mon 28 held; Thu 1 Oct is short: 8 days.
    expect(runsDryInDays(monThu, 2, WED)).toBe(8)
  })

  it("skips a cycle's off days", () => {
    const cycled = compound({
      cycle: {
        pattern: { type: "onOff", onDays: 2, offDays: 2 },
        end: { type: "never" },
        colour: "steel",
        anchor: WED,
      },
    })
    // On Wed, Thu; off Fri, Sat; on Sun, Mon. 3 held: Wed, Thu, Sun. Short Mon.
    expect(runsDryInDays(cycled, 3, WED)).toBe(5)
  })

  it("skips a pause and picks up when it ends", () => {
    const paused = compound({
      pauses: [{ id: "p", startedOn: "2026-09-24", endsOn: "2026-09-27" }],
    })
    // Wed held, Thu–Sun paused, Mon held; Tue short.
    expect(runsDryInDays(paused, 2, WED)).toBe(6)
  })

  it("twice a day spends two a day", () => {
    const twice = compound({
      schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", laterTimes: ["20:00"], startDate: "2026-09-01" },
    })
    expect(runsDryInDays(twice, 5, WED)).toBe(2)
  })

  it("has no answer with nothing held, or when nothing more is ever due", () => {
    expect(runsDryInDays(compound(), null, WED)).toBeNull()
    const indefinitely = compound({ pauses: [{ id: "p", startedOn: "2026-09-20", endsOn: null }] })
    expect(runsDryInDays(indefinitely, 2, WED)).toBeNull()
  })

  it("is today when today's dose cannot be covered", () => {
    expect(runsDryInDays(compound(), 0, WED)).toBe(0)
  })
})

const item = (over: Partial<StockItem>): StockItem => ({
  id: "i",
  createdAt: "2026-09-01T00:00:00Z",
  protocolCompoundId: "pc",
  compoundName: "Retatrutide",
  category: "peptide",
  inventoryType: "reconstituted",
  baseUnit: "mg",
  acquiredOn: "2026-09-01",
  reconstitutedOn: "2026-09-01",
  totalAmount: 20,
  totalAmountUnit: "mg",
  bacWaterMl: 2,
  concentrationMgPerMl: null,
  strengthPerUnit: null,
  servingSizeG: null,
  priorUsedBase: null,
  remainingDisplay: 1,
  dosesRemaining: 5,
  estEmptyDate: null,
  daysToEmpty: null,
  mlPerDose: 0.1,
  unitsPerDoseOral: null,
  concentrationPerMl: 10,
  remainingBase: 10,
  totalBase: 20,
  ...over,
})

describe("which container is in use", () => {
  it("is the OLDEST open one, and both stay open", () => {
    const c = containersOf(
      [
        item({ id: "new", acquiredOn: "2026-09-20" }),
        item({ id: "old", acquiredOn: "2026-09-01" }),
      ],
      "pc",
    )
    expect(c.inUse?.id).toBe("old")
    expect(c.open.map((i) => i.id)).toEqual(["old", "new"])
  })

  it("breaks a same-day start by which was added first", () => {
    const c = containersOf(
      [
        item({ id: "b", createdAt: "2026-09-01T10:00:00Z" }),
        item({ id: "a", createdAt: "2026-09-01T09:00:00Z" }),
      ],
      "pc",
    )
    expect(c.inUse?.id).toBe("a")
  })

  it("moves past a used-up container, and keeps spares apart", () => {
    const c = containersOf(
      [
        item({ id: "empty", acquiredOn: "2026-08-01", remainingBase: 0 }),
        item({ id: "next", acquiredOn: "2026-09-01" }),
        item({ id: "spare", acquiredOn: null, reconstitutedOn: null, bacWaterMl: null }),
      ],
      "pc",
    )
    expect(c.inUse?.id).toBe("next")
    expect(c.open.map((i) => i.id)).toEqual(["next"])
    expect(c.spares.map((i) => i.id)).toEqual(["spare"])
  })

  it("shows the last container drawn empty when everything started is used up", () => {
    const c = containersOf([item({ id: "empty", remainingBase: 0 })], "pc")
    expect(c.inUse?.id).toBe("empty")
    expect(c.open).toEqual([])
  })
})
