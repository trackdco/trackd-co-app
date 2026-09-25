import { describe, expect, it } from "vitest"

import {
  absHalfH,
  amountAt,
  clearsAfterH,
  curvePoints,
  doseRuns,
  figuresAt,
  formatAmount,
  formatClearsIn,
  formatDuration,
  formatHalfLife,
  formatHalfLifeShort,
  formatPeak,
  formatPeakIn,
  formatPercent,
  formatSteady,
  formatUsual,
  halfGoneAfterH,
  halfGoneAtH,
  lastDoseLeft,
  peakAfterH,
  peakCountdown,
  RANGE_AT_NOW,
  RANGE_FAR,
  RANGE_WIDEN_H,
  rangeBand,
  rangeFactorsAt,
  routeFor,
  runStartH,
  sampleTimes,
  steadyAt,
  unitAmount,
  type AbsorptionRoute,
  type Dose,
} from "./model"

/**
 * The fixtures are the preview's own figures (next-tasks → "The curve model"),
 * which were checked three ways on 2026-09-24. "Now" is 13:12 on day 28 of the
 * schedule, and every dose is taken at 07:55 (day + 0.33).
 */
const NOW_H = 28.55 * 24
const at = (day: number) => (day + 0.33) * 24

/** Mon/Thu: three days, then four, alternating, from `first` to `last`. */
function monThu(first: number, last: number, amount: number): Dose[] {
  const out: Dose[] = []
  let d = first
  let short = true
  while (d <= last) {
    out.push({ atH: at(d), amount })
    d += short ? 3 : 4
    short = !short
  }
  return out
}

function everyN(first: number, last: number, n: number, amount: number): Dose[] {
  const out: Dose[] = []
  for (let d = first; d <= last; d += n) out.push({ atH: at(d), amount })
  return out
}

interface Case {
  name: string
  halfLifeH: number
  route: AbsorptionRoute
  doses: Dose[]
}

const RETA: Case = { name: "Retatrutide", halfLifeH: 144, route: "injection", doses: monThu(5, 44, 2) }
const TEST_E: Case = { name: "Test E", halfLifeH: 108, route: "injection", doses: monThu(5, 44, 125) }
const ANAS: Case = { name: "Anastrozole", halfLifeH: 48, route: "oral", doses: everyN(5, 44, 3, 0.5) }
const BPC: Case = { name: "BPC-157", halfLifeH: 4, route: "injection", doses: everyN(20, 32, 1, 250) }
const TB: Case = { name: "TB-500", halfLifeH: 2, route: "injection", doses: everyN(20, 32, 1, 250) }

function figures(c: Case) {
  const next = c.doses.find((d) => d.atH > NOW_H)
  return figuresAt({
    doses: c.doses,
    halfLifeH: c.halfLifeH,
    route: c.route,
    nowH: NOW_H,
    nextDoseAtH: next?.atH ?? null,
  })
}

describe("the preview's figures", () => {
  it("Retatrutide 2 mg Mon/Thu: peaks at 49.5 h, 4.58 mg, 84%, clears in ~29 days", () => {
    const f = figures(RETA)
    expect(peakAfterH(RETA.halfLifeH, RETA.route).toFixed(1)).toBe("49.5")
    expect(formatAmount(f.circulating)).toBe("4.58")
    expect(formatPercent(f.lastDoseLeft!)).toBe("84")
    expect(formatClearsIn(f.clearsInH!)).toBe("~29 days")
    expect(formatDuration(f.nextDoseInH!)).toBe("19h")
    // First dose on day 5.33, five 6-day half-lives on: day 35.33, 6.8 days away.
    expect(formatSteady(f.steady)).toBe("7 days")
  })

  it("Test E 125 mg Mon/Thu: peaks at 37.1 h, 220 mg, 78%", () => {
    const f = figures(TEST_E)
    expect(peakAfterH(TEST_E.halfLifeH, TEST_E.route).toFixed(1)).toBe("37.1")
    expect(formatAmount(f.circulating)).toBe("220")
    expect(formatPercent(f.lastDoseLeft!)).toBe("78")
    expect(formatSteady(f.steady)).toBe("Yes")
  })

  it("Anastrozole 0.5 mg every 3 days, oral: peaks at 2.5 h, 47%", () => {
    const f = figures(ANAS)
    expect(peakAfterH(ANAS.halfLifeH, ANAS.route).toFixed(1)).toBe("2.5")
    expect(formatPercent(f.lastDoseLeft!)).toBe("47")
  })

  it("BPC-157 250 mcg daily: 112 mcg, 44%, clears in ~16 h", () => {
    const f = figures(BPC)
    expect(formatAmount(f.circulating)).toBe("112")
    expect(formatPercent(f.lastDoseLeft!)).toBe("44")
    expect(formatClearsIn(f.clearsInH!)).toBe("~16h")
  })

  it("TB-500 250 mcg daily: 44.1 mcg, 18%", () => {
    const f = figures(TB)
    expect(formatAmount(f.circulating)).toBe("44.1")
    expect(formatPercent(f.lastDoseLeft!)).toBe("18")
  })
})

