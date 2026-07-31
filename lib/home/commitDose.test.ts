/**
 * Regression suite for `commitDoseOn` — the ONE path every log sheet writes
 * through.
 *
 * It exists because there were three copies of this logic (the dashboard, the
 * calendar, the quick-track sheet) and they had already drifted: quick-track's
 * took two parameters where the sheet passes four, so the day the user had just
 * edited in the Date row was dropped and the dose landed on the day the sheet
 * had been opened on — with the confirmation tick firing normally. TypeScript
 * cannot catch that, because a shorter function is assignable to a longer
 * signature. These tests pin the behaviour so the one implementation stays
 * honest.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  commitDoseOn,
  loadDoseLogs,
  loadTombstones,
  saveDoseLogs,
} from "@/lib/home/doseLog"

const USER = "u-1"

beforeEach(() => {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    dispatchEvent: () => true,
  }
})

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window
})

const dose = (amount: string) => ({ amount, siteId: null, time24: "09:00" })

describe("commitDoseOn", () => {
  it("writes to the day the sheet says it lands on, not the day it opened on", () => {
    // Quick-track's copy dropped `landsOn` entirely and wrote to `openedOn`.
    commitDoseOn(USER, "c1", dose("250"), "2026-07-28", "2026-07-31")
    const logs = loadDoseLogs(USER)
    expect(Object.keys(logs)).toEqual(["2026-07-28"])
    expect(logs["2026-07-28"]["c1"].amount).toBe("250")
  })

  it("MOVES an existing dose rather than copying it", () => {
    saveDoseLogs(USER, { "2026-07-31": { c1: dose("250") } })
    commitDoseOn(USER, "c1", dose("125"), "2026-07-29", "2026-07-31")
    const logs = loadDoseLogs(USER)
    expect(Object.keys(logs)).toEqual(["2026-07-29"])
    expect(logs["2026-07-29"]["c1"].amount).toBe("125")
  })

  it("does NOT tombstone a day the user never logged", () => {
    // The un-log used to fire for a FRESH log whose date had been changed,
    // planting a 14-day tombstone on a day with nothing on it. Hydration filters
    // every source by tombstone, so a dose for that day sitting in Postgres but
    // not yet pulled — a reinstall, a second device, mid-sync — would be deleted
    // from the cloud and suppressed for a fortnight.
    commitDoseOn(USER, "c1", dose("250"), "2026-07-28", "2026-07-31")
    expect(Object.keys(loadTombstones(USER))).toEqual([])
  })

  it("tombstones the OLD day when a real dose moves off it", () => {
    saveDoseLogs(USER, { "2026-07-31": { c1: dose("250") } })
    commitDoseOn(USER, "c1", dose("250"), "2026-07-29", "2026-07-31")
    expect(Object.keys(loadTombstones(USER))).toEqual(["2026-07-31|c1"])
  })

  it("leaves other compounds on the old day alone", () => {
    saveDoseLogs(USER, {
      "2026-07-31": { c1: dose("250"), c2: dose("500") },
    })
    commitDoseOn(USER, "c1", dose("250"), "2026-07-29", "2026-07-31")
    const logs = loadDoseLogs(USER)
    expect(logs["2026-07-31"]["c2"].amount).toBe("500")
    expect(logs["2026-07-31"]["c1"]).toBeUndefined()
    expect(logs["2026-07-29"]["c1"].amount).toBe("250")
  })

  it("writes exactly one entry when the day did not change", () => {
    commitDoseOn(USER, "c1", dose("250"), "2026-07-31", "2026-07-31")
    commitDoseOn(USER, "c1", dose("125"), "2026-07-31", "2026-07-31")
    const logs = loadDoseLogs(USER)
    expect(Object.keys(logs)).toEqual(["2026-07-31"])
    expect(logs["2026-07-31"]["c1"].amount).toBe("125")
  })
})
