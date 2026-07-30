/**
 * Regression suite for the device dose-log store's NORMALISER.
 *
 * `loadDoseLogs` rebuilds every entry from an explicit field list rather than
 * trusting what is in storage — which is right, because that JSON is the one
 * place a hand-edited or out-of-date record can enter the app. The hazard is
 * that the list is a denylist by omission: a field nobody adds to it is silently
 * destroyed on every read, and the store is read on every render, on every
 * re-push, and by the log sheet when it re-opens a dose.
 *
 * That is exactly how the per-dose note shipped write-only. These tests pin each
 * field that must survive the round trip.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { loadDoseLogs, saveDoseLogs, type DayLogs } from "@/lib/home/doseLog"

const USER = "u-1"
const DAY = "2026-07-30"

/** The tests run in `environment: "node"`, so the store's `window` is stubbed. */
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

function roundTrip(logs: DayLogs): DayLogs {
  saveDoseLogs(USER, logs)
  return loadDoseLogs(USER)
}

describe("the dose-log store keeps every field it is given", () => {
  it("keeps the NOTE", () => {
    // The reported shape: the note was written to storage and to Postgres, and
    // then dropped by this normaliser on the way back out. So the log sheet
    // re-opened a dose with an empty box, saving it again wrote `note: null`
    // over what Postgres held, and the reconnect re-push — which also reads
    // through here — wiped every note the user had on a single network flap.
    const out = roundTrip({
      [DAY]: {
        "c-1": {
          amount: "250",
          unit: "mg",
          note: "sore site",
          siteId: null,
          time24: "09:00",
        },
      },
    })
    expect(out[DAY]["c-1"].note).toBe("sore site")
  })

  it("drops an empty or non-string note rather than storing a lie", () => {
    const out = roundTrip({
      [DAY]: {
        "c-1": { amount: "250", note: "", siteId: null, time24: "09:00" },
        "c-2": {
          amount: "250",
          // A hand-edited record could hold anything.
          note: 42 as unknown as string,
          siteId: null,
          time24: "09:00",
        },
      },
    })
    expect(out[DAY]["c-1"].note).toBeUndefined()
    expect(out[DAY]["c-2"].note).toBeUndefined()
  })

  it("keeps the unit, the site and the time", () => {
    const out = roundTrip({
      [DAY]: {
        "c-1": {
          amount: "500",
          unit: "mcg",
          siteId: "quad-left",
          time24: "20:15",
        },
      },
    })
    expect(out[DAY]["c-1"]).toMatchObject({
      amount: "500",
      unit: "mcg",
      siteId: "quad-left",
      time24: "20:15",
    })
  })

  it("preserves UNDECIDED as an absent key, not as null", () => {
    // The third state that matters: absent = "the server should resolve the
    // vial", null = "explicitly do not count this dose". Flattening one into the
    // other unlinks a vial on the next save.
    const out = roundTrip({
      [DAY]: {
        undecided: { amount: "250", siteId: null, time24: "09:00" },
        optedOut: {
          amount: "250",
          siteId: null,
          time24: "09:00",
          inventoryItemId: null,
        },
        linked: {
          amount: "250",
          siteId: null,
          time24: "09:00",
          inventoryItemId: "vial-1",
        },
      },
    })
    expect("inventoryItemId" in out[DAY].undecided).toBe(false)
    expect(out[DAY].optedOut.inventoryItemId).toBeNull()
    expect(out[DAY].linked.inventoryItemId).toBe("vial-1")
  })
})
