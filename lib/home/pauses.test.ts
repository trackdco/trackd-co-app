import { describe, expect, it } from "vitest"

import {
  activePause,
  dayBefore,
  resumeLabel,
  isPausedOn,
  normalizePause,
  pausedDaysBetween,
  pausedDaysRemaining,
  resumesOn,
  type Pause,
} from "./pauses"
import {
  isCycleEnded,
  isDueOnFor,
  isRunning,
  upcomingDoseDates,
  type StackCompound,
} from "./stack"
import { cycleStatusOn, type CycleRule } from "@/lib/protocol/cycleRule"

const pause = (startedOn: string, endsOn: string | null, over: Partial<Pause> = {}): Pause => ({
  id: `p-${startedOn}`,
  startedOn,
  endsOn,
  ...over,
})

/**
 * BOTH ENDS INCLUSIVE. Undefined inclusivity is the single most likely source of
 * an off-by-one here, and an off-by-one shows up to the user as a phantom missed
 * day — so it gets its own block.
 */
describe("isPausedOn — both ends inclusive", () => {
  const p = [pause("2026-08-10", "2026-08-14")]

  it("includes the first and last day of the pause", () => {
    expect(isPausedOn(p, "2026-08-10")).toBe(true)
    expect(isPausedOn(p, "2026-08-14")).toBe(true)
  })

  it("excludes the day either side", () => {
    expect(isPausedOn(p, "2026-08-09")).toBe(false)
    expect(isPausedOn(p, "2026-08-15")).toBe(false)
  })

  it("treats a null end as running forever", () => {
    const open = [pause("2026-08-10", null)]
    expect(isPausedOn(open, "2026-08-10")).toBe(true)
    expect(isPausedOn(open, "2099-01-01")).toBe(true)
    expect(isPausedOn(open, "2026-08-09")).toBe(false)
  })

  it("is false for no pauses at all", () => {
    expect(isPausedOn(undefined, "2026-08-10")).toBe(false)
    expect(isPausedOn([], "2026-08-10")).toBe(false)
  })
})

describe("resuming today makes TODAY due, not tomorrow", () => {
  it("writes the day before as the last paused day", () => {
    expect(dayBefore("2026-08-10")).toBe("2026-08-09")
    // …so a pause ended that way no longer covers the day you resumed on.
    expect(isPausedOn([pause("2026-08-01", dayBefore("2026-08-10"))], "2026-08-10")).toBe(false)
  })

  it("steps back over a month boundary", () => {
    expect(dayBefore("2026-08-01")).toBe("2026-07-31")
    expect(dayBefore("2026-01-01")).toBe("2025-12-31")
  })
})

describe("pausedDaysBetween — half-open, and never double-counted", () => {
  it("counts the days in a simple pause", () => {
    // 10th to 14th inclusive is five days.
    expect(pausedDaysBetween([pause("2026-08-10", "2026-08-14")], "2026-08-01", "2026-09-01")).toBe(5)
  })

  it("excludes the `to` day, because the cycle clock counts days BEFORE it", () => {
    const p = [pause("2026-08-10", "2026-08-14")]
    expect(pausedDaysBetween(p, "2026-08-01", "2026-08-14")).toBe(4)
    expect(pausedDaysBetween(p, "2026-08-01", "2026-08-15")).toBe(5)
  })

  it("clips a pause that starts before the window", () => {
    expect(pausedDaysBetween([pause("2026-07-01", "2026-08-14")], "2026-08-10", "2026-08-15")).toBe(5)
  })

  it("counts OVERLAPPING pauses once, not twice", () => {
    // Ten days of rest must not take twenty days off the cycle clock. App logic
    // prevents overlaps on the way in; the arithmetic must be right regardless.
    const overlapping = [
      pause("2026-08-10", "2026-08-14"),
      pause("2026-08-12", "2026-08-16"),
    ]
    expect(pausedDaysBetween(overlapping, "2026-08-01", "2026-09-01")).toBe(7)
  })

  it("counts an indefinite pause only as far as the window", () => {
    expect(pausedDaysBetween([pause("2026-08-10", null)], "2026-08-01", "2026-08-15")).toBe(5)
  })

  it("is zero for an empty or backwards window", () => {
    expect(pausedDaysBetween([pause("2026-08-10", "2026-08-14")], "2026-09-01", "2026-08-01")).toBe(0)
    expect(pausedDaysBetween(undefined, "2026-08-01", "2026-09-01")).toBe(0)
  })
})

