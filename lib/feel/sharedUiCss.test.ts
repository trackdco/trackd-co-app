import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { CalculatorInputs } from "@/components/calculator/CalculatorInputs"
import { PadInput } from "@/components/feel/NumberPad"
import { FIRST_RUN_HINT, FirstRunBubble } from "@/components/home/FirstRunBubble"

/**
 * The shared CSS the cold design review found wanting (D1, D2, D12, D16),
 * read from the stylesheet itself: each of these is a rule that can be deleted
 * or narrowed with nothing else failing, and the phone quietly slides, grows or
 * greys again.
 */
const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
)

/** Every `{ … }` body opened by a prelude that matches `prelude`. */
function blocks(source: string, prelude: RegExp): string[] {
  const out: string[] = []
  let i = 0
  while (i < source.length) {
    const open = source.indexOf("{", i)
    if (open < 0) break
    const from = Math.max(source.lastIndexOf("}", open), source.lastIndexOf(";", open))
    const head = source.slice(from + 1, open).trim()
    let depth = 1
    let j = open + 1
    while (j < source.length && depth > 0) {
      if (source[j] === "{") depth += 1
      else if (source[j] === "}") depth -= 1
      j += 1
    }
    if (prelude.test(head)) {
      out.push(source.slice(open + 1, j - 1))
      i = j
    } else {
      i = open + 1
    }
  }
  return out
}

/** The declarations of the rule whose selector list is exactly `selector` (or contains it as one entry). */
function rule(source: string, selector: string): string | null {
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    const sels = m[1].split(",").map((s) => s.trim())
    if (sels.includes(selector)) return m[2]
  }
  return null
}

const reduced = blocks(css, /^@media \(prefers-reduced-motion: reduce\)$/).join("\n")

/** Contrast ratio of two #rrggbb colours (WCAG 2). */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16)
    const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
      const v = c / 255
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** A token's value in a rule body. */
const token = (body: string | null, name: string) => body?.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1]

