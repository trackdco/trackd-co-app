/**
 * Ended cycles (build-brief-final §3.10) — the derivation from the schedule
 * trail, and the thin actions over `setCompoundCycle` in
 * `lib/home/endedCycleActions.ts` (tested here so one targeted run covers both).
 *
 * The actions need a `window`: a minimal in-memory `localStorage`, the same
 * stand-in `stacksStorage.test.ts` uses. The Postgres mirrors are server actions
 * irrelevant to what is under test, so they are stubbed rather than reached.
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
vi.mock("@/lib/home/syncActions", () => ({
  pushStackCompound: vi.fn(async () => ({ ok: true })),
}))
vi.mock("@/lib/home/syncStatus", () => ({
  trackCriticalSync: vi.fn(async () => {}),
  trackSync: vi.fn(async () => {}),
}))
vi.mock("@/lib/home/stackSync", () => ({
  pushStacks: vi.fn(async () => ({ ok: true })),
}))

import {
  endCycle,
  hiddenEndedCycles,
  hideEndedCycle,
  restartCycle,
  unhideEndedCycle,
} from "@/lib/home/endedCycleActions"
import {
  isCycleEnded,
  isRunning,
  loadStack,
  resolveScheduleOn,
  saveStack,
  setCompoundCycle,
  type ScheduleVersion,
  type StackCompound,
} from "@/lib/home/stack"
import { cyclePatternText } from "./cyclePage"
import { isOnCycle, type CycleRule } from "./cycleRule"
import { endedCycles, restartRule, type EndedCycle } from "./endedCycles"

/* ------------------------------------------------------------------ fixtures */

const rule = (over: Partial<CycleRule> = {}): CycleRule => ({
  pattern: { type: "onOff", onDays: 5, offDays: 2 },
  end: { type: "never" },
  colour: "steel",
  anchor: "2026-02-01",
  ...over,
})

function version(effectiveFrom: string, over: Partial<ScheduleVersion> = {}): ScheduleVersion {
  return {
    effectiveFrom,
    cadence: { type: "daily" },
    timeOfDay: "09:00",
    dose: 250,
    unit: "mcg",
    ...over,
  }
}

function compound(over: Partial<StackCompound> = {}): StackCompound {
  return {
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
  }
}

/** Ended by the user on 10 Mar after running from 1 Feb. */
const endedByUser = () =>
  compound({
    scheduleHistory: [
      version("2026-01-01"),
      version("2026-02-01", { cycle: rule() }),
      version("2026-03-10"),
    ],
  })

/* ---------------------------------------------------------------- derivation */

