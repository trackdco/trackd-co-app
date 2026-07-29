/**
 * Spec 05 · Stacks — the model half.
 *
 * The spec's two hard rules are structural here, and these pin them: a compound
 * belongs to at most one stack, and never appears twice inside one. The third —
 * that a stack owns no member field — is enforced by the TYPE (a `Stack` has
 * nowhere to put a dose, schedule or log), so there is nothing to assert.
 */
import { describe, expect, it } from "vitest"

import {
  partitionByStack,
  removeMemberEverywhere,
  removeStack,
  setStackMembers,
  stackOf,
  stackedIds,
  type Stack,
} from "./stacks"

const stack = (over: Partial<Stack> = {}): Stack => ({
  id: "s1",
  name: "Morning",
  colour: "teal",
  memberIds: [],
  ...over,
})

describe("one stack per compound", () => {
  it("moves a compound out of its old stack when added to a new one", () => {
    const before = [
      stack({ id: "s1", memberIds: ["a", "b"] }),
      stack({ id: "s2", name: "Evening", memberIds: ["c"] }),
    ]
    const after = setStackMembers(before, "s2", ["c", "a"])
    expect(after.find((s) => s.id === "s2")!.memberIds).toEqual(["c", "a"])
    // 'a' left s1 automatically — the invariant holds by construction.
    expect(after.find((s) => s.id === "s1")!.memberIds).toEqual(["b"])
  })

  it("never lets the same compound sit in two stacks", () => {
    const after = setStackMembers(
      [stack({ id: "s1", memberIds: ["a"] }), stack({ id: "s2", memberIds: [] })],
      "s2",
      ["a"]
    )
    const all = after.flatMap((s) => s.memberIds)
    expect(all).toEqual(["a"])
    expect(new Set(all).size).toBe(all.length)
  })

  it("collapses a duplicate inside one stack", () => {
    const after = setStackMembers([stack({ memberIds: [] })], "s1", ["a", "b", "a"])
    expect(after[0].memberIds).toEqual(["a", "b"])
  })

  it("preserves the order the user chose", () => {
    const after = setStackMembers([stack()], "s1", ["c", "a", "b"])
    expect(after[0].memberIds).toEqual(["c", "a", "b"])
  })
})

describe("lookups", () => {
  const stacks = [
    stack({ id: "s1", memberIds: ["a", "b"] }),
    stack({ id: "s2", name: "Evening", memberIds: ["c"] }),
  ]

  it("finds the stack a compound belongs to", () => {
    expect(stackOf(stacks, "b")?.id).toBe("s1")
    expect(stackOf(stacks, "c")?.id).toBe("s2")
    expect(stackOf(stacks, "zzz")).toBeNull()
  })

  it("lists every stacked compound, for excluding them from the member picker", () => {
    expect(stackedIds(stacks)).toEqual(new Set(["a", "b", "c"]))
  })
})

describe("the dashboard partition", () => {
  const stacks = [stack({ id: "s1", memberIds: ["a", "b"] })]

  it("puts members in their stack and never also in the loose list", () => {
    const { stacks: grouped, loose } = partitionByStack(["a", "b", "x"], stacks)
    expect(grouped).toHaveLength(1)
    expect(grouped[0].memberIds).toEqual(["a", "b"])
    expect(loose).toEqual(["x"])
  })

  it("omits a stack with no members due that day rather than showing it empty", () => {
    const { stacks: grouped, loose } = partitionByStack(["x"], stacks)
    expect(grouped).toHaveLength(0)
    expect(loose).toEqual(["x"])
  })

  it("shows a partially-due stack with only the due members", () => {
    const { stacks: grouped, loose } = partitionByStack(["a", "x"], stacks)
    expect(grouped[0].memberIds).toEqual(["a"])
    expect(loose).toEqual(["x"])
  })

  it("with no stacks, everything stays loose — the dashboard is unchanged", () => {
    const { stacks: grouped, loose } = partitionByStack(["a", "b"], [])
    expect(grouped).toHaveLength(0)
    expect(loose).toEqual(["a", "b"])
  })

  it("partitions — every id lands in exactly one place", () => {
    const ids = ["a", "b", "x", "y"]
    const { stacks: grouped, loose } = partitionByStack(ids, stacks)
    const seen = [...grouped.flatMap((g) => g.memberIds), ...loose]
    expect(seen.sort()).toEqual([...ids].sort())
  })
})

describe("deletion leaves compounds alone", () => {
  it("dropping a member leaves the stack standing with one fewer", () => {
    const after = removeMemberEverywhere(
      [stack({ memberIds: ["a", "b", "c"] })],
      "b"
    )
    expect(after).toHaveLength(1)
    expect(after[0].memberIds).toEqual(["a", "c"])
  })

  it("a stack reduced to one member is still a stack", () => {
    const after = removeMemberEverywhere([stack({ memberIds: ["a", "b"] })], "a")
    expect(after[0].memberIds).toEqual(["b"])
  })

  it("deleting the stack ungroups its members and touches nothing else", () => {
    const before = [
      stack({ id: "s1", memberIds: ["a", "b"] }),
      stack({ id: "s2", memberIds: ["c"] }),
    ]
    const after = removeStack(before, "s1")
    expect(after).toHaveLength(1)
    expect(after[0].id).toBe("s2")
    // The member ids are simply no longer claimed — nothing was cascaded.
    expect(stackOf(after, "a")).toBeNull()
  })
})

describe("a stack is dissolved only when it empties", () => {
  it("keeps a stack that still has one member", () => {
    const after = removeMemberEverywhere([stack({ memberIds: ["a", "b"] })], "a")
      .filter((s) => s.memberIds.length > 0)
    expect(after).toHaveLength(1)
    expect(after[0].memberIds).toEqual(["b"])
  })

  it("drops a stack whose last member is gone, rather than leaving an empty card", () => {
    const after = removeMemberEverywhere([stack({ memberIds: ["a"] })], "a")
      .filter((s) => s.memberIds.length > 0)
    expect(after).toHaveLength(0)
  })
})
