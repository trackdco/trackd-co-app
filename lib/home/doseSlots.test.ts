import { describe, expect, it } from "vitest"

import {
  loggedCountFor,
  loggedSlotsFor,
  nextUnloggedSlot,
  parseSlotKey,
  slotKey,
  slotsForDay,
  tombstoneId,
} from "./doseLog"
import { doseAmountsOf, doseTimesOf, timesPerDayOf, type StackCompound } from "./stack"
import type { DoseLog } from "./mockHomeData"

const log = (amount: string): DoseLog => ({
  amount,
  time24: "08:00",
  siteId: null,
})

const compound = (over: Partial<StackCompound> = {}): StackCompound => ({
  id: "c1",
  name: "Test",
  category: "anabolic",
  method: "im",
  dose: 100,
  unit: "mg",
  schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-01-01" },
  rotationSites: [],
  rotationIndex: 0,
  ...over,
})

/**
 * The backwards-compatibility contract, and the reason no backfill is needed:
 * slot 0 is the BARE compound id, so every key ever written is already slot 0.
 */
describe("slotKey / parseSlotKey — slot 0 is unsuffixed", () => {
  it("leaves slot 0 as the bare compound id", () => {
    expect(slotKey("abc")).toBe("abc")
    expect(slotKey("abc", 0)).toBe("abc")
  })

  it("suffixes every later slot", () => {
    expect(slotKey("abc", 1)).toBe("abc#1")
    expect(slotKey("abc", 12)).toBe("abc#12")
  })

  it("reads a pre-slot key back as slot 0", () => {
    expect(parseSlotKey("abc")).toEqual({ compoundId: "abc", slot: 0 })
  })

  it("round-trips every slot", () => {
    for (const n of [0, 1, 2, 9, 10]) {
      expect(parseSlotKey(slotKey("abc", n))).toEqual({ compoundId: "abc", slot: n })
    }
  })

  it("does not truncate a compound id that itself contains a hash", () => {
    // Only a wholly numeric suffix is a slot. Otherwise the key belongs whole to
    // a compound whose id happens to contain a `#`, and splitting it would point
    // the log at a DIFFERENT compound.
    expect(parseSlotKey("ab#c")).toEqual({ compoundId: "ab#c", slot: 0 })
    expect(parseSlotKey("#1")).toEqual({ compoundId: "#1", slot: 0 })
  })
})

describe("tombstoneId — the slot is part of the identity", () => {
  it("keeps slot 0's tombstone in its old form, so existing ones still match", () => {
    expect(tombstoneId("2026-08-07", "c1")).toBe("2026-08-07|c1")
  })

  it("gives the evening dose a tombstone the morning one cannot answer to", () => {
    // The bug this prevents: undoing the evening dose offline suppressed the
    // MORNING dose on the next hydration, because the pull filter could not tell
    // the two apart.
    expect(tombstoneId("2026-08-07", "c1", 1)).not.toBe(tombstoneId("2026-08-07", "c1", 0))
  })
})

describe("counting a day's doses", () => {
  const day = { c1: log("100"), "c1#1": log("100"), c2: log("50") }

  it("finds every slot for one compound, in slot order", () => {
    expect(loggedSlotsFor(day, "c1").map((s) => s.slot)).toEqual([0, 1])
    expect(loggedCountFor(day, "c1")).toBe(2)
  })

  it("does not let one compound's slots leak into another's count", () => {
    expect(loggedCountFor(day, "c2")).toBe(1)
  })

  it("counts nothing for a compound with no logs, and for an absent day", () => {
    expect(loggedCountFor(day, "c3")).toBe(0)
    expect(loggedCountFor(undefined, "c1")).toBe(0)
  })
})

describe("nextUnloggedSlot — what one tap advances", () => {
  it("picks the first slot on an untouched day", () => {
    expect(nextUnloggedSlot({}, "c1", 2)).toBe(0)
  })

  it("picks the EVENING dose once the morning one is logged", () => {
    // Without this, tapping a twice-daily member's stack in the evening
    // overwrote the morning dose it had already recorded.
    expect(nextUnloggedSlot({ c1: log("100") }, "c1", 2)).toBe(1)
  })

  it("fills a gap rather than appending past it", () => {
    expect(nextUnloggedSlot({ "c1#1": log("100") }, "c1", 3)).toBe(0)
  })

  it("returns null when the day is already complete, so nothing duplicates", () => {
    expect(nextUnloggedSlot({ c1: log("100") }, "c1", 1)).toBeNull()
    expect(nextUnloggedSlot({ c1: log("100"), "c1#1": log("100") }, "c1", 2)).toBeNull()
  })

  it("treats a nonsense times-per-day as once daily", () => {
    expect(nextUnloggedSlot({}, "c1", 0)).toBe(0)
  })
})

