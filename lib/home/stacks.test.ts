/**
 * Spec 05 · Stacks — the model half.
 *
 * The spec's two hard rules are structural here, and these pin them: a compound
 * belongs to at most one stack, and never appears twice inside one. The third —
 * that a stack owns no member field — is enforced by the TYPE (a `Stack` has
 * nowhere to put a dose, schedule or log), so there is nothing to assert.
 *
 * The fourth rule is the DATING added after stacks were found rewriting history:
 * a grouping applies from the day it was made forward, and a membership from the
 * day it began. Every test that walks back in time is pinning that.
 */
import { describe, expect, it } from "vitest"

import { nextStartingCompound, type StackCompound } from "@/lib/home/stack"

import {
  activeStacks,
  currentMemberIds,
  memberIdsOn,
  partitionByStack,
  removeMemberEverywhere,
  removeStack,
  setStackMembers,
  stackOf,
  stackedIds,
  nextStackName,
  type Stack,
} from "./stacks"

const MADE = "2026-07-10"

/** A stack made on `MADE`, with every member joining that day. */
const stack = (over: Partial<Stack> & { ids?: string[] } = {}): Stack => {
  const { ids = [], ...rest } = over
  return {
    id: "s1",
    name: "Morning",
    colour: "teal",
    effectiveFrom: MADE,
    members: ids.map((compoundId, position) => ({
      compoundId,
      from: MADE,
      position,
    })),
    ...rest,
  }
}

/** Current member ids of the stack with this id. */
const idsOf = (stacks: Stack[], id: string) =>
  currentMemberIds(stacks.find((s) => s.id === id)!)

const LATER = "2026-07-20"

describe("one stack per compound", () => {
  it("moves a compound out of its old stack when added to a new one", () => {
    const before = [
      stack({ id: "s1", ids: ["a", "b"] }),
      stack({ id: "s2", name: "Evening", ids: ["c"] }),
    ]
    const after = setStackMembers(before, "s2", ["c", "a"], LATER)
    expect(idsOf(after, "s2")).toEqual(["c", "a"])
    // 'a' left s1 automatically — the invariant holds by construction.
    expect(idsOf(after, "s1")).toEqual(["b"])
  })

  it("never lets the same compound sit in two stacks AT ONCE", () => {
    const after = setStackMembers(
      [stack({ id: "s1", ids: ["a"] }), stack({ id: "s2", ids: [] })],
      "s2",
      ["a"],
      LATER
    )
    const all = after.flatMap((s) => currentMemberIds(s))
    expect(all).toEqual(["a"])
    expect(new Set(all).size).toBe(all.length)
  })

  it("but the days before the move still show it in the OLD stack", () => {
    const after = setStackMembers(
      [stack({ id: "s1", ids: ["a"] }), stack({ id: "s2", name: "Evening", ids: [] })],
      "s2",
      ["a"],
      LATER
    )
    const s1 = after.find((s) => s.id === "s1")!
    const s2 = after.find((s) => s.id === "s2")!
    // The day before the move: still in s1, not yet in s2.
    expect(memberIdsOn(s1, "2026-07-19")).toEqual(["a"])
    expect(memberIdsOn(s2, "2026-07-19")).toEqual([])
    // The day of the move: swapped, and never in both.
    expect(memberIdsOn(s1, LATER)).toEqual([])
    expect(memberIdsOn(s2, LATER)).toEqual(["a"])
  })

  it("collapses a duplicate inside one stack", () => {
    const after = setStackMembers([stack({ ids: [] })], "s1", ["a", "b", "a"], LATER)
    expect(currentMemberIds(after[0])).toEqual(["a", "b"])
  })

  it("preserves the order the user chose", () => {
    const after = setStackMembers([stack()], "s1", ["c", "a", "b"], LATER)
    expect(currentMemberIds(after[0])).toEqual(["c", "a", "b"])
  })

  it("re-saving an unchanged stack does not restate its members as starting today", () => {
    // The regression that would silently un-group every past day: an edit that
    // only renames the stack must leave every existing span exactly where it was.
    const after = setStackMembers([stack({ ids: ["a", "b"] })], "s1", ["a", "b"], LATER)
    expect(after[0].members.map((m) => m.from)).toEqual([MADE, MADE])
    expect(memberIdsOn(after[0], MADE)).toEqual(["a", "b"])
  })

  it("drops a membership that began and ended on the same day", () => {
    // It covered no day at all, so storing it would occupy the one-stack slot
    // while rendering as a member of nothing.
    const added = setStackMembers([stack({ ids: [] })], "s1", ["a"], LATER)
    const removed = setStackMembers(added, "s1", [], LATER)
    expect(removed[0].members).toEqual([])
  })
})

