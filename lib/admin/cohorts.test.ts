import { describe, expect, it } from "vitest"

import { cohortGrid, type CohortEvent } from "./cohorts"

const NOW = new Date("2026-08-13T12:00:00Z")
/** Wide enough to cover every date used below. */
const ALL_OBSERVED = new Date("2026-06-01T00:00:00Z")

const signup = (userId: string, at: string): CohortEvent => ({ userId, at: `${at}T09:00:00Z` })

describe("cohortGrid", () => {
  it("returns no rows, but still returns columns, when nobody has signed up", () => {
    const grid = cohortGrid({
      signups: [],
      activity: [],
      observedFrom: ALL_OBSERVED,
      now: NOW,
      maxWeeks: 4,
    })
    expect(grid.rows).toEqual([])
    expect(grid.weeks).toEqual([0, 1, 2, 3])
  })

  it("buckets signups into UTC Monday weeks and counts each cohort", () => {
    const grid = cohortGrid({
      // Sunday 2026-07-12 belongs to the week that OPENED on Monday 2026-07-06.
      signups: [signup("u1", "2026-07-06"), signup("u2", "2026-07-12"), signup("u3", "2026-07-13")],
      activity: [],
      observedFrom: ALL_OBSERVED,
      now: NOW,
      maxWeeks: 2,
    })
    expect(grid.rows.map((r) => [r.week, r.size])).toEqual([
      ["2026-07-06", 2],
      ["2026-07-13", 1],
    ])
  })

  it("fills each cell with the share of the cohort active that week", () => {
    const grid = cohortGrid({
      signups: [signup("u1", "2026-07-06"), signup("u2", "2026-07-07")],
      activity: [
        signup("u1", "2026-07-07"), // week 0
        signup("u2", "2026-07-08"), // week 0
        signup("u1", "2026-07-22"), // week 2
      ],
      observedFrom: ALL_OBSERVED,
      now: NOW,
      maxWeeks: 4,
    })
    expect(grid.rows[0].cells.map((c) => c.pct)).toEqual([100, 0, 50, 0])
    expect(grid.rows[0].cells.map((c) => c.active)).toEqual([2, 0, 1, 0])
  })

  it("counts a user once per week however many times they wrote", () => {
    const grid = cohortGrid({
      signups: [signup("u1", "2026-07-06")],
      activity: [
        signup("u1", "2026-07-07"),
        signup("u1", "2026-07-08"),
        signup("u1", "2026-07-09"),
      ],
      observedFrom: ALL_OBSERVED,
      now: NOW,
      maxWeeks: 2,
    })
    expect(grid.rows[0].cells[0].active).toBe(1)
    expect(grid.rows[0].cells[0].pct).toBe(100)
  })

  it("ignores activity by somebody who is not in the cohort", () => {
    const grid = cohortGrid({
      signups: [signup("u1", "2026-07-06")],
      activity: [signup("stranger", "2026-07-07")],
      observedFrom: ALL_OBSERVED,
      now: NOW,
      maxWeeks: 2,
    })
    expect(grid.rows[0].cells[0].active).toBe(0)
    expect(grid.rows[0].cells[0].pct).toBe(0)
  })

  // ── The reason this module exists ─────────────────────────────────────────

  it("returns null — not 0% — for a week the activity read never covered", () => {
    const grid = cohortGrid({
      signups: [signup("u1", "2026-07-06")],
      // Real activity in week 0, but the read window starts after it.
      activity: [signup("u1", "2026-07-07")],
      observedFrom: new Date("2026-08-01T00:00:00Z"),
      now: NOW,
      maxWeeks: 6,
    })
    const cells = grid.rows[0].cells
    // Weeks 0–3 open before 2026-08-01, so they were never looked at.
    expect(cells.slice(0, 4).map((c) => c.pct)).toEqual([null, null, null, null])
    expect(cells.slice(0, 4).every((c) => c.observed === false)).toBe(true)
    // Week 4 opens on 2026-08-03, inside the window, and is a real measured 0.
    expect(cells[4].observed).toBe(true)
    expect(cells[4].pct).toBe(0)
  })

  it("returns null for a week that has not happened yet", () => {
    const grid = cohortGrid({
      signups: [signup("u1", "2026-08-10")],
      activity: [signup("u1", "2026-08-11")],
      observedFrom: ALL_OBSERVED,
      now: NOW,
      maxWeeks: 3,
    })
    const cells = grid.rows[0].cells
    expect(cells[0].pct).toBe(100)
    expect(cells[1]).toMatchObject({ observed: false, pct: null })
    expect(cells[2]).toMatchObject({ observed: false, pct: null })
  })

  it("flags the week that is still running, so a partial column is not read as churn", () => {
    const grid = cohortGrid({
      signups: [signup("u1", "2026-07-06")],
      activity: [],
      observedFrom: ALL_OBSERVED,
      now: NOW,
      maxWeeks: 7,
    })
    const cells = grid.rows[0].cells
    // Weeks 0–4 finished before 2026-08-13; week 5 (opening 2026-08-10) is live.
    expect(cells.slice(0, 5).every((c) => c.partial === false)).toBe(true)
    expect(cells[5]).toMatchObject({ observed: true, partial: true })
    // …and week 6 has not started at all, so it is neither.
    expect(cells[6]).toMatchObject({ observed: false, partial: false })
  })

  // ── Boundaries and bad input ──────────────────────────────────────────────

  it("keeps the most recent cohorts when there are more than the grid holds", () => {
    const grid = cohortGrid({
      signups: [
        signup("u1", "2026-07-06"),
        signup("u2", "2026-07-13"),
        signup("u3", "2026-07-20"),
      ],
      activity: [],
      observedFrom: ALL_OBSERVED,
      now: NOW,
      maxWeeks: 2,
      maxCohorts: 2,
    })
    // Most recent two, still oldest-first so the grid reads down through time.
    expect(grid.rows.map((r) => r.week)).toEqual(["2026-07-13", "2026-07-20"])
  })

  it("drops signups it cannot date, and signups from the future", () => {
    const grid = cohortGrid({
      signups: [
        signup("u1", "2026-07-06"),
        { userId: "u2", at: "not a date" },
        { userId: "u3", at: "2027-01-04T00:00:00Z" },
      ],
      activity: [],
      observedFrom: ALL_OBSERVED,
      now: NOW,
      maxWeeks: 2,
    })
    expect(grid.rows.map((r) => [r.week, r.size])).toEqual([["2026-07-06", 1]])
  })

  it("drops activity it cannot date rather than counting it as epoch", () => {
    const grid = cohortGrid({
      signups: [signup("u1", "2026-07-06")],
      activity: [{ userId: "u1", at: "" }],
      observedFrom: ALL_OBSERVED,
      now: NOW,
      maxWeeks: 2,
    })
    expect(grid.rows[0].cells[0].active).toBe(0)
  })

  it("reports how many days of activity it could see", () => {
    const grid = cohortGrid({
      signups: [signup("u1", "2026-07-06")],
      activity: [],
      observedFrom: new Date("2026-07-14T12:00:00Z"),
      now: NOW,
      maxWeeks: 2,
    })
    expect(grid.observedDays).toBe(30)
  })

  // The invariant, asserted structurally rather than trusted.
  it("never lets a user id out of the module", () => {
    const grid = cohortGrid({
      signups: [signup("d7f1a0c2-user", "2026-07-06")],
      activity: [signup("d7f1a0c2-user", "2026-07-07")],
      observedFrom: ALL_OBSERVED,
      now: NOW,
      maxWeeks: 3,
    })
    expect(JSON.stringify(grid)).not.toContain("d7f1a0c2-user")
    expect(grid.rows[0].cells[0].active).toBe(1)
  })
})
