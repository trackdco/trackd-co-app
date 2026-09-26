import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { CalculatorInputs } from "@/components/calculator/CalculatorInputs"

type Props = Parameters<typeof CalculatorInputs>[0]

const base = {
  sizeId: "0.5",
  onSizeChange: () => {},
  powder: "5",
  powderUnit: "mg",
  onPowderUnitChange: () => {},
  bac: "",
  dose: "250",
  doseUnit: "mcg",
  onDoseUnitChange: () => {},
  onReset: () => {},
  resettable: true,
} as const

const render = (extra: Partial<Props>) =>
  renderToStaticMarkup(createElement(CalculatorInputs, { ...base, ...extra } as Props))

/** Every `class` attribute on an element with the given marker. */
function classesOf(html: string, marker: RegExp): string[] {
  return [...html.matchAll(/<(\w+)([^>]*)>/g)]
    .filter((m) => marker.test(m[2]))
    .map((m) => /class="([^"]*)"/.exec(m[2])?.[1] ?? "")
}

/**
 * Cold review D31: the calculator's focused field drew a 2px amber ring
 * (`focus-visible:ring-2 ring-ring`) round only its value, where every other
 * field sits an inset 1.2px muted ring INSIDE the field (brief §3.5).
 */
describe("the calculator's field focus (D31)", () => {
  const app = render({ onOpenField: () => {} })

  it("puts the shared inset ring on the whole field while its value has keyboard focus", () => {
    // The box around the value button and the unit (the only bg-bg-input boxes
    // that hold a pad field).
    const boxes = [...app.matchAll(/<div class="([^"]*\bbg-bg-input\b[^"]*)"><button[^>]*data-pad-field/g)].map(
      (m) => m[1],
    )
    expect(boxes).toHaveLength(3)
    for (const c of boxes) {
      expect(c).toContain("has-[[data-pad-field]:focus-visible]:inset-ring-[1.2px]")
      expect(c).toContain("has-[[data-pad-field]:focus-visible]:inset-ring-text-muted")
    }
  })

  it("no longer draws the amber 2px ring on the value itself", () => {
    const buttons = classesOf(app, /\sdata-pad-field="/)
    expect(buttons).toHaveLength(3)
    for (const c of buttons) {
      expect(c).not.toMatch(/\bfocus-visible:ring-2\b|\bring-ring\b/)
      expect(c).toContain("outline-none")
    }
  })

  it("leaves the public site's plain inputs as they shipped", () => {
    const site = render({ onPowderChange: () => {}, onBacChange: () => {}, onDoseChange: () => {} })
    expect(site).not.toContain("inset-ring")
    expect(site).not.toContain("data-pad-field")
    expect(classesOf(site, /inputmode="decimal"/i)).toEqual(
      Array(3).fill(
        "w-full min-w-0 flex-1 bg-transparent font-mono text-base tabular-nums text-foreground outline-none placeholder:text-text-muted",
      ),
    )
  })
})
