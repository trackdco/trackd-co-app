import { describe, expect, it } from "vitest"

import { GRAPH_VIEW, graphAnchors, type GraphAnchors, type GraphLine } from "@/components/halflife/HalfLifeGraph"
import type { DayLogs } from "@/lib/home/doseLog"
import { toDateKey } from "@/lib/home/mockHomeData"
import type { StackCompound } from "@/lib/home/stack"

import { curveLines, hoursOf } from "./compoundCurve"
import {
  GUIDE_CLEAR,
  GUIDE_GAP,
  GUIDE_TWIN,
  guideHolds,
  halfGoneAtH,
  heldScroll,
  layoutGuide,
  peakCountdown,
  type Dose,
  type GuideBox,
  type GuideLabel,
  type GuidePlaced,
  type GuideSide,
} from "./model"

/**
 * The "Reading the curve" guide's labels (build-brief-final §3.11: straight
 * vertical leaders, never overlapping) and the rail's hold on a tapped card.
 * Cold review B24 / F6 / D3 (the Peak leader ran into the ½ label) and F7 (a
 * side card jumped to the centre in one frame).
 */

/* ------------------------------------------------------------ fixtures */

/** The preview's Now and dose times (lib/halflife/model.test.ts). */
const NOW_H = 28.55 * 24
const at = (day: number) => (day + 0.33) * 24
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

/** The labels as the guide has them, with their widths at 11px Plex Sans. */
const LABELS: [keyof GraphAnchors, number, GuideSide][] = [
  ["band", 70, "top"],
  ["now", 32, "top"],
  ["ahead", 42, "top"],
  ["doses", 66, "bot"],
  ["peak", 36, "bot"],
  ["half", 128, "bot"],
]
const LABEL_H = 18
const LANE_INNER = 22

/** A preview line at the preview's Now (model.test.ts's fixtures). */
function previewLine(doses: Dose[], halfLifeH: number): { line: GraphLine; nowH: number } {
  const taken = doses.filter((d) => d.atH <= NOW_H)
  const toCome = doses.filter((d) => d.atH > NOW_H && d.atH <= NOW_H + 192)
  return { line: { source: { halfLifeH, estimated: false, route: "injection" }, taken, toCome, hue: "x" }, nowH: NOW_H }
}

/**
 * The preview's own Testosterone Enanthate (app/preview/protocol/preview.tsx:
 * 250 mg every other day at 09:00, days -70 to 0, skipping each eleventh),
 * as the compound page builds it at `now`. From 09:00 on 26 Sep its next peak
 * sits 3px from the ½ line: the review's screen (F6, D3).
 */
function previewTestE(now: Date): { line: GraphLine; nowH: number } {
  const today = new Date(2026, 8, 26)
  const off = (d: number) => toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + d))
  const c: StackCompound = {
    id: "pv-test-e",
    name: "Testosterone Enanthate",
    category: "anabolic",
    method: "im",
    dose: 250,
    unit: "mg",
    schedule: { cadence: { type: "everyOtherDay" }, timeOfDay: "09:00", startDate: off(-70) },
    rotationSites: [],
    rotationIndex: 1,
  }
  const logs: DayLogs = {}
  for (let d = 70; d >= 0; d--) {
    if (d % 2 === 0 && d % 11 !== 0) logs[off(-d)] = { "pv-test-e": { amount: "250", unit: "mg", siteId: null, time24: "09:00" } }
  }
  const nowH = hoursOf(now)
  const [l] = curveLines(c, logs, now, nowH + 192)
  return { line: { source: l.source!, taken: l.taken, toCome: l.toCome, hue: "x" }, nowH }
}

/** The guide as CurveGuide lays it out at `width`: the chart inset 10px each
 *  side under a 46px band, its SVG 270 × 106 scaled to fit; the window is the
 *  compound page's (sixteen days back, eight ahead, for these half-lives). */
function guideCase({ line, nowH }: { line: GraphLine; nowH: number }, width: number) {
  const { halfLifeH, route } = line.source
  const t0 = nowH - 384
  const t1 = nowH + 192
  const all = [...line.taken, ...line.toCome]
  const peak = peakCountdown(all, nowH, halfLifeH, route)
  const A = graphAnchors({
    lines: [line],
    t0,
    t1,
    nowH,
    band: true,
    halfAtH: halfGoneAtH(all, nowH, halfLifeH, route),
    peakAtH: peak.kind === "ahead" || peak.kind === "next" ? peak.atH : null,
  })
  const svgW = width - 20
  const svgH = (svgW * GRAPH_VIEW.h) / GRAPH_VIEW.w
  const box: GuideBox = { width, height: 46 + 10 + svgH + 6 + 46, labelH: LABEL_H, laneInner: LANE_INNER }
  const labels: GuideLabel[] = []
  for (const [key, w, prefer] of LABELS) {
    const a = A[key]
    if (!a) continue
    labels.push({ key, w, prefer, px: 10 + (a[0] / GRAPH_VIEW.w) * svgW, py: 56 + (a[1] / GRAPH_VIEW.h) * svgH })
  }
  return { labels, box }
}

