import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { dismissToast, getToast, showToast, subscribeToast, TOAST_MS, undoToast } from "./toast"

describe("the bottom toast", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    dismissToast()
    vi.useRealTimers()
  })

  it("shows one line and clears itself", () => {
    showToast("Saved")
    expect(getToast()?.text).toBe("Saved")
    expect(getToast()?.undo).toBeUndefined()
    vi.advanceTimersByTime(TOAST_MS.plain)
    expect(getToast()).toBeNull()
  })

  it("keeps an Undo toast up for 3s", () => {
    showToast("Unticked", { undo: () => {} })
    vi.advanceTimersByTime(TOAST_MS.undo - 1)
    expect(getToast()?.text).toBe("Unticked")
    vi.advanceTimersByTime(1)
    expect(getToast()).toBeNull()
  })

  it("runs Undo once and closes", () => {
    const undo = vi.fn()
    showToast("Unticked", { undo })
    undoToast()
    undoToast()
    expect(undo).toHaveBeenCalledTimes(1)
    expect(getToast()).toBeNull()
  })

  it("a new toast replaces the last, and takes its Undo with it", () => {
    const first = vi.fn()
    showToast("Unticked", { undo: first })
    showToast("Saved")
    undoToast()
    expect(first).not.toHaveBeenCalled()
  })

  it("re-announces the same words", () => {
    showToast("Saved")
    const a = getToast()?.id
    showToast("Saved")
    expect(getToast()?.id).not.toBe(a)
  })

  it("tells subscribers", () => {
    const l = vi.fn()
    const off = subscribeToast(l)
    showToast("Paused")
    expect(l).toHaveBeenCalled()
    off()
  })
})
