import { describe, expect, it } from "vitest"

import {
  PRESS_DELAY_MS,
  PRESS_HOLD_MS,
  PRESS_SELECTOR,
  movedPastSlop,
  pressDelayFor,
  releaseDelay,
  variantOf,
} from "./press"

describe("press timing", () => {
  it("presses keys, ticks, text, icons, tabs, the FAB, pills and fields at once", () => {
    for (const v of ["key", "tick", "text", "icon", "tab", "fab", "pill", "field"] as const) {
      expect(pressDelayFor(v)).toBe(0)
    }
  })

  it("makes rows, cards, buttons and week days wait, so a scroll does not flash them", () => {
    for (const v of ["row", "card", "button", "day"] as const) {
      expect(pressDelayFor(v)).toBe(PRESS_DELAY_MS)
    }
  })

  it("holds a quick tap for the rest of the minimum", () => {
    expect(releaseDelay(1000, 1030)).toBe(PRESS_HOLD_MS - 30)
  })

  it("releases a long press at once", () => {
    expect(releaseDelay(1000, 1500)).toBe(0)
  })

  it("treats more than 10px of travel as a scroll", () => {
    expect(movedPastSlop(6, 8)).toBe(false) // exactly 10
    expect(movedPastSlop(8, 7)).toBe(true)
  })
})

describe("press classes", () => {
  it("reads the variant off a class list", () => {
    expect(variantOf(["flex", "press-card", "rounded-2xl"])).toBe("card")
    expect(variantOf(["press-row-part"])).toBeNull()
    expect(variantOf(["pressed", "express-lane"])).toBeNull()
  })

  it("selects every variant and the row part", () => {
    expect(PRESS_SELECTOR).toContain(".press-key")
    expect(PRESS_SELECTOR).toContain(".press-row-part")
  })
})