describe("which cycles are ended", () => {
  it("lists a cycle the user ended, on the day they ended it", () => {
    expect(endedCycles([endedByUser()], "2026-04-01")).toEqual([
      {
        key: "c1|2026-02-01",
        compoundId: "c1",
        compoundName: "BPC-157",
        category: "peptide",
        rule: rule(),
        pattern: "5 days on, 2 off",
        endedOn: "2026-03-10",
        reason: "ended",
      },
    ])
  })

  it("does not list a cycle that is still running", () => {
    const c = compound({ scheduleHistory: [version("2026-01-01"), version("2026-02-01", { cycle: rule() })] })
    expect(endedCycles([c], "2026-04-01")).toEqual([])
  })

  it("lists a cycle that reached its end date, dated its last day", () => {
    const c = compound({
      scheduleHistory: [version("2026-02-01", { cycle: rule({ end: { type: "onDate", date: "2026-03-31" } }) })],
    })
    // Its last day is still a running day.
    expect(endedCycles([c], "2026-03-31")).toEqual([])
    const [row] = endedCycles([c], "2026-04-01")
    expect(row).toMatchObject({ reason: "finished", endedOn: "2026-03-31", key: "c1|2026-02-01" })
  })

  it("lists a cycle that ran its rounds, agreeing with the app's own gate", () => {
    // 5 on / 2 off from Mon 2 Feb, three rounds = 21 days: last day 22 Feb.
    const c = compound({
      scheduleHistory: [
        version("2026-02-02", { cycle: rule({ anchor: "2026-02-02", end: { type: "afterRounds", rounds: 3 } }) }),
      ],
    })
    expect(endedCycles([c], "2026-02-22")).toEqual([])
    expect(endedCycles([c], "2026-03-15")[0]).toMatchObject({ reason: "finished", endedOn: "2026-02-22" })
    expect(isCycleEnded(c, "2026-02-22")).toBe(false)
    expect(isCycleEnded(c, "2026-02-23")).toBe(true)
  })

  it("holds the rounds clock through a pause, as the gate does", () => {
    const c = compound({
      scheduleHistory: [
        version("2026-02-02", { cycle: rule({ anchor: "2026-02-02", end: { type: "afterRounds", rounds: 3 } }) }),
      ],
      pauses: [{ id: "p1", startedOn: "2026-02-05", endsOn: "2026-02-09" }],
    })
    const [row] = endedCycles([c], "2026-03-15")
    expect(row.endedOn).toBe("2026-02-27")
    expect(isCycleEnded(c, row.endedOn)).toBe(false)
    expect(isCycleEnded(c, "2026-02-28")).toBe(true)
  })

  it("reads a compound never edited from its current cycle and start date", () => {
    // The add form writes `cycle` straight onto the record, with no trail.
    const c = compound({
      schedule: { cadence: { type: "daily" }, timeOfDay: "09:00", startDate: "2026-02-01" },
      cycle: rule({ end: { type: "onDate", date: "2026-02-28" } }),
    })
    expect(endedCycles([c], "2026-03-02")[0]).toMatchObject({
      key: "c1|2026-02-01",
      reason: "finished",
      endedOn: "2026-02-28",
    })
  })

  it("treats an edit of a running cycle as the same cycle, ending on its last rule", () => {
    const edited = rule({ pattern: { type: "onOff", onDays: 7, offDays: 7 } })
    const c = compound({
      scheduleHistory: [
        version("2026-02-01", { cycle: rule() }),
        version("2026-02-15", { cycle: edited }),
        version("2026-03-01"),
      ],
    })
    const rows = endedCycles([c], "2026-04-01")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ key: "c1|2026-02-01", rule: edited, pattern: "7 days on, 7 off" })
  })

  it("a dose edit after the End does not move the day it ended", () => {
    const c = endedByUser()
    c.scheduleHistory!.push(version("2026-03-20", { dose: 500 }))
    expect(endedCycles([c], "2026-04-01")[0].endedOn).toBe("2026-03-10")
  })

  it("says FINISHED, not ended, when an End came after the cycle had run out", () => {
    const c = compound({
      scheduleHistory: [
        version("2026-02-01", { cycle: rule({ end: { type: "onDate", date: "2026-02-28" } }) }),
        version("2026-03-01"),
      ],
    })
    expect(endedCycles([c], "2026-04-01")[0]).toMatchObject({ reason: "finished", endedOn: "2026-02-28" })
  })

  it("does not end a run whose replacement is still in the future", () => {
    const c = compound({ scheduleHistory: [version("2026-02-01", { cycle: rule() }), version("2026-05-01")] })
    expect(endedCycles([c], "2026-04-01")).toEqual([])
  })

  it("leaves out a deleted compound", () => {
    expect(endedCycles([{ ...endedByUser(), archived: true }], "2026-04-01")).toEqual([])
  })

  it("lists a cycle ended by deleting the compound once it is added back", () => {
    const c = compound({
      scheduleHistory: [
        version("2026-02-01", { cycle: rule() }),
        version("2026-03-01", { stopped: true }),
        version("2026-03-20"),
      ],
    })
    expect(endedCycles([c], "2026-04-01")[0]).toMatchObject({ reason: "ended", endedOn: "2026-03-01" })
  })

  it("filters out what was deleted for good", () => {
    expect(endedCycles([endedByUser()], "2026-04-01", new Set(["c1|2026-02-01"]))).toEqual([])
    expect(endedCycles([endedByUser()], "2026-04-01", new Set(["c1|2026-01-01"]))).toHaveLength(1)
  })

  it("sorts newest first", () => {
    const later = compound({
      id: "c2",
      name: "TB-500",
      scheduleHistory: [version("2026-02-01", { cycle: rule() }), version("2026-03-25")],
    })
    expect(endedCycles([endedByUser(), later], "2026-04-01").map((r) => r.compoundId)).toEqual(["c2", "c1"])
  })

  describe("after a restart", () => {
    const restarted = () =>
      compound({
        scheduleHistory: [
          version("2026-01-01"),
          version("2026-02-01", { cycle: rule() }),
          version("2026-03-10"),
          version("2026-04-01", { cycle: rule({ anchor: "2026-04-01" }) }),
        ],
      })

    it("the compound is on its cycle again, so it has no Ended row", () => {
      expect(endedCycles([restarted()], "2026-04-05")).toEqual([])
    })

    it("ending it again lists the NEW run, once", () => {
      const c = restarted()
      c.scheduleHistory!.push(version("2026-04-20"))
      const rows = endedCycles([c], "2026-05-01")
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ key: "c1|2026-04-01", endedOn: "2026-04-20", reason: "ended" })
    })

    it("a new cycle after one FINISHED is a new run, not the old one carrying on", () => {
      // So hiding the finished one cannot hide the next.
      const c = compound({
        scheduleHistory: [
          version("2026-02-02", { cycle: rule({ anchor: "2026-02-02", end: { type: "afterRounds", rounds: 1 } }) }),
          version("2026-03-01", { cycle: rule({ anchor: "2026-03-01" }) }),
          version("2026-03-20"),
        ],
      })
      expect(endedCycles([c], "2026-04-01")[0]).toMatchObject({ key: "c1|2026-03-01", endedOn: "2026-03-20" })
    })
  })
})

