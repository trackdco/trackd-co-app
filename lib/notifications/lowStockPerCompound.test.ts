/**
 * B2 (cold review, 26 Sep 2026): the low-stock push judged each CONTAINER as
 * if it were the only one. Adding stock stopped archiving the used-up
 * container, and two containers can be open at once, so one compound gave
 * several verdicts: "BPC-157 is running low. About 0 doses left." every day
 * while a full vial sat beside the empty one, and "2 compounds are running
 * low: BPC-157, BPC-157".
 *
 * The push now judges per COMPOUND: doses summed over started containers,
 * days walked from the sum over the compound's schedule (the screen's Runs
 * dry), each compound named once.
 */
import { describe, expect, it } from "vitest"

import type { StackCompound } from "@/lib/home/stack"
import { RUNS_DRY_HORIZON_DAYS, runsDryInDays } from "@/lib/protocol/runsDry"
import {
  INVENTORY_REMINDER_SELECT,
  STOCK_HORIZON_DAYS,
  lowStock,
  lowStockMessage,
  runsDryDays,
  stockPerCompound,
  type LowStockItem,
  type ReminderCompound,
  type StockSchedule,
} from "@/lib/notifications/reminders"

const item = (over: Partial<LowStockItem> = {}): LowStockItem => ({
  name: "BPC-157",
  paused: false,
  stopped: false,
  estEmptyDate: null,
  daysToEmpty: null,
  dosesRemaining: null,
  ...over,
})

/** A container as the runner now builds it: its compound id and whether it
 *  has been started. */
const box = (compoundId: string, over: Partial<LowStockItem> = {}): LowStockItem =>
  item({ compoundId, started: true, ...over })

const reminder = (over: Partial<ReminderCompound> = {}): ReminderCompound => ({
  id: "bpc",
  name: "BPC-157",
  schedule_type: "every_day",
  days_of_week: null,
  interval_days: null,
  first_dose_on: "2026-09-01",
  end_date: null,
  doseTimes: ["08:00"],
  ...over,
})

const schedules = (...entries: Array<[ReminderCompound, number]>): Map<string, StockSchedule> =>
  new Map(entries.map(([compound, loggedToday]) => [compound.id, { compound, loggedToday }]))

// 2026-09-23 is a Wednesday.
const WED = "2026-09-23"

/* ------------------------------------------ the reviewer's proof, ported */

describe("low-stock push with several containers per compound (cold review B2)", () => {
  it("does not call a compound low when an empty old vial sits beside a full new one", () => {
    // Vial A used up and never discarded (days_to_empty 0 in v_inventory_math);
    // vial B added from Protocol "Add stock" (no replace), 40 days of doses.
    const stock = [item({ daysToEmpty: 0, dosesRemaining: 0 }), item({ daysToEmpty: 40, dosesRemaining: 40 })]
    const low = lowStock(stock, "2026-10-01", 7)
    expect(lowStockMessage(low)).toBeNull() // the app's own Runs dry says 40 days
  })

  it("names a compound once when two of its open containers are each short", () => {
    const stock = [item({ daysToEmpty: 3, dosesRemaining: 3 }), item({ daysToEmpty: 5, dosesRemaining: 5 })]
    // Together they hold 8 days, so at 7 there is nothing to say at all (the
    // proof's `msg?.body` is undefined now, not a doubled name)...
    expect(lowStockMessage(lowStock(stock, "2026-10-01", 7))).toBeNull()
    // ...and inside a wider window the compound is named once, with its sum.
    expect(lowStockMessage(lowStock(stock, "2026-10-01", 10))?.body).toBe(
      "BPC-157 is running low. About 8 doses left.",
    )
  })

  it("the same two cases, as the runner builds them (by compound id)", () => {
    const full = [box("bpc", { daysToEmpty: 0, dosesRemaining: 0 }), box("bpc", { daysToEmpty: 40, dosesRemaining: 40 })]
    expect(lowStock(full, WED, 7)).toEqual([])
    expect(lowStock(full, WED, 7, schedules([reminder(), 0]))).toEqual([])

    const short = [box("bpc", { daysToEmpty: 3, dosesRemaining: 3 }), box("bpc", { daysToEmpty: 3, dosesRemaining: 3 })]
    const low = lowStock(short, WED, 7, schedules([reminder(), 0]))
    expect(low).toHaveLength(1)
    expect(lowStockMessage(low)?.body).toBe("BPC-157 is running low. About 6 doses left.")
  })
})

/* --------------------------------------------------- one item per compound */