describe("absorption", () => {
  it("is 9% of the half-life for an injection, with no floor", () => {
    // The prototype's 1.5 h floor would have made TB-500 absorb over 1.5 h.
    expect(absHalfH(2, "injection")).toBeCloseTo(0.18, 10)
    expect(absHalfH(144, "injection")).toBeCloseTo(12.96, 10)
  })

  it("is a fixed 0.35 h for oral, whatever the half-life", () => {
    expect(absHalfH(48, "oral")).toBe(0.35)
    expect(absHalfH(2, "oral")).toBe(0.35)
  })

  it("maps IM and sub-Q to injection, and oral and nasal to the fixed time", () => {
    expect(routeFor("im")).toBe("injection")
    expect(routeFor("subq")).toBe("injection")
    expect(routeFor("po")).toBe("oral")
    expect(routeFor("nasal")).toBe("oral")
  })
})

describe("the Bateman curve", () => {
  it("is zero before and at the dose, and never negative after", () => {
    expect(unitAmount(-1, 4, "injection")).toBe(0)
    expect(unitAmount(0, 4, "injection")).toBe(0)
    for (let h = 0.1; h < 200; h += 7.3) expect(unitAmount(h, 4, "injection")).toBeGreaterThanOrEqual(0)
  })

  it("peaks at its peak time", () => {
    const peak = peakAfterH(108, "injection")
    const top = unitAmount(peak, 108, "injection")
    expect(unitAmount(peak - 0.5, 108, "injection")).toBeLessThan(top)
    expect(unitAmount(peak + 0.5, 108, "injection")).toBeLessThan(top)
  })

  it("takes the limit form when the two rates are equal", () => {
    // Oral absorbs over 0.35 h, so a 0.35 h half-life puts both rates level.
    const hl = 0.35
    const k = Math.LN2 / hl
    const h = 0.8
    expect(unitAmount(h, hl, "oral")).toBeCloseTo(k * h * Math.exp(-k * h), 12)
    expect(peakAfterH(hl, "oral")).toBeCloseTo(1 / k, 10)
    // And it meets the general form from either side without a jump.
    expect(unitAmount(h, hl * 1.0001, "oral")).toBeCloseTo(unitAmount(h, hl, "oral"), 3)
  })

  it("sums every dose taken by then, and none after", () => {
    const doses: Dose[] = [{ atH: 0, amount: 10 }, { atH: 24, amount: 10 }]
    const one = 10 * unitAmount(30, 12, "injection")
    const two = 10 * unitAmount(6, 12, "injection")
    expect(amountAt(doses, 30, 12, "injection")).toBeCloseTo(one + two, 12)
    expect(amountAt(doses, 20, 12, "injection")).toBeCloseTo(10 * unitAmount(20, 12, "injection"), 12)
  })
})

describe("of last dose left", () => {
  it("is all of it at the moment of the dose", () => {
    expect(lastDoseLeft(0, 144, "injection")).toBe(1)
  })

  it("counts the depot, so it runs behind plain half-life decay", () => {
    // 0.5^(h/hl) ignores what is still absorbing and read too low beside the line.
    const h = 53.28
    expect(lastDoseLeft(h, 144, "injection")).toBeGreaterThan(Math.pow(0.5, h / 144))
  })

  it("never exceeds 1 and falls over time", () => {
    let prev = 1
    for (let h = 0; h < 600; h += 11) {
      const v = lastDoseLeft(h, 108, "injection")
      expect(v).toBeLessThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(prev + 1e-12)
      prev = v
    }
  })

  it("clears when it falls below 3%", () => {
    const h = clearsAfterH(4, "injection")
    expect(lastDoseLeft(h, 4, "injection")).toBeLessThanOrEqual(0.03)
    expect(lastDoseLeft(h - 4 / 50, 4, "injection")).toBeGreaterThan(0.03)
  })
})

