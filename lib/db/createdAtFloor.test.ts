/**
 * The evidence floor a `protocol_compounds` row carries onto the device.
 *
 * `createdAt` is the first day the app was actually watching, and everything
 * before it is unknown rather than missed (`wasObservedOn`). So the ONE
 * direction that must never happen is the floor landing later than the day the
 * user was standing in: that erases days the app genuinely saw.
 */
import { describe, expect, it, afterEach } from "vitest"

import { protocolCompoundToStack } from "@/lib/db/types"
import type { ProtocolCompound } from "@/lib/db/types"

const row = (createdAt: unknown): ProtocolCompound =>
  ({
    id: "pc1",
    user_id: "u1",
    cycle_id: "cy1",
    compound_id: "cat1",
    custom_name: null,
    custom_category: null,
    dose_amount: 250,
    dose_unit: "mg",
    route: "im",
    schedule_type: "every_day",
    days_of_week: null,
    interval_days: null,
    times_per_day: 1,
    dose_times: ["08:00"],
    first_dose_on: "2026-07-01",
    end_date: null,
    is_active: true,
    rotation_sites: [],
    rotation_index: 0,
    created_at: createdAt,
    updated_at: "2026-07-10T00:00:00Z",
  }) as unknown as ProtocolCompound

const floorOf = (createdAt: unknown): string | undefined =>
  protocolCompoundToStack(row(createdAt), { name: "Test E", category: "anabolic" })
    .createdAt

/** Run a case as if the device were in `tz`, by moving the process there. */
function inTimezone<T>(tz: string, fn: () => T): T {
  const before = process.env.TZ
  process.env.TZ = tz
  try {
    return fn()
  } finally {
    process.env.TZ = before
  }
}

afterEach(() => {
  delete process.env.TZ
})

describe("the floor is the earlier of the UTC day and the device's own day", () => {
  it("keeps the LOCAL day when the device is behind UTC", () => {
    // 09:40pm on the 9th in Los Angeles is already the 10th in UTC. The user
    // added the compound on their 9th, so a floor of the 10th would blank the
    // whole of their first day.
    const floor = inTimezone("America/Los_Angeles", () =>
      floorOf("2026-07-10T04:40:00.000Z"),
    )
    expect(floor).toBe("2026-07-09")
  })

  it("keeps the UTC day when the device is ahead of it", () => {
    // 09:40am on the 10th in Sydney is still the 10th in UTC by the calendar,
    // but an early-morning add crosses the other way: 08:40am on the 10th in
    // Sydney is the 9th in UTC. The earlier reading wins there too, and it is
    // the safe direction — a floor one day early declines to blank, nothing more.
    const floor = inTimezone("Australia/Sydney", () =>
      floorOf("2026-07-09T22:40:00.000Z"),
    )
    expect(floor).toBe("2026-07-09")
  })

  it("agrees with itself mid-day, when the two readings cannot differ", () => {
    expect(inTimezone("UTC", () => floorOf("2026-07-09T12:00:00.000Z"))).toBe(
      "2026-07-09",
    )
  })

  it("carries no floor at all when the stamp is unusable", () => {
    // Absent means UNKNOWN, and unknown cannot rule a day out, so the record
    // behaves exactly as it did before the field existed.
    expect(floorOf(null)).toBeUndefined()
    expect(floorOf("")).toBeUndefined()
    expect(floorOf(undefined)).toBeUndefined()
  })

  it("falls back to the date part when the stamp will not parse", () => {
    expect(floorOf("2026-07-09 not a timestamp")).toBe("2026-07-09")
  })
})
