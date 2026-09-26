import { describe, expect, it } from "vitest"

import {
  FOCUSABLE,
  focusHandoff,
  isOverSheet,
  OVER_SHEET,
  SHEET_CONTENT,
  tabWrap,
  topOpenSheet,
  trapTab,
  windowFrame,
} from "./overlay"

/** A stand-in for a sheet's content element: only its `data-state` matters. */
const sheet = (state: "open" | "closed" | null, name = "") => ({
  name,
  getAttribute: (n: string) => (n === "data-state" ? state : null),
})

describe("where a toast or a pop-up renders while sheets are up (B10, B36)", () => {
  it("renders on the page when no sheet is open", () => {
    expect(topOpenSheet([])).toBeNull()
  })

  it("renders inside the one open sheet", () => {
    const s = sheet("open", "compound")
    expect(topOpenSheet([s])).toBe(s)
  })

  it("renders inside the TOP sheet when a sheet opened another (the later one in the document)", () => {
    const under = sheet("open", "day")
    const top = sheet("open", "log")
    expect(topOpenSheet([under, top])?.name).toBe("log")
  })

  it("leaves a sheet the moment it starts to close", () => {
    expect(topOpenSheet([sheet("closed")])).toBeNull()
    // Closing the top one hands it to the one underneath.
    const under = sheet("open", "day")
    expect(topOpenSheet([under, sheet("closed", "log")])).toBe(under)
  })

  it("waits for the top sheet to land before moving in, so a toast never rides the slide", () => {
    const rising = sheet("open", "rising")
    const under = sheet("open", "under")
    expect(topOpenSheet([under, rising], (s) => s.name !== "rising")).toBeNull()
    expect(topOpenSheet([under, rising], () => true)).toBe(rising)
  })

  it("names the sheet the protected primitive renders", () => {
    expect(SHEET_CONTENT).toBe('[data-slot="sheet-content"]')
  })
})

describe("Tab inside a pop-up (B36)", () => {
  it("walks forward and wraps from the last to the first", () => {
    expect(trapTab(3, 0, false)).toBe(1)
    expect(trapTab(3, 1, false)).toBe(2)
    expect(trapTab(3, 2, false)).toBe(0)
  })

  it("walks back and wraps from the first to the last", () => {
    expect(trapTab(3, 2, true)).toBe(1)
    expect(trapTab(3, 0, true)).toBe(2)
  })

  it("brings focus that is outside the card back in at the right end", () => {
    expect(trapTab(2, -1, false)).toBe(0)
    expect(trapTab(2, -1, true)).toBe(1)
  })

  it("stays on the one control when there is only one (First Dose Logged's Done)", () => {
    expect(trapTab(1, 0, false)).toBe(0)
    expect(trapTab(1, 0, true)).toBe(0)
  })

  it("holds focus on the card when it has nothing to land on", () => {
    expect(trapTab(0, -1, false)).toBe(-1)
  })

  it("skips what cannot take focus", () => {
    expect(FOCUSABLE).toContain("button:not([disabled])")
    expect(FOCUSABLE).toContain('[tabindex]:not([tabindex="-1"])')
    expect(FOCUSABLE).toContain('input:not([disabled]):not([type="hidden"])')
  })
})

describe("Tab at the edge of a sheet, from the toast the sheet's trap cannot hear (B10 round two)", () => {
  it("wraps forward from the last control to the first, as the sheet's own trap does", () => {
    expect(tabWrap(4, 3, false)).toBe(0)
  })

  it("wraps back from the first to the last", () => {
    expect(tabWrap(4, 0, true)).toBe(3)
  })

  it("leaves every other Tab to the browser, whose order inside the sheet is right", () => {
    expect(tabWrap(4, 1, false)).toBeNull()
    expect(tabWrap(4, 2, true)).toBeNull()
    expect(tabWrap(4, 3, true)).toBeNull()
    expect(tabWrap(4, 0, false)).toBeNull()
  })

  it("does nothing when focus is not on one of the sheet's controls, or there are none", () => {
    expect(tabWrap(4, -1, false)).toBeNull()
    expect(tabWrap(0, -1, false)).toBeNull()
  })
})

describe("a tap on the toast or the first-dose card is not a tap outside the sheet (B36 round two)", () => {
  /** A stand-in target that sits inside an element matching one of `hits`. */
  const inside = (...hits: string[]) => ({
    closest: (sel: string) => (sel.split(",").some((part) => hits.includes(part.trim())) ? {} : null),
  })

  it("exempts the toast and anything marked as over the sheet", () => {
    expect(OVER_SHEET).toContain("[data-toast]")
    expect(OVER_SHEET).toContain("[data-over-sheet]")
    expect(isOverSheet(inside("[data-toast]"))).toBe(true)
    expect(isOverSheet(inside("[data-over-sheet]"))).toBe(true)
  })

  it("still lets a real tap outside close the sheet", () => {
    expect(isOverSheet(inside())).toBe(false)
    expect(isOverSheet(null)).toBe(false)
    // A text node or a window has no `closest`.
    expect(isOverSheet({})).toBe(false)
  })
})

describe("where focus goes as a close arrow hides (S4 round two)", () => {
  const ok = (el: string) => !el.startsWith("x")

  it("goes back to what opened the panel while that can take focus", () => {
    expect(focusHandoff("tile", ok, ["save"], ["other"], ["twin"])).toBe("tile")
  })

  it("then to the twin in the arrow's own spot", () => {
    expect(focusHandoff("x-gone", ok, ["save"], ["other"], ["twin"])).toBe("twin")
    expect(focusHandoff(null, ok, ["save"], ["other"], ["twin"])).toBe("twin")
  })

  it("then the next control after it (the journal's reopen line, drawn afresh), then the one before", () => {
    expect(focusHandoff(null, ok, ["x-inert", "reopen"], ["first", "card"])).toBe("reopen")
    expect(focusHandoff(null, ok, ["x-a", "x-b"], ["first", "card", "x-hidden"])).toBe("card")
  })

  it("gives up only when nothing can take focus", () => {
    expect(focusHandoff("x", ok, ["x1"], ["x2"], ["x3"])).toBeNull()
  })
})

describe("a layer rendered into a sheet still covers the window (B10 round two, desktop dialog)", () => {
  const phone = { left: 0, top: 0, width: 390, height: 844 }
  const laptop = { left: 0, top: 0, width: 1425, height: 900 }

  it("leaves the frame alone on a phone sheet, where a fixed probe inside is already the window", () => {
    expect(windowFrame(phone, phone)).toBeNull()
    // Sub-pixel noise is still the same box.
    expect(windowFrame({ ...phone, height: 844.3 }, phone)).toBeNull()
  })

  it("moves back over the window from a translated desktop dialog", () => {
    // A 544px dialog centred at (760, 450) in a 1440 × 900 window whose
    // scrollbar leaves 1425 for fixed things: its box starts at (488, 250),
    // and the frame must start 488 left and 250 up of it, as wide as the window.
    const f = windowFrame({ left: 488, top: 250, width: 544, height: 400 }, laptop)!
    expect(f).toEqual({ left: -488, top: -250, width: 1425, height: 900 })
    // Back on screen, the frame is the window.
    expect(488 + f.left).toBe(0)
    expect(250 + f.top).toBe(0)
  })

  it("covers the window even from a sheet held at the window's corner but smaller than it", () => {
    expect(windowFrame({ left: 0, top: 0, width: 600, height: 400 }, laptop)).toEqual({ left: 0, top: 0, width: 1425, height: 900 })
  })
})