describe("chart sampling", () => {
  it("includes every dose, just before it, and every peak", () => {
    const t0 = NOW_H - 36
    const t1 = NOW_H + 12
    const ts = sampleTimes(TB.doses, t0, t1, 10, TB.halfLifeH, TB.route)
    const peak = peakAfterH(TB.halfLifeH, TB.route)
    for (const d of TB.doses.filter((x) => x.atH >= t0 && x.atH <= t1)) {
      expect(ts).toContain(d.atH)
      expect(ts.some((t) => t < d.atH && d.atH - t < 1e-3)).toBe(true)
      if (d.atH + peak <= t1) expect(ts).toContain(d.atH + peak)
    }
    expect([...ts].sort((a, b) => a - b)).toEqual(ts)
  })

  it("keeps a 2 h peptide's daily peaks, which even steps alone miss", () => {
    // The card's window: 16 days back, 8 forward, 200 steps (the prototype's).
    const t0 = NOW_H - 16 * 24
    const t1 = NOW_H + 8 * 24
    const peak = peakAfterH(TB.halfLifeH, TB.route)
    const points = curvePoints(TB.doses, t0, t1, 200, TB.halfLifeH, TB.route)
    const even = Array.from({ length: 201 }, (_, i) => t0 + ((t1 - t0) * i) / 200)
    let worstEven = 1
    for (const d of TB.doses.filter((x) => x.atH >= t0 && x.atH + peak <= t1)) {
      const truePeak = amountAt(TB.doses, d.atH + peak, TB.halfLifeH, TB.route)
      const inDay = (t: number) => t >= d.atH && t < d.atH + 24
      const sampled = Math.max(...points.filter((p) => inDay(p[0])).map((p) => p[1]))
      expect(sampled).toBeCloseTo(truePeak, 9)
      const evenMax = Math.max(...even.filter(inDay).map((t) => amountAt(TB.doses, t, 2, "injection")))
      worstEven = Math.min(worstEven, evenMax / truePeak)
    }
    // Even steps alone lose well over a third of some day's peak.
    expect(worstEven).toBeLessThan(0.65)
  })
})

describe("steady, anchored to the current run", () => {
  const daily = (from: number, to: number, amount: number): Dose[] =>
    everyN(from, to, 1, amount)

  it("starts the run at the first dose when nothing has changed", () => {
    expect(runStartH(daily(0, 10, 5), at(10), 24)).toBe(at(0))
  })

  it("restarts at a dose change, because titrating starts a new level", () => {
    const doses = [...daily(0, 9, 5), ...daily(10, 20, 7.5)]
    expect(runStartH(doses, at(20), 24)).toBe(at(10))
  })

  it("restarts after a gap of more than three half-lives", () => {
    const doses = [...daily(0, 5, 5), ...daily(12, 20, 5)]
    expect(runStartH(doses, at(20), 24)).toBe(at(12))
  })

  it("does not restart a fast peptide at every daily dose", () => {
    // 24 h between doses is more than 3 × 4 h, but it is the usual interval:
    // the compound clears and repeats the same curve, which is steady.
    const daily4h = daily(0, 20, 250)
    expect(runStartH(daily4h, at(20) + 14, 4)).toBe(at(0))
    expect(steadyAt(daily4h, at(20) + 14, 4, "injection", at(21))).toEqual({ kind: "reached" })
  })

  it("still restarts a fast peptide after a missed day", () => {
    const missed = [...daily(0, 10, 250), ...daily(13, 20, 250)]
    expect(runStartH(missed, at(20), 4)).toBe(at(13))
  })

  it("does not restart for a different evening amount in its own slot", () => {
    const doses: Dose[] = []
    for (let d = 0; d <= 10; d++) {
      doses.push({ atH: at(d), amount: 100, slot: 0 })
      doses.push({ atH: at(d) + 12, amount: 50, slot: 1 })
    }
    expect(runStartH(doses, at(10) + 12, 24)).toBe(at(0))
  })

  it("restarts at the next dose due once a run has lapsed", () => {
    const doses = daily(0, 5, 5)
    const now = at(20)
    const next = at(21)
    expect(steadyAt(doses, now, 24, "injection", next)).toEqual({ kind: "in", hours: next + 5 * 24 - now })
  })

  it("has nothing to be steady at with no dose taken and none due", () => {
    expect(steadyAt([], NOW_H, 24, "injection", null)).toEqual({ kind: "none" })
    expect(formatSteady({ kind: "none" })).toBeNull()
  })
})

