import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { rampFill, rampT } from "./recencyRamp"

/** sRGB hex → OKLCH [L 0-1, C, H degrees] (Björn Ottosson's matrices). */
function oklch(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const lin = (c: number) => {
    const x = c / 255
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  }
  const r = lin(n >> 16)
  const g = lin((n >> 8) & 255)
  const b = lin(n & 255)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360]
}

describe("rampT", () => {
  it("is 0 for no heat and 1 for today", () => {
    expect(rampT(0)).toBe(0)
    expect(rampT(-1)).toBe(0)
    expect(rampT(Number.NaN)).toBe(0)
    expect(rampT(1)).toBe(1)
    expect(rampT(2)).toBe(1)
  })

  it("is heat^0.85, rising with heat", () => {
    expect(rampT(0.5)).toBeCloseTo(Math.pow(0.5, 0.85), 10)
    const steps = [1, 2, 3, 4, 5, 6, 7].map((d) => rampT(1 - d / 8))
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1])
  })
})

describe("rampFill", () => {
  it("paints nothing for an unshaded site and pure amber for today", () => {
    expect(rampFill(0)).toBeNull()
    expect(rampFill(1)).toBe("var(--accent-amber)")
  })

  it("is a solid OKLCH mix, never amber at an opacity", () => {
    const f = rampFill(3 / 8)!
    expect(f).toContain("color-mix(in oklch")
    expect(f).toContain("var(--ramp-base)")
    expect(f).not.toContain("opacity")
  })
})

describe("the --ramp-base tokens", () => {
  const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8")
  const root = css.slice(0, css.indexOf("\n:root:has(.lp-site) {"))
  const hex = (name: string) => {
    const m = root.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))
    if (!m) throw new Error(`no ${name}`)
    return m[1]
  }
  const base = (block: string) => {
    const m = block.match(/--ramp-base:\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/)
    if (!m) throw new Error("no --ramp-base")
    return [Number(m[1]) / 100, Number(m[2]), Number(m[3])]
  }
  const amberHue = oklch(hex("--accent-amber"))[2]
  const cases: [string, string, string][] = [
    ["the glance map", "--muscle-region", root],
    ["the log sheet's raised map", "--pick-region", css.slice(css.indexOf(".body-map-raised {"))],
    ["the inset map", "--pick-region-lift", css.slice(css.indexOf(".body-map-lifted {"))],
  ]
  it.each(cases)("%s restates its grey at amber's hue less 4 degrees", (_, grey, block) => {
    const [L, C] = oklch(hex(grey))
    const [bL, bC, bH] = base(block)
    expect(bL).toBeCloseTo(L, 3)
    expect(bC).toBeCloseTo(C, 3)
    expect(bH).toBeCloseTo(amberHue - 4, 1)
  })
})
