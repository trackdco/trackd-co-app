/**
 * Regression suite for Spec 01 · Dose & Schedule Integrity.
 *
 * One `describe` per reported symptom, each pinning the SPECIFIC behaviour that
 * was wrong — so a future change that reintroduces the bug fails here rather
 * than in a beta tester's log. The comments name the original defect, because a
 * test whose reason has been forgotten is the first one deleted when it goes red.
 */
import { describe, expect, it } from "vitest"

import {
  combineLocalDateTime,
  dateKeyToDate,
  toDateKey,
  type DoseLog,
} from "@/lib/home/mockHomeData"
import {
  formatTimeLabel,
  hasTime,
  isDueOn,
  isDueOnFor,
  recordScheduleVersion,
  resolveScheduleOn,
  scheduleVersionFromRow,
  scheduleVersionToRow,
  upcomingDoseDates,
  type Schedule,
  type StackCompound,
} from "@/lib/home/stack"
import { recordScheduleStop } from "@/lib/home/stack"
import { computeNextDose, formatCountdown } from "@/lib/home/nextDose"
import {
  getSelectedDay,
  getSelectedDayOrToday,
  setSelectedDay,
} from "@/lib/home/selectedDay"
import type { DayLogs } from "@/lib/home/doseLog"

/* ------------------------------------------------------------------ fixtures */

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

function log(over: Partial<DoseLog> = {}): DoseLog {
  return { amount: "250", siteId: null, time24: "09:00", ...over }
}

/* ------------------------------------------------------ next dose resolution */

describe("next dose resolution", () => {
  const day = "2026-07-23"
  const date = dateKeyToDate(day)

  it("resolves a due dose instead of returning nothing", () => {
    // THE BUG: the screen passed `seedStack` (the empty first-run fixture) rather
    // than the user's stack, so this returned null for every user on every render
    // and the card rendered a dash while doses were genuinely due.
    const next = computeNextDose([compound()], {}, day, date)
    expect(next).not.toBeNull()
    expect(next?.name).toBe("Test E")
  })

  it("returns the EARLIEST due compound of several", () => {
    const stack = [
      compound({ id: "a", name: "Late", schedule: schedule({ timeOfDay: "15:43" }) }),
      compound({ id: "b", name: "Early", schedule: schedule({ timeOfDay: "15:42" }) }),
    ]
    expect(computeNextDose(stack, {}, day, date)?.name).toBe("Early")
  })

  it("skips a dose that is already logged, and advances to the next", () => {
    const stack = [
      compound({ id: "a", name: "Early", schedule: schedule({ timeOfDay: "08:00" }) }),
      compound({ id: "b", name: "Later", schedule: schedule({ timeOfDay: "20:00" }) }),
    ]
    const logs: DayLogs = { [day]: { a: log() } }
    expect(computeNextDose(stack, logs, day, date)?.name).toBe("Later")
  })

  it("returns null only once everything due is logged", () => {
    const stack = [compound({ id: "a" })]
    expect(computeNextDose(stack, { [day]: { a: log() } }, day, date)).toBeNull()
  })

  it("never offers an archived compound", () => {
    expect(computeNextDose([compound({ archived: true })], {}, day, date)).toBeNull()
  })

  it("sorts a compound with no dose time LAST, not first", () => {
    // `""` string-compares below every real time, so an untimed compound would
    // otherwise sit permanently in the slot and hide the timed one behind it.
    const stack = [
      compound({ id: "a", name: "Untimed", schedule: schedule({ timeOfDay: "" }) }),
      compound({ id: "b", name: "Timed", schedule: schedule({ timeOfDay: "22:00" }) }),
    ]
    expect(computeNextDose(stack, {}, day, date)?.name).toBe("Timed")
  })

  it("counts an overdue dose as still outstanding", () => {
    // 15:42 has passed by 16:00, but the dose is unlogged — overdue, not gone.
    const now = new Date(2026, 6, 23, 16, 0)
    expect(formatCountdown(now, "15:42")).toBe("0h 0m")
  })

  it("does not roll a passed time forward to tomorrow", () => {
    // Rolling over would re-point the countdown at the NEXT day's dose and hide
    // the overdue one entirely.
    const now = new Date(2026, 6, 23, 16, 0)
    expect(formatCountdown(now, "15:00")).not.toBe("23h 0m")
  })

  it("counts down to a dose still ahead", () => {
    const now = new Date(2026, 6, 23, 9, 30)
    expect(formatCountdown(now, "11:00")).toBe("1h 30m")
  })
})