describe("edge cases", () => {
  it("with no doses: nothing circulating, and no last-dose figures", () => {
    const f = figuresAt({ doses: [], halfLifeH: 24, route: "injection", nowH: NOW_H, nextDoseAtH: null })
    expect(f.circulating).toBe(0)
    expect(f.lastDoseLeft).toBeNull()
    expect(f.clearsInH).toBeNull()
    expect(f.nextDoseInH).toBeNull()
  })

  it("ignores a dose in the future: it has not been taken yet", () => {
    const past = RETA.doses.filter((d) => d.atH <= NOW_H)
    const withFuture = figuresAt({ doses: RETA.doses, halfLifeH: 144, route: "injection", nowH: NOW_H, nextDoseAtH: null })
    const pastOnly = figuresAt({ doses: past, halfLifeH: 144, route: "injection", nowH: NOW_H, nextDoseAtH: null })
    expect(withFuture.circulating).toBe(pastOnly.circulating)
    expect(withFuture.lastDoseLeft).toBe(pastOnly.lastDoseLeft)
    expect(withFuture.clearsInH).toBe(pastOnly.clearsInH)
  })

  it("says Cleared once the last dose is below 3%", () => {
    const f = figuresAt({
      doses: everyN(20, 28, 1, 100),
      halfLifeH: 0.5,
      route: "injection",
      nowH: NOW_H,
      nextDoseAtH: null,
    })
    expect(f.clearsInH!).toBeLessThanOrEqual(0)
    expect(formatClearsIn(f.clearsInH!)).toBe("Cleared")
  })
})

describe("formatting", () => {
  it("words durations in minutes, hours, then days", () => {
    expect(formatDuration(0.2)).toBe("12 min")
    expect(formatDuration(0.001)).toBe("1 min")
    expect(formatDuration(18.72)).toBe("19h")
    expect(formatDuration(47.4)).toBe("47h")
    expect(formatDuration(48)).toBe("2 days")
    expect(formatDuration(695.5)).toBe("29 days")
  })

  it("keeps a figure to its significant digits", () => {
    expect(formatAmount(219.556)).toBe("220")
    expect(formatAmount(44.0845)).toBe("44.1")
    expect(formatAmount(4.5791)).toBe("4.58")
  })

  it("words the half-life for the row and the tag", () => {
    expect(formatHalfLife(108)).toBe("4.5 days")
    expect(formatHalfLife(4)).toBe("4h")
    expect(formatHalfLife(1.2)).toBe("1.2h")
    expect(formatHalfLife(0.07)).toBe("4 min")
    expect(formatHalfLifeShort(144)).toBe("6.0D")
    expect(formatHalfLifeShort(2.5)).toBe("2.5H")
    expect(formatHalfLifeShort(0.5)).toBe("30MIN")
  })
})