describe("the row's pattern", () => {
  it("reads in words", () => {
    expect(cyclePatternText({ type: "onOff", onDays: 5, offDays: 2 })).toBe("5 days on, 2 off")
    expect(cyclePatternText({ type: "onOff", onDays: 1, offDays: 1 })).toBe("1 day on, 1 off")
    expect(cyclePatternText({ type: "continuous" })).toBe("Continuous")
  })
})

describe("the rule Restart applies", () => {
  const row = (r: CycleRule, over: Partial<EndedCycle> = {}): EndedCycle => ({
    key: "c1|2026-02-01",
    compoundId: "c1",
    compoundName: "BPC-157",
    category: "peptide",
    rule: r,
    pattern: cyclePatternText(r.pattern),
    endedOn: "2026-03-10",
    reason: "ended",
    ...over,
  })

  it("starts a fresh run today", () => {
    expect(restartRule(row(rule()), "2026-04-01")).toEqual(rule({ anchor: "2026-04-01" }))
  })

  it("restarts the rounds from today", () => {
    const r = rule({ end: { type: "afterRounds", rounds: 3 } })
    expect(restartRule(row(r, { reason: "finished" }), "2026-04-01")).toEqual({ ...r, anchor: "2026-04-01" })
  })

  it("moves an end date with the start, keeping the run's length", () => {
    // 30 Sep to 30 Nov is 61 days; restarted 5 Dec it ends 4 Feb.
    const r = rule({ anchor: "2026-09-30", end: { type: "onDate", date: "2026-11-30" } })
    expect(restartRule(row(r, { reason: "finished", endedOn: "2026-11-30" }), "2026-12-05")).toEqual({
      ...r,
      anchor: "2026-12-05",
      end: { type: "onDate", date: "2027-02-04" },
    })
  })

  it("puts back the exact rule when it was ended today", () => {
    expect(restartRule(row(rule(), { endedOn: "2026-04-01" }), "2026-04-01")).toEqual(rule())
  })

  it("keeps a start that had not come yet", () => {
    const r = rule({ anchor: "2026-05-01" })
    expect(restartRule(row(r), "2026-04-01")).toEqual(r)
  })
})