/** Everything the brief promises of a laid-out guide. */
function expectSound(labels: readonly GuideLabel[], box: GuideBox, placed: readonly GuidePlaced[]) {
  const byKey = new Map(labels.map((l) => [l.key, l]))
  const span = (p: GuidePlaced) => {
    const py = byKey.get(p.key)!.py
    return p.side === "top" ? [p.y0, py] : [py, p.y0]
  }
  for (const p of placed) {
    const it = byKey.get(p.key)!
    // Its own leader, straight and inside it (not merely near it).
    expect(guideHolds(it.px, it.w, p.left, box.width), `${p.key} holds its leader`).toBe(true)
    expect(p.left).toBeGreaterThanOrEqual(-1e-6)
    expect(p.left + it.w).toBeLessThanOrEqual(box.width + 0.5)
    expect(p.y0).toBe(p.side === "top" ? p.top + box.labelH : p.top)
    for (const q of placed) {
      if (q === p) continue
      const other = byKey.get(q.key)!
      // Never overlapping.
      if (q.side === p.side && q.lane === p.lane) {
        const apart = p.left + it.w + GUIDE_GAP <= q.left + 1e-6 || q.left + other.w + GUIDE_GAP <= p.left + 1e-6
        expect(apart, `${p.key} and ${q.key} overlap`).toBe(true)
      }
      // No leader runs into another label.
      const [a0, a1] = span(p)
      const across = it.px > q.left - GUIDE_CLEAR && it.px < q.left + other.w + GUIDE_CLEAR
      const through = a0 < q.top + box.labelH && a1 > q.top
      expect(across && through, `${p.key}'s leader runs into ${q.key}`).toBe(false)
      // Two leaders never run side by side as one line.
      if (Math.abs(it.px - other.px) < GUIDE_TWIN) {
        const [b0, b1] = span(q)
        expect(Math.max(a0, b0) < Math.min(a1, b1), `${p.key} and ${q.key} leaders run together`).toBe(false)
      }
    }
  }
}

/* ---------------------------------------------------------------- the rule */

describe("a label holds its leader only when the leader is inside it", () => {
  it("refuses the layout the old check let through (Peak at 185-221, its leader at 275)", () => {
    expect(guideHolds(275, 36, 185, 312)).toBe(false)
    expect(guideHolds(228, 36, 0, 312)).toBe(false)
  })
  it("keeps the leader 5px inside, except at the guide's own edge", () => {
    expect(guideHolds(100, 36, 80, 312)).toBe(true)
    expect(guideHolds(83, 36, 80, 312)).toBe(false)
    expect(guideHolds(2, 36, 0, 312)).toBe(true)
    expect(guideHolds(311, 36, 276, 312)).toBe(true)
  })
})

/* ------------------------------------------------------------- real guides */