describe("the ½ line", () => {
  it("falls where Of last dose left crosses half: about 1.14 half-lives after an injection", () => {
    for (const hl of [2, 4, 108, 144]) {
      const h = halfGoneAfterH(hl, "injection")
      expect(h / hl, `${hl} h`).toBeCloseTo(1.136, 3)
      expect(lastDoseLeft(h, hl, "injection")).toBeCloseTo(0.5, 9)
      expect(lastDoseLeft(h - hl * 1e-6, hl, "injection")).toBeGreaterThan(0.5)
    }
  })

  it("is NOT the last dose plus one half-life: the depot holds it back", () => {
    // At one half-life 55% of a weekly injection is still left.
    expect(lastDoseLeft(144, 144, "injection")).toBeGreaterThan(0.54)
    expect(halfGoneAfterH(144, "injection")).toBeGreaterThan(144 + 19)
  })

  it("lands just past the half-life for an oral dose, whose depot empties in minutes", () => {
    const h = halfGoneAfterH(48, "oral")
    expect(h / 48).toBeGreaterThan(1)
    expect(h / 48).toBeLessThan(1.02)
  })

  it("waits for absorption when the half-life is shorter than it", () => {
    // A 6-minute half-life still absorbs over 0.35 h, so it cannot be half gone
    // in 6 minutes.
    const h = halfGoneAfterH(0.1, "oral")
    expect(h).toBeGreaterThan(0.35)
    expect(lastDoseLeft(h, 0.1, "oral")).toBeCloseTo(0.5, 9)
  })

  it("sits after the LAST dose taken, where the tile reads 50%", () => {
    const last = at(26)
    const half = halfGoneAtH(RETA.doses, NOW_H, 144, "injection")!
    // The doses still to come in the same list move nothing.
    expect(half).toBe(last + halfGoneAfterH(144, "injection"))
    // With no dose taken in between, the tile reads 50% at the line.
    const taken = RETA.doses.filter((d) => d.atH <= NOW_H)
    const f = figuresAt({ doses: taken, halfLifeH: 144, route: "injection", nowH: half, nextDoseAtH: null })
    expect(formatPercent(f.lastDoseLeft!)).toBe("50")
  })

  it("has no ½ line before the first dose", () => {
    expect(halfGoneAtH([], NOW_H, 144, "injection")).toBeNull()
    expect(halfGoneAtH([{ atH: NOW_H + 5, amount: 2 }], NOW_H, 144, "injection")).toBeNull()
  })
})

