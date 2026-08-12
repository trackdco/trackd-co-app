import { describe, expect, it } from "vitest"

import type { DoseLog } from "@/lib/home/mockHomeData"
import type { DaySlot } from "@/lib/home/doseLog"
import {
  isReflexReversal,
  liveMembers,
  REVERSE_GUARD_MS,
  stackLogTargets,
  stackProgress,
  stackUnlogTargets,
} from "@/lib/home/stackTicks"

const taken = (over: Partial<DoseLog> = {}): DoseLog => ({
  amount: "250",
  siteId: null,
  time24: "08:00",
  ...over,
})

const slot = (n: number, log: DoseLog | null): DaySlot => ({
  slot: n,
  time24: "08:00",
  dose: 250,
  log,
})

interface Member {
  id: string
  paused?: boolean
  slots: DaySlot[]
}

const member = (id: string, slots: DaySlot[], paused = false): Member => ({
  id,
  paused,
  slots,
})

describe("stackUnlogTargets", () => {
  it("takes every logged slot of every live member", () => {
    const members = [
      member("test-e", [slot(0, taken())]),
      member("hcg", [slot(0, taken())]),
    ]
    expect(stackUnlogTargets(members).map((t) => [t.compound.id, t.slot])).toEqual([
      ["test-e", 0],
      ["hcg", 0],
    ])
  })

  it("takes BOTH doses of a twice-daily member", () => {
    const members = [member("mk-677", [slot(0, taken()), slot(1, taken())])]
    expect(stackUnlogTargets(members).map((t) => t.slot)).toEqual([0, 1])
  })

  it("leaves a member's unlogged slot alone", () => {
    const members = [member("mk-677", [slot(0, taken()), slot(1, null)])]
    expect(stackUnlogTargets(members).map((t) => t.slot)).toEqual([0])
  })

  it("never touches a SKIPPED dose — it is a decision, not a tick", () => {
    const members = [
      member("test-e", [slot(0, taken())]),
      member("creatine", [slot(0, taken({ status: "skipped" }))]),
      member("bpc-157", [slot(0, taken())]),
    ]
    expect(stackUnlogTargets(members).map((t) => t.compound.id)).toEqual([
      "test-e",
      "bpc-157",
    ])
  })

  it("never touches a PAUSED member, even if it somehow carries a log", () => {
    const members = [
      member("test-e", [slot(0, taken())]),
      member("hcg", [slot(0, taken())], true),
    ]
    expect(stackUnlogTargets(members).map((t) => t.compound.id)).toEqual(["test-e"])
  })

  it("DOES untick a dose that carries an injection site", () => {
    // A stack tick never records a site, so one can only be here because the
    // member was ticked individually — and its own row unticks it in one tap
    // today. Sparing it would leave the row half-ticked after "untick all".
    const members = [member("test-e", [slot(0, taken({ siteId: "glute-l" }))])]
    expect(stackUnlogTargets(members)).toHaveLength(1)
  })

  it("is empty when the stack is complete only because everything was skipped", () => {
    const members = [
      member("creatine", [slot(0, taken({ status: "skipped" }))]),
      member("vitamin-d", [slot(0, taken({ status: "skipped" }))]),
    ]
    expect(stackUnlogTargets(members)).toEqual([])
    // ...and the stack still reads complete, so the tick must not become a
    // button that does nothing.
    expect(stackProgress(members).complete).toBe(true)
  })

  it("is empty for a stack with nothing logged", () => {
    expect(stackUnlogTargets([member("test-e", [slot(0, null)])])).toEqual([])
  })

  it("is empty for a wholly paused stack", () => {
    expect(stackUnlogTargets([member("test-e", [slot(0, taken())], true)])).toEqual([])
  })

  it("never touches a HISTORIC dose — nothing could re-create it", () => {
    // A historic slot exists ONLY because it carries a log (a dose taken under
    // an older, longer schedule). Delete the log and the slot vanishes from
    // `slotsForDay`, and no control in the app can add it back — so "they can
    // always re-log it" is false for exactly these.
    const members = [
      member("mk-677", [
        slot(0, taken()),
        slot(1, taken()),
        { ...slot(2, taken()), historic: true },
      ]),
    ]
    expect(stackUnlogTargets(members).map((t) => t.slot)).toEqual([0, 1])
  })
})

describe("stackLogTargets", () => {
  it("takes members with any unlogged slot, including partly-logged ones", () => {
    const members = [
      member("test-e", [slot(0, taken())]),
      member("mk-677", [slot(0, taken()), slot(1, null)]),
      member("bpc-157", [slot(0, null)]),
    ]
    expect(stackLogTargets(members).map((m) => m.id)).toEqual(["mk-677", "bpc-157"])
  })

  it("never offers a paused member", () => {
    const members = [member("hcg", [slot(0, null)], true)]
    expect(stackLogTargets(members)).toEqual([])
  })
})