/* --------------------------------------------------- logging from a past day */

describe("date context on logging", () => {
  it("writes to the published day, not to today", () => {
    // THE BUG: the quick-actions FAB is rendered by the (app) shell and hardcoded
    // "today", so scrolling the week strip back and logging from the FAB silently
    // landed the dose on today.
    setSelectedDay("2026-07-20")
    expect(getSelectedDayOrToday("2026-07-23")).toBe("2026-07-20")
    setSelectedDay(null)
  })

  it("falls back to today only when NO day was supplied", () => {
    setSelectedDay(null)
    expect(getSelectedDay()).toBeNull()
    expect(getSelectedDayOrToday("2026-07-23")).toBe("2026-07-23")
  })

  it("clears the selection so it cannot outlive its screen", () => {
    setSelectedDay("2026-07-20")
    setSelectedDay(null)
    expect(getSelectedDayOrToday("2026-07-23")).toBe("2026-07-23")
  })

  it("stamps a back-dated dose on ITS day, not the day it was entered", () => {
    // `taken_at` is derived client-side from the day key + time. A dose logged for
    // last Monday must land on last Monday even though it is being entered today.
    const iso = combineLocalDateTime("2026-07-20", "18:30")
    const stamped = new Date(iso)
    expect(toDateKey(stamped)).toBe("2026-07-20")
    expect(stamped.getHours()).toBe(18)
    expect(stamped.getMinutes()).toBe(30)
  })

  it("keeps a back-dated dose on its own day when the time is unset", () => {
    // An unset time falls back to local noon — deliberately mid-day, so the day
    // cannot slide either side of midnight under any timezone offset.
    const stamped = new Date(combineLocalDateTime("2026-07-20", ""))
    expect(toDateKey(stamped)).toBe("2026-07-20")
  })
})

/* ------------------------------------------------------------- unset time */

describe("dose time is not pre-filled", () => {
  it("treats an empty time as unset, not as a value", () => {
    expect(hasTime("")).toBe(false)
    expect(hasTime("09:00")).toBe(true)
    expect(hasTime(undefined)).toBe(false)
  })

  it("words a legacy unset time the same way everywhere", () => {
    // A time is REQUIRED at every entry point now, so this only ever renders for
    // records written before that — never for something a user just skipped.
    expect(formatTimeLabel("")).toBe("Not set")
  })

  it("rejects an empty time as not-set, which is what blocks the log", () => {
    expect(hasTime("")).toBe(false)
  })

  it("still formats a real time normally", () => {
    expect(formatTimeLabel("07:30")).toBe("7:30 AM")
    expect(formatTimeLabel("19:05")).toBe("7:05 PM")
  })

  it("does not treat midnight as unset", () => {
    // "00:00" is a legitimate chosen time and must not collapse into "Not set".
    expect(hasTime("00:00")).toBe(true)
    expect(formatTimeLabel("00:00")).toBe("12:00 AM")
  })
})

/* ------------------------------------ altering a schedule never rewrites history */

describe("altering a dose or schedule leaves logged doses alone", () => {
  /** What the dose row renders for a compound, given its log (if any). */
  function shownDose(c: StackCompound, logged: DoseLog | null) {
    return {
      amount: logged ? logged.amount : String(c.dose),
      unit: (logged?.unit ?? c.unit) || c.unit,
      time: logged ? logged.time24 : c.schedule.timeOfDay,
    }
  }

  it("keeps the unit a dose was recorded in when the compound's unit changes", () => {
    // THE BUG: the row rendered the compound's CURRENT unit beside the historical
    // amount, so switching mg → mcg kept "250" and silently restated it as 250mcg
    // — a thousandfold change in meaning, applied retroactively to every dose.
    const logged = log({ amount: "250", unit: "mg" })
    const altered = compound({ unit: "mcg", dose: 250 })
    expect(shownDose(altered, logged).unit).toBe("mg")
    expect(shownDose(altered, logged).amount).toBe("250")
  })

  it("keeps the time a dose was logged at when the schedule time changes", () => {
    const logged = log({ time24: "07:15" })
    const altered = compound({ schedule: schedule({ timeOfDay: "21:00" }) })
    expect(shownDose(altered, logged).time).toBe("07:15")
  })

  it("still shows the CURRENT plan for a day that has no log", () => {
    // The other half of the rule: an alteration must apply going forward. An
    // unlogged row is a prediction and should track the new schedule.
    const altered = compound({ dose: 500, unit: "mcg", schedule: schedule({ timeOfDay: "21:00" }) })
    expect(shownDose(altered, null)).toEqual({
      amount: "500",
      unit: "mcg",
      time: "21:00",
    })
  })

  it("falls back to the compound's unit for logs written before units were stamped", () => {
    const legacy = log({ amount: "250" })
    delete (legacy as { unit?: string }).unit
    expect(shownDose(compound({ unit: "mg" }), legacy).unit).toBe("mg")
  })
})

