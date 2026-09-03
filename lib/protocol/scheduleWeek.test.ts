import { describe, expect, it } from "vitest"

import { toDateKey as toKey } from "@/lib/home/mockHomeData"
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
  weekMatrix,
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
/** No doses logged at all, which is the state most of these fixtures are in. */
const NO_LOGS: DayLogs = {}

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
    expect(compoundsInWeek([stoppedWed], weekDaysFrom(MON), NO_LOGS)).toHaveLength(1)
    expect(compoundsInWeek([stoppedWed], weekDaysFrom("2026-08-24"), NO_LOGS)).toHaveLength(0)
  })

  it("still holds its row in every earlier week", () => {
    expect(compoundsInWeek([stoppedWed], weekDaysFrom("2026-06-01"), NO_LOGS)).toHaveLength(1)
  })

  it("is NOT erased from the past by the archived flag", () => {
    // The flag is undated. Gating on it would delete the compound from every
    // week it ever ran in, which is the whole bug this avoids.
    const archived = { ...stoppedWed, archived: true }
    expect(compoundsInWeek([archived], weekDaysFrom("2026-06-01"), NO_LOGS)).toHaveLength(1)
  })

  it("has no row before its run began", () => {
    expect(compoundsInWeek([compound()], weekDaysFrom("2025-12-01"), NO_LOGS)).toHaveLength(0)
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

describe("weekMatrix figures", () => {
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

    const t = weekMatrix([compound(), paused], weekDaysFrom(MON), logs, "2026-08-25")
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

  it("carries a year plus its remainder, not a blurred year", () => {
    // Adrian's own example: a year and a week, not "12 months ago" and not the
    // "1 year ago" that used to swallow everything up to 76 weeks.
    expect(back(52)).toBe("1 year ago")
    expect(back(53)).toBe("1 year and 1 week ago")
    expect(back(54)).toBe("1 year and 2 weeks ago")
    expect(back(78)).toBe("1 year and 6 months ago")
    expect(back(100)).toBe("1 year and 11 months ago")
    expect(back(104)).toBe("2 years ago")
    expect(back(156)).toBe("3 years ago")
  })

  it("never prints a remainder of twelve months, or a negative one", () => {
    // The remainder used to be rounded separately from the year, which could
    // produce "1 year and 12 months ago"; and 364 days rounds to twelve months
    // while sitting just short of a year, which produced a negative week count.
    for (let w = 12; w <= 400; w++) {
      const label = back(w)
      expect(label).not.toMatch(/and (0|1[2-9]|[2-9]\d) months/)
      expect(label).not.toMatch(/-/)
      expect(label).not.toMatch(/and 0 weeks/)
    }
  })

  it("lands whole years exactly", () => {
    // Computing years from a rounded month count let the 30.44 drift compound
    // and turned exactly three years into "2 years ago".
    for (const y of [1, 2, 3, 4, 5]) {
      expect(back(Math.round((y * 365.25) / 7))).toBe(
        y === 1 ? "1 year ago" : `${y} years ago`,
      )
    }
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

    expect(wasRunningOn(ended, "2026-02-01")).toBe(true)
    expect(wasRunningOn(ended, "2026-08-19")).toBe(false)
    expect(compoundsInWeek([ended], weekDaysFrom(MON), NO_LOGS)).toHaveLength(0)
    // And it keeps the weeks it genuinely ran in.
    expect(compoundsInWeek([ended], weekDaysFrom("2026-02-02"), NO_LOGS)).toHaveLength(1)
  })

  it("draws NOTHING for an archived compound whose delete was never dated", () => {
    // A compound pulled from the cloud carries no schedule history, so
    // `archived` can be the only evidence of a delete, and it carries no date.
    //
    // This used to stop such a compound at TODAY and hand it every past day, on
    // the reasoning that it must have run until it was deleted. The reasoning
    // holds and the consequence did not: no past day has a log, so every past
    // day was a miss, so the compound drew a fresh row of missed doses in every
    // week for the rest of time. Two of Adrian's did this in the CURRENT week,
    // having been deleted in July before dated stops were written at all.
    const noTrail = compound({ archived: true })
    expect(hasDatedStopFixture(noTrail)).toBe(false)

    expect(wasRunningOn(noTrail, "2026-06-01")).toBe(false)
    expect(wasRunningOn(noTrail, TODAY)).toBe(false)

    const thisWeek = weekDaysFrom(mondayOf(TODAY))
    expect(compoundsInWeek([noTrail], thisWeek, NO_LOGS)).toHaveLength(0)
    expect(
      thisWeek.map((d) => weekCellState(noTrail, d, NO_LOGS, TODAY)),
    ).toEqual(["none", "none", "none", "none", "none", "none", "none"])
    expect(
      compoundsInWeek([noTrail], weekDaysFrom(shiftWeeks(mondayOf(TODAY), 1)), NO_LOGS),
    ).toHaveLength(0)
    expect(compoundsInWeek([noTrail], weekDaysFrom("2026-06-01"), NO_LOGS)).toHaveLength(0)
  })

  it("but keeps every day that compound has a LOG on", () => {
    // The strict reading above is only safe because nothing observed is lost by
    // it. A dose is a fact the user entered; the delete's missing date is not.
    const noTrail = compound({ archived: true })
    const logs = { "2026-06-02": { c1: { id: "l1" } } } as unknown as DayLogs
    const week = weekDaysFrom("2026-06-01")

    expect(compoundsInWeek([noTrail], week, logs)).toHaveLength(1)
    expect(weekCellState(noTrail, week[1], logs, TODAY)).toBe("logged")
    // And still nothing on the days around it, which is the whole point: the
    // row shows what happened, not a week of invented failure.
    expect(weekCellState(noTrail, week[0], logs, TODAY)).toBe("none")
    expect(weekCellState(noTrail, week[2], logs, TODAY)).toBe("none")
  })

  it("still trusts a dated stop over the archived flag", () => {
    // The dated record is the better evidence, so it wins: this one keeps the
    // current week only up to the day it was actually stopped.
    const dated = compound({
      archived: true,
      scheduleHistory: recordScheduleStop(compound(), "2026-08-19"),
    })
    expect(wasRunningOn(dated, "2026-08-18")).toBe(true)
    expect(wasRunningOn(dated, "2026-08-19")).toBe(false)
  })
})

/** Local mirror of the module's private helper, so the test above states what it
 *  is actually asserting rather than asserting it by side effect. */
function hasDatedStopFixture(c: StackCompound): boolean {
  return (c.scheduleHistory ?? []).some((v) => v.stopped === true)
}

describe("a back-dated start is a claim, not an observed run", () => {
  /* Adrian, 2026-09-03. Three compounds added on 7 August carried a start date
     of 24 July and not one logged dose. The grid drew a fortnight of solid
     missed marks for days that predate the records entirely, and the weeks
     before that filled with compounds he had added once to try the app out.

     The start date is a CLAIM ("I have been running this a while"); `createdAt`
     is the first day the app was actually there. Between the two there is no
     evidence either way, and "no evidence" must never render as failure. */
  const backdated = compound({
    schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-07-24" },
    createdAt: "2026-08-07",
  } as Partial<StackCompound>)
  const week = weekDaysFrom("2026-07-27") // Mon 27 Jul, wholly before the record

  it("claims no day before the record existed", () => {
    expect(wasRunningOn(backdated, "2026-08-06")).toBe(false)
    expect(wasRunningOn(backdated, "2026-08-07")).toBe(true)
  })

  it("gives that week no row at all rather than a row of misses", () => {
    expect(compoundsInWeek([backdated], week, NO_LOGS)).toHaveLength(0)
    expect(week.map((d) => weekCellState(backdated, d, NO_LOGS, TODAY))).toEqual([
      "none", "none", "none", "none", "none", "none", "none",
    ])
  })

  it("counts none of it toward the week's figures", () => {
    const m = weekMatrix([backdated], week, NO_LOGS, TODAY)
    expect(m.due).toBe(0)
    expect(m.logged).toBe(0)
  })

  it("still honours a back-filled dose, because that IS evidence", () => {
    // Someone who back-dates the start AND enters the doses is telling us what
    // happened. Their work counts; the blank days beside it still do not.
    const logs = { "2026-07-29": { c1: { id: "l1" } } } as unknown as DayLogs
    expect(compoundsInWeek([backdated], week, logs)).toHaveLength(1)
    expect(weekCellState(backdated, week[2], logs, TODAY)).toBe("logged")
    expect(weekCellState(backdated, week[3], logs, TODAY)).toBe("none")
    expect(weekMatrix([backdated], week, logs, TODAY).logged).toBe(1)
  })

  it("changes nothing for a record with no creation date", () => {
    // Absent means UNKNOWN, and unknown cannot rule a day out. Every record
    // written before this field existed behaves exactly as it did.
    const legacy = compound({
      schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-07-24" },
    })
    expect(wasRunningOn(legacy, "2026-08-06")).toBe(true)
    expect(compoundsInWeek([legacy], week, NO_LOGS)).toHaveLength(1)
  })
})

describe("weekMatrix counts only what has come due", () => {
  const daily = compound()
  const days = weekDaysFrom(MON)

  it("does not count doses still ahead of today", () => {
    // Tuesday, with Monday logged. Reporting "1 of 7" made the user look six
    // doses behind when five had not happened yet.
    const logs = { "2026-08-17": { c1: { id: "a" } } } as unknown as DayLogs
    const t = weekMatrix([daily], days, logs, "2026-08-18")
    expect(t).toMatchObject({ logged: 1, due: 1 })
  })

  it("counts the whole week once the week is past", () => {
    const logs = { "2026-08-17": { c1: { id: "a" } } } as unknown as DayLogs
    const t = weekMatrix([daily], days, logs, "2026-09-03")
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
    const t = weekMatrix([pausedA, pausedB], days, {} as DayLogs, "2026-09-03")
    expect(t.pausedDays).toBe(7)
    expect(t.due).toBe(0)
    expect(t.logged).toBe(0)
  })
})

/**
 * Both of these were the grid disagreeing with `/progress` about the same week,
 * found by review on 2026-09-03. The benchmark for each is what
 * `lib/progress/consistency.ts` reports, because two surfaces stating different
 * adherence for one week is worse than either being wrong alone.
 */
describe("a dose is only logged if it was actually taken", () => {
  const days = weekDaysFrom(MON)
  const PAST = "2026-09-03"
  /** A taken dose and a skipped one, in the shape the store writes. */
  const taken = { amount: "250", unit: "mg", siteId: null, time24: "09:00" }
  const skipped = { ...taken, status: "skipped" as const }

  it("does not draw a SKIPPED dose as logged", () => {
    // A truthiness check on the log counted a skip as taken, so a week of skips
    // drew seven solid marks and claimed 7 of 7. consistency.ts says in
    // capitals that a skipped dose is due-and-not-taken, precisely so someone
    // cannot skip everything and read 100%.
    const logs = Object.fromEntries(
      days.map((d) => [toKey(d), { c1: skipped }]),
    ) as unknown as DayLogs

    const m = weekMatrix([compound()], days, logs, PAST)
    expect(m.states.get("c1")).toEqual(Array(7).fill("missed"))
    expect(m).toMatchObject({ logged: 0, due: 7 })
  })

  it("still draws a TAKEN dose as logged", () => {
    const logs = Object.fromEntries(
      days.map((d) => [toKey(d), { c1: taken }]),
    ) as unknown as DayLogs
    const m = weekMatrix([compound()], days, logs, PAST)
    expect(m.states.get("c1")).toEqual(Array(7).fill("logged"))
    expect(m).toMatchObject({ logged: 7, due: 7 })
  })

  it("judges a twice-daily compound on EVERY slot, not just slot 0", () => {
    // `slotKey` leaves slot 0 unsuffixed and puts later doses at `id#1`, so
    // reading `logs[key][c.id]` could only ever see the morning. Someone who
    // logged only their evening dose all week read as having missed all seven.
    const twice = compound({
      schedule: {
        cadence: { type: "daily" },
        timeOfDay: "08:00",
        laterTimes: ["20:00"],
        startDate: "2026-01-01",
      },
    } as Partial<StackCompound>)

    const eveningOnly = Object.fromEntries(
      days.map((d) => [toKey(d), { "c1#1": taken }]),
    ) as unknown as DayLogs
    const evening = weekMatrix([twice], days, eveningOnly, PAST)
    expect(evening.logged).toBe(7)
    expect(evening.due).toBe(14)
    // Half the doses taken is not a clean sweep, and not a total miss either.
    expect(evening.states.get("c1")).toEqual(Array(7).fill("missed"))

    const bothSlots = Object.fromEntries(
      days.map((d) => [toKey(d), { c1: taken, "c1#1": taken }]),
    ) as unknown as DayLogs
    const both = weekMatrix([twice], days, bothSlots, PAST)
    expect(both).toMatchObject({ logged: 14, due: 14 })
    expect(both.states.get("c1")).toEqual(Array(7).fill("logged"))
  })
})