/* ------------------------------------------------------------------- actions */

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
afterEach(() => {
  vi.unstubAllGlobals()
})

/** The hidden list is held per tab, so each test gets a user of its own. */
let n = 0
const freshUser = () => `u${++n}`

const running = () =>
  compound({ scheduleHistory: [version("2026-01-01"), version("2026-02-01", { cycle: rule() })], cycle: rule() })

const load = (user: string) => loadStack(user)!.find((c) => c.id === "c1")!
/** Was the compound on an ON day of its cycle, by the rule in force that day? */
const onCycle = (c: StackCompound, day: string) => isOnCycle(resolveScheduleOn(c, day).cycle, day)
const onDay = (user: string, day: string) => (loadStack(user)!.flatMap((c) => c.scheduleHistory ?? [])).filter((v) => v.effectiveFrom === day)

describe("End", () => {
  it("is today's Remove: the compound keeps running, and the cycle lists as ended today", () => {
    const user = freshUser()
    saveStack(user, [running()])
    expect(endCycle(user, "c1", "2026-04-01")).toBe(true)
    const c = load(user)
    expect(c.cycle).toBeUndefined()
    expect(resolveScheduleOn(c, "2026-04-01").cycle).toBeUndefined()
    // The run before today keeps the cycle it was run under.
    expect(resolveScheduleOn(c, "2026-03-31").cycle).toEqual(rule())
    expect(isRunning(c, "2026-04-01")).toBe(true)
    expect(endedCycles([c], "2026-04-01")[0]).toMatchObject({ key: "c1|2026-02-01", endedOn: "2026-04-01" })
  })
})

describe("Restart and its Undo", () => {
  it("re-applies an ended cycle from today, and Undo (End, same day) leaves one version and the same row", () => {
    const user = freshUser()
    saveStack(user, [running()])
    endCycle(user, "c1", "2026-03-10")
    const [before] = endedCycles([load(user)], "2026-04-01")

    expect(restartCycle(user, before, "2026-04-01")).toEqual({ ok: true })
    let c = load(user)
    expect(c.cycle).toEqual(rule({ anchor: "2026-04-01" }))
    expect(endedCycles([c], "2026-04-01")).toEqual([])
    expect(onDay(user, "2026-04-01")).toHaveLength(1)

    expect(endCycle(user, "c1", "2026-04-01")).toBe(true)
    c = load(user)
    expect(onDay(user, "2026-04-01")).toHaveLength(1)
    expect(onDay(user, "2026-04-01")[0].cycle).toBeUndefined()
    expect(c.cycle).toBeUndefined()
    expect(endedCycles([c], "2026-04-01")).toEqual([before])
  })

  it("restarting a cycle ended TODAY carries on where it was", () => {
    const user = freshUser()
    saveStack(user, [running()])
    const phaseBefore = ["2026-04-01", "2026-04-04", "2026-04-06"].map((d) => onCycle(load(user), d))
    endCycle(user, "c1", "2026-04-01")
    const [row] = endedCycles([load(user)], "2026-04-01")
    expect(restartCycle(user, row, "2026-04-01")).toEqual({ ok: true })
    const c = load(user)
    expect(c.cycle).toEqual(rule())
    expect(onDay(user, "2026-04-01")).toHaveLength(1)
    expect(["2026-04-01", "2026-04-04", "2026-04-06"].map((d) => onCycle(c, d))).toEqual(phaseBefore)
  })

  it("restarts a FINISHED cycle as a fresh run, and Undo returns the same finished row", () => {
    const user = freshUser()
    const done = rule({ anchor: "2026-02-02", end: { type: "afterRounds", rounds: 1 } })
    saveStack(user, [compound({ scheduleHistory: [version("2026-02-02", { cycle: done })], cycle: done })])
    const [before] = endedCycles([load(user)], "2026-03-01")
    expect(before).toMatchObject({ reason: "finished", endedOn: "2026-02-08" })
    expect(isRunning(load(user), "2026-03-01")).toBe(false)

    expect(restartCycle(user, before, "2026-03-01")).toEqual({ ok: true })
    expect(load(user).cycle).toEqual({ ...done, anchor: "2026-03-01" })
    expect(isRunning(load(user), "2026-03-01")).toBe(true)
    expect(endedCycles([load(user)], "2026-03-01")).toEqual([])

    endCycle(user, "c1", "2026-03-01")
    expect(endedCycles([load(user)], "2026-03-01")).toEqual([before])
  })

  it("refuses a stale row, writing nothing", () => {
    const user = freshUser()
    saveStack(user, [running()])
    endCycle(user, "c1", "2026-03-10")
    const [row] = endedCycles([load(user)], "2026-04-01")
    // Meanwhile a new cycle was put on it from the Cycles page.
    setCompoundCycle(user, "c1", rule({ anchor: "2026-03-20" }), "2026-03-20")
    const stored = window.localStorage.getItem(`trackd.stack.v2.${user}`)
    expect(restartCycle(user, row, "2026-04-01")).toEqual({ ok: false, reason: "gone" })
    expect(window.localStorage.getItem(`trackd.stack.v2.${user}`)).toBe(stored)
  })

  it("refuses a cycle deleted for good", () => {
    const user = freshUser()
    saveStack(user, [running()])
    endCycle(user, "c1", "2026-03-10")
    const [row] = endedCycles([load(user)], "2026-04-01")
    hideEndedCycle(user, row.key)
    expect(restartCycle(user, row, "2026-04-01")).toEqual({ ok: false, reason: "gone" })
  })
})