/* ------------------------------------------------------ schedule versioning */

describe("an alteration applies from the chosen day forward", () => {
  // Daily from 1 Jul; on 20 Jul the user switches it to Mondays only.
  const original = compound({
    dose: 250,
    unit: "mg",
    schedule: schedule({ cadence: { type: "daily" }, startDate: "2026-07-01" }),
  })
  const history = recordScheduleVersion(
    original,
    { cadence: { type: "daysOfWeek", days: [1] }, timeOfDay: "20:00", dose: 500, unit: "mg" },
    "2026-07-20"
  )
  const altered: StackCompound = {
    ...original,
    dose: 500,
    schedule: schedule({
      cadence: { type: "daysOfWeek", days: [1] },
      timeOfDay: "20:00",
      startDate: "2026-07-01",
    }),
    scheduleHistory: history,
  }

  it("seeds a baseline so days before the change keep the OLD rule", () => {
    expect(history[0].effectiveFrom).toBe("2026-07-01")
    expect(history[0].cadence).toEqual({ type: "daily" })
    expect(history[0].dose).toBe(250)
  })

  it("still says a pre-change Wednesday was due", () => {
    // 15 Jul 2026 is a Wednesday. Under the OLD daily rule it was due; under the
    // new Mondays-only rule it wouldn't be. Before versioning, the alteration
    // rewrote that day and a correctly-rested Wednesday became "missed".
    expect(isDueOnFor(altered, dateKeyToDate("2026-07-15"))).toBe(true)
  })

  it("applies the new rule from the change day onward", () => {
    // 22 Jul 2026 is a Wednesday — not due under Mondays-only.
    expect(isDueOnFor(altered, dateKeyToDate("2026-07-22"))).toBe(false)
    // 20 Jul 2026 is the Monday the change took effect.
    expect(isDueOnFor(altered, dateKeyToDate("2026-07-20"))).toBe(true)
  })

  it("resolves the dose that was in force on a past day", () => {
    expect(resolveScheduleOn(altered, "2026-07-15").dose).toBe(250)
    expect(resolveScheduleOn(altered, "2026-07-20").dose).toBe(500)
  })

  it("adds no catch-up dose for the days before the change", () => {
    // Raising 250 → 500 must not retroactively make earlier days owe 500.
    expect(resolveScheduleOn(altered, "2026-07-02").dose).toBe(250)
    expect(altered.scheduleHistory).toHaveLength(2)
  })

  it("replaces same-day re-edits instead of stacking versions", () => {
    const again = recordScheduleVersion(
      altered,
      { cadence: { type: "daily" }, timeOfDay: "08:00", dose: 300, unit: "mg" },
      "2026-07-20"
    )
    expect(again).toHaveLength(2)
    expect(again[1].dose).toBe(300)
  })

  it("behaves exactly as before for a compound never edited", () => {
    // No history ⇒ current values, so versioning costs nothing until it's used.
    const plain = compound()
    expect(resolveScheduleOn(plain, "2020-01-01").dose).toBe(plain.dose)
    expect(isDueOnFor(plain, dateKeyToDate("2026-07-15"))).toBe(
      isDueOn(plain.schedule, dateKeyToDate("2026-07-15"))
    )
  })

  it("answers a day older than every version with the OLDEST rule", () => {
    // A history pulled from Postgres need not reach back to the compound's start
    // (versions are written from the first edit onward). Falling through to the
    // CURRENT rule there would be the retroactive rewrite this exists to stop, so
    // the earliest recorded rule is the honest answer.
    const late: StackCompound = {
      ...original,
      dose: 500,
      scheduleHistory: [
        { effectiveFrom: "2026-07-20", cadence: { type: "daily" }, timeOfDay: "20:00", dose: 400, unit: "mg" },
      ],
    }
    expect(resolveScheduleOn(late, "2026-07-05").dose).toBe(400)
  })

  it("round-trips a version through the Postgres row shape", () => {
    const v = history[1]
    expect(scheduleVersionFromRow(scheduleVersionToRow(v))).toEqual(v)
  })

  it("round-trips every cadence shape", () => {
    const cadences: Schedule["cadence"][] = [
      { type: "daily" },
      { type: "everyOtherDay" },
      { type: "everyNDays", n: 5 },
      { type: "daysOfWeek", days: [0, 3, 6] },
    ]
    for (const cadence of cadences) {
      const v = { effectiveFrom: "2026-07-20", cadence, timeOfDay: "09:00", dose: 1, unit: "mg" }
      expect(scheduleVersionFromRow(scheduleVersionToRow(v))).toEqual(v)
    }
  })
})

