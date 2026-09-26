import { describe, expect, it } from "vitest"

import type { DayLogs } from "@/lib/home/doseLog"
import { toDateKey } from "@/lib/home/mockHomeData"
import type { StackCompound } from "@/lib/home/stack"

import {
  calendarDaysBetween,
  curveLines,
  doseAfterNextAt,
  hoursAt,
  hoursOf,
  loggedDoses,
  nextDoseAt,
  nextDoseWords,
  runLengthDays,
} from "./compoundCurve"
import {
  clearsAfterH,
  doseRuns,
  figuresAt,
  formatAmount,
  formatDuration,
  formatHalfLife,
  formatHalfLifeShort,
  formatPeak,
  lastDoseLeft,
  listRowFigure,
  peakCountdown,
  RUN_BREAK_MIN_H,
  runStartH,
  steadyAt,
  wallHoursBetween,
  type Dose,
} from "./model"

/**
 * Regressions for the cold review of the half-life slice (Context/reviews/
 * cold-bugs.md, B11 to B13 and B25 to B30; cold-design.md D28). Each case is
 * the review's own repro, and FAILED before its fix.
 */

const compound = (over: Partial<StackCompound> = {}): StackCompound => ({
  id: "x",
  name: "BPC-157",
  category: "peptide",
  method: "subq",
  dose: 250,
  unit: "mcg",
  schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-08-01" },
  rotationSites: [],
  rotationIndex: 0,
  ...over,
})

/** Run a case as if the device were in `tz`, by moving the process there. */
function inTimezone<T>(tz: string, fn: () => T): T {
  const before = process.env.TZ
  process.env.TZ = tz
  try {
    return fn()
  } finally {
    if (before === undefined) delete process.env.TZ
    else process.env.TZ = before
  }
}

/* ------------------------------------------------------------------- B11 */