describe("the guide's layout", () => {
  const RETA = previewLine(monThu(5, 44, 2), 144)
  const TEST_E_MONTHU = previewLine(monThu(5, 44, 125), 108)

  for (const width of [287, 302, 312, 320]) {
    it(`the preview's Test E at ${width}px: the peak 3px from the ½ line, every label holds its own leader`, () => {
      const { labels, box } = guideCase(previewTestE(new Date(2026, 8, 26, 10, 0)), width)
      const peak = labels.find((l) => l.key === "peak")!
      const half = labels.find((l) => l.key === "half")!
      expect(Math.abs(peak.px - half.px)).toBeLessThan(GUIDE_TWIN)
      const placed = layoutGuide(labels, box)
      expect(placed.map((p) => p.key).sort()).toEqual(labels.map((l) => l.key).sort())
      expectSound(labels, box, placed)
      // The two marks cannot share a lane, so one of them moved.
      const [pp, hp] = ["peak", "half"].map((k) => placed.find((p) => p.key === k)!)
      expect(pp.side !== hp.side || pp.lane !== hp.lane).toBe(true)
    })

    it(`the preview's Test E at ${width}px, every hour of two days: all shown, all sound`, () => {
      for (let h = 0; h < 48; h++) {
        const { labels, box } = guideCase(previewTestE(new Date(2026, 8, 26, h, 0)), width)
        const placed = layoutGuide(labels, box)
        expect(placed, `at ${h}:00`).toHaveLength(labels.length)
        expectSound(labels, box, placed)
      }
    })

    it(`Test E twice a week at ${width}px: every label shows and holds its own leader`, () => {
      const { labels, box } = guideCase(TEST_E_MONTHU, width)
      const placed = layoutGuide(labels, box)
      expect(placed).toHaveLength(labels.length)
      expectSound(labels, box, placed)
    })

    it(`Retatrutide at ${width}px: every label shows and holds its own leader`, () => {
      const { labels, box } = guideCase(RETA, width)
      const placed = layoutGuide(labels, box)
      expect(placed).toHaveLength(labels.length)
      expectSound(labels, box, placed)
    })
  }

  it("the review's Retatrutide at 312px: the Peak leader lands inside the Peak label", () => {
    const { labels, box } = guideCase(RETA, 312)
    const placed = layoutGuide(labels, box)
    const peak = labels.find((l) => l.key === "peak")!
    const p = placed.find((q) => q.key === "peak")!
    expect(peak.px).toBeGreaterThanOrEqual(p.left)
    expect(peak.px).toBeLessThanOrEqual(p.left + peak.w)
  })

  it("keeps each label on its own side when there is room", () => {
    const box: GuideBox = { width: 312, height: 230, labelH: LABEL_H, laneInner: LANE_INNER }
    const labels: GuideLabel[] = [
      { key: "now", px: 150, py: 90, w: 32, prefer: "top" },
      { key: "doses", px: 40, py: 170, w: 66, prefer: "bot" },
      { key: "half", px: 220, py: 58, w: 128, prefer: "bot" },
    ]
    const placed = layoutGuide(labels, box)
    expect(placed.map((p) => [p.key, p.side, p.lane])).toEqual([
      ["now", "top", 0],
      ["doses", "bot", 0],
      ["half", "bot", 0],
    ])
    expectSound(labels, box, placed)
  })

  it("two marks 3px apart anywhere across the chart: both shown, neither leader in the other's label", () => {
    const box: GuideBox = { width: 302, height: 223, labelH: LABEL_H, laneInner: LANE_INNER }
    for (let x = 12; x <= 287; x += 5) {
      const labels: GuideLabel[] = [
        { key: "band", px: 60, py: 70, w: 70, prefer: "top" },
        { key: "now", px: 190, py: 110, w: 32, prefer: "top" },
        { key: "doses", px: 30, py: 170, w: 66, prefer: "bot" },
        { key: "peak", px: x, py: 80, w: 36, prefer: "bot" },
        { key: "half", px: x + 3, py: 58, w: 128, prefer: "bot" },
      ]
      const placed = layoutGuide(labels, box)
      expectSound(labels, box, placed)
      // Only one leader per side can pass one spot, so a THIRD mark on top of
      // the pair must give way; anywhere else all five show.
      const crowded = labels.slice(0, 3).some((m) => Math.abs(m.px - x) < 12 || Math.abs(m.px - x - 3) < 12)
      if (!crowded) expect(placed, `at ${x}`).toHaveLength(labels.length)
    }
  })

  it("holds its promises for any marks at all (seeded fuzz), hiding a label only when nothing fits", () => {
    let seed = 7
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
    const box: GuideBox = { width: 302, height: 223, labelH: LABEL_H, laneInner: LANE_INNER }
    let hidden = 0
    for (let n = 0; n < 150; n++) {
      const labels: GuideLabel[] = LABELS.filter(() => rand() > 0.15).map(([key, w, prefer]) => ({
        key,
        w,
        prefer,
        px: 10 + rand() * (box.width - 20),
        py: 56 + rand() * 110,
      }))
      const placed = layoutGuide(labels, box)
      hidden += labels.length - placed.length
      expectSound(labels, box, placed)
    }
    // Four lanes hold six labels: random marks hardly ever force one out.
    expect(hidden).toBeLessThan(5)
  })

  it("is quick enough to run on every open and resize", () => {
    const { labels, box } = guideCase(previewTestE(new Date(2026, 8, 26, 10, 0)), 302)
    const t = performance.now()
    for (let i = 0; i < 10; i++) layoutGuide(labels, box)
    expect((performance.now() - t) / 10).toBeLessThan(40)
  })
})

/* ----------------------------------------------------------------- the rail */

describe("the rail's hold on a tapped card (F7)", () => {
  it("starts where the card sat and ends centred, with no jump", () => {
    expect(heldScroll(400, -245, 0, 460)).toBe(155)
    expect(heldScroll(400, -245, 460, 460)).toBe(400)
    expect(heldScroll(400, -245, 900, 460)).toBe(400)
  })

  it("moves a little each frame, on the grow's ease-out, and follows the card as it moves", () => {
    let prev = -Infinity
    let biggest = 0
    for (let ms = 0; ms <= 460; ms += 16) {
      const x = heldScroll(400, -245, ms, 460)
      expect(x).toBeGreaterThanOrEqual(prev)
      if (prev > -Infinity) biggest = Math.max(biggest, x - prev)
      prev = x
    }
    // The old pin moved the whole 245px in one frame.
    expect(biggest).toBeLessThan(60)
    // Held on the card: a centre that moves carries the scroll with it.
    expect(heldScroll(420, -245, 230, 460) - heldScroll(400, -245, 230, 460)).toBeCloseTo(20, 9)
  })

  it("simply holds the centre card, and a zero-length grow lands centred", () => {
    expect(heldScroll(400, 0, 100, 460)).toBe(400)
    expect(heldScroll(400, -245, 0, 0)).toBe(400)
  })
})