describe("activePause / resumesOn / pausedDaysRemaining", () => {
  const p = [pause("2026-08-10", "2026-08-14")]

  it("finds the pause covering a day", () => {
    expect(activePause(p, "2026-08-12")?.id).toBe("p-2026-08-10")
    expect(activePause(p, "2026-08-20")).toBeNull()
  })

  it("resumes the day AFTER the last paused day", () => {
    expect(resumesOn(p, "2026-08-12")).toBe("2026-08-15")
  })

  it("has no resume date for an indefinite pause, rather than inventing one", () => {
    expect(resumesOn([pause("2026-08-10", null)], "2026-08-12")).toBeNull()
  })

  it("counts the days still to come, inclusive of today", () => {
    expect(pausedDaysRemaining(p, "2026-08-12")).toBe(3)
    expect(pausedDaysRemaining(p, "2026-08-14")).toBe(1)
    expect(pausedDaysRemaining(p, "2026-08-20")).toBe(0)
  })

  it("gives NULL, not a large number, for an indefinite pause", () => {
    // There is no answer to "when does this run out" while nothing is being
    // consumed and no resume date exists.
    expect(pausedDaysRemaining([pause("2026-08-10", null)], "2026-08-12")).toBeNull()
  })
})

describe("normalizePause — a corrupt row must not pause a compound forever", () => {
  it("keeps a well-formed pause", () => {
    expect(normalizePause({ id: "a", startedOn: "2026-08-10", endsOn: "2026-08-14" })).toEqual({
      id: "a",
      startedOn: "2026-08-10",
      endsOn: "2026-08-14",
    })
  })

  it("drops a row with no id or an unparseable start", () => {
    expect(normalizePause({ startedOn: "2026-08-10", endsOn: null })).toBeNull()
    expect(normalizePause({ id: "a", startedOn: "nope", endsOn: null })).toBeNull()
  })

  it("REJECTS an end before its start rather than reading it as indefinite", () => {
    // Coercing it to null would pause the compound forever, which is the worst
    // available reading of a corrupt row.
    expect(normalizePause({ id: "a", startedOn: "2026-08-14", endsOn: "2026-08-10" })).toBeNull()
  })

  it("keeps a group id when there is one, and omits the key when there is not", () => {
    expect(normalizePause({ id: "a", startedOn: "2026-08-10", endsOn: null, groupId: "g" }))
      .toEqual({ id: "a", startedOn: "2026-08-10", endsOn: null, groupId: "g" })
    expect(
      Object.hasOwn(
        normalizePause({ id: "a", startedOn: "2026-08-10", endsOn: null }) ?? {},
        "groupId",
      ),
    ).toBe(false)
  })
})

/* ------------------------------------------------- the gate and the clock */

const daily = (over: Partial<StackCompound> = {}): StackCompound => ({
  id: "c1",
  name: "Test",
  category: "anabolic",
  method: "im",
  dose: 100,
  unit: "mg",
  schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-01-01" },
  rotationSites: [],
  rotationIndex: 0,
  ...over,
})

const at = (key: string) => {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y, m - 1, d)
}

describe("a paused day is not due, so it can never be missed", () => {
  const c = daily({ pauses: [pause("2026-08-10", "2026-08-23")] })

  it("is due before and after the pause", () => {
    expect(isDueOnFor(c, at("2026-08-09"))).toBe(true)
    expect(isDueOnFor(c, at("2026-08-24"))).toBe(true)
  })

  it("is NOT due on any day inside it", () => {
    for (const d of ["2026-08-10", "2026-08-17", "2026-08-23"]) {
      expect(isDueOnFor(c, at(d))).toBe(false)
    }
  })

  it("reclassifies a PAST fortnight with no backfill", () => {
    // The whole point of computing at read time: backdating a pause makes days
    // already recorded as missed stop resolving that way, with no migration.
    const before = daily()
    expect(isDueOnFor(before, at("2026-08-17"))).toBe(true)
    const after = daily({ pauses: [pause("2026-08-10", "2026-08-23")] })
    expect(isDueOnFor(after, at("2026-08-17"))).toBe(false)
  })
})