describe("B11: Level for a short half-life taken two or three times a day", () => {
  /** `times` each day (hours after midnight), for `days` days, from day 0. */
  const regimen = (times: number[], days: number, amount = 250): Dose[] => {
    const out: Dose[] = []
    for (let d = 0; d < days; d++) times.forEach((h, slot) => out.push({ atH: d * 24 + h, amount, slot }))
    return out
  }

  it("BPC-157 at 08:00 and 16:00 for two weeks is one run, and steady", () => {
    const doses = regimen([8, 16], 14)
    const now = 13 * 24 + 12
    expect(runStartH(doses, now, 4)).toBe(8)
    const f = figuresAt({ doses, halfLifeH: 4, route: "injection", nowH: now, nextDoseAtH: 13 * 24 + 16 })
    expect(f.steady).toEqual({ kind: "reached" })
  })

  it("three times a day (08, 13, 18) is steady too, every morning", () => {
    const doses = regimen([8, 13, 18], 14)
    for (const h of [7, 9, 14, 20]) {
      const now = 13 * 24 + h
      expect(runStartH(doses, now, 4), `at ${h}:00`).toBe(8)
      expect(steadyAt(doses, now, 4, "injection", now + 1), `at ${h}:00`).toEqual({ kind: "reached" })
    }
  })

  it("has not lapsed overnight: before the first dose of the day it is still steady", () => {
    // 07:00 is 15 h after the 16:00 dose: the old rule (1.75 × the 8 h median)
    // called that lapsed and counted "Climbing" to the 08:00 dose.
    const doses = regimen([8, 16], 13)
    expect(steadyAt(doses, 13 * 24 + 7, 4, "injection", 13 * 24 + 8)).toEqual({ kind: "reached" })
  })

  it("two untimed slots both placed at noon do not make the usual interval 0", () => {
    const c = compound({
      id: "bpc",
      schedule: { cadence: { type: "daily" }, timeOfDay: "", laterTimes: [""], startDate: "2026-09-01" },
    })
    const logs: DayLogs = {}
    for (let d = 10; d <= 24; d++) {
      logs[`2026-09-${String(d).padStart(2, "0")}`] = {
        bpc: { amount: "250", unit: "mcg", siteId: null, time24: "" },
        "bpc#1": { amount: "250", unit: "mcg", siteId: null, time24: "" },
      }
    }
    const nowH = hoursOf(new Date(2026, 8, 25, 9, 0))
    const taken = loggedDoses(c, logs, nowH)
    const f = figuresAt({ doses: taken, halfLifeH: 4, route: "injection", nowH, nextDoseAtH: hoursAt("2026-09-25", "12:00") })
    expect(f.steady).toEqual({ kind: "reached" })
  })

  it("still breaks the run when a twice-daily compound misses two whole days", () => {
    const doses = [...regimen([8, 16], 10), ...regimen([8, 16], 5).map((d) => ({ ...d, atH: d.atH + 12 * 24 }))]
    expect(runStartH(doses, 16 * 24 + 17, 4)).toBe(12 * 24 + 8)
  })

  it("keeps the old rule for one dose a day: a missed day still breaks it", () => {
    const daily = (from: number, to: number) => regimen([8], to - from + 1).map((d) => ({ ...d, atH: d.atH + from * 24 }))
    expect(runStartH([...daily(0, 10), ...daily(13, 20)], 20 * 24 + 9, 4)).toBe(13 * 24 + 8)
    expect(runStartH(daily(0, 20), 20 * 24 + 22, 4)).toBe(8)
  })

  /* Round two: the first fix measured every gap against the 24 h same-slot
     interval, so a whole missed day (36 h) no longer broke a twice-daily run. */

  it("a missed day still breaks a twice-daily run: Oxandrolone at 08:00 and 20:00", () => {
    const doses = regimen([8, 20], 12, 10).filter((d) => Math.floor(d.atH / 24) !== 10)
    const now = 11 * 24 + 14
    expect(runStartH(doses, now, 9)).toBe(11 * 24 + 8)
    const f = figuresAt({ doses, halfLifeH: 9, route: "oral", nowH: now, nextDoseAtH: 11 * 24 + 20 })
    expect(f.steady.kind).toBe("in")
  })

  describe("any missed dose longer than three half-lives breaks the run, and nothing else does", () => {
    const regimens: [string, number[], number][] = [
      ["08/20", [8, 20], 1],
      ["08/16", [8, 16], 1],
      ["07/22", [7, 22], 1],
      ["08/13/18", [8, 13, 18], 1],
      ["06/12/18", [6, 12, 18], 1],
      ["08/20 every other day", [8, 20], 2],
      ["08:00 daily", [8], 1],
    ]
    const build = (times: number[], every: number) => {
      const out: Dose[] = []
      for (let d = 0; d < 24; d += every) times.forEach((h, slot) => out.push({ atH: d * 24 + h, amount: 10, slot }))
      return out
    }
    for (const [name, times, every] of regimens) {
      it(name, () => {
        const all = build(times, every)
        const missDay = 16
        const misses: [string, (d: Dose) => boolean][] = [
          ["the whole day", (d) => Math.floor(d.atH / 24) === missDay],
          ...times.map((_, slot): [string, (d: Dose) => boolean] => [
            `slot ${slot}`,
            (d) => Math.floor(d.atH / 24) === missDay && d.slot === slot,
          ]),
        ]
        for (const hl of [2, 4, 6, 9, 12, 18]) {
          // Taken as scheduled, it is one run however short the half-life.
          expect(runStartH(all, 23 * 24 + 23, hl), `${name} t½ ${hl}`).toBe(all[0].atH)
          for (const [miss, isMissed] of misses) {
            const doses = all.filter((d) => !isMissed(d))
            const i = doses.findIndex((d) => d.atH > missDay * 24 + 7 && all.some((a) => isMissed(a) && a.atH < d.atH))
            const after = doses[i]
            const gap = after.atH - doses[i - 1].atH
            const start = runStartH(doses, after.atH + 0.5, hl)
            const label = `${name} t½ ${hl} missed ${miss} (a ${gap} h gap)`
            if (gap > 3 * hl) expect(start, label).toBe(after.atH)
            else expect(start, label).toBe(all[0].atH)
          }
        }
      })
    }
  })

  it("07:00 and 22:00: a missed morning dose is a break, whichever way the gaps fall", () => {
    // The old rule's median of every gap flipped between 9 h and 15 h with the
    // count of each, and on the 15 h side a missed morning (24 h) was no break.
    const doses = regimen([7, 22], 16, 10).filter((d) => d.atH !== 14 * 24 + 7)
    expect(runStartH(doses, 14 * 24 + 23, 5)).toBe(14 * 24 + 22)
    expect(steadyAt(doses, 14 * 24 + 23, 5, "injection", 15 * 24 + 7).kind).toBe("in")
  })

  it("an overdue dose counts as missed once it is three quarters of the next gap late", () => {
    // 08:00 and 16:00, t½ 6 h: the 08:00 dose is due 16 h after 16:00, and the
    // gap after it is 8 h, so it has lapsed 16 + 6 = 22 h after the 16:00 dose.
    const doses = regimen([8, 16], 14, 10)
    const next = 14 * 24 + 16
    expect(steadyAt(doses, 13 * 24 + 16 + 21.5, 6, "injection", next)).toEqual({ kind: "reached" })
    expect(steadyAt(doses, 13 * 24 + 16 + 22.5, 6, "injection", next).kind).toBe("in")
    // Once a day it is 18 h late, as it always was (1.75 × 24 h).
    const daily = regimen([8], 14, 10)
    expect(steadyAt(daily, 13 * 24 + 8 + 41.5, 6, "injection", 16 * 24 + 8)).toEqual({ kind: "reached" })
    expect(steadyAt(daily, 13 * 24 + 8 + 42.5, 6, "injection", 16 * 24 + 8).kind).toBe("in")
  })

  it("a schedule cut from twice a day to once settles within about a week", () => {
    const before = regimen([8, 16], 30)
    const after = regimen([8], 12).map((d) => ({ ...d, atH: d.atH + 30 * 24 }))
    const doses = [...before, ...after]
    // Two weeks after the cut, the once-a-day run is steady (it restarted as
    // the new rhythm set in, not at every dose since).
    const now = 41 * 24 + 12
    expect(steadyAt(doses, now, 4, "injection", 42 * 24 + 8)).toEqual({ kind: "reached" })
    expect(runStartH(doses, now, 4)).toBeLessThanOrEqual(39 * 24 + 8)
  })
})

