import { describe, expect, it } from "vitest"

import type { DayLogs } from "@/lib/home/doseLog"
import type { StackCompound } from "@/lib/home/stack"
import {
  convertAmount,
  curveLines,
  halfLifeOf,
  hoursAt,
  loggedDoses,
  nextDoseAt,
  scheduledDoses,
} from "./compoundCurve"

const compound = (over: Partial<StackCompound> = {}): StackCompound => ({
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

describe("half-life sources", () => {
  it("reads the catalogue, with its route", () => {
    expect(halfLifeOf("Retatrutide", "subq")).toEqual({ halfLifeH: 144, estimated: false, route: "injection" })
    expect(halfLifeOf("Anastrozole", "po")?.route).toBe("oral")
  })

  it("marks the three with no human PK as estimates", () => {
    for (const n of ["BPC-157", "TB-500", "GHK-Cu"]) expect(halfLifeOf(n, "subq")?.estimated, n).toBe(true)
  })

  it("falls back to a custom compound's own half-life, and to none", () => {
    expect(halfLifeOf("My Blend", "im", new Map([["my blend", 36]]))?.halfLifeH).toBe(36)
    expect(halfLifeOf("My Blend", "im")).toBeNull()
    expect(halfLifeOf("KPV", "subq")).toBeNull()
  })
})

describe("units", () => {
  it("adds mg and mcg together, and never mixes iu with mg", () => {
    expect(convertAmount(250, "mcg", "mg")).toBeCloseTo(0.25, 10)
    expect(convertAmount(2, "mg", "mcg")).toBe(2000)
    expect(convertAmount(1000, "iu", "mg")).toBeNull()
  })
})

describe("logged doses", () => {
  const logs: DayLogs = {
    "2026-09-20": { reta: { amount: "2", unit: "mg", siteId: null, time24: "07:30" } },
    "2026-09-21": { reta: { amount: "2000", unit: "mcg", siteId: null, time24: "" } },
    "2026-09-22": { reta: { amount: "2", unit: "mg", siteId: null, time24: "08:00", status: "skipped" } },
    "2026-09-23": { other: { amount: "5", unit: "mg", siteId: null, time24: "08:00" } },
  }

  it("keeps taken doses in the compound's unit, oldest first", () => {
    const d = loggedDoses(compound(), logs)
    expect(d.map((x) => x.amount)).toEqual([2, 2])
    expect(d[0].atH).toBe(hoursAt("2026-09-20", "07:30"))
  })

  it("places an untimed dose at its slot's scheduled time", () => {
    expect(loggedDoses(compound(), logs)[1].atH).toBe(hoursAt("2026-09-21", "08:00"))
  })

  it("does not count a skipped dose, or another compound's", () => {
    expect(loggedDoses(compound(), logs)).toHaveLength(2)
  })
})

describe("doses still to come", () => {
  const now = new Date(2026, 8, 23, 13, 12) // Wed 23 Sep, 13:12

  it("skips today's slot once it is past or logged, and starts tomorrow", () => {
    const d = scheduledDoses(compound(), {}, now, hoursAt("2026-09-26", "23:59"))
    expect(d.map((x) => x.atH)).toEqual(
      ["2026-09-24", "2026-09-25", "2026-09-26"].map((k) => hoursAt(k, "08:00")),
    )
  })

  it("includes today's later slot, at its own amount", () => {
    const twice = compound({
      schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", laterTimes: ["20:00"], laterDoses: [1], startDate: "2026-09-01" },
    })
    const d = scheduledDoses(twice, {}, now, hoursAt("2026-09-23", "23:59"))
    expect(d).toEqual([{ atH: hoursAt("2026-09-23", "20:00"), amount: 1, slot: 1 }])
  })

  it("names the next dose due", () => {
    expect(nextDoseAt(compound(), {}, now)).toBe(hoursAt("2026-09-24", "08:00"))
  })

  it("has none for a compound paused indefinitely", () => {
    const paused = compound({ pauses: [{ id: "p", startedOn: "2026-09-20", endsOn: null }] })
    expect(nextDoseAt(paused, {}, now)).toBeNull()
  })
})

describe("blend lines", () => {
  it("splits a Glow dose into its three components, each on its own half-life", () => {
    const glow = compound({ id: "glow", name: "Glow (BPC-157 + TB-500 + GHK-Cu)", dose: 1750, unit: "mcg" })
    const logs: DayLogs = { "2026-09-22": { glow: { amount: "1750", unit: "mcg", siteId: null, time24: "08:00" } } }
    const lines = curveLines(glow, logs, new Date(2026, 8, 23, 13), hoursAt("2026-09-24", "00:00"))
    expect(lines.map((l) => [l.label, l.taken[0].amount, l.source?.halfLifeH])).toEqual([
      ["BPC", 250, 4],
      ["TB", 250, 2],
      ["GHK", 1250, 4],
    ])
  })

  it("lists a component with no half-life, so it can say so", () => {
    const klow = compound({ id: "k", name: "KLOW (BPC-157 + TB-500 + GHK-Cu + KPV)", unit: "mcg" })
    const kpv = curveLines(klow, {}, new Date(2026, 8, 23), 0).find((l) => l.label === "KPV")
    expect(kpv?.source).toBeNull()
  })
})
