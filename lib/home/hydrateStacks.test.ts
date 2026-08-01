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

import { adoptStart, mergeStack } from "./hydrateProtocol"
import { currentMemberIds, memberIdsOn, type Stack } from "./stacks"

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

describe("adoptStart — correcting a migration guess", () => {
  const guessed = base({ effectiveFrom: "2026-08-01", provisionalStart: true })
  const withMember = (s: Stack, from: string): Stack => ({
    ...s,
    members: [{ compoundId: "a", from, position: 0 }],
  })

  it("takes the server's earlier date, and pulls the guessed spans back with it", () => {
    // Moving the stack's gate alone leaves every recovered day with no members
    // in force, which renders exactly as if nothing had been corrected.
    const local = withMember(guessed, "2026-08-01")
    const pulled = base({ effectiveFrom: "2026-05-01" })
    const out = adoptStart(local, pulled)
    expect(out.effectiveFrom).toBe("2026-05-01")
    expect(memberIdsOn(out, "2026-06-15")).toEqual(["a"])
    expect(out.provisionalStart).toBeUndefined()
  })

  it("leaves a member that genuinely joined after the guess alone", () => {
    const local: Stack = {
      ...guessed,
      members: [
        { compoundId: "a", from: "2026-08-01", position: 0 },
        { compoundId: "later", from: "2026-08-05", position: 1 },
      ],
    }
    const out = adoptStart(local, base({ effectiveFrom: "2026-05-01" }))
    expect(memberIdsOn(out, "2026-06-15")).toEqual(["a"])
    expect(memberIdsOn(out, "2026-08-05")).toEqual(["a", "later"])
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