/* ------------------------------------------------------------------- B12 */

describe("B12: Peaks in sees a next dose however far off it is", () => {
  const cyp = (n: number) =>
    compound({
      id: "tc",
      name: "Testosterone Cypionate",
      category: "anabolic",
      method: "im",
      dose: 200,
      unit: "mg",
      schedule: { cadence: { type: "everyNDays", n }, timeOfDay: "08:00", startDate: "2026-08-01" },
    })

  it("every 14 days, 5 days after a dose: the next dose is due, so Next peak in", () => {
    const c = cyp(14)
    const logs: DayLogs = {}
    for (const k of ["2026-08-01", "2026-08-15", "2026-08-29", "2026-09-12"]) {
      logs[k] = { tc: { amount: "200", unit: "mg", siteId: null, time24: "08:00" } }
    }
    const now = new Date(2026, 8, 17, 12, 0)
    const nowH = hoursOf(now)
    // What useHalfLifeModels builds: the graph's eight days ahead.
    const [l] = curveLines(c, logs, now, nowH + 192)
    expect(l.toCome.map((d) => d.atH)).toEqual([hoursAt("2026-09-26", "08:00"), hoursAt("2026-10-10", "08:00")])
    const p = peakCountdown([...l.taken, ...l.toCome], nowH, l.source!.halfLifeH, l.source!.route)
    expect(formatPeak(p)?.label).toBe("Next peak in")
    expect(p.kind === "next" && p.atH > hoursAt("2026-09-26", "08:00")).toBe(true)
  })

  it("every 10 weeks, 20 days after a dose: still Next peak in, not Passed", () => {
    const c = cyp(70)
    const logs: DayLogs = { "2026-08-01": { tc: { amount: "750", unit: "mg", siteId: null, time24: "08:00" } } }
    const now = new Date(2026, 7, 21, 8, 0)
    const [l] = curveLines(c, logs, now, hoursOf(now) + 192)
    const p = peakCountdown([...l.taken, ...l.toCome], hoursOf(now), l.source!.halfLifeH, l.source!.route)
    expect(p.kind).toBe("next")
  })

  it("reaches the dose after next, and no further than the window otherwise", () => {
    const c = compound({ id: "d" })
    const now = new Date(2026, 8, 23, 13, 0)
    expect(doseAfterNextAt(c, {}, now)).toBe(hoursAt("2026-09-25", "08:00"))
    const [l] = curveLines(c, {}, now, hoursAt("2026-09-27", "23:59"))
    expect(l.toCome).toHaveLength(4)
    expect(doseAfterNextAt(compound({ pauses: [{ id: "p", startedOn: "2026-09-20", endsOn: null }] }), {}, now)).toBeNull()
  })
})