describe("dating a stack", () => {
  it("groups nothing before the day it was made", () => {
    const s = stack({ ids: ["a", "b"] })
    expect(memberIdsOn(s, "2026-07-09")).toEqual([])
    expect(memberIdsOn(s, MADE)).toEqual(["a", "b"])
  })

  it("a member added later is absent from the days before it joined", () => {
    // Adrian's report: a "Vitamins" stack gained D3 and C after the fact, and
    // they showed on days when only creatine was being taken.
    const after = setStackMembers(
      [stack({ ids: ["creatine"] })],
      "s1",
      ["creatine", "d3", "vitC"],
      LATER
    )
    expect(memberIdsOn(after[0], "2026-07-19")).toEqual(["creatine"])
    expect(memberIdsOn(after[0], LATER)).toEqual(["creatine", "d3", "vitC"])
  })

  it("a removed member still shows on the days it was in the stack", () => {
    const after = removeMemberEverywhere([stack({ ids: ["a", "b"] })], "a", LATER)
    expect(memberIdsOn(after[0], "2026-07-19")).toEqual(["a", "b"])
    expect(memberIdsOn(after[0], LATER)).toEqual(["b"])
  })
})

describe("lookups", () => {
  const stacks = [
    stack({ id: "s1", ids: ["a", "b"] }),
    stack({ id: "s2", name: "Evening", ids: ["c"] }),
  ]

  it("finds the stack a compound belongs to", () => {
    expect(stackOf(stacks, "b")?.id).toBe("s1")
    expect(stackOf(stacks, "c")?.id).toBe("s2")
    expect(stackOf(stacks, "zzz")).toBeNull()
  })

  it("lists every stacked compound, for excluding them from the member picker", () => {
    expect(stackedIds(stacks)).toEqual(new Set(["a", "b", "c"]))
  })

  it("a past member is not counted as stacked — it can join another stack", () => {
    const after = removeMemberEverywhere([stack({ ids: ["a", "b"] })], "a", LATER)
    expect(stackedIds(after)).toEqual(new Set(["b"]))
    expect(stackOf(after, "a")).toBeNull()
  })
})

describe("the dashboard partition", () => {
  const stacks = [stack({ id: "s1", ids: ["a", "b"] })]

  it("puts members in their stack and never also in the loose list", () => {
    const { stacks: grouped, loose } = partitionByStack(["a", "b", "x"], stacks, MADE)
    expect(grouped).toHaveLength(1)
    expect(grouped[0].memberIds).toEqual(["a", "b"])
    expect(loose).toEqual(["x"])
  })

  it("leaves everything loose on a day BEFORE the stack was made", () => {
    // The bug: a stack made today wrapped every day already lived.
    const { stacks: grouped, loose } = partitionByStack(["a", "b", "x"], stacks, "2026-07-09")
    expect(grouped).toHaveLength(0)
    expect(loose).toEqual(["a", "b", "x"])
  })

  it("omits a stack with no members due that day rather than showing it empty", () => {
    const { stacks: grouped, loose } = partitionByStack(["x"], stacks, MADE)
    expect(grouped).toHaveLength(0)
    expect(loose).toEqual(["x"])
  })

  it("shows a partially-due stack with only the due members", () => {
    const { stacks: grouped, loose } = partitionByStack(["a", "x"], stacks, MADE)
    expect(grouped[0].memberIds).toEqual(["a"])
    expect(loose).toEqual(["x"])
  })

  it("with no stacks, everything stays loose — the dashboard is unchanged", () => {
    const { stacks: grouped, loose } = partitionByStack(["a", "b"], [], MADE)
    expect(grouped).toHaveLength(0)
    expect(loose).toEqual(["a", "b"])
  })

  it("partitions — every id lands in exactly one place, on any day", () => {
    const ids = ["a", "b", "x", "y"]
    for (const day of ["2026-07-01", MADE, LATER]) {
      const { stacks: grouped, loose } = partitionByStack(ids, stacks, day)
      const seen = [...grouped.flatMap((g) => g.memberIds), ...loose]
      expect(seen.sort()).toEqual([...ids].sort())
    }
  })
})

describe("deletion leaves compounds alone", () => {
  it("dropping a member leaves the stack standing with one fewer", () => {
    const after = removeMemberEverywhere([stack({ ids: ["a", "b", "c"] })], "b", LATER)
    expect(after).toHaveLength(1)
    expect(currentMemberIds(after[0])).toEqual(["a", "c"])
  })

  it("a stack reduced to one member is still a stack", () => {
    const after = removeMemberEverywhere([stack({ ids: ["a", "b"] })], "a", LATER)
    expect(currentMemberIds(after[0])).toEqual(["b"])
  })

  it("deleting the stack ungroups its members and touches nothing else", () => {
    const before = [
      stack({ id: "s1", ids: ["a", "b"] }),
      stack({ id: "s2", ids: ["c"] }),
    ]
    const after = removeStack(before, "s1")
    expect(after).toHaveLength(1)
    expect(after[0].id).toBe("s2")
    // The member ids are simply no longer claimed — nothing was cascaded.
    expect(stackOf(after, "a")).toBeNull()
  })
})