describe("the schedule's own view of a multi-dose day", () => {
  it("reads a once-daily compound as one slot", () => {
    const c = compound()
    expect(timesPerDayOf(c.schedule)).toBe(1)
    expect(doseTimesOf(c.schedule)).toEqual(["08:00"])
  })

  it("puts slot 0 first and the later times after it, in order", () => {
    const c = compound({
      schedule: {
        cadence: { type: "daily" },
        timeOfDay: "08:00",
        laterTimes: ["14:00", "20:00"],
        startDate: "2026-01-01",
      },
    })
    expect(timesPerDayOf(c.schedule)).toBe(3)
    expect(doseTimesOf(c.schedule)).toEqual(["08:00", "14:00", "20:00"])
  })
})

/**
 * The reason slots resolve against the version in force ON THE DAY rather than
 * today's: a slot is an INDEX, so reading history against the current times
 * relabels doses that were genuinely taken at another hour.
 */
describe("slotsForDay — resolved against that day's schedule, not today's", () => {
  const twiceThenThrice = compound({
    schedule: {
      cadence: { type: "daily" },
      timeOfDay: "08:00",
      laterTimes: ["14:00", "20:00"],
      startDate: "2026-01-01",
    },
    scheduleHistory: [
      {
        effectiveFrom: "2026-01-01",
        cadence: { type: "daily" },
        timeOfDay: "09:00",
        laterTimes: ["21:00"],
        dose: 100,
        unit: "mg",
      },
      {
        effectiveFrom: "2026-06-01",
        cadence: { type: "daily" },
        timeOfDay: "08:00",
        laterTimes: ["14:00", "20:00"],
        dose: 100,
        unit: "mg",
      },
    ],
  })

  it("uses the OLD times for a day under the old version", () => {
    const slots = slotsForDay(twiceThenThrice, "2026-03-04", {})
    expect(slots.map((s) => s.time24)).toEqual(["09:00", "21:00"])
  })

  it("uses the new times for a day under the new version", () => {
    const slots = slotsForDay(twiceThenThrice, "2026-07-04", {})
    expect(slots.map((s) => s.time24)).toEqual(["08:00", "14:00", "20:00"])
  })

  it("attaches each day's logs to the right slot", () => {
    const slots = slotsForDay(twiceThenThrice, "2026-07-04", {
      c1: log("100"),
      "c1#2": log("50"),
    })
    expect(slots.map((s) => s.log?.amount ?? null)).toEqual(["100", null, "50"])
  })

  it("still renders a dose taken under a LONGER schedule that has since shrunk", () => {
    // Dropping from 3x to 2x daily must not erase the third dose you took last
    // month. It renders, marked `historic`, rather than disappearing.
    const shrunk = compound({
      schedule: {
        cadence: { type: "daily" },
        timeOfDay: "08:00",
        laterTimes: ["20:00"],
        startDate: "2026-01-01",
      },
    })
    const slots = slotsForDay(shrunk, "2026-07-04", {
      c1: log("100"),
      "c1#1": log("100"),
      "c1#2": log("100"),
    })
    expect(slots).toHaveLength(3)
    expect(slots[2]).toMatchObject({ slot: 2, historic: true })
    expect(slots[2].log?.amount).toBe("100")
  })

  it("gives a once-daily compound exactly one slot, keyed by the bare id", () => {
    const slots = slotsForDay(compound(), "2026-07-04", { c1: log("100") })
    expect(slots).toHaveLength(1)
    expect(slots[0]).toMatchObject({ slot: 0, time24: "08:00" })
    expect(slots[0].log?.amount).toBe("100")
  })
})

/**
 * Per-slot amounts. ⚠️ Scope the spec explicitly deferred, added on Adrian's
 * call (2026-08-07) — see `supabase/protocol/021`'s header.
 */
