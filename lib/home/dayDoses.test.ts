import { describe, expect, it } from "vitest"

import { belongsInDayLog, ringCounts, type DayEntry } from "./dayDoses"
import { slotKey, slotsForDay } from "./doseLog"
import type { StackCompound } from "./stack"
import type { DoseLog } from "./mockHomeData"

/**
 * THE TWO DIVERGENCES THIS FILE EXISTS FOR.
 *
 * A cold review put the Dashboard's ring and the desktop rail's ring side by
 * side on the same day and they printed different numbers: "1 of 2" against
 * "0/1, 1 dose left", 250px apart. Neither was a hard bug. The rail had a
 * SECOND implementation of "what is due today", and it disagreed with the first
 * in two places.
 *
 * Both are pinned below, and both are pinned as EQUIVALENCE: the assertions say
 * what the shared rule answers, and the rail and the Dashboard now both call
 * it, so there is nothing left to drift. If someone reintroduces a filter at
 * either call site, these fail.
 */

const log = (amount = "100"): DoseLog => ({
  amount,
  time24: "08:00",
  siteId: null,
})

const compound = (over: Partial<StackCompound> = {}): StackCompound => ({
  id: "c1",
  name: "Test E",
  category: "anabolic",
  method: "im",
  dose: 100,
  unit: "mg",
  schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-01-01" },
  rotationSites: [],
  rotationIndex: 0,
  ...over,
})

const DAY = "2026-09-11"
const DATE = new Date(2026, 8, 11)

describe("belongsInDayLog — an archived compound keeps the doses it was taken for", () => {
  /**
   * Deleting a compound stops FUTURE doses and keeps every logged one (Spec 02;
   * Invariant 8, archive never hard-delete). So the archived test has to come
   * after the log test, not before it.
   *
   * The rail had them the other way round, which meant: log today's dose, then
   * tidy that compound out of your protocol, and the dose you had taken
   * vanished from the rail's count while the Dashboard still showed it.
   */
  it("keeps an archived compound that carries a log on the day", () => {
    const c = compound({ archived: true })
    const rows = { [slotKey(c.id, 0)]: log() }
    expect(belongsInDayLog(c, rows, DATE)).toBe(true)
  })

  it("drops an archived compound with no log on the day", () => {
    expect(belongsInDayLog(compound({ archived: true }), {}, DATE)).toBe(false)
  })

  it("keeps an active compound that is due", () => {
    expect(belongsInDayLog(compound(), {}, DATE)).toBe(true)
  })

  it("drops an active compound that is not due on the day", () => {
    const weekly = compound({
      schedule: {
        cadence: { type: "everyNDays", n: 30 },
        timeOfDay: "08:00",
        startDate: "2026-09-01",
      },
    })
    expect(belongsInDayLog(weekly, {}, DATE)).toBe(false)
  })

  it("treats an undefined day of logs as no logs", () => {
    expect(belongsInDayLog(compound({ archived: true }), undefined, DATE)).toBe(false)
  })
})

describe("ringCounts — a historic slot still counts", () => {
  /**
   * `slotsForDay` appends slots that are no longer scheduled but carry a log: a
   * dose genuinely taken under an older, longer schedule. Cutting a compound
   * from three doses a day to two does not un-take this morning's third one.
   *
   * The rail filtered those out, so a day that was complete read as incomplete
   * and the ring never reached 100%.
   */
  it("counts a logged slot that the current schedule no longer has", () => {
    const c = compound({
      schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-01-01" },
    })
    // Two logs, but the schedule now only has one slot: slot 1 is historic.
    const rows = {
      [slotKey(c.id, 0)]: log(),
      [slotKey(c.id, 1)]: log("50"),
    }
    const slots = slotsForDay(c, DAY, rows)
    expect(slots.some((s) => s.historic)).toBe(true)

    const counts = ringCounts([
      { id: c.id, category: c.category, paused: false, slots },
    ])
    expect(counts.due).toBe(2)
    expect(counts.logged).toBe(2)
  })

  it("counts doses, not compounds, for a multi-slot day", () => {
    const twice = compound({
      schedule: {
        cadence: { type: "daily" },
        timeOfDay: "08:00",
        laterTimes: ["20:00"],
        startDate: "2026-01-01",
      },
    })
    const rows = { [slotKey(twice.id, 0)]: log() }
    const counts = ringCounts([
      {
        id: twice.id,
        category: twice.category,
        paused: false,
        slots: slotsForDay(twice, DAY, rows),
      },
    ])
    // One of two, never one of one — the evening dose is still outstanding.
    expect(counts).toMatchObject({ due: 2, logged: 1 })
  })

  it("counts nothing for a paused compound", () => {
    const entries: DayEntry[] = [
      {
        id: "c1",
        category: "anabolic",
        paused: true,
        slots: slotsForDay(compound(), DAY, {}),
      },
    ]
    // A paused dose cannot be logged, so counting it would park the day below
    // 100% forever.
    expect(ringCounts(entries)).toMatchObject({ due: 0, logged: 0, dots: [] })
  })

  it("gives every countable slot its own dot", () => {
    const twice = compound({
      schedule: {
        cadence: { type: "daily" },
        timeOfDay: "08:00",
        laterTimes: ["20:00"],
        startDate: "2026-01-01",
      },
    })
    const { dots } = ringCounts([
      {
        id: twice.id,
        category: twice.category,
        paused: false,
        slots: slotsForDay(twice, DAY, { [slotKey(twice.id, 0)]: log() }),
      },
    ])
    expect(dots.map((d) => d.id)).toEqual(["c1#0", "c1#1"])
    expect(dots.map((d) => d.logged)).toEqual([true, false])
  })
})

describe("the whole day, end to end", () => {
  /**
   * The exact scenario from the cold review: one compound taken and then
   * archived, one still due. Before the extraction the rail answered 0 of 1 and
   * the Dashboard answered 1 of 2.
   */
  it("agrees on a day holding an archived-but-logged dose and a due one", () => {
    const taken = compound({ id: "taken", archived: true })
    const due = compound({ id: "due" })
    const rows = { [slotKey("taken", 0)]: log() }
    const stack = [taken, due]

    const entries = stack
      .filter((c) => belongsInDayLog(c, rows, DATE))
      .map((c) => ({
        id: c.id,
        category: c.category,
        paused: false,
        slots: slotsForDay(c, DAY, rows),
      }))

    expect(entries.map((e) => e.id)).toEqual(["taken", "due"])
    expect(ringCounts(entries)).toMatchObject({ due: 2, logged: 1 })
  })
})
