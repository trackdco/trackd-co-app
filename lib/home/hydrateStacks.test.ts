/**
 * The stack half of hydration — folding the Postgres pull into the device store.
 *
 * This is the merge, not the round trip: `mergeStack` and `adoptStart` are pure
 * and are where three of the four cold-review rounds on this feature found their
 * bug, every one of them a case of the server's copy quietly overwriting
 * something the device knew and the server did not. They had no coverage at all,
 * which is why each fix took another round to catch.
 *
 * The rule being pinned: **the device is authoritative.** The server contributes
 * the real start date when ours is a migration guess, and any membership we have
 * never heard of. Nothing else.
 */
import { describe, expect, it } from "vitest"

import { adoptStart, mergeStack, placedElsewhere } from "./hydrateProtocol"
import {
  currentMemberIds,
  memberIdsOn,
  type Stack,
  type StackMembership,
} from "./stacks"

const base = (over: Partial<Stack> = {}): Stack => ({
  id: "s1",
  name: "Vitamins",
  colour: "teal",
  effectiveFrom: "2026-06-01",
  members: [],
  ...over,
})

describe("an edit the server has not seen yet", () => {
  it("keeps a member REMOVED offline removed", () => {
    // The removal changes a span's `to`, not its identity — so a merge keyed on
    // (compound, from) saw no difference, took the server's open span, and the
    // member came back. Then the next push wrote the resurrection to Postgres.
    const local = base({
      members: [
        { compoundId: "a", from: "2026-06-01", position: 0 },
        { compoundId: "b", from: "2026-06-01", to: "2026-07-10", position: 1 },
      ],
    })
    const pulled = base({
      members: [
        { compoundId: "a", from: "2026-06-01", position: 0 },
        { compoundId: "b", from: "2026-06-01", position: 1 },
      ],
    })
    const merged = mergeStack(pulled, local)
    expect(currentMemberIds(merged)).toEqual(["a"])
    // And the days it WAS a member still show it.
    expect(memberIdsOn(merged, "2026-06-15")).toEqual(["a", "b"])
  })

  it("keeps a member ADDED offline", () => {
    const local = base({
      members: [
        { compoundId: "a", from: "2026-06-01", position: 0 },
        { compoundId: "new", from: "2026-07-10", position: 1 },
      ],
    })
    const pulled = base({
      members: [{ compoundId: "a", from: "2026-06-01", position: 0 }],
    })
    expect(currentMemberIds(mergeStack(pulled, local))).toEqual(["a", "new"])
  })

  it("keeps a member the push could not send at all", () => {
    // An unmigrated custom compound: `pushStacks` skips it deliberately, on the
    // grounds that the device store still holds the membership. It has to.
    const local = base({
      members: [
        { compoundId: "cat", from: "2026-06-01", position: 0 },
        { compoundId: "custom", from: "2026-06-01", position: 1 },
      ],
    })
    const pulled = base({
      members: [{ compoundId: "cat", from: "2026-06-01", position: 0 }],
    })
    expect(currentMemberIds(mergeStack(pulled, local))).toEqual(["cat", "custom"])
  })
})

describe("the 013 backfill must not overwrite a real join date", () => {
  it("keeps the device's join date for a member the server dated by backfill", () => {
    // 013 dates every pre-existing membership to its stack's creation day. For
    // anything added between the deploy and the migration being applied by hand,
    // the device knows the real day and the server does not — and taking the
    // server's version restores the original bug: a member grouped on days
    // before it joined.
    const local = base({
      effectiveFrom: "2026-06-02",
      members: [
        { compoundId: "a", from: "2026-06-02", position: 0 },
        { compoundId: "b", from: "2026-07-20", position: 1 },
      ],
    })
    const pulled = base({
      effectiveFrom: "2026-06-01",
      members: [
        { compoundId: "a", from: "2026-06-01", position: 0 },
        { compoundId: "b", from: "2026-06-01", position: 1 },
      ],
    })
    const merged = mergeStack(pulled, local)
    expect(memberIdsOn(merged, "2026-07-10")).toEqual(["a"])
    expect(memberIdsOn(merged, "2026-07-20")).toEqual(["a", "b"])
    // One span per compound — no duplicate left behind by the merge.
    expect(merged.members).toHaveLength(2)
  })

  it("adds a member only the server knows about", () => {
    const local = base({
      members: [{ compoundId: "a", from: "2026-06-01", position: 0 }],
    })
    const pulled = base({
      members: [
        { compoundId: "a", from: "2026-06-01", position: 0 },
        { compoundId: "fromOtherDevice", from: "2026-06-05", position: 1 },
      ],
    })
    expect(currentMemberIds(mergeStack(pulled, local))).toEqual([
      "a",
      "fromOtherDevice",
    ])
  })
})

