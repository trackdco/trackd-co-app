import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  addLeaving,
  dropLeaving,
  flightDelta,
  restartOutcome,
  withLeaving,
  type Leaving,
} from "@/lib/protocol/cycleExits"
import {
  cyclesHintSeen,
  freshPauses,
  markCyclesHintSeen,
  pausedSeen,
  rememberPausedSeen,
  resetCyclesMemoryForTests,
  sameSeen,
  shouldMarkHintSeen,
} from "@/lib/protocol/cyclesHint"

type Row = { key: string }
const key = (r: Row) => r.key
const rows = (...keys: string[]): Row[] => keys.map((k) => ({ key: k }))
const drawn = (list: { item: Row; leaving: boolean }[]) => list.map((r) => (r.leaving ? `(${r.item.key})` : r.item.key))

describe("B34: a leaving row is drawn where it was until its leave ends", () => {
  it("keeps a restarted row in its place after the write has taken it out of the list", () => {
    const leaving: Leaving<Row>[] = [{ item: { key: "b" }, at: 1 }]
    expect(drawn(withLeaving(rows("a", "c"), leaving, key))).toEqual(["a", "(b)", "c"])
  })

  it("puts two rows that left together back where both were", () => {
    const leaving: Leaving<Row>[] = [
      { item: { key: "d" }, at: 3 },
      { item: { key: "b" }, at: 1 },
    ]
    expect(drawn(withLeaving(rows("a", "c", "e"), leaving, key))).toEqual(["a", "(b)", "c", "(d)", "e"])
  })

  it("an Undo inside the leave draws the row once, as current", () => {
    const leaving: Leaving<Row>[] = [{ item: { key: "b" }, at: 1 }]
    expect(drawn(withLeaving(rows("a", "b", "c"), leaving, key))).toEqual(["a", "b", "c"])
  })

  it("the last row leaving an empty list still draws, and an index past the end lands last", () => {
    expect(drawn(withLeaving([], [{ item: { key: "x" }, at: 4 }], key))).toEqual(["(x)"])
  })

  it("add replaces an earlier leave of the same row; drop removes it once played", () => {
    const one = addLeaving<Row>([], { item: { key: "b" }, at: 1 }, key)
    const two = addLeaving(one, { item: { key: "b" }, at: 2 }, key)
    expect(two).toEqual([{ item: { key: "b" }, at: 2 }])
    expect(dropLeaving(two, "b", key)).toEqual([])
  })

  it("a failed Restart never leaves: the row stays drawn, and the toast says why", () => {
    expect(restartOutcome({ ok: false, reason: "not-saved" }, "BPC-157")).toEqual({
      leave: false,
      toast: "Couldn’t restart it. Try again.",
      undo: false,
    })
    expect(restartOutcome({ ok: false, reason: "gone" }, "BPC-157")).toEqual({
      leave: false,
      toast: "Couldn’t restart it. It has changed.",
      undo: false,
    })
  })

  it("a Restart that saved leaves, with the brief's toast and an Undo", () => {
    expect(restartOutcome({ ok: true }, "BPC-157")).toEqual({
      leave: true,
      toast: "Restarted. BPC-157 is back on its cycle.",
      undo: true,
    })
  })
})

describe("W34: the ghost of an ended row heads for the Ended link", () => {
  it("lands centred on a link in view", () => {
    expect(flightDelta({ top: 200, height: 50 }, { top: 500, height: 44 }, 844)).toBe(297)
  })

  it("heads for a link below the fold and stops at the screen's edge", () => {
    // Centre of a 50px ghost may reach the bottom edge, no further.
    expect(flightDelta({ top: 300, height: 50 }, { top: 1400, height: 44 }, 844)).toBe(844 - 25 - 300)
  })

  it("also flies up, to a Paused header above", () => {
    expect(flightDelta({ top: 400, height: 40 }, { top: 100, height: 40 }, 844)).toBe(-300)
  })
})

describe("the Cycles page's device memory", () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    store.clear()
    resetCyclesMemoryForTests()
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it("F8: a tap marks the hint seen only when the hint was drawn", () => {
    // One type: the page opens it and draws no hint. A tap must not use it up.
    expect(shouldMarkHintSeen({ drawn: false, gone: false, leaving: false })).toBe(false)
    expect(shouldMarkHintSeen({ drawn: true, gone: false, leaving: false })).toBe(true)
    expect(shouldMarkHintSeen({ drawn: true, gone: false, leaving: true })).toBe(false)
    expect(shouldMarkHintSeen({ drawn: true, gone: true, leaving: false })).toBe(false)
    expect(cyclesHintSeen("u")).toBe(false)
    markCyclesHintSeen("u")
    expect(cyclesHintSeen("u")).toBe(true)
  })

  it("ruling 7: a pause the page has never shown is fresh, and slides once", () => {
    expect(pausedSeen("u")).toBeNull()
    expect(freshPauses(["p1", "p2"], pausedSeen("u"))).toEqual(["p1", "p2"])
    rememberPausedSeen("u", ["p1", "p2"])
    expect(freshPauses(["p1", "p2"], pausedSeen("u"))).toEqual([])
  })

  it("ruling 7: remembered across visits, and a new pause after a Resume slides again", () => {
    rememberPausedSeen("u", ["p1"])
    resetCyclesMemoryForTests() // a new visit reads storage again
    expect(freshPauses(["p1"], pausedSeen("u"))).toEqual([])
    // Resumed (p1 ends), then paused again: a new pause id.
    expect(freshPauses(["p9"], pausedSeen("u"))).toEqual(["p9"])
  })

  it("remembering replaces the list, so an ended pause drops out", () => {
    rememberPausedSeen("u", ["p1", "p2"])
    rememberPausedSeen("u", ["p2"])
    resetCyclesMemoryForTests()
    expect([...(pausedSeen("u") ?? [])]).toEqual(["p2"])
  })

  it("a storage that throws still remembers for the session", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked")
        },
        setItem: () => {
          throw new Error("blocked")
        },
      },
    })
    resetCyclesMemoryForTests()
    expect(pausedSeen("u")).toBeNull()
    rememberPausedSeen("u", ["p1"])
    expect(freshPauses(["p1"], pausedSeen("u"))).toEqual([])
  })

  it("per account", () => {
    rememberPausedSeen("a", ["p1"])
    expect(freshPauses(["p1"], pausedSeen("b"))).toEqual(["p1"])
  })

  it("sameSeen skips a write that would say nothing new", () => {
    expect(sameSeen(null, [])).toBe(true)
    expect(sameSeen(null, ["p1"])).toBe(false)
    expect(sameSeen(new Set(["p1"]), ["p1"])).toBe(true)
    expect(sameSeen(new Set(["p1"]), ["p1", "p2"])).toBe(false)
    expect(sameSeen(new Set(["p1", "p2"]), ["p2"])).toBe(false)
  })
})