describe("paused days do not advance the cycle clock", () => {
  const cycle: CycleRule = {
    anchor: "2026-08-01",
    pattern: { type: "onOff", onDays: 7, offDays: 7 },
    end: { type: "never" },
    colour: "moss",
  }

  it("keeps the on/off phase where it was across a pause", () => {
    // Day 7 (08-08) would be the first OFF day. Pause 08-03..08-07 (five days),
    // and by 08-08 only two days of the cycle have actually elapsed — so it is
    // still ON.
    expect(cycleStatusOn(cycle, "2026-08-08").on).toBe(false)
    expect(cycleStatusOn(cycle, "2026-08-08", { pausedDays: 5 }).on).toBe(true)
  })

  it("cannot be pushed back before its own anchor by a nonsense count", () => {
    expect(cycleStatusOn(cycle, "2026-08-03", { pausedDays: 9999 }).on).toBe(true)
  })
})

describe("a fixed end date moves out by the days paused before it", () => {
  const ending: CycleRule = {
    anchor: "2026-08-01",
    pattern: { type: "continuous" },
    end: { type: "onDate", date: "2026-08-31" },
    colour: "moss",
  }

  it("ends on the stored date when nothing was paused", () => {
    expect(cycleStatusOn(ending, "2026-08-31").ended).toBe(false)
    expect(cycleStatusOn(ending, "2026-09-01").ended).toBe(true)
  })

  it("runs ten days longer after a ten-day pause", () => {
    // The run is still the length it was meant to be; pausing near the end must
    // not simply eat the tail.
    expect(cycleStatusOn(ending, "2026-09-01", { pausedBeforeEnd: 10 }).ended).toBe(false)
    expect(cycleStatusOn(ending, "2026-09-10", { pausedBeforeEnd: 10 }).ended).toBe(false)
    expect(cycleStatusOn(ending, "2026-09-11", { pausedBeforeEnd: 10 }).ended).toBe(true)
  })
})

/**
 * RE-ANCHORING (Adrian, 2026-08-07, overturning the earlier call). The next dose
 * lands on the day you come back, not on whatever day the untouched grid would
 * have picked.
 */
describe("an every-third-day compound resumes ON the day it comes back", () => {
  const c = daily({
    schedule: {
      cadence: { type: "everyNDays", n: 3 },
      timeOfDay: "08:00",
      startDate: "2026-08-01",
    },
    pauses: [pause("2026-08-05", "2026-08-11")],
  })

  it("keeps the ORIGINAL grid before the pause", () => {
    // 08-01, 08-04 … nothing about a pause reaches backwards.
    expect(isDueOnFor(c, at("2026-08-01"))).toBe(true)
    expect(isDueOnFor(c, at("2026-08-04"))).toBe(true)
    expect(isDueOnFor(c, at("2026-08-03"))).toBe(false)
  })

  it("is due on nothing inside the pause", () => {
    expect(isDueOnFor(c, at("2026-08-07"))).toBe(false)
    expect(isDueOnFor(c, at("2026-08-10"))).toBe(false)
  })

  it("is due on the RESUME day, then every third day from there", () => {
    expect(isDueOnFor(c, at("2026-08-12"))).toBe(true) // back, and due
    expect(isDueOnFor(c, at("2026-08-15"))).toBe(true)
    expect(isDueOnFor(c, at("2026-08-18"))).toBe(true)
    // …and no longer on the pre-pause grid, which is the trade this accepts.
    expect(isDueOnFor(c, at("2026-08-13"))).toBe(false)
  })

  it("leaves a compound that was never paused exactly as it was", () => {
    const never = daily({
      schedule: {
        cadence: { type: "everyNDays", n: 3 },
        timeOfDay: "08:00",
        startDate: "2026-08-01",
      },
    })
    expect(isDueOnFor(never, at("2026-08-13"))).toBe(true)
    expect(isDueOnFor(never, at("2026-08-12"))).toBe(false)
  })

  it("does not re-anchor while the pause is still open", () => {
    // An indefinite pause has no resume day to anchor to yet.
    const open = daily({
      schedule: {
        cadence: { type: "everyNDays", n: 3 },
        timeOfDay: "08:00",
        startDate: "2026-08-01",
      },
      pauses: [pause("2026-08-05", null)],
    })
    expect(isDueOnFor(open, at("2026-08-13"))).toBe(false) // paused
  })
})

/**
 * How the return reads on the dashboard: a DATE while it is far off, a COUNTDOWN
 * once it is within a week (Adrian, 2026-08-07). The crossover matches
 * `RUNS_DRY_AMBER_DAYS` — the point the app already treats as imminent.
 */
