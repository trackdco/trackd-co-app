import { describe, expect, it } from "vitest"

import {
  EXPLAINER_COPY,
  EXPLAINER_KEY_SIZE,
  PICTURE_PLAYS,
  PICTURE_STAGGER_MS,
  cycleDays,
  halfLifePicture,
  hitReach,
  shareLabel,
} from "@/lib/explainers"
import { GLYPHS } from "@/lib/solidGlyphs"

const ALL_LINES = Object.values(EXPLAINER_COPY).flatMap((c) => [c.title, ...c.lines])

describe("the explainers' words (W27, W6)", () => {
  it("follow the copy rules: no em dash, no exclamation, the name spelled Trakabl", () => {
    for (const l of ALL_LINES) {
      expect(l).not.toMatch(/[—–]/)
      expect(l).not.toContain("!")
      expect(l).not.toMatch(/trackable|trackd/i)
    }
  })

  it("report and never advise (Apple 1.4.2)", () => {
    for (const l of ALL_LINES) {
      expect(l).not.toMatch(/\b(should|recommend|best to|try to|consider|we suggest|you need to)\b/i)
    }
  })

  it("say more than the old two lines where Adrian asked, and ask their own question", () => {
    expect(EXPLAINER_COPY.stacks.lines.length).toBeGreaterThanOrEqual(3)
    expect(EXPLAINER_COPY.cycles.lines.length).toBeGreaterThanOrEqual(3)
    for (const c of Object.values(EXPLAINER_COPY)) expect(c.title).toMatch(/^What is a .+\?$/)
  })

  it("no longer carry the half-life sentence Adrian asked to change (W6)", () => {
    const hl = EXPLAINER_COPY["half-life"].lines.join(" ")
    expect(hl).not.toContain("when a dose has cleared")
    expect(hl).toContain("Trakabl")
    // The line he liked stays.
    expect(hl).toContain("how the body breaks it down and how slowly it is released")
  })
})

describe("the ? key's reach (cold review D8)", () => {
  it("reaches 44 points from its drawn size", () => {
    expect(EXPLAINER_KEY_SIZE + 2 * hitReach(EXPLAINER_KEY_SIZE)).toBe(44)
    expect(hitReach(20)).toBe(12)
    expect(hitReach(26)).toBe(9)
    expect(hitReach(50)).toBe(0)
  })
})

describe("the cycle picture's days", () => {
  it("runs 5 on, 2 off, and repeats", () => {
    expect(cycleDays(5, 2, 14)).toEqual([
      true, true, true, true, true, false, false,
      true, true, true, true, true, false, false,
    ])
  })

  it("has no on day without on days", () => {
    expect(cycleDays(0, 2, 4)).toEqual([false, false, false, false])
    expect(cycleDays(5, 2, 0)).toEqual([])
  })
})

describe("the half-life picture", () => {
  const input = { doseX: 22, peakX: 30, endX: 226, baseY: 68, peakY: 14, halfW: 58, marks: 2 }
  const pic = halfLifePicture(input)
  const height = input.baseY - input.peakY

  it("prints ½ and ¼ where the drawn curve really is at a half and a quarter of its peak", () => {
    expect(pic.marks.map((m) => shareLabel(m.left))).toEqual(["½", "¼"])
    pic.marks.forEach((m, i) => {
      expect(m.x).toBe(input.peakX + input.halfW * (i + 1))
      expect(input.baseY - m.y).toBeCloseTo(height * m.left, 6)
    })
  })

  it("draws a curve that starts at the dose, peaks, and ends on the right edge", () => {
    expect(pic.line.startsWith(`M${input.doseX} ${input.baseY}`)).toBe(true)
    expect(pic.line).toContain(`L${input.peakX} ${input.peakY}`)
    expect(pic.line).toMatch(new RegExp(`L${input.endX} [\\d.]+$`))
    expect(pic.area.endsWith(`V${input.baseY}H${input.doseX}Z`)).toBe(true)
  })

  it("never rises again after the peak", () => {
    const ys = [...pic.line.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])])
    const after = ys.filter(([x]) => x >= input.peakX).map(([, y]) => y)
    for (let i = 1; i < after.length; i++) expect(after[i]).toBeGreaterThanOrEqual(after[i - 1])
  })
})

describe("the pictures' motion", () => {
  it("moves only transform and opacity, and every play ends at rest", () => {
    for (const p of Object.values(PICTURE_PLAYS)) {
      for (const k of p.keyframes) {
        for (const prop of Object.keys(k)) expect(["opacity", "transform", "offset"]).toContain(prop)
      }
      const last = p.keyframes[p.keyframes.length - 1] as { opacity?: number; transform?: string }
      expect(last.opacity).toBe(1)
      if (last.transform) expect(last.transform).toMatch(/^(scale\(1\)|translate[XY]\(0px\)|rotate\(0deg\))$/)
    }
  })

  it("carries numbers only in its keyframes (var() snaps in Safari)", () => {
    expect(JSON.stringify(PICTURE_PLAYS)).not.toContain("var(")
  })

  it("staggers inside the house's 40 to 60ms", () => {
    expect(PICTURE_STAGGER_MS).toBeGreaterThanOrEqual(40)
    expect(PICTURE_STAGGER_MS).toBeLessThanOrEqual(60)
  })
})

describe("the Solid glyphs (W36, W6)", () => {
  const numbers = (d: string) => (d.match(/-?\d*\.?\d+/g) ?? []).map(Number)

  it("draw every part with well-formed paths", () => {
    for (const [name, parts] of Object.entries(GLYPHS)) {
      for (const p of parts as { d?: string; s?: string }[]) {
        const d = p.d ?? p.s
        expect(d, name).toBeTruthy()
        expect(d, name).toMatch(/^M/)
        for (const n of numbers(d!)) expect(Number.isFinite(n), name).toBe(true)
      }
    }
  })

  it("keep the new Cycles mark on the 24 grid: a lit run, a dim run (the days off) and an arrowhead", () => {
    const parts = GLYPHS.tileCycles as readonly { d?: string; s?: string; o?: number }[]
    expect(parts.filter((p) => p.s && p.o != null && p.o < 1)).toHaveLength(1)
    expect(parts.some((p) => p.d && p.d.endsWith("Z"))).toBe(true)
    for (const p of parts) {
      // Coordinates only (the arc flags and radii sit inside 0..24 too).
      for (const n of numbers((p.d ?? p.s)!)) {
        expect(n).toBeGreaterThanOrEqual(0)
        expect(n).toBeLessThanOrEqual(24)
      }
    }
  })

  it("keep the Half-life mark's curve and dot, over a faint fill", () => {
    const parts = GLYPHS.halfLife as readonly { d?: string; s?: string; o?: number }[]
    const line = parts.find((p) => p.s)!.s!
    const fill = parts.find((p) => p.d && p.o != null && p.o < 0.5)!.d!
    expect(fill.startsWith(line)).toBe(true)
    expect(parts.filter((p) => p.d && p.o == null)).toHaveLength(1)
  })
})
