import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { CloseArrow } from "@/components/feel/CloseArrow"
import { TypeRail } from "@/components/feel/TypeRail"
import {
  ADD_ACTION,
  CLOSE_ARROW,
  HIT_26,
  HIT_30,
  HIT_34,
  HIT_Y_25,
  HIT_Y_30,
  HIT_Y_36,
  HIT_Y_TEXT,
  SEGMENTED_ITEM,
  SEGMENTED_ITEM_LG,
} from "./ui-presets"

/** The drawn size (`h-[Npx]`) and the reach of the transparent ::before
 *  (`before:-inset-[Mpx]` or `before:-inset-y-[Mpx]`) in a class string. */
function reach(cls: string, axis: "x" | "y"): number {
  const all = cls.match(/before:-inset-\[(\d+)px\]/)
  if (all) return Number(all[1])
  const one = cls.match(new RegExp(`before:-inset-${axis}-\\[(\\d+)px\\]`))
  if (one) return Number(one[1])
  // A spacing step: Tailwind's 4px scale (`before:-inset-y-2.5` is 10px).
  const step = cls.match(new RegExp(`before:-inset-${axis}-(\\d+(?:\\.\\d+)?)(?:\\s|$)`))
  return step ? Number(step[1]) * 4 : 0
}
const drawn = (cls: string, dim: "h" | "w") => Number(cls.match(new RegExp(`(?:^| )${dim}-\\[(\\d+)px\\]`))?.[1] ?? NaN)

describe("hit areas are 44 × 44 without redrawing anything (D8)", () => {
  it("every hit preset is a positioned element with a transparent, empty ::before", () => {
    for (const p of [HIT_26, HIT_30, HIT_34, HIT_Y_30, HIT_Y_25, HIT_Y_36, HIT_Y_TEXT]) {
      expect(p).toMatch(/(^| )relative( |$)/)
      expect(p).toContain("before:absolute")
      expect(p).toContain("before:content-['']")
      // Nothing painted: no background, no border on the reach.
      expect(p).not.toMatch(/before:(bg|border)/)
    }
  })

  it("each preset reaches its drawing to 44 on both axes", () => {
    expect(26 + 2 * reach(HIT_26, "x")).toBeGreaterThanOrEqual(44)
    expect(30 + 2 * reach(HIT_30, "x")).toBeGreaterThanOrEqual(44)
    expect(34 + 2 * reach(HIT_34, "x")).toBeGreaterThanOrEqual(44)
    expect(30 + 2 * reach(HIT_Y_30, "y")).toBeGreaterThanOrEqual(44)
    // A chip's reach is vertical only, so chips side by side never overlap.
    expect(HIT_Y_30).toContain("before:inset-x-0")
  })

  it("the top-right + is drawn at 34 and pressed at 44", () => {
    expect(drawn(ADD_ACTION, "h")).toBe(34)
    expect(drawn(ADD_ACTION, "w")).toBe(34)
    expect(ADD_ACTION).toContain(HIT_34)
    expect(34 + 2 * reach(ADD_ACTION, "x")).toBeGreaterThanOrEqual(44)
  })

  it("the close arrow is drawn at 30 and pressed at 44", () => {
    expect(drawn(CLOSE_ARROW, "h")).toBe(30)
    expect(drawn(CLOSE_ARROW, "w")).toBe(30)
    expect(CLOSE_ARROW).toContain("rounded-[9px]")
    expect(30 + 2 * reach(CLOSE_ARROW, "x")).toBeGreaterThanOrEqual(44)
    const html = renderToStaticMarkup(createElement(CloseArrow, { onClick: () => {} }))
    expect(html).toContain("before:-inset-[7px]")
  })

  it("a caller's own position still wins over the preset's `relative` (FoldArrow's twin is absolute)", () => {
    const html = renderToStaticMarkup(createElement(CloseArrow, { onClick: () => {}, className: "absolute inset-0" }))
    expect(html).toMatch(/class="[^"]*\babsolute\b/)
    expect(html).not.toMatch(/class="[^"]*(^|\s)relative(\s|")/)
  })

  it("type chips reach 44 tall, and the scroller gives them room past the rail without moving it", () => {
    const html = renderToStaticMarkup(
      createElement(TypeRail, { categories: ["peptide", "anabolic"], value: "all", onChange: () => {} }),
    )
    // Chips: 30 tall (py-1.5 + an 18px line), reaching 7px above and below.
    expect(html).toContain("py-1.5")
    expect(html).toContain("before:-inset-y-[7px]")
    // The chip sits 3px inside the rail, so it reaches 4px past it; the
    // scroller has exactly that room, given back by a negative margin.
    expect(html).toMatch(/class="type-rail relative -my-1 overflow-x-auto rounded-\[15px\] py-1"/)
    // The rail's drawing stands still behind the scrolling chips.
    expect(html).toMatch(/<span aria-hidden="true" class="inst-rail pointer-events-none absolute inset-0"><\/span>/)
    // The caller's margins land on the outer box, which does not collapse.
    const withMargin = renderToStaticMarkup(
      createElement(TypeRail, { categories: ["peptide", "anabolic"], value: "all", onChange: () => {}, className: "mt-3" }),
    )
    expect(withMargin).toMatch(/^<div class="relative flow-root mt-3">/)
  })
})