describe("a move the server has not seen yet", () => {
  it("does not re-adopt a compound the device has moved to another stack TODAY", () => {
    // The same-day move prunes the old stack's span to nothing (it covered no
    // day), so the device's record of the move is an ABSENCE — and the pulled
    // pre-move span was adopted straight back, putting the compound in two
    // stacks. `dedupeMembership`'s same-day tie then went to the OLDER stack, so
    // the move was undone and the stack the user had just built was emptied.
    const oldStack = base({ id: "morning", name: "Morning", members: [
      { compoundId: "tren", from: "2026-07-10", position: 0 },
    ] })
    const pulledOld = base({ id: "morning", name: "Morning", members: [
      { compoundId: "tren", from: "2026-07-10", position: 0 },
      { compoundId: "creatine", from: "2026-07-10", position: 1 },
    ] })
    const merged = mergeStack(pulledOld, oldStack, new Set(["creatine"]))
    expect(currentMemberIds(merged)).toEqual(["tren"])
  })

  it("still adopts a genuinely unknown member", () => {
    const local = base({ members: [{ compoundId: "a", from: "2026-06-01", position: 0 }] })
    const pulled = base({ members: [
      { compoundId: "a", from: "2026-06-01", position: 0 },
      { compoundId: "unknown", from: "2026-06-05", position: 1 },
    ] })
    expect(currentMemberIds(mergeStack(pulled, local, new Set(["elsewhere"])))).toEqual([
      "a",
      "unknown",
    ])
  })
})

describe("adoptStart — correcting a migration guess", () => {
  const guessed = base({ effectiveFrom: "2026-08-01", provisionalStart: true })
  /** A span the v1 migration invented — the only kind adoptStart may move. */
  const invented = (compoundId: string, position: number): StackMembership => ({
    compoundId,
    from: "2026-08-01",
    position,
    provisionalFrom: true,
  })

  it("takes the server's earlier date, and pulls the guessed spans back with it", () => {
    // Moving the stack's gate alone leaves every recovered day with no members
    // in force, which renders exactly as if nothing had been corrected.
    const local: Stack = { ...guessed, members: [invented("a", 0)] }
    const out = adoptStart(local, base({ effectiveFrom: "2026-05-01" }))
    expect(out.effectiveFrom).toBe("2026-05-01")
    expect(memberIdsOn(out, "2026-06-15")).toEqual(["a"])
    expect(out.provisionalStart).toBeUndefined()
    expect(out.members[0].provisionalFrom).toBeUndefined()
  })

  it("leaves a member that genuinely joined after the guess alone", () => {
    const local: Stack = {
      ...guessed,
      members: [invented("a", 0), { compoundId: "later", from: "2026-08-05", position: 1 }],
    }
    const out = adoptStart(local, base({ effectiveFrom: "2026-05-01" }))
    expect(memberIdsOn(out, "2026-06-15")).toEqual(["a"])
    expect(memberIdsOn(out, "2026-08-05")).toEqual(["a", "later"])
  })

  it("leaves a member added ON the migration day alone — the date alone cannot tell", () => {
    // Adrian's original report, in the one place it could come back: a member
    // ticked in on the day the store was migrated carries the guessed date
    // HONESTLY, so back-dating it renders it on weeks before it joined.
    const local: Stack = {
      ...guessed,
      members: [invented("creatine", 0), { compoundId: "d3", from: "2026-08-01", position: 1 }],
    }
    const out = adoptStart(local, base({ effectiveFrom: "2026-05-01" }))
    expect(memberIdsOn(out, "2026-06-15")).toEqual(["creatine"])
    expect(memberIdsOn(out, "2026-08-01")).toEqual(["creatine", "d3"])
  })

  it("clears the flag even when the server's date is no earlier", () => {
    // Left set, the stack stays in the "omit effective_from" push batch forever
    // and the device could never mirror its own date up at all.
    const out = adoptStart(guessed, base({ effectiveFrom: "2026-09-01" }))
    expect(out.effectiveFrom).toBe("2026-08-01")
    expect(out.provisionalStart).toBeUndefined()
  })

  it("refuses a server date that is ITSELF a guess", () => {
    // A pre-013 pull invents dates from `created_at`. Trading one guess for
    // another is not a correction.
    const out = adoptStart(
      guessed,
      base({ effectiveFrom: "2026-05-01", provisionalStart: true })
    )
    expect(out.effectiveFrom).toBe("2026-08-01")
    expect(out.provisionalStart).toBe(true)
  })

  it("never touches a stack that knows its own start", () => {
    const known = base({ effectiveFrom: "2026-06-01" })
    expect(adoptStart(known, base({ effectiveFrom: "2026-01-01" }))).toBe(known)
  })
})

