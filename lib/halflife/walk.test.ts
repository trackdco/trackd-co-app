import { describe, expect, it } from "vitest"

import { componentsOf } from "@/lib/compound-blends"
import { COMPOUNDS } from "@/lib/compounds-catalogue"

import { ABOUT_NAMES, aboutFor } from "./about"
import { blendChoices, blendRunBasis, settleChoice, sharedUnit } from "./blendView"
import { guideExample } from "./guide"
import {
  clearsAfterH,
  doseRuns,
  figuresAt,
  halfGoneAtH,
  listRowFigure,
  nowReading,
  peakAfterH,
  rangeBand,
  sumFigures,
  type AbsorptionRoute,
  type Dose,
} from "./model"

/**
 * Adrian's walk of the preview (26 Sep, Context/next-tasks.md) on the
 * half-life pages: ruling 5 ("Absorbing" in place of 0.00), W2 (the guide's
 * drawn example), W4 (About this compound) and W5 (a blend's All and its parts
 * in full).
 */

const MIN = 1 / 60

const fig = (doses: Dose[], nowH: number, halfLifeH: number, route: AbsorptionRoute = "injection") =>
  figuresAt({ doses, halfLifeH, route, nowH, nextDoseAtH: null })

/* --------------------------------------------------------------- ruling 5 */

describe("ruling 5: right after a dose, Absorbing instead of 0.00", () => {
  it("the minute a first dose is tracked (it sits AT Now), the card reads Absorbing, not 0.00", () => {
    // Track records the clock to the minute and Now is the minute: the dose
    // is 0 hours old, so nothing has reached the blood yet.
    const f = fig([{ atH: 100, amount: 250 }], 100, 108)
    expect(f.circulating).toBe(0)
    expect(f.absorbing).toBe(true)
    expect(nowReading(f)).toEqual({ kind: "absorbing" })
  })

  it("then the figure, as soon as there is one to show", () => {
    // Testosterone Enanthate 250 mg: a third of a mg a minute later.
    const f = fig([{ atH: 100, amount: 250 }], 100 + MIN, 108)
    expect(f.absorbing).toBe(true)
    expect(nowReading(f)).toEqual({ kind: "amount", text: "0.30" })
  })

  it("a small weekly dose reads Absorbing until its figure reaches 0.01", () => {
    // Semaglutide 0.25 mg: 0.00 for the first stretch of its absorption.
    const at = (h: number) => nowReading(fig([{ atH: 0, amount: 0.25 }], h, 168))
    expect(at(10 * MIN)).toEqual({ kind: "absorbing" })
    expect(at(3)).toEqual({ kind: "amount", text: "0.03" })
  })

  it("a dose on top of a level already built up has a figure from the start", () => {
    const doses = [0, 84, 168].map((atH) => ({ atH, amount: 125 }))
    const f = fig(doses, 168, 108)
    expect(f.absorbing).toBe(true)
    expect(nowReading(f).kind).toBe("amount")
  })

  it("is not Absorbing once the dose is past its peak, even if the figure is tiny", () => {
    const f = fig([{ atH: 0, amount: 0.001 }], 2 * peakAfterH(4, "injection"), 4)
    expect(f.absorbing).toBe(false)
    expect(nowReading(f)).toEqual({ kind: "amount", text: "0.00" })
  })

  it("before the first dose nothing changes: the figure is what it always was", () => {
    const f = fig([], 50, 108)
    expect(f.absorbing).toBe(false)
    expect(f.lastDoseAtH).toBeNull()
    expect(nowReading(f)).toEqual({ kind: "amount", text: "0.00" })
  })

  it("the Half-life list says it too", () => {
    const f = fig([{ atH: 100, amount: 250 }], 100, 108)
    expect(listRowFigure(f, "mg")).toEqual({ figure: "Absorbing", line: true })
    const later = fig([{ atH: 100, amount: 250 }], 124, 108)
    expect(listRowFigure(later, "mg").figure).toMatch(/ mg$/)
  })

  it("figuresAt names the last dose it counted", () => {
    const f = fig([{ atH: 10, amount: 1 }, { atH: 30, amount: 1 }, { atH: 90, amount: 1 }], 50, 24)
    expect(f.lastDoseAtH).toBe(30)
  })
})

/* ---------------------------------------------------- W5: a blend as a whole */

