/**
 * Stacks: a second "Morning" is saved as "Morning (2)" on its own (Adrian's
 * walk, W22), and "No colour" draws each compound in its own look (W23).
 *
 * The pure rules first, then the store, which applies them on every save
 * (so no screen can skip them), with the minimal `window` the storage half
 * needs (as `stacksStorage.test.ts` does).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/home/stackSync", () => ({
  pushStacks: vi.fn(async () => ({ ok: true })),
}))
vi.mock("@/lib/home/syncStatus", () => ({
  trackCriticalSync: vi.fn(async () => {}),
  trackSync: vi.fn(async () => {}),
}))

import {
  STACK_NAME_MAX,
  loadStacks,
  restoreStack,
  deleteStack,
  stackColourVar,
  stackNameToSave,
  uniqueStackName,
  upsertStack,
  type Stack,
} from "./stacks"
import { mergeStack } from "./hydrateProtocol"
import { pushStacks } from "@/lib/home/stackSync"

const MADE = "2026-07-10"
const stack = (id: string, name: string, ids: string[] = ["x"], over: Partial<Stack> = {}): Stack => ({
  id,
  name,
  colour: "teal",
  effectiveFrom: MADE,
  members: ids.map((compoundId, position) => ({ compoundId, from: MADE, position })),
  ...over,
})

describe("uniqueStackName (W22)", () => {
  it("keeps a name nobody else has", () => {
    expect(uniqueStackName("Morning", [stack("a", "Evening")])).toBe("Morning")
    expect(uniqueStackName("Morning", [])).toBe("Morning")
  })

  it("numbers a second one (2), then (3), and so on", () => {
    const one = [stack("a", "Morning")]
    expect(uniqueStackName("Morning", one)).toBe("Morning (2)")
    const two = [...one, stack("b", "Morning (2)")]
    expect(uniqueStackName("Morning", two)).toBe("Morning (3)")
    const three = [...two, stack("c", "Morning (3)")]
    expect(uniqueStackName("Morning", three)).toBe("Morning (4)")
  })

  it("reuses the lowest free number", () => {
    const gap = [stack("a", "Morning"), stack("c", "Morning (3)")]
    expect(uniqueStackName("Morning", gap)).toBe("Morning (2)")
  })

  it("is blind to case and to spaces round the name, and keeps the user's casing", () => {
    const one = [stack("a", "Morning")]
    expect(uniqueStackName("morning", one)).toBe("morning (2)")
    expect(uniqueStackName("  Morning  ", one)).toBe("Morning (2)")
  })

  it("counts on from the stem when the name typed already carries a number", () => {
    const both = [stack("a", "Morning"), stack("b", "Morning (2)")]
    expect(uniqueStackName("Morning (2)", both)).toBe("Morning (3)")
    expect(uniqueStackName("Morning (2)", [stack("a", "Morning")])).toBe("Morning (2)")
  })

  it("never clashes with the stack being renamed", () => {
    const one = [stack("a", "Morning")]
    expect(uniqueStackName("Morning", one, "a")).toBe("Morning")
  })

  it("ignores a stack kept only for its history (no current members)", () => {
    const over = stack("a", "Morning", [])
    expect(uniqueStackName("Morning", [over])).toBe("Morning")
  })

  it("stays within the limit, cutting the stem and never the number", () => {
    const long = "M".repeat(STACK_NAME_MAX)
    const out = uniqueStackName(long, [stack("a", long)])
    expect(out.length).toBeLessThanOrEqual(STACK_NAME_MAX)
    expect(out.endsWith(" (2)")).toBe(true)
  })
})

describe("stackNameToSave: renaming follows the rule (W22)", () => {
  const two = [stack("a", "Morning"), stack("b", "Evening")]

  it("a rename onto another stack's name is numbered", () => {
    expect(stackNameToSave("Morning", two, "b")).toBe("Morning (2)")
  })

  it("an unchanged name is kept as it is, even a duplicate from before the rule", () => {
    const dupes = [stack("a", "Morning"), stack("b", "Morning")]
    expect(stackNameToSave("Morning", dupes, "b")).toBe("Morning")
  })

  it("a new stack (no id in the list yet) follows the rule", () => {
    expect(stackNameToSave("Morning", two, "")).toBe("Morning (2)")
  })
})

describe("stackColourVar (W23)", () => {
  it("is the palette token for a coloured stack and null for No colour", () => {
    expect(stackColourVar({ colour: "teal" })).toBe("var(--palette-teal)")
    expect(stackColourVar({ colour: "teal", plain: true })).toBeNull()
  })
})

/* ------------------------------------------------------------- the store */

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