describe("every bottom sheet fades under reduced motion (D2)", () => {
  const sheet = rule(reduced, '[data-slot="sheet-content"]')

  it("zeroes the slide both ways and fades instead", () => {
    expect(sheet).not.toBeNull()
    for (const p of ["--tw-enter-translate-y", "--tw-exit-translate-y", "--tw-enter-translate-x", "--tw-exit-translate-x"]) {
      expect(sheet).toMatch(new RegExp(`${p}:\\s*0;`))
    }
    expect(sheet).toMatch(/--tw-enter-scale:\s*1;/)
    expect(sheet).toMatch(/--tw-enter-opacity:\s*0;/)
    expect(sheet).toMatch(/--tw-exit-opacity:\s*0;/)
  })

  it("is a SHORT fade, the sheet and its scrim alike", () => {
    const ms = Number(sheet?.match(/animation-duration:\s*(\d+)ms/)?.[1])
    expect(ms).toBeGreaterThan(0)
    expect(ms).toBeLessThanOrEqual(200)
    const scrim = rule(reduced, '[data-slot="sheet-overlay"]')
    expect(Number(scrim?.match(/animation-duration:\s*(\d+)ms/)?.[1])).toBe(ms)
  })

  it("leaves desktop's rail and dialog to their own, more specific, rules", () => {
    const desktop = readFileSync(fileURLToPath(new URL("../../app/desktop.css", import.meta.url)), "utf8")
    expect(desktop).toMatch(
      /\[data-slot="sheet-content"\]\[data-desktop="rail"\]\[data-state="open"\],\s*\[data-slot="sheet-content"\]\[data-desktop="rail"\]\[data-state="closed"\],\s*\[data-slot="sheet-content"\]\[data-desktop="dialog"\]\[data-state="open"\]/,
    )
    // One attribute here against three there: desktop's `animation: none` wins.
    expect('[data-slot="sheet-content"]'.match(/\[/g)).toHaveLength(1)
  })
})

describe("the half-life card takes its new width at once under reduced motion (D12)", () => {
  it("stops the card's own flex-basis transition, not only its children's", () => {
    const body = rule(reduced, ".hl-glance-card")
    expect(body).toMatch(/transition:\s*none\s*!important/)
    expect(rule(reduced, ".hl-glance-card *")).toMatch(/transition:\s*none\s*!important/)
  })
})

describe("text on an input measures 5:1 (D16)", () => {
  const root = blocks(css, /^:root$/)[0]
  const site = blocks(css, /^:root:has\(\.lp-site\)$/)[0]
  const previews = blocks(css, /^\[data-app-look\]$/)[0]

  it("is its own token, a step lighter than muted, and clears 5:1 on the input", () => {
    const onInput = token(root, "--text-on-input")!
    const input = token(root, "--bg-input")!
    const muted = token(root, "--text-muted")!
    expect(onInput).toBe("#9a9895")
    expect(contrast(muted, input)).toBeLessThan(4.5)
    expect(contrast(onInput, input)).toBeGreaterThanOrEqual(5)
  })

  it("reaches everything painted with the input surface, and what is inside it, by scope", () => {
    const scoped = rule(css, ".bg-bg-input")
    expect(scoped).toMatch(/--text-muted:\s*var\(--text-on-input\)/)
    expect(scoped).toMatch(/--muted-foreground:\s*var\(--text-on-input\)/)
    // The pad field (drawn transparent over a grow-field) keeps it too.
    expect(rule(css, ".pad-input")).toBe(scoped)
    // A plain class selector: it matches an input, a textarea, a field-shaped
    // button and a box drawn around a clear input alike, and every descendant
    // inherits the redefined token.
    expect(css).toMatch(/(^|[\s,}])\.bg-bg-input\s*[,{]/)
  })

  it("covers the Calculator, whose unit sits beside a clear input inside a bg-bg-input box (round two)", () => {
    const html = renderToStaticMarkup(
      createElement(CalculatorInputs, {
        sizeId: "1",
        onSizeChange: () => {},
        powder: "",
        powderUnit: "mg",
        onPowderUnitChange: () => {},
        bac: "",
        dose: "",
        doseUnit: "mg",
        onDoseUnitChange: () => {},
        onReset: () => {},
        resettable: false,
      } as unknown as Parameters<typeof CalculatorInputs>[0]),
    )
    // The empty water field shows only "mL": muted, and inside the input box
    // (no box closes between the two), so the scope above lightens it.
    const unit = /<div class="[^"]*\bbg-bg-input\b[^"]*">(?:(?!<\/div>)[\s\S])*?<span class="[^"]*\btext-text-muted\b[^"]*">mL<\/span>/
    expect(html).toMatch(unit)
  })

  it("covers a PadInput's unit and its placeholder", () => {
    const html = renderToStaticMarkup(
      createElement(PadInput, {
        value: "",
        placeholder: "optional",
        suffix: createElement("span", { className: "text-text-muted" }, "mg"),
        label: "Amount",
        active: false,
        onOpen: () => {},
      } as unknown as Parameters<typeof PadInput>[0]),
    )
    expect(html).toMatch(/class="[^"]*\bpad-input\b[^"]*\bbg-bg-input\b/)
    expect(html).toMatch(/<span class="text-text-muted">mg<\/span>/)
  })

  it("leaves the public site as it shipped, and gives its app previews the app's", () => {
    expect(token(site, "--text-on-input")).toBe(token(site, "--text-muted"))
    expect(token(previews, "--text-on-input")).toBe(token(root, "--text-on-input"))
  })
})

describe("the first-run bubble tells the truth (D1)", () => {
  it("says the circle takes two taps, in few words and no exclamation", () => {
    expect(FIRST_RUN_HINT).toBe("Tap the circle twice to log it.")
    expect(FIRST_RUN_HINT).not.toMatch(/[!—]/)
    const html = renderToStaticMarkup(createElement(FirstRunBubble))
    expect(html).toContain(FIRST_RUN_HINT)
    expect(html).toContain('role="note"')
  })

  it("its preview taps twice per loop", () => {
    const frames = blocks(css, /^@keyframes first-run-tap$/)[0]
    // A press is the dot at full size and full opacity.
    const presses = frames.match(/\{\s*transform:\s*scale\(1\);\s*opacity:\s*1;\s*\}/g) ?? []
    expect(presses).toHaveLength(2)
    const ring = blocks(css, /^@keyframes first-run-ring$/)[0]
    expect(ring.match(/scale\(0\.86\)/g) ?? []).toHaveLength(2)
  })

  it("holds still under reduced motion, the words doing the teaching", () => {
    expect(rule(reduced, ".first-run-tap")).toMatch(/animation:\s*none/)
  })
})
