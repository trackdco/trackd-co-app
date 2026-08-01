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
  it("the LATEST membership wins, and the loser's past is kept", () => {
    // Stacks are held in CREATION order everywhere (`upsertStack` appends,
    // `pullStacks` orders by created_at), so "whichever sorts first wins" handed
    // it to the oldest — undoing the user's most recent move, and emptying the
    // stack they had just built. The array order here is the real one.
    const stacks: Stack[] = [
      {
        id: "sOld",
        name: "Old",
        colour: "moss",
        effectiveFrom: "2026-01-01",
        members: [{ compoundId: "a", from: "2026-01-01", position: 0 }],
      },
      {
        id: "sNew",
        name: "New",
        colour: "teal",
        effectiveFrom: "2026-06-01",
        members: [{ compoundId: "a", from: "2026-06-01", position: 0 }],
      },
    ]
    saveStacks(USER, stacks)
    const [sOld, sNew] = loadStacks(USER)

    expect(currentMemberIds(sNew)).toEqual(["a"])
    expect(currentMemberIds(sOld)).toEqual([])
    // The five months it really was in "Old" are still there — closed, not deleted.
    expect(memberIdsOn(sOld, "2026-03-01")).toEqual(["a"])
    // And it is in exactly one stack on any given day.
    expect(memberIdsOn(sOld, "2026-07-01")).toEqual([])
    expect(memberIdsOn(sNew, "2026-07-01")).toEqual(["a"])
  })

  it("breaks a same-day tie deterministically, without deleting either past", () => {
    const stacks: Stack[] = [
      {
        id: "sA",
        name: "A",
        colour: "moss",
        effectiveFrom: "2026-06-01",
        members: [{ compoundId: "x", from: "2026-06-01", position: 0 }],
      },
      {
        id: "sB",
        name: "B",
        colour: "teal",
        effectiveFrom: "2026-06-01",
        members: [{ compoundId: "x", from: "2026-06-01", position: 0 }],
      },
    ]
    saveStacks(USER, stacks)
    const loaded = loadStacks(USER)
    const holders = loaded.filter((s) => currentMemberIds(s).includes("x"))
    // Exactly one, on every day, either way the tie falls.
    expect(holders).toHaveLength(1)
    for (const day of ["2026-06-01", "2026-07-01"]) {
      expect(loaded.filter((s) => memberIdsOn(s, day).includes("x"))).toHaveLength(1)
    }
  })
})

describe("the provisional start flag", () => {
  it("survives a store round-trip", () => {
    // It used to live only in the object `migrateLegacy` returned: the next
    // `loadStacks` saw a valid date, dropped the flag, and the next push wrote
    // the guess over the server's real `created_at`-derived date — destroying the
    // only accurate copy. Every consumer calls `loadStacks` directly, so "the
    // next read" is the very next thing that happens.
    freezeToday("2026-08-01")
    write(V1_KEY, [{ id: "s1", name: "V", colour: "teal", memberIds: ["a"] }])

    expect(loadStacks(USER)[0].provisionalStart).toBe(true)
    expect(loadStacks(USER)[0].provisionalStart).toBe(true)

    saveStacks(USER, loadStacks(USER))
    expect(loadStacks(USER)[0].provisionalStart).toBe(true)
  })

  it("is absent on a stack that knows its own start", () => {
    write(V2_KEY, [
      {
        id: "s1",
        name: "V",
        colour: "teal",
        effectiveFrom: "2026-07-01",
        members: [{ compoundId: "a", from: "2026-07-01", position: 0 }],
      },
    ])
    expect(loadStacks(USER)[0].provisionalStart).toBeUndefined()
  })
})

describe("impossible dates", () => {
  it("are not treated as dates", () => {
    // "2026-13-45" is the right SHAPE, passes every span comparison here (they
    // are string compares) and only fails at the database — on an insert that
    // runs after the membership wipe.
    freezeToday("2026-08-01")
    write(V2_KEY, [
      {
        id: "s1",
        name: "V",
        colour: "teal",
        effectiveFrom: "2026-13-45",
        members: [{ compoundId: "a", from: "2026-02-30", position: 0 }],
      },
    ])
    const [s] = loadStacks(USER)
    expect(s.effectiveFrom).toBe("2026-08-01")
    expect(s.members[0].from).toBe("2026-08-01")
  })
})