const USER = "u-naming"

describe("the store applies both rules on every save", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: fakeStorage(), dispatchEvent: () => true })
    vi.stubGlobal("CustomEvent", class { constructor(public type: string) {} })
    vi.mocked(pushStacks).mockClear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const byId = (id: string) => loadStacks(USER).find((s) => s.id === id)!

  it("a second Morning is saved as Morning (2), a third as Morning (3)", () => {
    upsertStack(USER, { id: "a", name: "Morning", colour: "teal", memberIds: ["x"] })
    upsertStack(USER, { id: "b", name: "Morning", colour: "moss", memberIds: ["y"] })
    upsertStack(USER, { id: "c", name: "Morning", colour: "clay", memberIds: ["z"] })
    expect([byId("a").name, byId("b").name, byId("c").name]).toEqual(["Morning", "Morning (2)", "Morning (3)"])
  })

  it("renaming onto a taken name numbers it; saving without renaming does not", () => {
    upsertStack(USER, { id: "a", name: "Morning", colour: "teal", memberIds: ["x"] })
    upsertStack(USER, { id: "b", name: "Evening", colour: "moss", memberIds: ["y"] })
    upsertStack(USER, { id: "b", name: "Morning", colour: "moss", memberIds: ["y"] })
    expect(byId("b").name).toBe("Morning (2)")
    upsertStack(USER, { id: "b", name: "Morning (2)", colour: "clay", memberIds: ["y"] })
    expect(byId("b").name).toBe("Morning (2)")
    expect(byId("b").colour).toBe("clay")
  })

  it("No colour is kept on the device, and the mirror still gets a real palette colour", () => {
    upsertStack(USER, { id: "a", name: "Morning", colour: "moss", memberIds: ["x"], plain: true })
    const saved = byId("a")
    expect(saved.plain).toBe(true)
    expect(saved.colour).toBe("moss")
    // Read back through the normaliser: not dropped on the next load.
    expect(loadStacks(USER)[0].plain).toBe(true)
    // The Postgres mirror sends the palette name, which its CHECK accepts.
    const pushed = vi.mocked(pushStacks).mock.calls.at(-1)![0] as Stack[]
    expect(pushed[0].colour).toBe("moss")
  })

  it("picking a colour again clears No colour, and the record is as it always was", () => {
    upsertStack(USER, { id: "a", name: "Morning", colour: "moss", memberIds: ["x"], plain: true })
    upsertStack(USER, { id: "a", name: "Morning", colour: "teal", memberIds: ["x"] })
    expect("plain" in byId("a")).toBe(false)
    expect(byId("a").colour).toBe("teal")
  })

  it("Undo after a delete brings No colour back with the stack", () => {
    upsertStack(USER, { id: "a", name: "Morning", colour: "moss", memberIds: ["x"], plain: true })
    const before = byId("a")
    deleteStack(USER, "a")
    expect(restoreStack(USER, before)).toEqual({ ok: true })
    expect(byId("a").plain).toBe(true)
  })

  it("a sync from the server keeps the device's No colour (the merge builds on the local stack)", () => {
    const local = stack("a", "Morning", ["x"], { plain: true })
    const pulled = stack("a", "Morning", ["x"])
    expect(mergeStack(pulled, local).plain).toBe(true)
  })
})