describe("the peak the drawn curve reaches", () => {
  /** The highest the curve gets between `from` and `to`, walked finely. */
  const walkedTop = (doses: Dose[], from: number, to: number, hl: number, route: AbsorptionRoute) => {
    let top = 0
    for (let t = from; t <= to; t += (to - from) / 5000) top = Math.max(top, amountAt(doses, t, hl, route))
    return top
  }

  it("counts to the top of the stacked curve between the last dose and the next", () => {
    // Retatrutide, 6 h after the day-26 dose; the next is day 29.
    const now = at(26) + 6
    const p = peakCountdown(RETA.doses, now, 144, "injection")
    expect(p.kind).toBe("ahead")
    if (p.kind !== "ahead") return
    expect(p.inH).toBeCloseTo(p.atH - now, 12)
    const top = amountAt(RETA.doses, p.atH, 144, "injection")
    expect(top).toBeGreaterThanOrEqual(walkedTop(RETA.doses, at(26), at(29), 144, "injection") - 1e-9)
    for (const [t, v] of curvePoints(RETA.doses, at(26), at(29), 200, 144, "injection")) {
      expect(v, `at ${t}`).toBeLessThanOrEqual(top + 1e-9)
    }
    // The earlier doses, still falling, pull the top ahead of one dose's own peak.
    expect(p.atH).toBeLessThan(at(26) + peakAfterH(144, "injection"))
    expect(formatPeak(p)).toEqual({ label: "Peaks in", value: "23h" })
  })

  it("switches to the next dose's own peak the moment the top has passed", () => {
    const top = peakCountdown(RETA.doses, at(26) + 6, 144, "injection")
    if (top.kind !== "ahead") throw new Error("expected a peak ahead")
    const before = peakCountdown(RETA.doses, top.atH - 0.01, 144, "injection")
    expect(before.kind).toBe("ahead")
    expect(before.kind === "ahead" && before.atH).toBeCloseTo(top.atH, 6)

    const after = peakCountdown(RETA.doses, top.atH + 0.01, 144, "injection")
    expect(after.kind).toBe("next")
    if (after.kind !== "next") return
    // The day-29 dose's window runs to the day-33 dose.
    expect(after.atH).toBeGreaterThan(at(29))
    expect(after.atH).toBeLessThan(at(33))
    const nextTop = amountAt(RETA.doses, after.atH, 144, "injection")
    expect(nextTop).toBeGreaterThanOrEqual(walkedTop(RETA.doses, at(29), at(33), 144, "injection") - 1e-9)
    expect(formatPeak(after)?.label).toBe("Next peak in")
  })

  it("reads Next peak in at the preview's Now, two days after the day-26 top", () => {
    const p = peakCountdown(RETA.doses, NOW_H, 144, "injection")
    expect(p.kind).toBe("next")
    expect(formatPeak(p)).toEqual({ label: "Next peak in", value: "2 days" })
  })

  it("finds a short half-life's spike exactly, which even samples miss", () => {
    // TB-500, 2 h: yesterday's dose is 12 half-lives gone, so the top is this
    // dose's own peak, 41 minutes after it.
    const soon = peakCountdown(TB.doses, at(28) + 0.2, 2, "injection")
    expect(soon.kind).toBe("ahead")
    expect(soon.kind === "ahead" && soon.atH).toBeCloseTo(at(28) + peakAfterH(2, "injection"), 3)
    expect(formatPeak(soon)).toEqual({ label: "Peaks in", value: "<1h" })

    const later = peakCountdown(TB.doses, at(28) + 3, 2, "injection")
    expect(later.kind).toBe("next")
    expect(later.kind === "next" && later.atH).toBeCloseTo(at(29) + peakAfterH(2, "injection"), 3)
    expect(formatPeak(later)).toEqual({ label: "Next peak in", value: "22h" })
  })

  it("peaks within hours of an oral dose", () => {
    const p = peakCountdown(ANAS.doses, at(26) + 1, 48, "oral")
    expect(p.kind).toBe("ahead")
    if (p.kind !== "ahead") return
    expect(p.atH).toBeGreaterThan(at(26) + 1)
    expect(p.atH).toBeLessThanOrEqual(at(26) + peakAfterH(48, "oral") + 1e-9)
    expect(formatPeak(p)).toEqual({ label: "Peaks in", value: "1h" })
  })

  it("a stopped compound: counts to its last top, then reads Peak · Passed", () => {
    // The last dose is day 19 and nothing is to come.
    const stopped = monThu(5, 20, 2)
    const early = peakCountdown(stopped, at(19) + 5, 144, "injection")
    const late = peakCountdown(stopped, NOW_H, 144, "injection")
    if (early.kind !== "ahead" || late.kind !== "passed") throw new Error(`${early.kind} then ${late.kind}`)
    // The same top, counted to and then passed.
    expect(late.atH).toBeCloseTo(early.atH, 6)
    expect(late.atH).toBeLessThan(NOW_H)
    expect(formatPeak(late)).toEqual({ label: "Peak", value: "Passed" })
  })

  it("has no peak before the first dose, even with doses to come", () => {
    expect(peakCountdown([], NOW_H, 144, "injection")).toEqual({ kind: "none" })
    expect(peakCountdown([{ atH: NOW_H + 20, amount: 2 }], NOW_H, 144, "injection")).toEqual({ kind: "none" })
    expect(formatPeak({ kind: "none" })).toBeNull()
  })
})

describe("the peak countdown's wording", () => {
  it("is whole days from a day, then hours, then <1h", () => {
    expect(formatPeakIn(0.4)).toBe("<1h")
    expect(formatPeakIn(0.99)).toBe("<1h")
    expect(formatPeakIn(1)).toBe("1h")
    expect(formatPeakIn(5.2)).toBe("5h")
    expect(formatPeakIn(23.4)).toBe("23h")
    expect(formatPeakIn(24)).toBe("1 day")
    expect(formatPeakIn(35)).toBe("1 day")
    expect(formatPeakIn(47)).toBe("2 days")
    expect(formatPeakIn(72)).toBe("3 days")
  })

  it("never says 24h: hours that round to a day read as one", () => {
    expect(formatPeakIn(23.6)).toBe("1 day")
  })
})