describe("W5: a blend's All is its parts together", () => {
  const doses = (amount: number) => [0, 24, 48].map((atH) => ({ atH, amount }))
  const bpc = figuresAt({ doses: doses(125), halfLifeH: 4, route: "injection", nowH: 50, nextDoseAtH: 72 })
  const tb = figuresAt({ doses: doses(125), halfLifeH: 2, route: "injection", nowH: 50, nextDoseAtH: 72 })

  it("adds what is in you, clears with its slowest part, and shares one next dose", () => {
    const all = sumFigures([bpc, tb])
    expect(all.circulating).toBeCloseTo(bpc.circulating + tb.circulating, 10)
    expect(all.clearsInH).toBe(Math.max(bpc.clearsInH!, tb.clearsInH!))
    expect(all.nextDoseAtH).toBe(72)
    expect(all.lastDoseLeft).toBe(Math.max(bpc.lastDoseLeft!, tb.lastDoseLeft!))
  })

  it("is absorbing while any part is, and reads Absorbing only when the sum is 0.00", () => {
    const now0 = (hl: number) => figuresAt({ doses: [{ atH: 10, amount: 125 }], halfLifeH: hl, route: "injection", nowH: 10, nextDoseAtH: null })
    const all = sumFigures([now0(4), now0(2)])
    expect(all.absorbing).toBe(true)
    expect(nowReading(all)).toEqual({ kind: "absorbing" })
    expect(listRowFigure(all, "mcg")).toEqual({ figure: "Absorbing", line: true })
  })

  it("before any dose it is No doses yet on the list, as a single compound is", () => {
    const none = figuresAt({ doses: [], halfLifeH: 4, route: "injection", nowH: 10, nextDoseAtH: 20 })
    expect(listRowFigure(sumFigures([none, none]), "mcg")).toEqual({ figure: "No doses yet", line: false })
  })

  it("names each part in full on the rail, after All", () => {
    const parts = (name: string) => (componentsOf(name) ?? []).map((c) => ({ name: c.name }))
    expect(blendChoices(parts("Wolverine (BPC-157 + TB-500)")).map((c) => c.label)).toEqual(["All", "BPC-157", "TB-500"])
    expect(blendChoices(parts("Natural Desiccated Thyroid")).map((c) => c.label)).toEqual([
      "All",
      "Levothyroxine (T4)",
      "Liothyronine (T3)",
    ])
    expect(blendChoices(parts("Wolverine (BPC-157 + TB-500)")).map((c) => c.key)).toEqual(["all", 0, 1])
  })

  it("falls back to All when the part it named is gone", () => {
    expect(settleChoice(1, 2)).toBe(1)
    expect(settleChoice(2, 2)).toBe("all")
    expect(settleChoice("all", 0)).toBe("all")
  })

  it("adds amounts only in one unit", () => {
    expect(sharedUnit(["mcg", "mcg"])).toBe("mcg")
    expect(sharedUnit(["mcg", "mg"])).toBeNull()
    expect(sharedUnit([])).toBeNull()
  })

  it("under All, This run is the blend's: its doses, broken and cleared by its slowest part", () => {
    const taken = [0, 24, 48, 72].map((atH) => ({ atH, amount: 125 }))
    const basis = blendRunBasis([
      { name: "BPC-157", halfLifeH: 4, route: "injection", taken },
      { name: "TB-500", halfLifeH: 2, route: "injection", taken },
    ])!
    expect(basis.halfLifeH).toBe(4)
    expect(basis.clearsAfterH).toBe(clearsAfterH(4, "injection"))
    const runs = doseRuns(basis.doses, 80, basis.halfLifeH)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ count: 4, current: true })
    expect(blendRunBasis([])).toBeNull()
  })
})

/* ------------------------------------------------ W2: the guide's example */

describe("W2: the guide draws one example with every mark the key names", () => {
  const g = guideExample()
  const x = (t: number) => (t - g.t0) / (g.t1 - g.t0)

  it("has doses taken and to come in view, and a line ahead", () => {
    expect(g.taken.filter((d) => d.atH >= g.t0 && d.atH <= g.nowH).length).toBeGreaterThanOrEqual(2)
    expect(g.toCome.filter((d) => d.atH > g.nowH && d.atH <= g.t1).length).toBeGreaterThanOrEqual(1)
  })

  it("puts Now, the ½ line and the next dose apart, in that order", () => {
    const next = Math.min(...g.toCome.map((d) => d.atH))
    expect(g.halfAtH).toBe(halfGoneAtH([...g.taken, ...g.toCome], g.nowH, g.source.halfLifeH, g.source.route))
    expect(x(g.halfAtH) - x(g.nowH)).toBeGreaterThan(0.05)
    expect(x(next) - x(g.halfAtH)).toBeGreaterThan(0.03)
    expect(x(g.nowH)).toBeGreaterThan(0.4)
    expect(x(next)).toBeLessThan(0.95)
  })

  it("draws a likely range that is visibly wider than the line", () => {
    const [[, lo, hi]] = rangeBand([[g.t0, 1]], g.nowH)
    expect(hi - lo).toBeGreaterThan(0.5)
  })
})

/* ------------------------------------------------- W4: About this compound */

describe("W4: About this compound", () => {
  const catalogue = new Set(COMPOUNDS.map((c) => c.name))

  it("has a summary for every compound that can have a half-life page", () => {
    const pages = COMPOUNDS.filter((c) => c.halfLifeHours != null || componentsOf(c.name) != null).map((c) => c.name)
    const parts = COMPOUNDS.flatMap((c) => componentsOf(c.name) ?? []).map((p) => p.name)
    const missing = [...pages, ...parts].filter((n) => catalogue.has(n) && aboutFor(n) == null)
    // A part with no half-life (KPV) draws no line and has no tab: it needs none.
    const drawn = missing.filter((n) => COMPOUNDS.find((c) => c.name === n)?.halfLifeHours != null || componentsOf(n))
    expect(drawn).toEqual([])
  })

  it("keys every summary by an exact catalogue name", () => {
    expect(ABOUT_NAMES.filter((n) => !catalogue.has(n))).toEqual([])
  })

  it("finds a name however it is cased or spaced, and nothing for a custom compound", () => {
    expect(aboutFor("  testosterone enanthate ")).toBe(aboutFor("Testosterone Enanthate"))
    expect(aboutFor("My own peptide")).toBeNull()
  })

  it("reads as the app writes: short sentences, no em dash, no exclamation, and never advice", () => {
    for (const n of ABOUT_NAMES) {
      const t = aboutFor(n)!
      expect(t, n).toMatch(/^[A-Z0-9]/)
      expect(t, n).toMatch(/\.$/)
      expect(t.length, n).toBeLessThanOrEqual(190)
      expect(t, n).not.toMatch(/[—–!]/)
      expect(t, n).not.toMatch(/\b(you|your|should|recommend\w*|consider|try|ideal|best|safe\w*|dosage|dose\w*)\b/i)
    }
  })
})
