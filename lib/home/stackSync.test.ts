/**
 * Stacks ⇄ Postgres — the mirror.
 *
 * This file is worth testing more than most: `pushStacks` DELETES every
 * `stack_members` row for the user and then re-inserts, so a mistake here empties
 * the only durable record of what past days looked like. Four cold-review rounds
 * found four separate ways to do exactly that, and each guard added in response
 * was invisible to the suite — every one could be deleted with the tests still
 * green. These pin them.
 *
 * The Supabase client is faked rather than reached. The fake is deliberately
 * dumb: it records the calls in order and returns whatever error the test asks
 * for, so what is under test is this file's ORDERING and payloads, not PostgREST.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const USER = "00000000-0000-4000-8000-000000000001"

type Call = { table: string; op: string; payload?: unknown }
let calls: Call[]
/** `${table}.${op}` → the error to return, once. */
let failures: Record<string, { code?: string } | undefined>
let selectResult: { data: unknown; error: { code?: string } | null }
let idMap: Record<string, string>

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => fakeClient(),
}))
vi.mock("@/lib/home/protocolSync", () => ({
  resolveProtocolCompoundIds: async () => idMap,
}))

import { pullStacks, pushStacks } from "./stackSync"
import type { Stack } from "./stacks"

/** A thenable query builder: every chained method returns itself, and awaiting
 *  it yields the configured result. Matches how the real client is used here. */
function builder(table: string, op: string, payload?: unknown) {
  calls.push({ table, op, payload })
  const key = `${table}.${op}`
  const result = () => {
    const error = failures[key]
    if (error) {
      failures[key] = undefined // one-shot, so a retry can succeed
      return { data: null, error }
    }
    return op === "select" ? selectResult : { data: null, error: null }
  }
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  }
  for (const m of ["eq", "not", "order", "limit", "select"]) {
    chain[m] = () => chain
  }
  return chain
}

function fakeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
    from: (table: string) => ({
      delete: () => builder(table, "delete"),
      insert: (rows: unknown) => builder(table, "insert", rows),
      upsert: (rows: unknown) => builder(table, "upsert", rows),
      select: () => builder(table, "select"),
    }),
  }
}

beforeEach(() => {
  calls = []
  failures = {}
  selectResult = { data: [], error: null }
  idMap = { a: "pc-a", b: "pc-b" }
})

const stack = (over: Partial<Stack> = {}): Stack => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Vitamins",
  colour: "teal",
  effectiveFrom: "2026-06-01",
  members: [{ compoundId: "a", from: "2026-06-01", position: 0 }],
  ...over,
})

const opsOn = (table: string) => calls.filter((c) => c.table === table).map((c) => c.op)
const payloadOf = (table: string, op: string) =>
  calls.find((c) => c.table === table && c.op === op)?.payload as
    | Record<string, unknown>[]
    | undefined

describe("refusing to clear what it cannot rebuild", () => {
  it("touches nothing when no member resolves", () => {
    // `resolveProtocolCompoundIds` swallows its own failures and returns {}, so
    // one blip on that lookup used to wipe every membership row and return
    // early — after the delete, with nothing to put back.
    idMap = {}
    return pushStacks([stack()]).then((r) => {
      expect(r.ok).toBe(false)
      expect(calls).toEqual([])
    })
  })

  it("still clears when the user genuinely has no members left", () => {
    // A stack whose last member was deleted is a real state, not a failure.
    return pushStacks([stack({ members: [] })]).then(() => {
      expect(opsOn("stack_members")).toContain("delete")
    })
  })

  it("builds the replacement before issuing any delete", () => {
    return pushStacks([stack()]).then(() => {
      expect(opsOn("stacks")).toEqual(["delete", "upsert"])
      expect(opsOn("stack_members")).toEqual(["delete", "insert"])
    })
  })
})

describe("what reaches the wire", () => {
  it("sends each span with its dates", () => {
    const s = stack({
      members: [
        { compoundId: "a", from: "2026-06-01", to: "2026-07-01", position: 0 },
        { compoundId: "b", from: "2026-07-01", position: 1 },
      ],
    })
    return pushStacks([s]).then(() => {
      expect(payloadOf("stack_members", "insert")).toEqual([
        expect.objectContaining({
          protocol_compound_id: "pc-a",
          effective_from: "2026-06-01",
          effective_to: "2026-07-01",
        }),
        expect.objectContaining({
          protocol_compound_id: "pc-b",
          effective_from: "2026-07-01",
          effective_to: null,
        }),
      ])
    })
  })

  it("drops a span that ends on or before it starts", () => {
    // It fails `stack_members_span_valid` at the database — on an insert that
    // runs after the membership delete, so the mirror would stay empty and do it
    // again on every push.
    const s = stack({
      members: [
        { compoundId: "a", from: "2026-06-01", to: "2026-06-01", position: 0 },
        { compoundId: "b", from: "2026-06-01", position: 1 },
      ],
    })
    return pushStacks([s]).then(() => {
      expect(payloadOf("stack_members", "insert")).toHaveLength(1)
      expect(payloadOf("stack_members", "insert")?.[0].protocol_compound_id).toBe("pc-b")
    })
  })

  it("collapses two client ids that resolve to one row, for OPEN spans only", () => {
    // Two open spans for one row violate the partial unique index, and the
    // delete has already run — that one collision would wipe every stack.
    idMap = { a: "pc-x", b: "pc-x" }
    const s = stack({
      members: [
        { compoundId: "a", from: "2026-06-01", position: 0 },
        { compoundId: "b", from: "2026-06-01", position: 1 },
      ],
    })
    return pushStacks([s]).then(() => {
      expect(payloadOf("stack_members", "insert")).toHaveLength(1)
    })
  })

  it("omits effective_from for a stack whose start date is only a guess", () => {
    // PostgREST writes only the columns the payload carries, so leaving it out
    // preserves the server's real `created_at`-derived date — the thing the
    // guess exists to be corrected by.
    return pushStacks([stack({ provisionalStart: true })]).then(() => {
      const payload = payloadOf("stacks", "upsert")
      expect(payload?.[0]).not.toHaveProperty("effective_from")
    })
  })

  it("sends effective_from for a stack that knows its own start", () => {
    return pushStacks([stack()]).then(() => {
      expect(payloadOf("stacks", "upsert")?.[0].effective_from).toBe("2026-06-01")
    })
  })
})

