/**
 * Consistency arithmetic. Health data, so the figure must never assert
 * something that was not measured.
 */
import { describe, it, expect } from "vitest"

import { overallPct } from "@/lib/progress/consistency"

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