describe("doseAmountsOf — a different amount per dose", () => {
  const sched = (over: Partial<StackCompound["schedule"]> = {}) => ({
    cadence: { type: "daily" as const },
    timeOfDay: "08:00",
    startDate: "2026-01-01",
    ...over,
  })

  it("gives every slot the compound's dose when none is set", () => {
    expect(doseAmountsOf(sched({ laterTimes: ["20:00"] }), 500)).toEqual([500, 500])
  })

  it("gives a once-daily compound exactly one amount", () => {
    expect(doseAmountsOf(sched(), 500)).toEqual([500])
  })

  it("applies a per-slot amount to the slot it belongs to", () => {
    // 100 mg in the morning, 50 mg at night — the spec's own example.
    expect(
      doseAmountsOf(sched({ laterTimes: ["20:00"], laterDoses: [50] }), 100),
    ).toEqual([100, 50])
  })

  it("never lets a per-slot amount reach SLOT 0", () => {
    // Slot 0 always takes the compound's own dose. `laterDoses` is indexed from
    // slot 1, and an off-by-one here would silently restate the morning dose.
    const out = doseAmountsOf(
      sched({ laterTimes: ["14:00", "20:00"], laterDoses: [25, 50] }),
      100,
    )
    expect(out[0]).toBe(100)
    expect(out).toEqual([100, 25, 50])
  })

  it("reads a null, a gap and a short array all as the compound's dose", () => {
    // All three are legitimate states, not corruption: they mean "no per-slot
    // amount set", which is the default.
    expect(
      doseAmountsOf(sched({ laterTimes: ["14:00", "20:00"], laterDoses: [null, 50] }), 100),
    ).toEqual([100, 100, 50])
    expect(
      doseAmountsOf(sched({ laterTimes: ["14:00", "20:00"], laterDoses: [25] }), 100),
    ).toEqual([100, 25, 100])
  })

  it("ignores a nonsense amount rather than delivering it", () => {
    expect(
      doseAmountsOf(sched({ laterTimes: ["20:00"], laterDoses: [0] }), 100),
    ).toEqual([100, 100])
    expect(
      doseAmountsOf(sched({ laterTimes: ["20:00"], laterDoses: [-5] }), 100),
    ).toEqual([100, 100])
  })
})

describe("slotsForDay carries each slot's own planned amount", () => {
  it("hands the evening dose its own figure", () => {
    const c = compound({
      dose: 100,
      schedule: {
        cadence: { type: "daily" },
        timeOfDay: "08:00",
        laterTimes: ["20:00"],
        laterDoses: [50],
        startDate: "2026-01-01",
      },
    })
    expect(slotsForDay(c, "2026-07-04", {}).map((s) => s.dose)).toEqual([100, 50])
  })

  it("resolves the amounts against the version in force on that day", () => {
    // The same protection the times get: raising the evening dose today must
    // not restate the evening doses already taken last month.
    const c = compound({
      dose: 100,
      schedule: {
        cadence: { type: "daily" },
        timeOfDay: "08:00",
        laterTimes: ["20:00"],
        laterDoses: [80],
        startDate: "2026-01-01",
      },
      scheduleHistory: [
        {
          effectiveFrom: "2026-01-01",
          cadence: { type: "daily" },
          timeOfDay: "08:00",
          laterTimes: ["20:00"],
          laterDoses: [50],
          dose: 100,
          unit: "mg",
        },
        {
          effectiveFrom: "2026-06-01",
          cadence: { type: "daily" },
          timeOfDay: "08:00",
          laterTimes: ["20:00"],
          laterDoses: [80],
          dose: 100,
          unit: "mg",
        },
      ],
    })
    expect(slotsForDay(c, "2026-03-04", {}).map((s) => s.dose)).toEqual([100, 50])
    expect(slotsForDay(c, "2026-07-04", {}).map((s) => s.dose)).toEqual([100, 80])
  })
})

/**
 * REGRESSIONS, from the cold review of 2026-08-07. Every one of these was live
 * and unpinned: the slot plumbing itself was sound, but call sites throughout
 * the app still treated a slot key as a bare compound id.
 */
describe("regressions — slot keys reaching code that forgot slots exist", () => {
  it("keeps a compound's OWN slot 0 key identical to its id", () => {
    // The whole no-backfill claim rests on this. If it ever changes, every
    // stored log, row id and tombstone is orphaned at once.
    expect(slotKey("abc-123", 0)).toBe("abc-123")
    expect(tombstoneId("2026-08-07", "abc-123", 0)).toBe("2026-08-07|abc-123")
  })

  it("round-trips a slot key through parse for every realistic id shape", () => {
    // The failures this pins were all `map.get(slotKey)` misses — the lookup
    // silently returning undefined and the caller skipping or renaming the row.
    for (const id of [
      "abc-123",
      "550e8400-e29b-41d4-a716-446655440000",
      "pc:user:compound",
    ]) {
      for (const slot of [0, 1, 5]) {
        expect(parseSlotKey(slotKey(id, slot))).toEqual({ compoundId: id, slot })
      }
    }
  })

  it("gives each slot of a day its own tombstone identity", () => {
    // Un-logging the EVENING dose offline wrote `day|id#1`; hydration tested
    // `day|id` and let the row back in, keyed as the MORNING dose.
    const ids = [0, 1, 2].map((n) => tombstoneId("2026-08-07", "c1", n))
    expect(new Set(ids).size).toBe(3)
  })
})