describe("stockPerCompound", () => {
  it("sums the doses of every started container", () => {
    const [bpc] = stockPerCompound(
      [box("bpc", { dosesRemaining: 4, daysToEmpty: 4 }), box("bpc", { dosesRemaining: 9, daysToEmpty: 9 })],
      WED,
    )
    expect(bpc.dosesRemaining).toBe(13)
    expect(bpc.daysToEmpty).toBe(13)
  })

  it("counts a spare for nothing until it is started, as v_compound_stock does", () => {
    // Pre-026 the view still gives a spare oral its doses; the row's missing
    // start date is what keeps it out, exactly as `compoundsFromItems` does.
    const [bpc] = stockPerCompound(
      [box("bpc", { dosesRemaining: 2, daysToEmpty: 2 }), box("bpc", { started: false, dosesRemaining: 30, daysToEmpty: 30 })],
      WED,
    )
    expect(bpc.dosesRemaining).toBe(2)
    expect(bpc.daysToEmpty).toBe(2)
  })

  it("still reports an empty compound when all it holds besides is a spare", () => {
    // The screen reads "Today" in amber: nothing started has a dose left.
    const stock = [box("bpc", { dosesRemaining: 0, daysToEmpty: 0 }), box("bpc", { started: false })]
    const low = lowStock(stock, WED, 7, schedules([reminder(), 0]))
    expect(low).toHaveLength(1)
    expect(low[0].daysToEmpty).toBe(0)
    expect(low[0].dosesRemaining).toBe(0)
  })

  it("says nothing about a compound that holds only spares", () => {
    // No runway until one is started, as on the screen.
    const stock = [box("bpc", { started: false }), box("bpc", { started: false })]
    expect(lowStock(stock, WED, 7, schedules([reminder(), 0]))).toEqual([])
    expect(lowStock(stock, WED, 7)).toEqual([])
  })

  it("names each of two short compounds once", () => {
    const stock = [
      box("bpc", { dosesRemaining: 1, daysToEmpty: 1 }),
      box("tb", { name: "TB-500", dosesRemaining: 2, daysToEmpty: 2 }),
      box("bpc", { dosesRemaining: 1, daysToEmpty: 1 }),
      box("tb", { name: "TB-500", dosesRemaining: 0, daysToEmpty: 0 }),
    ]
    const msg = lowStockMessage(lowStock(stock, WED, 7))
    expect(msg?.body).toBe("2 compounds are running low: BPC-157, TB-500.")
  })

  it("keeps two compounds that share a name apart when their ids differ", () => {
    const stock = [box("a", { dosesRemaining: 1, daysToEmpty: 1 }), box("b", { dosesRemaining: 1, daysToEmpty: 1 })]
    expect(lowStock(stock, WED, 7)).toHaveLength(2)
  })

  it("silences the whole compound when it is paused or stopped", () => {
    const paused = [box("bpc", { dosesRemaining: 1, daysToEmpty: 1, paused: true }), box("bpc", { dosesRemaining: 1, daysToEmpty: 1 })]
    expect(lowStock(paused, WED, 7)).toEqual([])
    const stopped = [box("bpc", { dosesRemaining: 1, daysToEmpty: 1 }), box("bpc", { dosesRemaining: 1, daysToEmpty: 1, stopped: true })]
    expect(lowStock(stopped, WED, 7)).toEqual([])
  })

  it("keeps the old single-container figures when there is no schedule", () => {
    // One container is exactly what the view said, count first, date second.
    expect(stockPerCompound([box("bpc", { daysToEmpty: 8, estEmptyDate: "2026-09-30" })], WED)[0].daysToEmpty).toBe(8)
    expect(stockPerCompound([box("bpc", { estEmptyDate: "2026-09-26" })], WED)[0].daysToEmpty).toBe(3)
    expect(stockPerCompound([box("bpc")], WED)[0].daysToEmpty).toBeNull()
  })

  it("does not let an empty container's skewed date speak for a full compound", () => {
    // Pre-010 the date is differenced, and a used-up vial can read -1.
    const stock = [box("bpc", { dosesRemaining: 0, estEmptyDate: "2026-09-22" }), box("bpc", { dosesRemaining: 5, estEmptyDate: "2026-09-28" })]
    expect(stockPerCompound(stock, WED)[0].daysToEmpty).toBe(5)
  })
})

/* ------------------------------------------------ the walk, and the screen */