/* ------------------------------------------------------------------- B13 */

describe("B13: Next dose counts calendar days, not rounded hours", () => {
  it("21:00 with the next dose at 08:00 tomorrow reads 1 day", () => {
    const now = new Date(2026, 8, 25, 21, 0)
    const next = nextDoseAt(compound({ id: "d" }), {}, now)!
    expect(nextDoseWords(hoursOf(now), next)).toBe("1 day")
  })

  it("07:00 with the next dose at 20:00 today reads Today", () => {
    const c = compound({ id: "d", schedule: { cadence: { type: "daily" }, timeOfDay: "20:00", startDate: "2026-08-01" } })
    const now = new Date(2026, 8, 25, 7, 0)
    expect(nextDoseWords(hoursOf(now), nextDoseAt(c, {}, now)!)).toBe("Today")
  })

  it("counts days across a clock change by the dates alone", () => {
    inTimezone("Australia/Sydney", () => {
      // Clocks go back on 5 Apr 2026: 23:30 on the 4th to 00:30 on the 6th is 2 days.
      expect(calendarDaysBetween(hoursAt("2026-04-04", "23:30"), hoursAt("2026-04-06", "00:30"))).toBe(2)
      expect(nextDoseWords(hoursAt("2026-04-04", "23:30"), hoursAt("2026-04-07", "08:00"))).toBe("3 days")
    })
  })

  it("the figures carry the next dose's instant, so the rows can count days to it", () => {
    const f = figuresAt({ doses: [], halfLifeH: 4, route: "injection", nowH: 100, nextDoseAtH: 111 })
    expect(f.nowH).toBe(100)
    expect(f.nextDoseAtH).toBe(111)
    expect(f.nextDoseInH).toBe(11)
  })
})

/* ------------------------------------------------------------------- B25 */

describe("B25: NDT's parts are per mg of tablet, whatever the dose unit", () => {
  const base = { id: "ndt", name: "Natural Desiccated Thyroid", category: "thyroid" as StackCompound["category"], method: "po" as const }
  const now = new Date(2026, 8, 20, 12)

  it("1 grain logged as 60 mg or as 60000 mcg is the same 38 mcg of T4 and 9 of T3", () => {
    const cases: [StackCompound, DayLogs][] = [
      [compound({ ...base, dose: 60, unit: "mg" }), { "2026-09-19": { ndt: { amount: "60", unit: "mg", siteId: null, time24: "08:00" } } }],
      [compound({ ...base, dose: 60000, unit: "mcg" }), { "2026-09-19": { ndt: { amount: "60000", unit: "mcg", siteId: null, time24: "08:00" } } }],
    ]
    for (const [c, logs] of cases) {
      const lines = curveLines(c, logs, now, 0)
      expect(lines.map((l) => [l.label, l.unit])).toEqual([["T4", "mcg"], ["T3", "mcg"]])
      expect(lines[0].taken[0].amount).toBeCloseTo(38, 6)
      expect(lines[1].taken[0].amount).toBeCloseTo(9, 6)
    }
  })

  it("leaves the parts out when the dose cannot be put in mg", () => {
    const tabs = compound({ ...base, dose: 1, unit: "tab" })
    const logs: DayLogs = { "2026-09-19": { ndt: { amount: "1", unit: "tab", siteId: null, time24: "08:00" } } }
    expect(curveLines(tabs, logs, now, 0)).toEqual([])
  })

  it("splits a same-unit blend as it is, in mcg or in mg", () => {
    const glow = (unit: string, amount: string) =>
      curveLines(
        compound({ id: "g", name: "Glow (BPC-157 + TB-500 + GHK-Cu)", unit }),
        { "2026-09-19": { g: { amount, unit, siteId: null, time24: "08:00" } } },
        now,
        0,
      ).map((l) => l.taken[0].amount)
    expect(glow("mcg", "1750")).toEqual([250, 250, 1250])
    expect(glow("mg", "1.75").map((x) => +x.toFixed(6))).toEqual([0.25, 0.25, 1.25])
  })
})