describe("the likely range", () => {
  it("is the curve ×1.14 above and ×0.86 below at Now", () => {
    expect(rangeFactorsAt(NOW_H, NOW_H)).toEqual({ upper: 1.14, lower: 0.86 })
    expect(RANGE_AT_NOW).toEqual({ upper: 1.14, lower: 0.86 })
  })

  it("is halfway to its widest three days either side", () => {
    for (const t of [NOW_H - 72, NOW_H + 72]) {
      const k = rangeFactorsAt(t, NOW_H)
      expect(k.upper).toBeCloseTo(1.22, 12)
      expect(k.lower).toBeCloseTo(0.81, 12)
    }
  })

  it("widens in a straight line with the distance from Now", () => {
    const k = rangeFactorsAt(NOW_H + 36, NOW_H)
    expect(k.upper).toBeCloseTo(1.18, 12)
    expect(k.lower).toBeCloseTo(0.835, 12)
  })

  it("is ×1.30 and ×0.76 at six days, and holds there at ten", () => {
    expect(RANGE_WIDEN_H).toBe(144)
    expect(rangeFactorsAt(NOW_H + 144, NOW_H)).toEqual({ upper: 1.3, lower: 0.76 })
    expect(rangeFactorsAt(NOW_H + 240, NOW_H)).toEqual(RANGE_FAR)
    expect(rangeFactorsAt(NOW_H - 240, NOW_H)).toEqual(RANGE_FAR)
  })

  it("brackets every point of the drawn curve", () => {
    const pts = curvePoints(RETA.doses, NOW_H - 240, NOW_H + 144, 200, 144, "injection")
    const band = rangeBand(pts, NOW_H)
    expect(band).toHaveLength(pts.length)
    band.forEach(([t, lo, hi], i) => {
      const [pt, v] = pts[i]
      expect(t).toBe(pt)
      const k = rangeFactorsAt(t, NOW_H)
      expect(lo).toBeCloseTo(v * k.lower, 12)
      expect(hi).toBeCloseTo(v * k.upper, 12)
      expect(lo).toBeLessThanOrEqual(v)
      expect(hi).toBeGreaterThanOrEqual(v)
    })
  })
})

describe("the general line", () => {
  it("words one dose's peak and clearing time as durations", () => {
    expect(formatUsual(144, "injection")).toEqual({ peaksAfter: "2 days", clearsAfter: "31 days" })
    expect(formatUsual(108, "injection")).toEqual({ peaksAfter: "37h", clearsAfter: "23 days" })
    expect(formatUsual(4, "injection")).toEqual({ peaksAfter: "1h", clearsAfter: "21h" })
    expect(formatUsual(2, "injection")).toEqual({ peaksAfter: "41 min", clearsAfter: "10h" })
    expect(formatUsual(48, "oral")).toEqual({ peaksAfter: "3h", clearsAfter: "10 days" })
  })

  it("is the model's own single-dose figures, not a separate estimate", () => {
    for (const c of [RETA, TEST_E, ANAS, BPC, TB]) {
      expect(formatUsual(c.halfLifeH, c.route)).toEqual({
        peaksAfter: formatDuration(peakAfterH(c.halfLifeH, c.route)),
        clearsAfter: formatDuration(clearsAfterH(c.halfLifeH, c.route)),
      })
    }
  })
})

describe("dose runs", () => {
  const weekly = (fromDay: number, n: number): Dose[] =>
    Array.from({ length: n }, (_, i) => ({ atH: (fromDay + i * 7) * 24, amount: 2 }))

  it("splits taken doses at a break, keeps a titration in one run, and marks the current one", () => {
    const doses = [...weekly(0, 4), ...weekly(80, 3).map((d, i) => ({ ...d, amount: 2 + i }))]
    const runs = doseRuns(doses, 96 * 24, 6 * 24)
    expect(runs.map((r) => [r.fromH / 24, r.toH / 24, r.count, r.current])).toEqual([
      [0, 21, 4, false],
      [80, 94, 3, true],
    ])
  })

  it("keeps a daily compound's run whole across a missed day", () => {
    const daily: Dose[] = [0, 1, 2, 4, 5, 6].map((d) => ({ atH: d * 24, amount: 1 }))
    expect(doseRuns(daily, 6.5 * 24, 2).length).toBe(1)
  })

  it("has no current run once the last dose is long past, and none at all before a dose", () => {
    expect(doseRuns(weekly(0, 3), 200 * 24, 6 * 24).at(-1)?.current).toBe(false)
    expect(doseRuns([], 10, 6)).toEqual([])
  })
})