describe("a stack that empties is retired, not erased", () => {
  it("keeps a stack that still has one member", () => {
    const after = activeStacks(
      removeMemberEverywhere([stack({ ids: ["a", "b"] })], "a", LATER)
    )
    expect(after).toHaveLength(1)
    expect(currentMemberIds(after[0])).toEqual(["b"])
  })

  it("stops listing a stack whose last member is gone, rather than an empty card", () => {
    const after = removeMemberEverywhere([stack({ ids: ["a"] })], "a", LATER)
    expect(activeStacks(after)).toHaveLength(0)
    // But it is still there, and the days it grouped still read correctly.
    expect(after).toHaveLength(1)
    expect(memberIdsOn(after[0], "2026-07-19")).toEqual(["a"])
  })
})

describe("regressions found in cold review", () => {
  it("keeps historical order when an unrelated member is removed", () => {
    // Positions used to be restated 0..n-1 on every save, colliding with the
    // closed spans that keep their old numbers — so removing the FIRST of two
    // members silently flipped the pair on every day before the removal.
    const before = stack({
      members: [
        { compoundId: "z", from: MADE, position: 0 },
        { compoundId: "a", from: MADE, position: 1 },
      ],
    })
    const after = setStackMembers([before], "s1", ["a"], LATER)
    expect(memberIdsOn(after[0], MADE)).toEqual(["z", "a"])
    expect(currentMemberIds(after[0])).toEqual(["a"])
  })

  it("a new member goes after every position ever used, not into a reused slot", () => {
    const after = setStackMembers([stack({ ids: ["a", "b"] })], "s1", ["a", "b", "c"], LATER)
    const positions = after[0].members.map((m) => m.position)
    expect(new Set(positions).size).toBe(positions.length)
  })

  it("renders a compound once even when two spans overlap", () => {
    // Not reachable through the mutators, but a device clock that moves backwards
    // or two client ids resolving to one Postgres row both produce it.
    const s = stack({
      effectiveFrom: "2026-07-01",
      members: [
        { compoundId: "a", from: "2026-07-01", to: "2026-07-20", position: 0 },
        { compoundId: "a", from: "2026-07-05", to: "2026-07-10", position: 1 },
      ],
    })
    expect(memberIdsOn(s, "2026-07-07")).toEqual(["a"])
    expect(partitionByStack(["a"], [s], "2026-07-07").stacks[0].memberIds).toEqual(["a"])
  })

  it("never puts one compound in two stack rows on the same day", () => {
    const a = stack({ id: "s1", members: [{ compoundId: "x", from: MADE, position: 0 }] })
    const b = stack({ id: "s2", members: [{ compoundId: "x", from: MADE, position: 0 }] })
    const { stacks: grouped, loose } = partitionByStack(["x"], [a, b], LATER)
    expect(grouped).toHaveLength(1)
    expect(grouped.flatMap((g) => g.memberIds)).toEqual(["x"])
    expect(loose).toEqual([])
  })

  it("removing a member on a day before it joined cannot write to < from", () => {
    // The DB CHECK rejects it outright, which would take the whole membership
    // push down with it.
    const after = removeMemberEverywhere([stack({ ids: ["a"] })], "a", "2026-07-01")
    for (const m of after[0].members) {
      if (m.to !== undefined) expect(m.to >= m.from).toBe(true)
    }
  })

  it("moving a compound on the DAY IT JOINED leaves it in one stack, not two", () => {
    // Every setStackMembers test used a removal day later than the join day, so
    // the same-day boundary — setting two stacks up in one sitting and moving a
    // compound you put in the wrong one — was never exercised. The old stack kept
    // a one-day span, so for the rest of that day Home and Protocol disagreed
    // about which stack the compound was in.
    const morning = stack({ id: "m", name: "Morning", ids: ["creatine", "tren"] })
    const evening = stack({ id: "e", name: "Evening", ids: [] })
    const after = setStackMembers([morning, evening], "e", ["creatine"], MADE)

    expect(memberIdsOn(after[0], MADE)).toEqual(["tren"])
    expect(memberIdsOn(after[1], MADE)).toEqual(["creatine"])
    const { stacks: grouped } = partitionByStack(["creatine", "tren"], after, MADE)
    expect(grouped.map((g) => [g.stack.name, g.memberIds])).toEqual([
      ["Morning", ["tren"]],
      ["Evening", ["creatine"]],
    ])
  })

  it("moving the ONLY member on its join day renders the new stack, not the dead one", () => {
    const from = stack({ id: "m", name: "Morning", ids: ["creatine"] })
    const to = stack({ id: "e", name: "Evening", ids: [] })
    const after = setStackMembers([from, to], "e", ["creatine"], MADE)
    const { stacks: grouped } = partitionByStack(["creatine"], after, MADE)
    expect(grouped).toHaveLength(1)
    expect(grouped[0].stack.name).toBe("Evening")
  })

  it("unticking a member in the editor shortens its span, like deleting the compound does", () => {
    // The two removal paths disagreed: `removeMemberEverywhere` clamped, the
    // editor's own branch wrote the day raw and `pruneEmpty` then deleted the
    // whole span.
    const before = stack({ ids: ["a", "b"] })
    const edited = setStackMembers([before], "s1", ["b"], "2026-07-01")
    const deleted = removeMemberEverywhere([before], "a", "2026-07-01")
    expect(memberIdsOn(edited[0], MADE)).toEqual(memberIdsOn(deleted[0], MADE))
    expect(memberIdsOn(edited[0], MADE)).toEqual(["a", "b"])
  })

  it("keeps a member's place when it is removed and re-added the same day", () => {
    // No open span exists for it mid-edit, so it was treated as brand new and
    // sent to the end of the row — with a tick-list editor there is no way back.
    const before = stack({ ids: ["a", "b"] })
    const removed = setStackMembers([before], "s1", ["b"], LATER)
    const readded = setStackMembers(removed, "s1", ["b", "a"], LATER)
    expect(currentMemberIds(readded[0])).toEqual(["a", "b"])
  })

  it("shortens rather than deletes a membership closed by a backwards clock", () => {
    const after = removeMemberEverywhere([stack({ ids: ["a", "b"] })], "a", "2026-07-01")
    // The days it really was in the stack still show it.
    expect(memberIdsOn(after[0], MADE)).toEqual(["a", "b"])
    expect(currentMemberIds(after[0])).toEqual(["b"])
  })

  it("ignores a set against a stack id that does not exist", () => {
    const before = [stack({ id: "s1", ids: ["a", "b"] })]
    const after = setStackMembers(before, "nope", ["a", "b"], LATER)
    expect(currentMemberIds(after[0])).toEqual(["a", "b"])
  })
})