/* ------------------------------------------------------------------- B26 */

describe("B26: the formatters round first, then pick the unit", () => {
  it("formatDuration never reads 60 min or 48h", () => {
    expect(formatDuration(0.995)).toBe("1h")
    expect(formatDuration(47.6)).toBe("2 days")
    expect(formatDuration(47.4)).toBe("47h")
    expect(formatDuration(0.2)).toBe("12 min")
    expect(formatDuration(0.001)).toBe("1 min")
    expect(formatDuration(48)).toBe("2 days")
  })

  it("formatHalfLife and its short tag never read 60 min or 48h", () => {
    expect(formatHalfLife(0.995)).toBe("1h")
    expect(formatHalfLife(47.99)).toBe("2.0 days")
    expect(formatHalfLife(1.2)).toBe("1.2h")
    expect(formatHalfLife(108)).toBe("4.5 days")
    expect(formatHalfLifeShort(0.995)).toBe("1H")
    expect(formatHalfLifeShort(47.99)).toBe("2.0D")
    expect(formatHalfLifeShort(0.5)).toBe("30MIN")
  })

  it("formatAmount keeps three significant figures across 10 and 100", () => {
    expect(formatAmount(99.96)).toBe("100")
    expect(formatAmount(9.996)).toBe("10.0")
    expect(formatAmount(99.94)).toBe("99.9")
    expect(formatAmount(9.994)).toBe("9.99")
    expect(formatAmount(219.556)).toBe("220")
    expect(formatAmount(0)).toBe("0.00")
  })
})

/* ------------------------------------------------------------------- B27 */

describe("B27: a past run's Length matches its dates", () => {
  it("1 Sep 08:00 to 3 Sep 20:00 is 3 days; one day is 1; overnight is 2", () => {
    expect(runLengthDays(hoursAt("2026-09-01", "08:00"), hoursAt("2026-09-03", "20:00"))).toBe(3)
    expect(runLengthDays(hoursAt("2026-09-01", "08:00"), hoursAt("2026-09-01", "20:00"))).toBe(1)
    expect(runLengthDays(hoursAt("2026-09-01", "20:00"), hoursAt("2026-09-02", "08:00"))).toBe(2)
  })
})

/* ------------------------------------------------------------------- B28 */

describe("B28: a week off is a week across the autumn clock change", () => {
  /** Daily 08:00 doses for ten days to `last`, a week off, then four more. */
  function weekOff(y: number, m: number, d: number): { doses: Dose[]; nowH: number } {
    const doses: Dose[] = []
    for (let i = -9; i <= 0; i++) doses.push({ atH: hoursAt(toDateKey(new Date(y, m, d + i)), "08:00"), amount: 250 })
    for (let i = 7; i <= 10; i++) doses.push({ atH: hoursAt(toDateKey(new Date(y, m, d + i)), "08:00"), amount: 250 })
    return { doses, nowH: doses[doses.length - 1].atH + 2 }
  }
  const runs = ({ doses, nowH }: { doses: Dose[]; nowH: number }) => doseRuns(doses, nowH, 4).length

  for (const [tz, y, m, d] of [
    ["Australia/Sydney", 2026, 3, 1],
    ["America/Los_Angeles", 2026, 9, 28],
    ["Europe/London", 2026, 9, 22],
  ] as const) {
    it(`${tz}: the week over the clock change is one run, as any other week is`, () => {
      inTimezone(tz, () => {
        expect(runs(weekOff(2026, 5, 3))).toBe(1)
        expect(runs(weekOff(y, m, d))).toBe(1)
        const { doses } = weekOff(y, m, d)
        expect(wallHoursBetween(doses[9].atH, doses[10].atH)).toBe(RUN_BREAK_MIN_H)
      })
    })
  }

  it("still splits a week and a day, and keeps a clock-change week current", () => {
    inTimezone("Australia/Sydney", () => {
      const doses = [0, 1, 2].map((i) => ({ atH: hoursAt(toDateKey(new Date(2026, 3, 1 + i - 2)), "08:00"), amount: 1 }))
      const later = { atH: hoursAt("2026-04-09", "08:00"), amount: 1 }
      expect(doseRuns([...doses, later], later.atH + 1, 4)).toHaveLength(2)
      // 1 Apr 08:00 to 8 Apr 08:00 (169 h of real time) is still this run.
      expect(doseRuns(doses, hoursAt("2026-04-08", "08:00"), 4).at(-1)?.current).toBe(true)
    })
  })
})

