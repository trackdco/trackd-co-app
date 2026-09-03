import { describe, expect, it } from "vitest"

import {
  compoundsInWeek,
  firstLoggedDay,
  historyFloor,
  mondayOf,
  relativeWeekLabel,
  shiftWeeks,
  wasRunningOn,
  weekCellState,
  weekDaysFrom,
  weekTally,
} from "./scheduleWeek"
import { recordScheduleStop, type StackCompound } from "@/lib/home/stack"
import type { DayLogs } from "@/lib/home/doseLog"

const compound = (over: Partial<StackCompound> = {}): StackCompound => ({
  id: "c1",
  name: "Testosterone E",
  category: "anabolic",
  method: "im",
  dose: 250,
  unit: "mg",
  schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-01-01" },
  rotationSites: [],
  rotationIndex: 0,
  ...over,
})

// 2026-08-19 is a Wednesday; its week runs Mon 17 → Sun 23.
const WED = "2026-08-19"
const MON = "2026-08-17"

describe("week arithmetic", () => {
  it("finds the Monday of any day, including a Sunday", () => {
    expect(mondayOf(WED)).toBe(MON)
    expect(mondayOf(MON)).toBe(MON)
    expect(mondayOf("2026-08-23")).toBe(MON) // Sunday belongs to the week it ends
  })

  it("walks whole weeks in both directions", () => {
    expect(shiftWeeks(MON, -1)).toBe("2026-08-10")
    expect(shiftWeeks(MON, 1)).toBe("2026-08-24")
  })

  it("lays out seven days from the Monday", () => {
    const days = weekDaysFrom(MON).map((d) => d.getDate())
    expect(days).toEqual([17, 18, 19, 20, 21, 22, 23])
  })
})

describe("how far back it can go", () => {
  it("floors on the user's FIRST logged dose", () => {
    // Adrian's rule: a dose of creatine three years ago earns three years of
    // steppable history, most of it blank.
    const logs: DayLogs = {
      "2023-04-12": { c1: { id: "l1" } },
      "2026-08-19": { c1: { id: "l2" } },
    } as unknown as DayLogs
    expect(firstLoggedDay(logs)).toBe("2023-04-12")
    expect(historyFloor(logs, WED)).toBe(mondayOf("2023-04-12"))
  })

  it("ignores a day whose entry exists but holds no doses", () => {
    const logs = { "2023-04-12": {}, "2026-08-19": { c1: { id: "l2" } } } as unknown as DayLogs
    expect(firstLoggedDay(logs)).toBe("2026-08-19")
  })

  it("floors on the BLOCK's start when scoped to one", () => {
    const logs = { "2023-04-12": { c1: { id: "l1" } } } as unknown as DayLogs
    expect(historyFloor(logs, WED, "2026-07-06")).toBe("2026-07-06")
  })

  it("cannot step back at all with nothing logged", () => {
    expect(historyFloor({} as DayLogs, WED)).toBe(MON)
  })
})

describe("a deleted compound keeps the week it was deleted in", () => {
  // Delete records a dated STOP, which is what makes this answerable at all.
  const stoppedWed = compound({
    scheduleHistory: recordScheduleStop(compound(), WED),
  })

  it("was running before the stop and not after", () => {
    expect(wasRunningOn(stoppedWed, "2026-08-18")).toBe(true)
    expect(wasRunningOn(stoppedWed, WED)).toBe(false)
    expect(wasRunningOn(stoppedWed, "2026-08-20")).toBe(false)
  })

  it("keeps its row for the REST of that week, then loses it", () => {
    // Adrian, 2026-09-03: stopped midweek shows for the whole week, gone the
    // next. Membership is decided per week, not per day.
    expect(compoundsInWeek([stoppedWed], weekDaysFrom(MON))).toHaveLength(1)
    expect(compoundsInWeek([stoppedWed], weekDaysFrom("2026-08-24"))).toHaveLength(0)
  })

  it("still holds its row in every earlier week", () => {
    expect(compoundsInWeek([stoppedWed], weekDaysFrom("2026-06-01"))).toHaveLength(1)
  })

  it("is NOT erased from the past by the archived flag", () => {
    // The flag is undated. Gating on it would delete the compound from every
    // week it ever ran in, which is the whole bug this avoids.
    const archived = { ...stoppedWed, archived: true }
    expect(compoundsInWeek([archived], weekDaysFrom("2026-06-01"))).toHaveLength(1)
  })

  it("has no row before its run began", () => {
    expect(compoundsInWeek([compound()], weekDaysFrom("2025-12-01"))).toHaveLength(0)
  })
})