/* ------------------------------------------- schedule: no retroactive backfill */

describe("schedule resolution", () => {
  it("is not due before its start date", () => {
    // No back-fill: a compound that did not exist on Tuesday has no Tuesday dose.
    const s = schedule({ startDate: "2026-07-20" })
    expect(isDueOn(s, dateKeyToDate("2026-07-19"))).toBe(false)
    expect(isDueOn(s, dateKeyToDate("2026-07-20"))).toBe(true)
  })

  it("anchors every-other-day to the start date", () => {
    const s = schedule({ cadence: { type: "everyOtherDay" }, startDate: "2026-07-20" })
    expect(isDueOn(s, dateKeyToDate("2026-07-20"))).toBe(true)
    expect(isDueOn(s, dateKeyToDate("2026-07-21"))).toBe(false)
    expect(isDueOn(s, dateKeyToDate("2026-07-22"))).toBe(true)
  })

  it("anchors every-N-days to the start date", () => {
    const s = schedule({
      cadence: { type: "everyNDays", n: 3 },
      startDate: "2026-07-20",
    })
    expect(isDueOn(s, dateKeyToDate("2026-07-23"))).toBe(true)
    expect(isDueOn(s, dateKeyToDate("2026-07-24"))).toBe(false)
  })

  it("never schedules a catch-up dose before the start date", () => {
    // The system must not compensate: raising a dose or moving a schedule adds no
    // back-filled doses for the days that came before it.
    const s = schedule({ startDate: "2026-07-20" })
    const upcoming = upcomingDoseDates(s, dateKeyToDate("2026-07-01"), 3)
    expect(upcoming.every((d) => d >= "2026-07-20")).toBe(true)
    expect(upcoming[0]).toBe("2026-07-20")
  })
})

/* ------------------------------------------------- the delete / re-add gap */

describe("deleting a compound records a stop (Spec 02)", () => {
  // The reported shape: run a compound, delete it, add it back weeks later. The
  // logged doses always survived, but the run BEFORE the delete stopped counting
  // as "due" (the re-add moved `startDate` forward, and `isDueOn` gates on it), so
  // a completed run silently dropped out of consistency. Anchoring on the earliest
  // version fixes that — and would then make the deleted GAP read as missed doses,
  // which is why the stop marker has to exist as well.
  const ran = compound({
    schedule: schedule({ cadence: { type: "daily" }, startDate: "2026-01-01" }),
  })

  it("keeps the pre-delete run due after a re-add moves the start date", () => {
    const stopped = { ...ran, scheduleHistory: recordScheduleStop(ran, "2026-03-01") }
    // Re-added in June with a fresh start date, exactly what AddCompoundSheet writes.
    const readded: StackCompound = {
      ...stopped,
      schedule: schedule({ cadence: { type: "daily" }, startDate: "2026-06-01" }),
      scheduleHistory: recordScheduleVersion(
        stopped,
        { cadence: { type: "daily" }, timeOfDay: "09:00", dose: 250, unit: "mg" },
        "2026-06-01"
      ),
    }
    // The original run still counts.
    expect(isDueOnFor(readded, dateKeyToDate("2026-02-10"))).toBe(true)
    // The deleted stretch does not.
    expect(isDueOnFor(readded, dateKeyToDate("2026-04-10"))).toBe(false)
    // The new run does.
    expect(isDueOnFor(readded, dateKeyToDate("2026-06-10"))).toBe(true)
  })

  it("treats every day from the stop until a resume as not due", () => {
    const stopped = { ...ran, scheduleHistory: recordScheduleStop(ran, "2026-03-01") }
    expect(isDueOnFor(stopped, dateKeyToDate("2026-02-28"))).toBe(true)
    expect(isDueOnFor(stopped, dateKeyToDate("2026-03-01"))).toBe(false)
    expect(isDueOnFor(stopped, dateKeyToDate("2027-01-01"))).toBe(false)
  })

  it("seeds the outgoing rule so the run before the delete keeps its own cadence", () => {
    const stopped = recordScheduleStop(ran, "2026-03-01")
    expect(stopped).toHaveLength(2)
    expect(stopped[0].effectiveFrom).toBe("2026-01-01")
    expect(stopped[0].stopped).toBeFalsy()
    expect(stopped[1].effectiveFrom).toBe("2026-03-01")
    expect(stopped[1].stopped).toBe(true)
  })

  it("round-trips the stop through the Postgres row shape", () => {
    const [, stop] = recordScheduleStop(ran, "2026-03-01")
    const back = scheduleVersionFromRow(scheduleVersionToRow(stop))
    expect(back.stopped).toBe(true)
    expect(scheduleVersionFromRow(scheduleVersionToRow(ran.scheduleHistory?.[0] ?? {
      effectiveFrom: "2026-01-01", cadence: { type: "daily" }, timeOfDay: "09:00",
      dose: 250, unit: "mg",
    })).stopped).toBeUndefined()
  })

  it("costs nothing for a compound that was never deleted", () => {
    // No history ⇒ unchanged behaviour, the guarantee the whole feature rests on.
    expect(isDueOnFor(ran, dateKeyToDate("2026-02-10"))).toBe(true)
    expect(resolveScheduleOn(ran, "2026-02-10").stopped).toBe(false)
  })
})

