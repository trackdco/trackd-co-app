/**
 * Spec 05 · Stacks — the STORAGE half: normalising stored records, migrating the
 * pre-dating store, and the read-side repairs.
 *
 * Split from `stacks.test.ts` because it needs a `window` — every storage
 * function returns early on `typeof window === "undefined"`, and the suite runs
 * in the node environment (`vitest.config.ts`). A minimal in-memory
 * `localStorage` is enough; the alternative was leaving the whole storage half,
 * where the hostile-input handling lives, untested.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The store mirrors to Postgres on every write. These are server actions and
// irrelevant to what is under test, so they are stubbed rather than reached.
vi.mock("@/lib/home/stackSync", () => ({
  pushStacks: vi.fn(async () => ({ ok: true })),
}))
vi.mock("@/lib/home/syncStatus", () => ({
  trackCriticalSync: vi.fn(async () => {}),
  trackSync: vi.fn(async () => {}),
}))

import {
  currentMemberIds,
  loadStacks,
  memberIdsOn,
  saveStacks,
  type Stack,
} from "./stacks"

const USER = "u1"
const V1_KEY = `trackd.stacks.v1.${USER}`
const V2_KEY = `trackd.stacks.v2.${USER}`

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
  vi.stubGlobal("window", { localStorage: fakeStorage() })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** Pin "today" so a guessed start date is assertable. */
function freezeToday(dateKey: string) {
  vi.useFakeTimers()
  const [y, m, d] = dateKey.split("-").map(Number)
  vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0))
}

const write = (key: string, value: unknown) =>
  window.localStorage.setItem(key, JSON.stringify(value))

describe("migrating the pre-dating store", () => {
  it("dates a v1 stack to today and marks the date a guess", () => {
    freezeToday("2026-08-01")
    write(V1_KEY, [
      { id: "s1", name: "Vitamins", colour: "teal", memberIds: ["a", "b"] },
    ])

    const [s] = loadStacks(USER)
    expect(s.effectiveFrom).toBe("2026-08-01")
    // The whole point: it must NOT claim the days before it was migrated.
    expect(memberIdsOn(s, "2026-07-31")).toEqual([])
    expect(memberIdsOn(s, "2026-08-01")).toEqual(["a", "b"])
    // Flagged, so the guess is never pushed over the server's real created_at.
    expect(s.provisionalStart).toBe(true)
  })

  it("writes the migration through, so it happens once", () => {
    freezeToday("2026-08-01")
    write(V1_KEY, [{ id: "s1", name: "V", colour: "teal", memberIds: ["a"] }])
    loadStacks(USER)
    expect(window.localStorage.getItem(V2_KEY)).not.toBeNull()
    // v1 is deliberately left in place, so rolling back a deploy still finds it.
    expect(window.localStorage.getItem(V1_KEY)).not.toBeNull()
  })

  it("does not re-migrate once v2 exists, even if v2 is empty", () => {
    write(V1_KEY, [{ id: "s1", name: "V", colour: "teal", memberIds: ["a"] }])
    write(V2_KEY, [])
    expect(loadStacks(USER)).toEqual([])
  })

  it("survives garbage in either store", () => {
    window.localStorage.setItem(V1_KEY, "{not json")
    expect(loadStacks(USER)).toEqual([])
    window.localStorage.setItem(V2_KEY, "{not json")
    expect(loadStacks(USER)).toEqual([])
  })
})

describe("hostile stored records", () => {
  it("drops a membership whose end date is unusable, rather than reopening it", () => {
    // Reopening silently pulls a compound back into a stack it left — and
    // because an open span occupies the one-stack-per-compound slot, it then
    // disappears from every other stack's member picker with no visible cause.
    write(V2_KEY, [
      {
        id: "s1",
        name: "V",
        colour: "teal",
        effectiveFrom: "2026-07-01",
        members: [
          { compoundId: "ok", from: "2026-07-01", position: 0 },
          { compoundId: "bad", from: "2026-07-01", to: "not-a-date", position: 1 },
          { compoundId: "inverted", from: "2026-07-05", to: "2026-07-01", position: 2 },
        ],
      },
    ])
    const [s] = loadStacks(USER)
    expect(currentMemberIds(s)).toEqual(["ok"])
  })

  it("keeps a stack readable when a member entry is malformed", () => {
    write(V2_KEY, [
      {
        id: "s1",
        name: "V",
        colour: "teal",
        effectiveFrom: "2026-07-01",
        members: [null, 42, { from: "2026-07-01" }, { compoundId: "a", from: "2026-07-01", position: 0 }],
      },
    ])
    const [s] = loadStacks(USER)
    expect(currentMemberIds(s)).toEqual(["a"])
  })

  it("falls back to memberIds when a record carries both shapes and members is empty", () => {
    freezeToday("2026-08-01")
    write(V2_KEY, [
      { id: "s1", name: "V", colour: "teal", effectiveFrom: "2026-07-01", members: [], memberIds: ["a"] },
    ])
    const [s] = loadStacks(USER)
    expect(currentMemberIds(s)).toEqual(["a"])
  })

  it("treats a v2 record that lost its date as a guess, not as always-on", () => {
    freezeToday("2026-08-01")
    write(V2_KEY, [
      { id: "s1", name: "V", colour: "teal", members: [{ compoundId: "a", from: "2026-01-01", position: 0 }] },
    ])
    const [s] = loadStacks(USER)
    expect(s.provisionalStart).toBe(true)
    expect(memberIdsOn(s, "2026-01-15")).toEqual([])
  })

  it("rejects an unnamed or unidentifiable stack outright", () => {
    write(V2_KEY, [
      { id: "s1", name: "   ", colour: "teal", effectiveFrom: "2026-07-01", members: [] },
      { name: "no id", colour: "teal", effectiveFrom: "2026-07-01", members: [] },
    ])
    expect(loadStacks(USER)).toEqual([])
  })
})

describe("two stacks claiming the same compound", () => {
  it("ends the loser's span instead of deleting its history", () => {
    // Deleting it threw away however long that stack had legitimately grouped
    // the compound for.
    const stacks: Stack[] = [
      {
        id: "s1",
        name: "New",
        colour: "teal",
        effectiveFrom: "2026-06-01",
        members: [{ compoundId: "a", from: "2026-06-01", position: 0 }],
      },
      {
        id: "s2",
        name: "Old",
        colour: "moss",
        effectiveFrom: "2026-01-01",
        members: [{ compoundId: "a", from: "2026-01-01", position: 0 }],
      },
    ]
    saveStacks(USER, stacks)
    const [s1, s2] = loadStacks(USER)

    expect(currentMemberIds(s1)).toEqual(["a"])
    expect(currentMemberIds(s2)).toEqual([])
    // The five months it really was in "Old" are still there.
    expect(memberIdsOn(s2, "2026-03-01")).toEqual(["a"])
    // And it is in exactly one stack on any given day.
    expect(memberIdsOn(s2, "2026-07-01")).toEqual([])
    expect(memberIdsOn(s1, "2026-07-01")).toEqual(["a"])
  })
})
