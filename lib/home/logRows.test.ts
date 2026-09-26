import { describe, expect, it } from "vitest"

import type { DayLogs } from "@/lib/home/doseLog"
import type { StackCompound } from "@/lib/home/stack"
import { dayDoseRows, siteDaysBefore } from "./logRows"

const c = (over: Partial<StackCompound> = {}): StackCompound => ({
  id: "reta",
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

describe("the day's rows for Quick log and the Calendar", () => {
  it("lists what is due, with its slots and slot 0's log", () => {
    const logs: DayLogs = { "2026-09-24": { reta: { amount: "2", unit: "mg", siteId: null, time24: "09:00" } } }
    const rows = dayDoseRows([c(), c({ id: "bpc", name: "BPC-157" })], logs, "2026-09-24")
    expect(rows.map((r) => r.id)).toEqual(["reta", "bpc"])
    expect(rows[0].log?.amount).toBe("2")
    expect(rows[0].slots).toHaveLength(1)
    expect(rows[1].log).toBeNull()
  })

  it("keeps a deleted compound on a day it was logged, and drops it elsewhere", () => {
    const gone = c({ archived: true })
    const logs: DayLogs = { "2026-09-20": { reta: { amount: "2", unit: "mg", siteId: null, time24: "" } } }
    expect(dayDoseRows([gone], logs, "2026-09-20")).toHaveLength(1)
    expect(dayDoseRows([gone], logs, "2026-09-21")).toHaveLength(0)
  })

  it("leaves out a paused compound with nothing logged, and nothing before its start", () => {
    const paused = c({ pauses: [{ id: "p", startedOn: "2026-09-20", endsOn: null }] })
    expect(dayDoseRows([paused], {}, "2026-09-24")).toHaveLength(0)
    expect(dayDoseRows([c()], {}, "2026-08-30")).toHaveLength(0)
  })
})

describe("days since each site, for the Site panel's map", () => {
  const logs: DayLogs = {
    "2026-09-20": { reta: { amount: "2", unit: "mg", siteId: "sq-abdo-l", time24: "" } },
    "2026-09-23": { bpc: { amount: "1", unit: "mg", siteId: "sq-abdo-r", time24: "" } },
    "2026-09-24": {
      reta: { amount: "2", unit: "mg", siteId: "sq-abdo-l", time24: "" },
      "bpc#1": { amount: "1", unit: "mg", siteId: "sq-glute-l", time24: "" },
    },
    "2026-09-25": { reta: { amount: "2", unit: "mg", siteId: "sq-arm-l", time24: "" } },
  }

  it("counts back from the day, including it, never after it", () => {
    expect(siteDaysBefore(logs, "2026-09-24")).toEqual({ "sq-abdo-l": 0, "sq-abdo-r": 1, "sq-glute-l": 0 })
  })

  it("leaves out the dose being logged on that day, and only that dose", () => {
    expect(siteDaysBefore(logs, "2026-09-24", { compoundId: "reta", slot: 0 })).toEqual({
      "sq-abdo-l": 4,
      "sq-abdo-r": 1,
      "sq-glute-l": 0,
    })
    expect(siteDaysBefore(logs, "2026-09-24", { compoundId: "bpc", slot: 1 })["sq-glute-l"]).toBeUndefined()
  })

  // B21: the evening dose's map hid this morning's site of the same compound.
  it("counts this morning's dose of the same compound when logging its evening dose", () => {
    const day: DayLogs = { "2026-09-26": { bpc: { amount: "250", unit: "mcg", siteId: "sq-abdo-l", time24: "08:02" } } }
    expect(siteDaysBefore(day, "2026-09-26", { compoundId: "bpc", slot: 1 })).toEqual({ "sq-abdo-l": 0 })
    // Re-opening the morning dose itself still leaves it out.
    expect(siteDaysBefore(day, "2026-09-26", { compoundId: "bpc", slot: 0 })).toEqual({})
  })
})