describe("auto-naming an unnamed stack", () => {
  it("starts at Stack 1", () => {
    expect(nextStackName([])).toBe("Stack 1")
  })

  it("reuses the lowest FREE number, not count + 1", () => {
    // Delete "Stack 2" of three and the next one should fill the gap rather
    // than mint "Stack 4" alongside an existing "Stack 3".
    const stacks = [stack({ id: "a", name: "Stack 1" }), stack({ id: "c", name: "Stack 3" })]
    expect(nextStackName(stacks)).toBe("Stack 2")
  })

  it("skips a number the user typed themselves", () => {
    expect(nextStackName([stack({ name: "Stack 1" })])).toBe("Stack 2")
  })

  it("ignores names that merely contain a number", () => {
    expect(nextStackName([stack({ name: "Morning shot 1" })])).toBe("Stack 1")
  })
})

describe("nextStartingCompound", () => {
  const c = (
    name: string,
    startDate: string,
    archived = false,
  ): StackCompound =>
    ({
      id: name,
      name,
      category: "anabolic",
      method: "im",
      dose: 1,
      unit: "mg",
      schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate },
      rotationSites: [],
      rotationIndex: 0,
      archived,
    }) as unknown as StackCompound

  it("names the compound a future start date would otherwise hide", () => {
    // The cold-start defect: the compound is in the stack, due on no day, and
    // the first-run card is gone because the stack is not empty.
    expect(nextStartingCompound([c("Test E", "2026-08-10")], "2026-07-31")).toEqual({
      name: "Test E",
      startDate: "2026-08-10",
    })
  })

  it("picks the soonest, and breaks ties by name so the answer is stable", () => {
    const stack = [c("Zinc", "2026-08-10"), c("BPC", "2026-08-10"), c("Test E", "2026-09-01")]
    expect(nextStartingCompound(stack, "2026-07-31")?.name).toBe("BPC")
  })

  it("is null once the compound has started", () => {
    expect(nextStartingCompound([c("Test E", "2026-07-31")], "2026-07-31")).toBeNull()
    expect(nextStartingCompound([c("Test E", "2026-07-01")], "2026-07-31")).toBeNull()
  })

  it("ignores deleted compounds", () => {
    expect(nextStartingCompound([c("Test E", "2026-08-10", true)], "2026-07-31")).toBeNull()
  })

  it("is null for an empty stack", () => {
    expect(nextStartingCompound([], "2026-07-31")).toBeNull()
  })
})