describe("a database without 013", () => {
  it("retries the stack upsert without the dating column", () => {
    failures["stacks.upsert"] = { code: "PGRST204" }
    return pushStacks([stack()]).then((r) => {
      expect(r.ok).toBe(true)
      const upserts = calls.filter((c) => c.table === "stacks" && c.op === "upsert")
      expect(upserts).toHaveLength(2)
      expect(upserts[1].payload).toEqual([expect.not.objectContaining({ effective_from: expect.anything() })])
    })
  })

  it("retries the membership insert with the OPEN spans only", () => {
    // Before 013 the key is (stack_id, protocol_compound_id) with no partial
    // predicate, so a compound that has ever moved stacks collapses onto one key
    // and the insert dies 23505 — after the wipe, and identically on every retry.
    failures["stack_members.insert"] = { code: "PGRST204" }
    const s = stack({
      members: [
        { compoundId: "a", from: "2026-06-01", to: "2026-07-01", position: 0 },
        { compoundId: "a", from: "2026-07-01", position: 1 },
      ],
    })
    return pushStacks([s]).then((r) => {
      expect(r.ok).toBe(true)
      const inserts = calls.filter((c) => c.table === "stack_members" && c.op === "insert")
      expect(inserts).toHaveLength(2)
      const retried = inserts[1].payload as Record<string, unknown>[]
      expect(retried).toHaveLength(1)
      // Dates stripped: the old schema has nowhere to put them, and sending them
      // would write a closed span back as a CURRENT member.
      expect(retried[0]).not.toHaveProperty("effective_from")
      expect(retried[0]).not.toHaveProperty("effective_to")
    })
  })

  it("marks an undated pull provisional, so hydration keeps the device's dating", () => {
    selectResult = { data: null, error: { code: "42703" } }
    const undated = [
      {
        id: "s1",
        name: "V",
        colour: "teal",
        created_at: "2026-05-01T10:00:00Z",
        stack_members: [{ protocol_compound_id: "pc-a", position: 0 }],
      },
    ]
    return pullStacks()
      .then((first) => {
        // The retry runs against the same fake; feed it the undated shape.
        expect(first).toEqual([])
        selectResult = { data: undated, error: null }
        failures["stacks.select"] = { code: "42703" }
        return pullStacks()
      })
      .then((out) => {
        expect(out).toHaveLength(1)
        expect(out[0].provisionalStart).toBe(true)
        expect(out[0].effectiveFrom).toBe("2026-05-01")
        expect(out[0].members[0]).toMatchObject({ compoundId: "pc-a", from: "2026-05-01" })
        expect(out[0].members[0].to).toBeUndefined()
      })
  })

  it("does not mark a DATED pull provisional", () => {
    selectResult = {
      data: [
        {
          id: "s1",
          name: "V",
          colour: "teal",
          effective_from: "2026-05-01",
          created_at: "2026-05-01T10:00:00Z",
          stack_members: [
            {
              protocol_compound_id: "pc-a",
              position: 0,
              effective_from: "2026-05-10",
              effective_to: "2026-06-01",
            },
          ],
        },
      ],
      error: null,
    }
    return pullStacks().then((out) => {
      expect(out[0].provisionalStart).toBeUndefined()
      expect(out[0].members[0]).toMatchObject({ from: "2026-05-10", to: "2026-06-01" })
    })
  })
})

describe("the honest success signal", () => {
  it("reports failure when a CURRENT member could not be resolved", () => {
    idMap = { a: "pc-a" }
    const s = stack({
      members: [
        { compoundId: "a", from: "2026-06-01", position: 0 },
        { compoundId: "unmigrated", from: "2026-06-01", position: 1 },
      ],
    })
    return pushStacks([s]).then((r) => expect(r.ok).toBe(false))
  })

  it("does NOT fail over a PAST member that can never resolve again", () => {
    // Retrying cannot fix it, so counting it would pin the mirror to a failure
    // and show a sync-failed notice after every single stack edit, forever.
    idMap = { a: "pc-a" }
    const s = stack({
      members: [
        { compoundId: "a", from: "2026-06-01", position: 0 },
        { compoundId: "gone", from: "2026-01-01", to: "2026-02-01", position: 1 },
      ],
    })
    return pushStacks([s]).then((r) => expect(r.ok).toBe(true))
  })
})