describe("stackProgress", () => {
  it("counts DOSES, not members", () => {
    const members = [
      member("test-e", [slot(0, taken())]),
      member("mk-677", [slot(0, taken()), slot(1, null)]),
    ]
    expect(stackProgress(members)).toEqual({
      logged: 2,
      total: 3,
      complete: false,
      partial: true,
    })
  })

  it("counts a SKIPPED dose as dealt with, so the stack can read complete", () => {
    const members = [
      member("test-e", [slot(0, taken())]),
      member("creatine", [slot(0, taken({ status: "skipped" }))]),
    ]
    expect(stackProgress(members).complete).toBe(true)
  })

  it("excludes paused members from the total, so a stack can reach 100%", () => {
    const members = [
      member("test-e", [slot(0, taken())]),
      member("hcg", [slot(0, null)], true),
    ]
    expect(stackProgress(members)).toMatchObject({ logged: 1, total: 1, complete: true })
  })

  it("is never complete when the stack has nothing live in it", () => {
    const members = [member("hcg", [slot(0, null)], true)]
    expect(stackProgress(members)).toMatchObject({ total: 0, complete: false })
  })
})

describe("liveMembers", () => {
  it("keeps paused members out and everything else in order", () => {
    const members = [
      member("a", [slot(0, null)]),
      member("b", [slot(0, null)], true),
      member("c", [slot(0, null)]),
    ]
    expect(liveMembers(members).map((m) => m.id)).toEqual(["a", "c"])
  })
})

/**
 * The round trip Adrian described: "if I tick a stack, it ticks them all. If I
 * untick a stack, I want it to untick them all." Ticking then unticking must
 * land back where it started — and must leave the skipped member exactly as it
 * was, both times.
 */
describe("tick then untick", () => {
  it("returns the stack to where it started, keeping the skip", () => {
    const start = [
      member("test-e", [slot(0, null)]),
      member("mk-677", [slot(0, null), slot(1, null)]),
      member("creatine", [slot(0, taken({ status: "skipped" }))]),
      member("hcg", [slot(0, null)], true),
    ]

    // Tick: every live member with something outstanding, one dose each.
    const toLog = stackLogTargets(start)
    expect(toLog.map((m) => m.id)).toEqual(["test-e", "mk-677"])

    const afterTick = [
      member("test-e", [slot(0, taken())]),
      member("mk-677", [slot(0, taken()), slot(1, taken())]),
      member("creatine", [slot(0, taken({ status: "skipped" }))]),
      member("hcg", [slot(0, null)], true),
    ]
    expect(stackProgress(afterTick).complete).toBe(true)

    // Untick: everything that tick could have put there, and nothing else.
    const toUnlog = stackUnlogTargets(afterTick)
    expect(toUnlog.map((t) => [t.compound.id, t.slot])).toEqual([
      ["test-e", 0],
      ["mk-677", 0],
      ["mk-677", 1],
    ])
    // The skip and the paused member are untouched by both directions.
    expect(toUnlog.some((t) => t.compound.id === "creatine")).toBe(false)
    expect(toUnlog.some((t) => t.compound.id === "hcg")).toBe(false)
  })
})

/**
 * The double-tap guard. Extracted here because it was the one piece of the
 * untick with no coverage at all — the preview harness freezes its logs as a
 * prop, so a browser cannot exercise the stack row, and the live dashboard needs
 * a signed-in session.
 */
describe("isReflexReversal", () => {
  const at = (n: number, kind: "log" | "unlog") => ({ at: n, kind })

  it("refuses an untick moments after a tick", () => {
    // The destructive half: tap one logs everything, which turns the same target
    // into "untick all", and tap two deletes it.
    expect(isReflexReversal(at(1000, "log"), "unlog", 1200)).toBe(true)
  })

  it("refuses a tick moments after an untick", () => {
    // The other half — deletes five doses and re-logs them from the plan,
    // leaving the row looking exactly as it did.
    expect(isReflexReversal(at(1000, "unlog"), "log", 1200)).toBe(true)
  })

  it("allows a DELIBERATE reversal once the window has passed", () => {
    expect(isReflexReversal(at(1000, "log"), "unlog", 1000 + REVERSE_GUARD_MS)).toBe(false)
    expect(isReflexReversal(at(1000, "log"), "unlog", 5000)).toBe(false)
  })

  it("never blocks repeated taps the SAME way", () => {
    // Legitimate: one tap advances a twice-daily member to its second dose.
    expect(isReflexReversal(at(1000, "log"), "log", 1001)).toBe(false)
    expect(isReflexReversal(at(1000, "unlog"), "unlog", 1001)).toBe(false)
  })

  it("never blocks the first action on a row", () => {
    expect(isReflexReversal(null, "log", 1000)).toBe(false)
    expect(isReflexReversal(null, "unlog", 1000)).toBe(false)
  })

  it("is exclusive at the boundary, so the guard cannot outlast its window", () => {
    expect(isReflexReversal(at(0, "log"), "unlog", REVERSE_GUARD_MS - 1)).toBe(true)
    expect(isReflexReversal(at(0, "log"), "unlog", REVERSE_GUARD_MS)).toBe(false)
  })

  it("does not deadlock on a clock that goes BACKWARDS", () => {
    // Why the caller must pass `performance.now()`. With a wall clock an NTP
    // correction makes elapsed time negative, which reads as "inside the
    // window" — and the control stays dead until the clock catches up.
    expect(isReflexReversal(at(10_000, "log"), "unlog", 9_000)).toBe(true)
    // Monotonic time never does this; the test pins the hazard, not the fix.
  })
})