/* ------------------------------------------------------------------- B29 */

describe("B29: a dose tracked without a time is never placed in the future", () => {
  const c = compound({
    id: "bpc",
    schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", laterTimes: ["20:00"], startDate: "2026-09-01" },
  })
  const logs: DayLogs = {
    "2026-09-24": { "bpc#1": { amount: "250", unit: "mcg", siteId: null, time24: "" } },
    "2026-09-25": {
      bpc: { amount: "250", unit: "mcg", siteId: null, time24: "08:00" },
      "bpc#1": { amount: "250", unit: "mcg", siteId: null, time24: "" },
    },
  }
  const now = new Date(2026, 8, 25, 9, 0)

  it("today's later slot, tracked at 09:00 with no time, sits at Now", () => {
    const taken = loggedDoses(c, logs, hoursOf(now))
    expect(taken.every((d) => d.atH <= hoursOf(now))).toBe(true)
    expect(taken.at(-1)?.atH).toBe(hoursOf(now))
  })

  it("an untimed dose on an earlier day keeps its slot's time, and a timed one its own", () => {
    const taken = loggedDoses(c, logs, hoursOf(now))
    expect(taken[0].atH).toBe(hoursAt("2026-09-24", "20:00"))
    expect(taken[1].atH).toBe(hoursAt("2026-09-25", "08:00"))
  })

  it("the lines the screens draw carry it at Now, so the figures move on Track", () => {
    const [l] = curveLines(c, logs, now, hoursOf(now) + 192)
    expect(l.taken.every((d) => d.atH <= hoursOf(now))).toBe(true)
    const f = figuresAt({ doses: l.taken, halfLifeH: 4, route: "injection", nowH: hoursOf(now), nextDoseAtH: null })
    expect(f.lastDoseLeft).toBe(1)
  })
})

/* ------------------------------------------------------------------- B30 */

describe("B30: Clears in waits for a slow absorption", () => {
  it("a 0.02 h half-life taken by mouth has cleared when it says so", () => {
    const h = clearsAfterH(0.02, "oral")
    expect(lastDoseLeft(h, 0.02, "oral")).toBeLessThanOrEqual(0.03)
  })

  it("is unchanged for an injection, whose absorption is quicker than its half-life", () => {
    const h = clearsAfterH(144, "injection")
    expect(lastDoseLeft(h, 144, "injection")).toBeLessThanOrEqual(0.03)
    expect(lastDoseLeft(h - 144 / 50, 144, "injection")).toBeGreaterThan(0.03)
  })
})

/* ------------------------------------------------------------------- D28 */

describe("D28: the Half-life list draws no line before the first dose", () => {
  const f = (over: Partial<ReturnType<typeof figuresAt>>) => ({
    ...figuresAt({ doses: [], halfLifeH: 4, route: "injection", nowH: 0, nextDoseAtH: null }),
    ...over,
  })

  it("No doses yet, and no line", () => {
    expect(listRowFigure(null, "mg")).toEqual({ figure: "No doses yet", line: false })
    expect(listRowFigure(f({}), "mg")).toEqual({ figure: "No doses yet", line: false })
  })

  it("a line once there is a dose, cleared or circulating", () => {
    expect(listRowFigure(f({ lastDoseLeft: 0.01, clearsInH: -3 }), "mg")).toEqual({ figure: "Cleared", line: true })
    expect(listRowFigure(f({ lastDoseLeft: 0.5, clearsInH: 10, circulating: 4.5791 }), "mg")).toEqual({
      figure: "4.58 mg",
      line: true,
    })
  })
})