describe("cell states", () => {
  const logs = { "2026-08-17": { c1: { id: "l1" } } } as unknown as DayLogs
  const day = (n: number) => weekDaysFrom(MON)[n]

  it("marks a logged, a missed and a due day", () => {
    const today = "2026-08-19"
    expect(weekCellState(compound(), day(0), logs, today)).toBe("logged")
    expect(weekCellState(compound(), day(1), logs, today)).toBe("missed")
    expect(weekCellState(compound(), day(4), logs, today)).toBe("due")
  })

  it("marks a paused day as paused, never as missed", () => {
    // A paused dose was never due, so calling it missed would misstate the
    // user's adherence.
    const paused = compound({
      pauses: [{ id: "p1", startedOn: "2026-08-18", endsOn: "2026-08-21" }],
    } as Partial<StackCompound>)
    expect(weekCellState(paused, day(1), logs, "2026-08-25")).toBe("paused")
    expect(weekCellState(paused, day(2), logs, "2026-08-25")).toBe("paused")
  })

  it("leaves a day outside the run blank rather than paused", () => {
    const stoppedWed = compound({ scheduleHistory: recordScheduleStop(compound(), WED) })
    expect(weekCellState(stoppedWed, day(3), logs, "2026-08-25")).toBe("none")
  })
})

describe("weekTally", () => {
  it("counts logged against due and excludes paused from both", () => {
    const paused = compound({
      id: "c2",
      name: "Nandrolone",
      // endsOn is the LAST paused day, inclusive, so this is Mon → Sun.
      pauses: [{ id: "p1", startedOn: "2026-08-17", endsOn: "2026-08-23" }],
    } as Partial<StackCompound>)
    const logs = {
      "2026-08-17": { c1: { id: "a" } },
      "2026-08-18": { c1: { id: "b" } },
    } as unknown as DayLogs

    const t = weekTally([compound(), paused], weekDaysFrom(MON), logs, "2026-08-25")
    expect(t.logged).toBe(2)
    expect(t.due).toBe(7) // the daily compound only; none of the paused week
    expect(t.paused).toBe(7)
  })
})

describe("relativeWeekLabel", () => {
  // Counting back from a fixed Monday keeps these independent of the real date.
  const NOW = "2026-08-31"
  const back = (weeks: number) => relativeWeekLabel(shiftWeeks(NOW, -weeks), NOW)

  it("names the near weeks plainly", () => {
    expect(back(0)).toBe("This week")
    expect(back(1)).toBe("Last week")
    expect(back(2)).toBe("2 weeks ago")
    expect(back(11)).toBe("11 weeks ago")
  })

  it("switches to months at twelve weeks", () => {
    // Adrian's example, exactly: twelve weeks reads as three months.
    expect(back(12)).toBe("3 months ago")
    expect(back(26)).toBe("6 months ago")
    expect(back(43)).toBe("10 months ago")
  })

  it("switches to years rather than counting a hundred weeks", () => {
    expect(back(52)).toBe("1 year ago")
    expect(back(100)).toBe("2 years ago")
    expect(back(156)).toBe("3 years ago")
  })

  it("never prints a week count above eleven", () => {
    for (let w = 0; w <= 300; w++) {
      const label = back(w)
      const m = label.match(/^(\d+) weeks ago$/)
      if (m) expect(Number(m[1])).toBeLessThan(12)
    }
  })
})