describe("runsDryDays walks the schedule the way the Protocol card does", () => {
  it("spends only the doses still to take today", () => {
    // 7 doses, today's already logged: Thu to Wed next week is covered, so the
    // screen says "In 8 days" and the push must not say it is low at 7.
    const low = lowStock([box("bpc", { dosesRemaining: 7, daysToEmpty: 7 })], WED, 7, schedules([reminder(), 1]))
    expect(low).toEqual([])
    // Not yet logged today: today spends one, and the eighth day is short.
    expect(lowStock([box("bpc", { dosesRemaining: 7, daysToEmpty: 7 })], WED, 7, schedules([reminder(), 0]))).toHaveLength(1)
  })

  it("Mon/Thu from a Wednesday runs out on a Monday, not on an average", () => {
    const monThu = reminder({ schedule_type: "specific_days", days_of_week: [1, 4] })
    // Thu 24 and Mon 28 held, Thu 1 Oct short: 8 days, where an average week
    // (2 a week, 2 held) says 7.
    expect(runsDryDays(monThu, 2, WED)).toBe(8)
    expect(lowStock([box("bpc", { dosesRemaining: 2, daysToEmpty: 7 })], WED, 7, schedules([monThu, 0]))).toEqual([])
  })

  it("never runs dry past the end of the run", () => {
    const ending = reminder({ end_date: "2026-09-25" })
    expect(runsDryDays(ending, 3, WED)).toBeNull()
    expect(runsDryDays(ending, 2, WED)).toBe(2)
  })

  it("holds nothing when nothing is known", () => {
    expect(runsDryDays(reminder(), null, WED)).toBeNull()
  })

  it("walks no further than the window it is asked about", () => {
    expect(runsDryDays(reminder(), 30, WED, 0, 7)).toBeNull()
    expect(runsDryDays(reminder(), 30, WED)).toBe(30)
  })

  it("uses the same horizon as the screen", () => {
    expect(STOCK_HORIZON_DAYS).toBe(RUNS_DRY_HORIZON_DAYS)
  })

  describe("agrees with runsDryInDays for every schedule shape", () => {
    const stack = (over: Partial<StackCompound> = {}): StackCompound => ({
      id: "bpc",
      name: "BPC-157",
      category: "peptide",
      method: "subq",
      dose: 250,
      unit: "mcg",
      schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-09-01" },
      rotationSites: [],
      rotationIndex: 0,
      ...over,
    })
    const cycle = {
      pattern: { type: "onOff" as const, onDays: 5, offDays: 2 },
      end: { type: "never" as const },
      colour: "steel" as const,
      anchor: "2026-09-21",
    }
    const pauses = [{ id: "p", startedOn: "2026-09-25", endsOn: "2026-09-28" }]
    const cases: Array<[string, StackCompound, ReminderCompound]> = [
      ["daily", stack(), reminder()],
      [
        "twice a day",
        stack({ schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", laterTimes: ["20:00"], startDate: "2026-09-01" } }),
        reminder({ doseTimes: ["08:00", "20:00"] }),
      ],
      [
        "Mon/Thu",
        stack({ schedule: { cadence: { type: "daysOfWeek", days: [1, 4] }, timeOfDay: "08:00", startDate: "2026-09-01" } }),
        reminder({ schedule_type: "specific_days", days_of_week: [1, 4] }),
      ],
      [
        "every third day",
        stack({ schedule: { cadence: { type: "everyNDays", n: 3 }, timeOfDay: "08:00", startDate: "2026-09-02" } }),
        reminder({ schedule_type: "every_n_days", interval_days: 3, first_dose_on: "2026-09-02" }),
      ],
      [
        "five on, two off",
        stack({ cycle }),
        reminder({ cycle }),
      ],
      [
        "a pause ahead, then every other day",
        stack({ pauses, schedule: { cadence: { type: "everyNDays", n: 2 }, timeOfDay: "08:00", startDate: "2026-09-01" } }),
        reminder({ pauses, schedule_type: "every_n_days", interval_days: 2 }),
      ],
    ]
    for (const [label, client, server] of cases) {
      it(label, () => {
        for (let doses = 0; doses <= 25; doses++) {
          for (const logged of [0, 1, 2]) {
            expect(
              runsDryDays(server, doses, WED, logged),
              `${label}: ${doses} held, ${logged} logged today`,
            ).toBe(runsDryInDays(client, doses, WED, logged))
          }
        }
      })
    }
  })
})

/* ------------------------------------------------------------ the read */

describe("INVENTORY_REMINDER_SELECT", () => {
  it("names the foreign key, so a second key between the tables cannot break it", () => {
    expect(INVENTORY_REMINDER_SELECT).toContain(
      "protocol_compounds!inventory_items_protocol_compound_id_fkey!inner(",
    )
  })

  it("reads what the per-compound judgement needs", () => {
    // The compound id groups containers, the start date keeps spares out, and
    // a custom compound's own name keeps two of them from both reading
    // "Something".
    for (const col of ["protocol_compound_id", "acquired_on", "custom_name"]) {
      expect(INVENTORY_REMINDER_SELECT, col).toContain(col)
    }
  })
})