describe("a switch label never breaks inside itself (D7)", () => {
  it("both segmented sizes keep a label on one line (\"Sub-Q\", not \"Sub-\" / \"Q\")", () => {
    expect(SEGMENTED_ITEM).toContain("whitespace-nowrap")
    expect(SEGMENTED_ITEM_LG).toContain("whitespace-nowrap")
  })
})

describe("a waiting close arrow is out of the way for screen readers too (S4)", () => {
  it("is hidden from the accessibility tree and the Tab order while shut", () => {
    const button = renderToStaticMarkup(createElement(CloseArrow, { onClick: () => {}, shown: false, label: "Close" })).match(/^<button[^>]*>/)![0]
    expect(button).toContain('aria-hidden="true"')
    expect(button).toContain('tabindex="-1"')
    expect(button).toContain('data-shown="false"')
  })

  it("is announced and tabbable once shown", () => {
    const button = renderToStaticMarkup(createElement(CloseArrow, { onClick: () => {}, shown: true, label: "Close" })).match(/^<button[^>]*>/)![0]
    expect(button).not.toContain("aria-hidden")
    expect(button).toContain('tabindex="0"')
    expect(button).toContain('aria-label="Close"')
  })
})

describe("switch choices and text buttons reach 44 tall too (D8 round two)", () => {
  /** A choice's drawn height: its vertical padding and one line of its type
   *  (Tailwind's line height for `text-sm`, 1.5 for an arbitrary size). */
  const height = (cls: string) => {
    const py = Number(cls.match(/(?:^| )py-(\d+(?:\.\d+)?)(?: |$)/)?.[1]) * 4
    if (/(?:^| )text-sm(?: |$)/.test(cls)) return py * 2 + 20
    const px = Number(cls.match(/text-\[(\d+(?:\.\d+)?)px\]/)?.[1])
    return py * 2 + px * 1.5
  }

  it("the card-header switch (Cycles' 1M / 3M / 1Y / All) is drawn 25 tall and pressed at 44", () => {
    expect(Math.round(height(SEGMENTED_ITEM))).toBe(25)
    expect(SEGMENTED_ITEM).toContain(HIT_Y_25)
    expect(height(SEGMENTED_ITEM) + 2 * reach(SEGMENTED_ITEM, "y")).toBeGreaterThanOrEqual(44)
    // Vertical only: the choices sit 2px apart, side by side.
    expect(HIT_Y_25).toContain("before:inset-x-0")
  })

  it("the sheet switch is drawn 36 tall and pressed at 44", () => {
    expect(height(SEGMENTED_ITEM_LG)).toBe(36)
    expect(SEGMENTED_ITEM_LG).toContain(HIT_Y_36)
    expect(height(SEGMENTED_ITEM_LG) + 2 * reach(SEGMENTED_ITEM_LG, "y")).toBeGreaterThanOrEqual(44)
  })

  it("matches the reach the weight and consistency cards already gave the same switch by hand", () => {
    expect(HIT_Y_25).toBe("relative before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-['']")
  })

  it("a word used as a button, 12 to 17px tall, is pressed at 44 or more", () => {
    for (const h of [12, 17]) expect(h + 2 * reach(HIT_Y_TEXT, "y")).toBeGreaterThanOrEqual(44)
    expect(HIT_Y_TEXT).toContain("before:inset-x-0")
  })
})
