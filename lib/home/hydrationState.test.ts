import { beforeEach, describe, expect, it } from "vitest"

import {
  getHydrationState,
  resetHydrationStates,
  setHydrationState,
} from "./hydrationState"

describe("hydration state", () => {
  beforeEach(() => resetHydrationStates())

  it("starts pending for a real account", () => {
    expect(getHydrationState("u1")).toBe("pending")
  })

  it("is never pending for an account with nothing to pull", () => {
    expect(getHydrationState("anon")).toBe("done")
    expect(getHydrationState("")).toBe("done")
  })

  it("keeps done once reached, so a failed re-sync cannot bring the skeleton back", () => {
    setHydrationState("u1", "done")
    setHydrationState("u1", "failed")
    expect(getHydrationState("u1")).toBe("done")
  })

  it("lets a late success replace a failure", () => {
    setHydrationState("u1", "failed")
    setHydrationState("u1", "done")
    expect(getHydrationState("u1")).toBe("done")
  })

  it("is per user", () => {
    setHydrationState("u1", "done")
    expect(getHydrationState("u2")).toBe("pending")
  })
})