describe("resumeLabel — date far off, countdown when close", () => {
  const fmt = (k: string) => `D:${k}`
  const from = "2026-08-10"
  /** A pause that puts the user back `n` days after `from`. */
  const backIn = (n: number) => [pause("2026-08-01", dayBefore(shiftKey(from, n)))]

  it("gives a DATE when the return is more than a week out", () => {
    expect(resumeLabel(backIn(8), from, fmt)).toBe("D:2026-08-18")
    expect(resumeLabel(backIn(30), from, fmt)).toBe("D:2026-09-09")
  })

  it("switches to a COUNTDOWN at a week and closer", () => {
    expect(resumeLabel(backIn(7), from, fmt)).toBe("7 days")
    expect(resumeLabel(backIn(3), from, fmt)).toBe("3 days")
  })

  it("words the last two days rather than counting them", () => {
    expect(resumeLabel(backIn(1), from, fmt)).toBe("Tomorrow")
    expect(resumeLabel(backIn(2), from, fmt)).toBe("2 days")
  })

  it("says Indefinite for an open-ended pause, never a made-up date", () => {
    expect(resumeLabel([pause("2026-08-01", null)], from, fmt)).toBe("Indefinite")
  })

  it("is null when nothing is paused, so the caller can omit the row", () => {
    expect(resumeLabel([], from, fmt)).toBeNull()
    expect(resumeLabel([pause("2026-01-01", "2026-01-05")], from, fmt)).toBeNull()
  })
})

/** Local mirror of the module's own day shift, for the fixtures above. */
function shiftKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/**
 * REGRESSIONS, from the cold review of 2026-08-07. Each of these was live and
 * unpinned by the suite above.
 */
describe("regressions — found by review, not by tests", () => {
  it("honours a ONE-DAY pause in every helper at once", () => {
    // `spansOf` guarded on `end <= start` while `end` was still the inclusive
    // last day, so a one-day pause was dropped by `isPausedOn` and kept by
    // `activePause` — the compound was simultaneously paused and due, and the
    // day read as missed. A single day is the SHORTEST the sheet offers.
    const one = [pause("2026-08-10", "2026-08-10")]
    expect(isPausedOn(one, "2026-08-10")).toBe(true)
    expect(activePause(one, "2026-08-10")).not.toBeNull()
    expect(pausedDaysBetween(one, "2026-08-01", "2026-09-01")).toBe(1)
    expect(isDueOnFor(daily({ pauses: one }), at("2026-08-10"))).toBe(false)
    // …and the day either side is untouched.
    expect(isPausedOn(one, "2026-08-09")).toBe(false)
    expect(isPausedOn(one, "2026-08-11")).toBe(false)
  })

  it("still rejects a pause that genuinely ends before it starts", () => {
    expect(isPausedOn([pause("2026-08-14", "2026-08-10")], "2026-08-12")).toBe(false)
  })

  it("does not report a paused run as ENDED on the tail the pause pushed out", () => {
    // `isCycleEnded` was the one gate in the file without the pause context, so
    // a paused compound vanished from Today's Log and was offered back as a
    // fresh add while the calendar still counted it due.
    const c = daily({
      schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-08-01" },
      cycle: {
        anchor: "2026-08-01",
        pattern: { type: "onOff", onDays: 7, offDays: 7 },
        end: { type: "afterRounds", rounds: 2 },
        colour: "moss",
      },
      pauses: [pause("2026-08-05", "2026-08-14")],
    })
    // Ten paused days push the end out; the two answers must agree.
    expect(isCycleEnded(c, "2026-08-29")).toBe(false)
    expect(isRunning(c, "2026-08-29")).toBe(true)
  })

  it("lists the SAME upcoming dates the week strip does, after a pause", () => {
    // `upcomingDoseDates` walked the original grid while `isDueOnFor` walked the
    // re-anchored one, so every date on the "Next" line disagreed with the
    // calendar.
    const c = daily({
      schedule: {
        cadence: { type: "everyNDays", n: 3 },
        timeOfDay: "08:00",
        startDate: "2026-08-01",
      },
      pauses: [pause("2026-08-05", "2026-08-11")],
    })
    const upcoming = upcomingDoseDates(
      c.schedule,
      at("2026-08-12"),
      4,
      c.cycle,
      c.pauses,
    )
    for (const key of upcoming) {
      expect(isDueOnFor(c, at(key))).toBe(true)
    }
    expect(upcoming[0]).toBe("2026-08-12")
  })
})
