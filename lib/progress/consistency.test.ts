/**
 * Consistency arithmetic. Health data, so the figure must never assert
 * something that was not measured.
 */
import { describe, it, expect } from "vitest"

import { computeAdherenceOver, overallPct } from "@/lib/progress/consistency"
import type { StackCompound } from "@/lib/home/stack"

describe("overallPct — today is not yet missed", () => {
  const pt = (key: string, due: number, logged: number) =>
    ({ key, due, logged, pct: due > 0 ? (logged / due) * 100 : null }) as never

  it("does not headline 0 % for a dose still to come today", () => {
    // The cold-start case: one compound added minutes ago, its time not passed.
    // Denominator 1 / numerator 0 read as a bare "0 %" adherence figure.
    expect(overallPct([pt("2026-07-31", 1, 0)], "2026-07-31")).toBeNull()
  })

  it("counts a dose taken today", () => {
    expect(overallPct([pt("2026-07-31", 1, 1)], "2026-07-31")).toBe(100)
  })

  it("still counts a missed dose from a day that is over", () => {
    expect(overallPct([pt("2026-07-30", 1, 0)], "2026-07-31")).toBe(0)
  })

  it("blends past and today correctly", () => {
    // Yesterday: taken. Today: still outstanding, so out of the denominator.
    expect(
      overallPct([pt("2026-07-30", 1, 1), pt("2026-07-31", 1, 0)], "2026-07-31"),
    ).toBe(100)
  })

  it("is unchanged when no today key is supplied", () => {
    expect(overallPct([pt("2026-07-31", 1, 0)])).toBe(0)
  })
})

/**
 * SLOTS AND SKIPS (Spec w2b-13; Adrian's call on skips, 2026-08-07).
 *
 * The rule these pin: a PAUSE changes what was due, so a paused day never
 * reaches the calculation at all. A SKIP does not change the plan — the dose was
 * still due and the user chose not to take it — so it counts as due-and-not-taken.
 */
describe("consistency counts DOSES, and a skip is not a dose taken", () => {
  const twiceDaily = (over: Partial<StackCompound> = {}): StackCompound => ({
    id: "c1",
    name: "Metformin",
    category: "oral",
    method: "po",
    dose: 500,
    unit: "mg",
    schedule: {
      cadence: { type: "daily" },
      timeOfDay: "08:00",
      laterTimes: ["20:00"],
      startDate: "2026-08-01",
    },
    rotationSites: [],
    rotationIndex: 0,
    ...over,
  })
  const taken = { amount: "500", time24: "08:00", siteId: null }
  const skipped = { ...taken, status: "skipped" as const }

  it("reads a twice-daily compound with ONE dose logged as 50%, not 100%", () => {
    // The denominator counted compounds, so slot 0 alone made the day complete.
    const pts = computeAdherenceOver(
      [twiceDaily()],
      { "2026-08-10": { c1: taken } },
      "2026-08-10",
      "2026-08-10",
    )
    expect(pts[0]).toMatchObject({ due: 2, logged: 1, pct: 50 })
  })

  it("reads both doses logged as 100%", () => {
    const pts = computeAdherenceOver(
      [twiceDaily()],
      { "2026-08-10": { c1: taken, "c1#1": taken } },
      "2026-08-10",
      "2026-08-10",
    )
    expect(pts[0]).toMatchObject({ due: 2, logged: 2, pct: 100 })
  })

  it("counts a SKIPPED dose as due but not taken", () => {
    const pts = computeAdherenceOver(
      [twiceDaily()],
      { "2026-08-10": { c1: taken, "c1#1": skipped } },
      "2026-08-10",
      "2026-08-10",
    )
    expect(pts[0]).toMatchObject({ due: 2, logged: 1, pct: 50 })
  })

  it("does not let skipping everything read as 100%", () => {
    // The reason a skip is not excluded: if it were, the metric would mean
    // nothing for anyone who used the button.
    const pts = computeAdherenceOver(
      [twiceDaily()],
      { "2026-08-10": { c1: skipped, "c1#1": skipped } },
      "2026-08-10",
      "2026-08-10",
    )
    expect(pts[0]).toMatchObject({ due: 2, logged: 0, pct: 0 })
  })

  it("leaves a PAUSED day out of the calculation entirely", () => {
    // The contrast that settles the skip question: a pause changes what was DUE,
    // so the day has no denominator at all rather than a zero numerator.
    const pts = computeAdherenceOver(
      [twiceDaily({ pauses: [{ id: "p", startedOn: "2026-08-09", endsOn: "2026-08-11" }] })],
      {},
      "2026-08-10",
      "2026-08-10",
    )
    expect(pts[0]).toMatchObject({ due: 0, logged: 0, pct: null })
  })
})

/**
 * A back-dated start is a claim about the past; it is not a stretch the app
 * observed. Counting it made consistency a statement about days nobody tracked,
 * and always in the same direction, because a day with no app on it has no logs.
 */
describe("consistency only counts days the app was there for", () => {
  const daily = (over: Partial<StackCompound> = {}): StackCompound => ({
    id: "c1",
    name: "Vitamin D3",
    category: "supplement",
    method: "po",
    dose: 5000,
    unit: "iu",
    schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-07-01" },
    rotationSites: [],
    rotationIndex: 0,
    ...over,
  })

  it("ignores days before the record was created", () => {
    // Added on 10 July, start back-dated to 1 July, nothing logged. The nine
    // days in between are unknown, not missed.
    const c = daily({ createdAt: "2026-07-10" })
    const pts = computeAdherenceOver([c], {}, "2026-07-01", "2026-07-09")
    expect(pts.every((p) => p.due === 0)).toBe(true)
    expect(overallPct(pts)).toBeNull()
  })

  it("counts from the day the record existed", () => {
    const c = daily({ createdAt: "2026-07-10" })
    const pts = computeAdherenceOver([c], {}, "2026-07-10", "2026-07-11")
    expect(pts.map((p) => p.due)).toEqual([1, 1])
    expect(overallPct(pts)).toBe(0)
  })

  it("counts a back-filled dose on an unobserved day", () => {
    // The user entered it, so it happened, so it counts. The blank days around
    // it still do not.
    const c = daily({ createdAt: "2026-07-10" })
    const logs = { "2026-07-03": { c1: { id: "l1" } } } as never
    const pts = computeAdherenceOver([c], logs, "2026-07-01", "2026-07-05")
    expect(pts.map((p) => p.due)).toEqual([0, 0, 1, 0, 0])
    expect(overallPct(pts)).toBe(100)
  })

  it("changes nothing for a record with no creation date", () => {
    const pts = computeAdherenceOver([daily()], {}, "2026-07-01", "2026-07-03")
    expect(pts.map((p) => p.due)).toEqual([1, 1, 1])
  })
})
