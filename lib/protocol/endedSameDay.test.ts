/**
 * A cycle begun and ended on the SAME day reaches Ended (cold review B14 / F3).
 *
 * One version per day: End replaces the version written earlier that day, so a
 * cycle whose only version was today's left no run behind, Ended stayed empty,
 * and the End dialog's "you can restart it from Ended" was false. End now keeps
 * the rule on its own version (`endedCycle`) in exactly that case.
 *
 * Ported from the reviewer's `tests/mine/ended-same-day.test.ts`. Its first
 * assertion ("some version still carries `cycle`") is not ported: a version
 * carrying `cycle` puts the compound back on the cycle for dosing, which is the
 * opposite of End. The behaviour it was after, a row under Ended, is.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/home/protocolSync", () => ({
  archiveProtocolCompound: vi.fn(async () => ({ ok: true })),
  pushCompoundPause: vi.fn(async () => ({ ok: true })),
  pushPauseDelete: vi.fn(async () => ({ ok: true })),
  pushPauseEnd: vi.fn(async () => ({ ok: true })),
  pushPauseGroupEnd: vi.fn(async () => ({ ok: true })),
  pushProtocolCompound: vi.fn(async () => ({ ok: true })),
  pushScheduleVersions: vi.fn(async () => ({ ok: true })),
}))
vi.mock("@/lib/home/syncActions", () => ({ pushStackCompound: vi.fn(async () => ({ ok: true })) }))
vi.mock("@/lib/home/syncStatus", () => ({
  trackCriticalSync: vi.fn(async () => {}),
  trackSync: vi.fn(async () => {}),
}))
vi.mock("@/lib/home/stackSync", () => ({ pushStacks: vi.fn(async () => ({ ok: true })) }))

import { endCycle, restartCycle } from "@/lib/home/endedCycleActions"
import {
  isRunning,
  loadStack,
  recordScheduleVersion,
  resolveScheduleOn,
  saveStack,
  scheduleVersionToRow,
  setCompoundCycle,
  upsertStack,
  type StackCompound,
} from "@/lib/home/stack"
import type { CycleRule } from "./cycleRule"
import { endedCycles } from "./endedCycles"

function fakeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}
beforeEach(() => {
  vi.stubGlobal("window", { localStorage: fakeStorage(), dispatchEvent: () => true })
  vi.stubGlobal("CustomEvent", class { constructor(public type: string) {} })
})
afterEach(() => vi.unstubAllGlobals())

const TODAY = "2026-04-01"
const rule: CycleRule = {
  pattern: { type: "onOff", onDays: 5, offDays: 2 },
  end: { type: "never" },
  colour: "steel",
  anchor: TODAY,
}
const base = (over: Partial<StackCompound> = {}): StackCompound => ({
  id: "c1",
  name: "BPC-157",
  category: "peptide",
  method: "subq",
  dose: 250,
  unit: "mcg",
  schedule: { cadence: { type: "daily" }, timeOfDay: "09:00", startDate: "2026-01-01" },
  rotationSites: [],
  rotationIndex: 0,
  ...over,
})

let n = 0
const freshUser = () => `same-day-${++n}`
const load = (u: string) => loadStack(u)!.find((c) => c.id === "c1")!
const today = (u: string) => (load(u).scheduleHistory ?? []).filter((v) => v.effectiveFrom === TODAY)

describe("End on the day the cycle began", () => {
  it("a new cycle on a running compound, ended the same day, lands in Ended", () => {
    const u = freshUser()
    saveStack(u, [base()])
    expect(setCompoundCycle(u, "c1", rule, TODAY)).toBe(true)
    expect(endCycle(u, "c1", TODAY)).toBe(true)

    const c = load(u)
    expect(endedCycles([c], TODAY)).toEqual([
      {
        key: `c1|${TODAY}`,
        compoundId: "c1",
        compoundName: "BPC-157",
        category: "peptide",
        rule,
        pattern: "5 days on, 2 off",
        endedOn: TODAY,
        reason: "ended",
      },
    ])
    // And it really ended: the compound carries on uncycled from today.
    expect(c.cycle).toBeUndefined()
    expect(resolveScheduleOn(c, TODAY).cycle).toBeUndefined()
    expect(isRunning(c, TODAY)).toBe(true)
    expect(today(u)).toHaveLength(1)
  })

  it("a compound ADDED today with a cycle, ended today, lands in Ended", () => {
    const u = freshUser()
    saveStack(u, [
      base({
        schedule: { cadence: { type: "daily" }, timeOfDay: "09:00", startDate: TODAY },
        cycle: rule,
      }),
    ])
    expect(endCycle(u, "c1", TODAY)).toBe(true)
    const rows = endedCycles([load(u)], TODAY)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ key: `c1|${TODAY}`, endedOn: TODAY, reason: "ended", rule })
    expect(resolveScheduleOn(load(u), TODAY).cycle).toBeUndefined()
  })

  it("Restart from that row puts the same cycle back, and its Undo returns the same row", () => {
    const u = freshUser()
    saveStack(u, [base()])
    setCompoundCycle(u, "c1", rule, TODAY)
    endCycle(u, "c1", TODAY)
    const [row] = endedCycles([load(u)], TODAY)

    expect(restartCycle(u, row, TODAY)).toEqual({ ok: true })
    expect(load(u).cycle).toEqual(rule)
    expect(resolveScheduleOn(load(u), TODAY).cycle).toEqual(rule)
    expect(endedCycles([load(u)], TODAY)).toEqual([])
    // One version today, carrying the cycle and nothing ended.
    expect(today(u)).toHaveLength(1)
    expect(today(u)[0].endedCycle).toBeUndefined()

    // The toast's Undo is End on the same day.
    expect(endCycle(u, "c1", TODAY)).toBe(true)
    expect(endedCycles([load(u)], TODAY)).toEqual([row])
  })

  it("keeps the row through a same-day edit that writes no cycle", () => {
    const u = freshUser()
    saveStack(u, [base()])
    setCompoundCycle(u, "c1", rule, TODAY)
    endCycle(u, "c1", TODAY)
    const [row] = endedCycles([load(u)], TODAY)

    // The edit form re-versions today with a new dose and no cycle.
    const prior = load(u)
    const history = recordScheduleVersion(
      prior,
      { cadence: { type: "daily" }, timeOfDay: "09:00", dose: 500, unit: "mcg" },
      TODAY
    )
    expect(upsertStack(u, { ...prior, dose: 500, scheduleHistory: history })).toBe(true)
    expect(endedCycles([load(u)], TODAY)).toEqual([row])
    expect(resolveScheduleOn(load(u), TODAY).dose).toBe(500)
  })

  it("drops the ended rule once a cycle is set on that day again", () => {
    const u = freshUser()
    saveStack(u, [base()])
    setCompoundCycle(u, "c1", rule, TODAY)
    endCycle(u, "c1", TODAY)
    const other: CycleRule = { ...rule, pattern: { type: "onOff", onDays: 7, offDays: 7 } }
    setCompoundCycle(u, "c1", other, TODAY)
    expect(today(u)[0]).toMatchObject({ cycle: other })
    expect(today(u)[0].endedCycle).toBeUndefined()
    expect(endedCycles([load(u)], TODAY)).toEqual([])
  })
})

describe("End writes the ended rule ONLY when the trail would lose the cycle", () => {
  it("ending a cycle that ran before today lists that run, with nothing extra kept", () => {
    const u = freshUser()
    const running: CycleRule = { ...rule, anchor: "2026-02-01" }
    saveStack(u, [base({ cycle: running, scheduleHistory: [
      { effectiveFrom: "2026-01-01", cadence: { type: "daily" }, timeOfDay: "09:00", dose: 250, unit: "mcg" },
      { effectiveFrom: "2026-02-01", cadence: { type: "daily" }, timeOfDay: "09:00", dose: 250, unit: "mcg", cycle: running },
    ] })])
    endCycle(u, "c1", TODAY)
    expect(today(u)[0].endedCycle).toBeUndefined()
    const rows = endedCycles([load(u)], TODAY)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ key: "c1|2026-02-01", endedOn: TODAY })
  })

  it("a different cycle begun today on a compound with an older ended run lists the new one", () => {
    const u = freshUser()
    const old: CycleRule = { ...rule, anchor: "2026-02-01" }
    saveStack(u, [base({ scheduleHistory: [
      { effectiveFrom: "2026-02-01", cadence: { type: "daily" }, timeOfDay: "09:00", dose: 250, unit: "mcg", cycle: old },
      { effectiveFrom: "2026-03-01", cadence: { type: "daily" }, timeOfDay: "09:00", dose: 250, unit: "mcg" },
    ] })])
    const fresh: CycleRule = { ...rule, pattern: { type: "onOff", onDays: 3, offDays: 4 } }
    setCompoundCycle(u, "c1", fresh, TODAY)
    endCycle(u, "c1", TODAY)
    const rows = endedCycles([load(u)], TODAY)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ key: `c1|${TODAY}`, rule: fresh, endedOn: TODAY })
  })
})

describe("the ended rule is device-first", () => {
  it("survives the device store's own round trip", () => {
    const u = freshUser()
    saveStack(u, [base()])
    setCompoundCycle(u, "c1", rule, TODAY)
    endCycle(u, "c1", TODAY)
    // `load` goes through `loadStack`'s normaliser.
    expect(today(u)[0].endedCycle).toEqual(rule)
  })

  it("is never sent as a column Postgres does not have", () => {
    const u = freshUser()
    saveStack(u, [base()])
    setCompoundCycle(u, "c1", rule, TODAY)
    endCycle(u, "c1", TODAY)
    const row = scheduleVersionToRow(today(u)[0])
    expect(Object.keys(row).some((k) => /ended/i.test(k))).toBe(false)
    expect(row.cycle_anchor).toBeNull()
  })
})