describe("Delete for good (device-local)", () => {
  it("hides the row, Undo brings it back, and the trail is untouched", () => {
    const user = freshUser()
    saveStack(user, [running()])
    endCycle(user, "c1", "2026-03-10")
    const trail = JSON.stringify(load(user).scheduleHistory)
    const [row] = endedCycles([load(user)], "2026-04-01")

    expect(hideEndedCycle(user, row.key)).toBe(true)
    expect(endedCycles([load(user)], "2026-04-01", hiddenEndedCycles(user))).toEqual([])
    expect(JSON.parse(window.localStorage.getItem(`trackd.cycles.endedHidden.v1.${user}`)!)).toEqual([row.key])
    expect(JSON.stringify(load(user).scheduleHistory)).toBe(trail)

    expect(unhideEndedCycle(user, row.key)).toBe(true)
    expect(endedCycles([load(user)], "2026-04-01", hiddenEndedCycles(user))).toEqual([row])
  })

  it("keeps the same snapshot until something changes", () => {
    const user = freshUser()
    const a = hiddenEndedCycles(user)
    expect(hiddenEndedCycles(user)).toBe(a)
    hideEndedCycle(user, "c1|2026-02-01")
    const b = hiddenEndedCycles(user)
    expect(b).not.toBe(a)
    expect(hiddenEndedCycles(user)).toBe(b)
  })

  it("still works for the session when storage throws", () => {
    const user = freshUser()
    const broken = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    }
    vi.stubGlobal("window", { localStorage: broken, dispatchEvent: () => true })
    expect(hiddenEndedCycles(user).size).toBe(0)
    expect(hideEndedCycle(user, "c1|2026-02-01")).toBe(false)
    expect(hiddenEndedCycles(user).has("c1|2026-02-01")).toBe(true)
    expect(unhideEndedCycle(user, "c1|2026-02-01")).toBe(false)
    expect(hiddenEndedCycles(user).size).toBe(0)
  })

  it("ignores a corrupt stored list", () => {
    const user = freshUser()
    window.localStorage.setItem(`trackd.cycles.endedHidden.v1.${user}`, "{not json")
    expect(hiddenEndedCycles(user).size).toBe(0)
  })
})
