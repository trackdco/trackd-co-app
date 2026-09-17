import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * A FAILED FIRST PULL SAYS SO, AND SAYS IT WAS A READ (feel pass §1).
 *
 * Home stops showing its skeleton when hydration fails and falls back to what the
 * device has. On a fresh device that is nothing, so the notice is the only thing
 * standing between "we couldn't reach your account" and "you have no protocol".
 * It fires offline too (the brief asks for it there), and it carries its kind so
 * the notice does not claim a read "saved on your device".
 *
 * A fresh module and a stub `window` per test, for the reasons
 * `syncStatusRefusal.test.ts` gives.
 */

async function freshModule() {
  vi.resetModules()
  const target = new EventTarget()
  vi.stubGlobal("window", target)
  const mod = await import("./syncStatus")
  const kinds: string[] = []
  mod.subscribeSyncFailed((kind) => kinds.push(kind))
  return { mod, kinds }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("notifyHydrationFailed", () => {
  it("fires a pull failure while online", async () => {
    vi.stubGlobal("navigator", { onLine: true })
    const { mod, kinds } = await freshModule()
    mod.notifyHydrationFailed()
    expect(kinds).toEqual(["pull"])
  })

  it("fires while offline too", async () => {
    vi.stubGlobal("navigator", { onLine: false })
    const { mod, kinds } = await freshModule()
    mod.notifyHydrationFailed()
    expect(kinds).toEqual(["pull"])
  })

  it("shares the once-a-minute cooldown, so a patience timeout and a late failure show one notice", async () => {
    vi.stubGlobal("navigator", { onLine: true })
    const { mod, kinds } = await freshModule()
    mod.notifyHydrationFailed()
    mod.notifyHydrationFailed()
    expect(kinds).toEqual(["pull"])
  })
})
