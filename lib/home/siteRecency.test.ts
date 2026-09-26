import { describe, expect, it } from "vitest"

import type { DayLogs } from "@/lib/home/doseLog"
import { siteDaysBefore } from "@/lib/home/logRows"
import { calendarDayNumber, siteDaysSince, siteHeat } from "@/lib/home/siteRecency"

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

const at = (day: string, siteId: string, compound = "c1"): DayLogs =>
  ({ [day]: { [compound]: { amount: "1", time24: "09:00", siteId } } }) as unknown as DayLogs

/*
 * Ported from the cold bug review's proof (tests/home/siteRecencyLondon.test.ts).
 * The count divided a LOCAL midnight by a whole day, so where local midnight
 * crosses UTC midnight at a clock change, 29 and 30 March 2026 came out as one
 * day in Europe/London: Home's sites card said "today" for yesterday's site,
 * and disagreed with the Site panel (`siteDaysBefore`), which was right. The
 * proof only ran with TZ=Europe/London; this moves the process there itself.
 */
describe("siteDaysSince counts calendar days across a clock change", () => {
  it("London, March: a site used YESTERDAY reads 1 day ago, not today", () => {
    inTimezone("Europe/London", () => {
      const logs = at("2026-03-29", "im-delt-l")
      expect(siteDaysBefore(logs, "2026-03-30")).toEqual({ "im-delt-l": 1 })
      expect(siteDaysSince(logs, "2026-03-30")).toEqual({ "im-delt-l": 1 })
    })
  })

  it("London, October: the day after the clocks go back is 1 day, not 2", () => {
    inTimezone("Europe/London", () => {
      expect(siteDaysSince(at("2026-10-25", "sq-abdo-l"), "2026-10-26")).toEqual({ "sq-abdo-l": 1 })
    })
  })

  it("agrees with the Site panel in Sydney, Los Angeles, Dublin and Lisbon", () => {
    for (const tz of ["Australia/Sydney", "America/Los_Angeles", "Europe/Dublin", "Europe/Lisbon"]) {
      inTimezone(tz, () => {
        for (const [used, today] of [
          ["2026-03-29", "2026-03-30"],
          ["2026-03-28", "2026-03-30"],
          ["2026-10-25", "2026-10-26"],
          ["2026-04-05", "2026-04-06"],
          ["2026-11-01", "2026-11-02"],
          ["2026-09-20", "2026-09-26"],
        ]) {
          const logs = at(used, "im-glute-r")
          expect(siteDaysSince(logs, today)).toEqual(siteDaysBefore(logs, today))
        }
      })
    }
  })

  it("keeps each site's most recent use, including today, and ignores the future", () => {
    const logs = {
      "2026-09-20": { a: { amount: "1", time24: "09:00", siteId: "im-delt-l" } },
      "2026-09-24": { a: { amount: "1", time24: "09:00", siteId: "im-delt-l" } },
      "2026-09-26": {
        b: { amount: "1", time24: "09:00", siteId: "sq-abdo-r" },
        "b#1": { amount: "1", time24: "21:00", siteId: "sq-abdo-l" },
      },
      "2026-09-27": { a: { amount: "1", time24: "09:00", siteId: "im-quad-out-l" } },
    } as unknown as DayLogs
    expect(siteDaysSince(logs, "2026-09-26")).toEqual({ "im-delt-l": 2, "sq-abdo-r": 0, "sq-abdo-l": 0 })
  })

  it("skips a malformed day key instead of counting it", () => {
    const logs = { "not-a-day": { a: { amount: "1", time24: "09:00", siteId: "im-delt-l" } } } as unknown as DayLogs
    expect(siteDaysSince(logs, "2026-09-26")).toEqual({})
  })
})

describe("calendarDayNumber", () => {
  it("is one apart for consecutive days, whatever the clock does", () => {
    inTimezone("Europe/London", () => {
      expect(calendarDayNumber("2026-03-30")! - calendarDayNumber("2026-03-29")!).toBe(1)
      expect(calendarDayNumber("2026-10-26")! - calendarDayNumber("2026-10-25")!).toBe(1)
      expect(calendarDayNumber("2027-01-01")! - calendarDayNumber("2026-12-31")!).toBe(1)
    })
  })
  it("is null for a key that is not a date", () => {
    expect(calendarDayNumber("2026-3-1")).toBeNull()
    expect(calendarDayNumber("")).toBeNull()
  })
})

describe("siteHeat (unchanged)", () => {
  it("is full on the day, fades by route, and is empty past the window", () => {
    expect(siteHeat(0, "im")).toBe(1)
    expect(siteHeat(7, "im")).toBe(0)
    expect(siteHeat(5, "subq")).toBe(0)
    expect(siteHeat(null, "subq")).toBe(0)
  })
})
