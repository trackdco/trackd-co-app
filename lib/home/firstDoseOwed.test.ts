import { afterEach, describe, expect, it, vi } from "vitest"

import { celebrated, markCelebrated } from "@/lib/home/firstRun"
import {
  firstDoseOwed,
  oweFirstDose,
  owedFirstDoseAction,
  settleFirstDose,
} from "@/lib/home/firstDoseOwed"

function stubStorage() {
  const local = new Map<string, string>()
  const session = new Map<string, string>()
  const api = (m: Map<string, string>) => ({
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  })
  vi.stubGlobal("window", { localStorage: api(local), sessionStorage: api(session) })
}

const base = { owed: true, timerPending: false, hydrated: true, celebrated: false, anyLog: true }

describe("owedFirstDoseAction", () => {
  it("opens an owed pop-up once the history has settled and the dose is still there", () => {
    expect(owedFirstDoseAction(base)).toBe("open")
  })
  it("does nothing when nothing is owed, the timer is running, or the history is loading", () => {
    expect(owedFirstDoseAction({ ...base, owed: false })).toBe("none")
    expect(owedFirstDoseAction({ ...base, timerPending: true })).toBe("none")
    expect(owedFirstDoseAction({ ...base, hydrated: false, anyLog: false })).toBe("none")
  })
  it("drops it once seen, or when that first dose was unticked", () => {
    expect(owedFirstDoseAction({ ...base, celebrated: true })).toBe("drop")
    expect(owedFirstDoseAction({ ...base, anyLog: false })).toBe("drop")
  })
})

describe("B36: First Dose is marked celebrated only when it opens", () => {
  afterEach(() => vi.unstubAllGlobals())

  /*
   * Cold bug review B36: HomeScreen marked the moment celebrated, then opened
   * the pop-up 420ms later on a timer it never cleared. Leaving Home inside the
   * 420ms lost the pop-up for good. Now the first dose OWES it, the timer
   * settles and marks it as it opens, and a Home that unmounted first opens it
   * on the next visit. This walks HomeScreen's sequence through the helpers.
   */
  it("a Home left inside the 420ms still owes the pop-up on the next visit", () => {
    stubStorage()
    // The first dose: owed, timer started, NOT yet celebrated.
    oweFirstDose("u1")
    expect(celebrated("u1")).toBe(false)
    // Home unmounts; the timer is cleared before it fires. Next visit:
    expect(
      owedFirstDoseAction({
        owed: firstDoseOwed("u1"),
        timerPending: false,
        hydrated: true,
        celebrated: celebrated("u1"),
        anyLog: true,
      }),
    ).toBe("open")
    // The timer fires on this visit: settle, mark, open.
    settleFirstDose("u1")
    markCelebrated("u1")
    expect(firstDoseOwed("u1")).toBe(false)
    expect(celebrated("u1")).toBe(true)
    // And it never opens again.
    expect(
      owedFirstDoseAction({
        owed: firstDoseOwed("u1"),
        timerPending: false,
        hydrated: true,
        celebrated: celebrated("u1"),
        anyLog: true,
      }),
    ).toBe("none")
  })

  it("is per person", () => {
    stubStorage()
    oweFirstDose("u1")
    expect(firstDoseOwed("u1")).toBe(true)
    expect(firstDoseOwed("u2")).toBe(false)
  })

  it("never throws when storage does", () => {
    const boom = () => {
      throw new Error("blocked")
    }
    vi.stubGlobal("window", { sessionStorage: { getItem: boom, setItem: boom, removeItem: boom } })
    expect(() => oweFirstDose("u1")).not.toThrow()
    expect(firstDoseOwed("u1")).toBe(false)
    expect(() => settleFirstDose("u1")).not.toThrow()
  })
})
