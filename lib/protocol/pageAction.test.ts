/**
 * A Protocol page's header and folds (components/protocol/pages/Subpage.tsx).
 *
 * - Ruling 1: the page's own action is a white button in WORDS ("+ New
 *   stack"), never a second bare "+" beside the quick-actions one, and it is
 *   pressed at 44 points.
 * - W21: while what it opened is up, the button carries the state its slide
 *   hangs on.
 * - D8: the "?" beside the title is pressed at 44. Both keys (the explainer's
 *   and the page's own guide) are now the one explainer key: drawn at 20, with
 *   a 12px reach on ::after (`EXPLAINER_KEY`), so every "?" beside a title looks
 *   and presses the same.
 * - W33: what a fold holds carries the class that fades it in as it opens.
 *
 * Rendered to static markup, as `lib/ui-presets.test.ts` does: the suite runs
 * in node, and markup is what these rules are about.
 */
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Fold, SubpageShell } from "@/components/protocol/pages/Subpage"
import { HIT_Y_30, PAGE_ACTION } from "@/lib/ui-presets"
import { EXPLAINER_KEY } from "@/components/protocol/Explainer"

type ShellProps = Parameters<typeof SubpageShell>[0]
const shell = (props: Partial<ShellProps> = {}) => {
  const all: ShellProps = { screen: "protocol-stacks", title: "Stacks", children: null, ...props }
  return renderToStaticMarkup(createElement(SubpageShell, all))
}

/** The reach of a `before:-inset-y-[Npx]` hit area. */
const reachY = (cls: string) => Number(cls.match(/before:-inset-y-\[(\d+)px\]/)?.[1] ?? 0)
const drawnH = (cls: string) => Number(cls.match(/(?:^| )h-\[(\d+)px\]/)?.[1] ?? NaN)

describe("the page's own action (ruling 1)", () => {
  it("shows its words beside the plus, so it never reads as the quick-actions +", () => {
    const html = shell({ action: { label: "New stack", onClick: () => {} } })
    expect(html).toMatch(/<button[^>]*>[\s\S]*<svg[\s\S]*<\/svg><\/span>New stack<\/button>/)
    // Its words are its name: no aria-label standing in for missing text.
    expect(html).not.toContain('aria-label="New stack"')
  })

  it("is the white button at a row's size, drawn 30 tall and pressed at 44", () => {
    expect(PAGE_ACTION).toContain("inst-btn")
    expect(PAGE_ACTION).toContain("text-bg-base")
    expect(PAGE_ACTION).toContain(HIT_Y_30)
    expect(drawnH(PAGE_ACTION) + 2 * reachY(HIT_Y_30)).toBeGreaterThanOrEqual(44)
    const html = shell({ action: { label: "New cycle", onClick: () => {} } })
    expect(html).toContain("before:-inset-y-[7px]")
    expect(html).toContain("New cycle")
  })

  it("carries the open state for its slide toward the sheet (W21), closed by default", () => {
    expect(shell({ action: { label: "New stack", onClick: () => {}, open: true } })).toContain(
      'class="page-action" data-open="true"',
    )
    expect(shell({ action: { label: "New stack", onClick: () => {} } })).toContain(
      'class="page-action" data-open="false"',
    )
  })

  it("draws nothing at top right on a page without an action", () => {
    expect(shell()).not.toContain("page-action")
  })
})

describe("the title's ? is pressed at 44 (D8)", () => {
  it("the key is drawn at 20 and reaches 12 past each side: 44", () => {
    expect(EXPLAINER_KEY).toContain("h-5 w-5")
    expect(EXPLAINER_KEY).toContain("after:-inset-3")
    expect(20 + 2 * 12).toBeGreaterThanOrEqual(44)
  })

  it("the page's own guide ? is that key", () => {
    const html = shell({ help: { label: "Reading the curve", onClick: () => {} } })
    expect(html).toMatch(/aria-label="Reading the curve"[^>]*after:-inset-3|after:-inset-3[^>]*aria-label="Reading the curve"/)
    expect(html).not.toContain("rounded-full")
  })

  it("the explainer ? is that key too", () => {
    const html = shell({ explainer: "stacks" })
    expect(html).toMatch(/<button[^>]*after:-inset-3[^>]*>\?<\/button>/)
  })
})

describe("a fold's content fades with it (W33)", () => {
  it("wraps what it holds in .fold-body, keeping the caller's classes", () => {
    const props: Parameters<typeof Fold>[0] = { open: false, className: "pb-3", children: "x" }
    const html = renderToStaticMarkup(createElement(Fold, props))
    expect(html).toContain('class="fold-body pb-3"')
    expect(html).toContain('data-open="false"')
  })
})
