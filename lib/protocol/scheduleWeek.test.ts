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
// "Today" for the tests that need one; well after every fixture date, so the
// archived-with-no-dated-stop gate does not fire on the historical assertions.
const TODAY = "2026-09-03"
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
    expect(wasRunningOn(stoppedWed, "2026-08-18", TODAY)).toBe(true)
    expect(wasRunningOn(stoppedWed, WED, TODAY)).toBe(false)
    expect(wasRunningOn(stoppedWed, "2026-08-20", TODAY)).toBe(false)
  })

  it("keeps its row for the REST of that week, then loses it", () => {
    // Adrian, 2026-09-03: stopped midweek shows for the whole week, gone the
    // next. Membership is decided per week, not per day.
    expect(compoundsInWeek([stoppedWed], weekDaysFrom(MON), TODAY)).toHaveLength(1)
    expect(compoundsInWeek([stoppedWed], weekDaysFrom("2026-08-24"), TODAY)).toHaveLength(0)
  })

  it("still holds its row in every earlier week", () => {
    expect(compoundsInWeek([stoppedWed], weekDaysFrom("2026-06-01"), TODAY)).toHaveLength(1)
  })

  it("is NOT erased from the past by the archived flag", () => {
    // The flag is undated. Gating on it would delete the compound from every
    // week it ever ran in, which is the whole bug this avoids.
    const archived = { ...stoppedWed, archived: true }
    expect(compoundsInWeek([archived], weekDaysFrom("2026-06-01"), TODAY)).toHaveLength(1)
  })

  it("has no row before its run began", () => {
    expect(compoundsInWeek([compound()], weekDaysFrom("2025-12-01"), TODAY)).toHaveLength(0)
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
    expect(t.pausedDays).toBe(7)
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

/**
 * Every case below was a real defect found by review on 2026-09-03, each one
 * reproduced by executing the module. They are regression tests first and
 * documentation second.
 */
describe("phantom rows in the CURRENT week", () => {
  it("drops a compound whose CYCLE has ended", () => {
    // Spec 06: a cycle that has ended behaves exactly like a delete. Handing
    // this module the full stack without re-applying that gate gave an ended
    // compound a permanent row of seven blank cells.
    const ended = compound({
      schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-01-01" },
      cycle: {
        anchor: "2026-01-01",
        pattern: { type: "continuous" },
        end: { type: "onDate", date: "2026-03-01" },
      },
    } as Partial<StackCompound>)

    expect(wasRunningOn(ended, "2026-02-01", TODAY)).toBe(true)
    expect(wasRunningOn(ended, "2026-08-19", TODAY)).toBe(false)
    expect(compoundsInWeek([ended], weekDaysFrom(MON), TODAY)).toHaveLength(0)
    // And it keeps the weeks it genuinely ran in.
    expect(compoundsInWeek([ended], weekDaysFrom("2026-02-02"), TODAY)).toHaveLength(1)
  })

  it("stops an archived compound with no dated trail at TODAY, not never", () => {
    // A compound pulled from the cloud carries no schedule history, so
    // `archived` can be the only evidence of a delete. It must not go on
    // claiming doses are due, and it must not lose the weeks it ran in either.
    const noTrail = compound({ archived: true })
    expect(hasDatedStopFixture(noTrail)).toBe(false)

    expect(wasRunningOn(noTrail, "2026-06-01", TODAY)).toBe(true)
    expect(wasRunningOn(noTrail, TODAY, TODAY)).toBe(false)

    // It KEEPS this week's row, because the midweek rule says a compound
    // stopped partway through a week ran that week. What it must not do is go
    // on claiming doses from the stop onward.
    const thisWeek = weekDaysFrom(mondayOf(TODAY))
    expect(compoundsInWeek([noTrail], thisWeek, TODAY)).toHaveLength(1)
    const states = thisWeek.map((d) => weekCellState(noTrail, d, {} as DayLogs, TODAY))
    // TODAY is the Thursday of this week; nothing from it onward is due.
    expect(states.slice(3)).toEqual(["none", "none", "none", "none"])
    expect(states.slice(0, 3)).toEqual(["missed", "missed", "missed"])

    // And it is gone entirely from next week.
    expect(
      compoundsInWeek([noTrail], weekDaysFrom(shiftWeeks(mondayOf(TODAY), 1)), TODAY),
    ).toHaveLength(0)
    expect(compoundsInWeek([noTrail], weekDaysFrom("2026-06-01"), TODAY)).toHaveLength(1)
  })

  it("still trusts a dated stop over the archived flag", () => {
    // The dated record is the better evidence, so it wins: this one keeps the
    // current week only up to the day it was actually stopped.
    const dated = compound({
      archived: true,
      scheduleHistory: recordScheduleStop(compound(), "2026-08-19"),
    })
    expect(wasRunningOn(dated, "2026-08-18", TODAY)).toBe(true)
    expect(wasRunningOn(dated, "2026-08-19", TODAY)).toBe(false)
  })
})

/** Local mirror of the module's private helper, so the test above states what it
 *  is actually asserting rather than asserting it by side effect. */
function hasDatedStopFixture(c: StackCompound): boolean {
  return (c.scheduleHistory ?? []).some((v) => v.stopped === true)
}

describe("weekTally counts only what has come due", () => {
  const daily = compound()
  const days = weekDaysFrom(MON)

  it("does not count doses still ahead of today", () => {
    // Tuesday, with Monday logged. Reporting "1 of 7" made the user look six
    // doses behind when five had not happened yet.
    const logs = { "2026-08-17": { c1: { id: "a" } } } as unknown as DayLogs
    const t = weekTally([daily], days, logs, "2026-08-18")
    expect(t).toMatchObject({ logged: 1, due: 1 })
  })

  it("counts the whole week once the week is past", () => {
    const logs = { "2026-08-17": { c1: { id: "a" } } } as unknown as DayLogs
    const t = weekTally([daily], days, logs, "2026-09-03")
    expect(t).toMatchObject({ logged: 1, due: 7 })
  })

  it("reports paused DAYS, not doses, and counts a day once", () => {
    // Two compounds paused over the same stretch is still one paused day. The
    // figure cannot be doses: a pause covers calendar days and only some of them
    // would have carried one.
    const pausedA = compound({
      id: "c2",
      pauses: [{ id: "p", startedOn: "2026-08-17", endsOn: "2026-08-23" }],
    } as Partial<StackCompound>)
    const pausedB = compound({
      id: "c3",
      pauses: [{ id: "p", startedOn: "2026-08-17", endsOn: "2026-08-23" }],
    } as Partial<StackCompound>)
    const t = weekTally([pausedA, pausedB], days, {} as DayLogs, "2026-09-03")
    expect(t.pausedDays).toBe(7)
    expect(t.due).toBe(0)
    expect(t.logged).toBe(0)
  })
})