describe("placedElsewhere", () => {
  const s = (id: string, members: StackMembership[]): Stack => base({ id, members })

  it("names the compounds held OPEN in another stack", () => {
    const local = [
      s("a", [{ compoundId: "x", from: "2026-06-01", position: 0 }]),
      s("b", [{ compoundId: "y", from: "2026-06-01", position: 0 }]),
    ]
    expect(placedElsewhere(local, "a")).toEqual(new Set(["y"]))
    expect(placedElsewhere(local, "b")).toEqual(new Set(["x"]))
  })

  it("ignores closed spans — a compound that has LEFT is not placed anywhere", () => {
    const local = [
      s("a", []),
      s("b", [{ compoundId: "y", from: "2026-06-01", to: "2026-07-01", position: 0 }]),
    ]
    expect(placedElsewhere(local, "a")).toEqual(new Set())
  })

  it("never reports the target stack's own members", () => {
    const local = [s("a", [{ compoundId: "x", from: "2026-06-01", position: 0 }])]
    expect(placedElsewhere(local, "a")).toEqual(new Set())
  })
})

describe("mergeStack keeps history the device does not hold", () => {
  it("adopts a pulled CLOSED span even for a compound placed elsewhere now", () => {
    // The closed span says where the compound USED to be. It cannot conflict
    // with an open membership, and suppressing it dropped real past grouping
    // that the next push then deleted from Postgres too.
    const local = base({
      id: "a",
      effectiveFrom: "2026-01-01",
      members: [{ compoundId: "tren", from: "2026-01-01", position: 0 }],
    })
    const pulled = base({
      id: "a",
      effectiveFrom: "2026-01-01",
      members: [
        { compoundId: "tren", from: "2026-01-01", position: 0 },
        { compoundId: "creatine", from: "2026-01-01", to: "2026-06-01", position: 1 },
      ],
    })
    const merged = mergeStack(pulled, local, new Set(["creatine"]))
    expect(memberIdsOn(merged, "2026-03-01")).toEqual(["tren", "creatine"])
    expect(currentMemberIds(merged)).toEqual(["tren"])
  })

  it("routes through adoptStart, so a migration guess is actually corrected", () => {
    // adoptStart is tested in isolation; this is the only path that calls it.
    const local = base({
      effectiveFrom: "2026-08-01",
      provisionalStart: true,
      members: [{ compoundId: "a", from: "2026-08-01", position: 0, provisionalFrom: true }],
    })
    const merged = mergeStack(base({ effectiveFrom: "2026-05-01" }), local)
    expect(merged.effectiveFrom).toBe("2026-05-01")
    expect(memberIdsOn(merged, "2026-06-15")).toEqual(["a"])
  })
})
