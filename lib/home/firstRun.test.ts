import { afterEach, describe, expect, it, vi } from "vitest"

import type { DayLogs } from "@/lib/home/doseLog"

import { bubbleSeen, celebrated, hasAnyLog, markBubbleSeen, markCelebrated } from "./firstRun"

describe("hasAnyLog", () => {
  it("is false for an empty log, and for days left empty", () => {
    expect(hasAnyLog({})).toBe(false)
    expect(hasAnyLog({ "2026-09-26": {} } as unknown as DayLogs)).toBe(false)
  })
  it("is true once any day holds a dose", () => {
    const logs = { "2026-09-20": {}, "2026-09-26": { "abc#0": { time24: "08:00" } } } as unknown as DayLogs
    expect(hasAnyLog(logs)).toBe(true)
  })
})

describe("the device flags", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("remember what was seen, per person", () => {
    const store = new Map<string, string>()
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    })
    expect(bubbleSeen("u1")).toBe(false)
    markBubbleSeen("u1")
    expect(bubbleSeen("u1")).toBe(true)
    expect(bubbleSeen("u2")).toBe(false)
    expect(celebrated("u1")).toBe(false)
    markCelebrated("u1")
    expect(celebrated("u1")).toBe(true)
  })

  it("never throw when storage does", () => {
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
    expect(bubbleSeen("u1")).toBe(false)
    expect(() => markCelebrated("u1")).not.toThrow()
  })
})