describe("Spec 02 · the Next Dose card resolves through the shared helper", () => {
  it("carries the compound and the dose AS IT WAS on the day", () => {
    const c = compound({ schedule: schedule({ timeOfDay: "08:00" }) })
    const next = computeNextDose([c], {}, "2026-01-05", dateKeyToDate("2026-01-05"))
    // Home draws the container from `compound`, so it must come back with it —
    // a local re-implementation of the ordering got the untimed case wrong.
    expect(next?.compound.id).toBe(c.id)
    expect(next?.dose).toBe(c.dose)
    expect(next?.unit).toBe(c.unit)
  })

  it("still sorts an untimed compound LAST when it carries the compound", () => {
    const timed = compound({ id: "timed", name: "Test E", schedule: schedule({ timeOfDay: "08:00" }) })
    const untimed = compound({ id: "untimed", name: "Anastrozole", schedule: schedule({ timeOfDay: "" }) })
    const next = computeNextDose([untimed, timed], {}, "2026-01-05", dateKeyToDate("2026-01-05"))
    // "" string-compares below every real time, so a naive sort puts the untimed
    // compound first and it sits in the card permanently, hiding real doses.
    expect(next?.name).toBe("Test E")
    expect(next?.compound.id).toBe("timed")
  })
})

describe("schedule day-counting is DST-safe (proven bug, Europe/London)", () => {
  it("does not collapse or skip a day across a UTC+0 DST transition", () => {
    // 2026-03-29 and 2026-03-30 previously shared one day number in London, and
    // 25 -> 26 October skipped one. An every-other-day protocol therefore showed
    // a 3-day gap in March, two consecutive due days in October, and its phase
    // inverted permanently after each transition.
    const c = compound({
      schedule: schedule({ cadence: { type: "everyOtherDay" }, startDate: "2026-03-02" }),
    })
    const due = (k: string) => isDueOnFor(c, dateKeyToDate(k))
    // Strict alternation across the March boundary.
    expect([
      due("2026-03-26"), due("2026-03-27"), due("2026-03-28"),
      due("2026-03-29"), due("2026-03-30"), due("2026-03-31"),
    ]).toEqual([true, false, true, false, true, false])
    // And across the October one.
    expect([
      due("2026-10-24"), due("2026-10-25"), due("2026-10-26"), due("2026-10-27"),
    ]).toEqual([true, false, true, false])
  })

  it("is never due the day BEFORE its own start date", () => {
    const c = compound({ schedule: schedule({ startDate: "2026-03-30" }) })
    expect(isDueOnFor(c, dateKeyToDate("2026-03-29"))).toBe(false)
    expect(isDueOnFor(c, dateKeyToDate("2026-03-30"))).toBe(true)
  })
})
