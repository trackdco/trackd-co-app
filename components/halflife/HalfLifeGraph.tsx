"use client"

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"

import { PopDialog } from "@/components/feel/PopDialog"
import { cn } from "@/lib/utils"
import {
  amountAt,
  curvePoints,
  formatAmount,
  rangeBand,
  type CurvePoint,
  type Dose,
} from "@/lib/halflife/model"
import type { HalfLifeSource } from "@/lib/halflife/compoundCurve"
import { guideExample } from "@/lib/halflife/guide"
import { HIT_26, PRESS, PRIMARY_BUTTON } from "@/lib/ui-presets"

/** The drawing's own units; the SVG scales to the card. */
const W = 270
const H = 92
const PAD = 8
const IH = H - PAD * 2
/** The whole drawing, with the TODAY label under it. */
export const GRAPH_VIEW = { w: W, h: H + 14 }

/** The top of the scale: the highest the curves reach, with room above; with
 *  the likely range shown, room for its top edge (×1.30) too. */
function graphTop(lines: readonly GraphLine[], t0: number, t1: number, band: boolean): number {
  let mx = 0
  for (const l of lines) {
    const doses = [...l.taken, ...l.toCome]
    for (const [, v] of curvePoints(doses, t0, t1, 200, l.source.halfLifeH, l.source.route)) mx = Math.max(mx, v)
  }
  return (mx || 1) * (band ? 1.36 : 1.15)
}

/** Where a leader to each mark would point, in the drawing's units. */
export interface GraphAnchors {
  band: [number, number] | null
  now: [number, number] | null
  ahead: [number, number] | null
  doses: [number, number] | null
  peak: [number, number] | null
  half: [number, number] | null
}

/**
 * The marks the first "Reading the curve" guide pointed its leaders at, on
 * the scale this graph draws: the range's top edge in the past, Now on the
 * curve, a point on the dashed line ahead, the first dose tick, the upcoming
 * peak, and the top of the ½ line; null for a mark not drawn.
 *
 * The guide now explains with a drawn example and a plain key (Adrian's walk,
 * W2), so no screen calls this. It stays, with the leaders' layout
 * (`layoutGuide`) and their tests (`lib/halflife/guideLayout.test.ts`, cold
 * review B24 / F6 / D3), should the leaders come back.
 */
export function graphAnchors({
  lines,
  t0,
  t1,
  nowH,
  band = false,
  halfAtH = null,
  peakAtH = null,
}: {
  lines: readonly GraphLine[]
  t0: number
  t1: number
  nowH: number
  band?: boolean
  halfAtH?: number | null
  peakAtH?: number | null
}): GraphAnchors {
  const l = lines[0]
  if (!l) return { band: null, now: null, ahead: null, doses: null, peak: null, half: null }
  const top = graphTop(lines, t0, t1, band)
  const X = (t: number) => ((t - t0) / (t1 - t0)) * W
  const Y = (v: number) => PAD + IH - (v / top) * IH
  const all = [...l.taken, ...l.toCome]
  const at = (t: number) => amountAt(t <= nowH ? l.taken : all, t, l.source.halfLifeH, l.source.route)
  const inView = (t: number | null): t is number => t != null && t > t0 && t < t1
  const bandT = nowH - (nowH - t0) * 0.55
  const aheadT = nowH + (t1 - nowH) * 0.55
  const firstTick = l.taken.find((d) => d.atH >= t0 && d.atH <= t1)
  return {
    band: band ? [X(bandT), Y(at(bandT) * rangeBand([[bandT, 1]], nowH)[0][2])] : null,
    now: inView(nowH) ? [X(nowH), Y(at(nowH))] : null,
    ahead: l.toCome.length > 0 && inView(aheadT) ? [X(aheadT), Y(at(aheadT))] : null,
    doses: firstTick ? [X(firstTick.atH), H - 4] : null,
    peak: inView(peakAtH) && peakAtH > nowH ? [X(peakAtH), Y(at(peakAtH))] : null,
    half: inView(halfAtH) ? [X(halfAtH), PAD + 2] : null,
  }
}

/**
 * The fill and the likely range, told apart (Adrian's walk, W3: "bring the
 * gradient back, softer, and keep the range band; the two must read as
 * different things"). The FILL is the chart style's tapered gradient, softer
 * than Weight's 0.35: under the line so far only, fading to nothing at the
 * base. The RANGE is flat, not tapered, fainter, and edged with a hairline top
 * and bottom, so it reads as a band around the line, past and ahead, rather
 * than as more fill. From the approved mock's "over" treatment (`r6/hl7.js`:
 * range 0.13 flat, fill 0.32 to 0), softened.
 */
const FILL_TOP = 0.22
const RANGE_FILL = 0.1
const RANGE_EDGE = 0.32

/** The feel-pass tracer (ui-context → Charts): the line sweeps in over 1470ms
 *  on a quintic ease-out, a 7px ring rides the tip and fades over 320ms, and
 *  the fill waits for the line, then fades in over 520ms. */
const DRAW_MS = 1470
const TIP_FADE_MS = 320
const FILL_FADE_MS = 520
/** The tracer starts once the card has mostly opened, so the expand and the
 *  draw never compete for the same frames (measured 60fps in the preview). */
export const TRACER_DELAY_MS = 380
const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5)

/** One line on the graph: a compound, or one component of a blend. */
export interface GraphLine {
  source: HalfLifeSource
  taken: readonly Dose[]
  toCome: readonly Dose[]
  /** A CSS colour: the compound's category hue, or a blend's Sorbet token. */
  hue: string
  /** A blend component's dash (Sorbet lines are told apart by dash too). */
  dash?: string
}

interface Built {
  past: string
  future: string
  area: string
  pts: CurvePoint[]
}

function build(line: GraphLine, t0: number, t1: number, nowH: number, top: number): Built {
  const doses = [...line.taken, ...line.toCome]
  const pts = curvePoints(doses, t0, t1, 200, line.source.halfLifeH, line.source.route)
  const X = (t: number) => ((t - t0) / (t1 - t0)) * W
  const Y = (v: number) => PAD + IH - (v / top) * IH
  let past = ""
  let future = ""
  for (const [t, v] of pts) {
    const seg = `${X(t).toFixed(1)} ${Y(v).toFixed(1)}`
    if (t <= nowH) past += (past ? "L" : "M") + seg
    // The future overlaps the past by one step so the two meet without a gap.
    if (t >= nowH - (t1 - t0) / 200) future += (future ? "L" : "M") + seg
  }
  const tx = X(Math.min(nowH, t1)).toFixed(1)
  const base = (PAD + IH).toFixed(1)
  const area = past ? `${past}L${tx} ${base}L0 ${base}Z` : ""
  return { past, future, area, pts }
}

/** "Now" · "6h ago" · "In 3d": hours inside two days, days beyond. */
function whenLabel(deltaH: number): string {
  const a = Math.abs(deltaH)
  if (a < 1) return "Now"
  const n = a < 48 ? `${Math.round(a)}h` : `${Math.round(a / 24)}d`
  return deltaH < 0 ? `${n} ago` : `In ${n}`
}

/**
 * The half-life graph, in an inset (ui-context → "The half-life card"). It
 * draws the MODEL's own samples, dense and exact at every dose and peak, so it
 * is a path through them rather than a smoothed spline: the kink where a dose
 * starts absorbing is real, and a spline would round it off.
 *
 * `drawKey` changing (the row opening) draws it in with the tracer. `selected`
 * isolates one line of a blend; the others step back. Press and drag to scrub.
 */
export function HalfLifeGraph({
  lines,
  t0,
  t1,
  nowH,
  unit,
  drawKey,
  selected = null,
  className,
  halfAtH = null,
  doseTicks = false,
  keyed = false,
  band = false,
  showNow = true,
  scrub: scrubbable = true,
}: {
  lines: readonly GraphLine[]
  t0: number
  t1: number
  nowH: number
  /** The unit the scrub reads in. */
  unit: string
  /** Changes when the graph should draw in (a row opening). Null = no draw. */
  drawKey: number | null
  /** The isolated line, or null for all. */
  selected?: number | null
  className?: string
  /** Where "Of last dose left" crosses 50% (the model's depot-plus-curve point,
   *  about 1.14 × the half-life after an injection): a dashed ½ line there. */
  halfAtH?: number | null
  /** The doses as short ticks along the bottom: taken white, to come grey. */
  doseTicks?: boolean
  /** A circled "?" in the graph's own top-right corner that opens "Reading
   *  the curve" (Adrian's walk, W1: no bar, no seam; it sits in the graph). */
  keyed?: boolean
  /** The likely range (×1.14 / ×0.86 at Now, widening to ×1.30 / ×0.76 six
   *  days out) as a band around the line, beside the fill (§3.11; W3). */
  band?: boolean
  /** A past run's graph ends before today: no Now line, no TODAY. */
  showNow?: boolean
  /** Press and drag reads the curve (default on). Off for a drawn example. */
  scrub?: boolean
}) {
  const [keyOpen, setKeyOpen] = useState(false)
  const uid = useId().replace(/:/g, "")
  const top = useMemo(() => graphTop(lines, t0, t1, band), [lines, t0, t1, band])
  const built = useMemo(() => lines.map((l) => build(l, t0, t1, nowH, top)), [lines, t0, t1, nowH, top])
  // The line the fill and the range belong to: the isolated one, or the only
  // one. A blend's "All" draws its lines bare (W5): a band per part would
  // bury them, and a part is one tap away.
  const focusLine = selected ?? (lines.length === 1 ? 0 : null)
  // The likely range around each line: the band, and its two edges. Every
  // line has its own, shown only on the focus line, so a switch between a
  // blend's parts fades one out and the next in rather than popping.
  const ranges = useMemo(() => {
    if (!band) return built.map(() => null)
    const X = (t: number) => (((t - t0) / (t1 - t0)) * W).toFixed(1)
    const Y = (v: number) => (PAD + IH - (v / top) * IH).toFixed(1)
    return built.map((b) => {
      if (b.pts.length === 0) return null
      const r = rangeBand(b.pts, nowH)
      const upper = "M" + r.map(([t, , hi]) => `${X(t)} ${Y(hi)}`).join("L")
      const lower = "M" + r.map(([t, lo]) => `${X(t)} ${Y(lo)}`).join("L")
      const area = upper + "L" + [...r].reverse().map(([t, lo]) => `${X(t)} ${Y(lo)}`).join("L") + "Z"
      return { area, upper, lower }
    })
  }, [band, built, t0, t1, top, nowH])
  const tx = ((Math.min(nowH, t1) - t0) / (t1 - t0)) * W

  // ---- the tracer: per-frame attribute writes, never React state ----
  const svgRef = useRef<SVGSVGElement>(null)
  const drawnKey = useRef<number | null>(null)
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || drawKey == null || drawnKey.current === drawKey) return
    drawnKey.current = drawKey
    const clips = [...svg.querySelectorAll<SVGRectElement>("[data-clip]")]
    const fades = [...svg.querySelectorAll<SVGElement>("[data-fade]")]
    const tip = svg.querySelector<SVGCircleElement>("[data-tip]")
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const show = () => {
      clips.forEach((c) => c.setAttribute("width", String(W)))
      fades.forEach((f) => {
        f.style.transition = `opacity ${FILL_FADE_MS}ms ease`
        f.style.opacity = ""
      })
      if (tip) {
        tip.style.transition = `opacity ${TIP_FADE_MS}ms ease`
        tip.style.opacity = "0"
      }
    }
    if (reduce) {
      show()
      return
    }
    // The line the ring rides: the isolated one, else the first.
    const ride = built[selected ?? 0] ?? built[0]
    const yAt = (x: number) => {
      const t = t0 + (x / W) * (t1 - t0)
      const l = lines[selected ?? 0] ?? lines[0]
      const v = amountAt(l.taken, t, l.source.halfLifeH, l.source.route)
      return PAD + IH - (v / top) * IH
    }
    clips.forEach((c) => c.setAttribute("width", "0"))
    fades.forEach((f) => {
      f.style.transition = "none"
      f.style.opacity = "0"
    })
    if (tip) {
      tip.style.transition = "none"
      tip.style.opacity = ride?.past ? "1" : "0"
      tip.setAttribute("cx", "0")
      tip.setAttribute("cy", yAt(0).toFixed(1))
    }
    let raf = 0
    let t0ms = 0
    const step = (now: number) => {
      if (!t0ms) t0ms = now
      const t = Math.min(1, (now - t0ms) / DRAW_MS)
      const x = tx * easeOutQuint(t)
      clips.forEach((c) => c.setAttribute("width", x.toFixed(1)))
      if (tip) {
        tip.setAttribute("cx", x.toFixed(1))
        tip.setAttribute("cy", yAt(x).toFixed(1))
      }
      if (t < 1) raf = requestAnimationFrame(step)
      else show()
    }
    const wait = window.setTimeout(() => {
      raf = requestAnimationFrame(step)
    }, TRACER_DELAY_MS)
    return () => {
      window.clearTimeout(wait)
      cancelAnimationFrame(raf)
      show()
    }
    // `built`/`lines` change only with the data; a data change mid-draw ends
    // the draw (the cleanup shows it finished) and the new data is not redrawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawKey])

  // ---- the scrub: press and drag, like Weight ----
  const [scrub, setScrub] = useState<{ x: number; y: number; label: string; value: string; frac: number } | null>(null)
  const scrubLine = scrubbable ? focusLine : null
  const scrubAt = (clientX: number) => {
    const svg = svgRef.current
    if (!svg || scrubLine == null) return
    const r = svg.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    const t = t0 + frac * (t1 - t0)
    const l = lines[scrubLine]
    const doses = t <= nowH ? l.taken : [...l.taken, ...l.toCome]
    const v = amountAt(doses, t, l.source.halfLifeH, l.source.route)
    setScrub({
      x: frac * W,
      y: PAD + IH - (v / top) * IH,
      label: whenLabel(t - nowH),
      value: `${formatAmount(v)} ${unit}`,
      frac,
    })
  }

  const DAY_TICKS = useMemo(() => [1, 2].map((j) => (PAD + (IH * j) / 3).toFixed(1)), [])

  return (
    <div className={cn("inset-graph relative rounded-[13px] px-2.5 pt-2.5 pb-1.5", className)}>
      {keyed ? (
        // In the graph's own corner, on the inset itself: no strip, no seam
        // (W1). A dark disc keeps it legible over the curve (the approved
        // mock's `.hq9`). Drawn at 26, pressed at 44 (D8): 9px in from the
        // inset's corner, so the reach is never clipped by the card's grow.
        <span className="absolute top-[9px] right-[9px] z-20 flex">
          <button
            type="button"
            onClick={() => setKeyOpen(true)}
            aria-label="Reading the curve"
            className={cn(
              PRESS.icon,
              HIT_26,
              "flex h-[26px] w-[26px] items-center justify-center rounded-full bg-bg-base/55 text-[12px] font-medium text-foreground shadow-[inset_0_0_0_1.2px_var(--text-muted)] transition-colors",
            )}
          >
            ?
          </button>
        </span>
      ) : null}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H + 14}`}
        className="block h-auto w-full overflow-visible"
        aria-hidden
      >
        <defs>
          {lines.map((l, i) => (
            <linearGradient key={i} id={`${uid}g${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: l.hue }} stopOpacity={FILL_TOP} />
              <stop offset="1" style={{ stopColor: l.hue }} stopOpacity="0" />
            </linearGradient>
          ))}
          {lines.map((_, i) => (
            <clipPath key={i} id={`${uid}c${i}`}>
              <rect data-clip="" x="0" y="0" width={tx.toFixed(1)} height={H} />
            </clipPath>
          ))}
        </defs>
        {DAY_TICKS.map((y) => (
          <line key={y} x1="0" x2={W} y1={y} y2={y} stroke="var(--text-primary)" strokeOpacity="0.05" />
        ))}
        {built.map((b, i) => {
          const dim = selected != null && selected !== i
          // The fill and the range belong to one line: the isolated one, or
          // the only one (see `focusLine`). The outer group's opacity is the
          // switch (a 300ms fade); the inner `data-fade` is the tracer's.
          const range = ranges[i]
          return (
            <g
              key={i}
              className="transition-opacity duration-300 ease-out"
              style={{ opacity: dim ? 0.14 : 1 }}
            >
              {/* The tapered fill under the line so far, then the flat,
                  edged range over it (W3). */}
              {b.area || range ? (
                <g className="transition-opacity duration-300 ease-out" style={{ opacity: focusLine === i ? 1 : 0 }}>
                  {b.area ? <path data-fade="" d={b.area} fill={`url(#${uid}g${i})`} /> : null}
                  {range ? (
                    <g data-fade="">
                      <path d={range.area} style={{ fill: lines[i].hue }} fillOpacity={RANGE_FILL} />
                      {[range.upper, range.lower].map((d, k) => (
                        <path
                          key={k}
                          d={d}
                          fill="none"
                          stroke={lines[i].hue}
                          strokeOpacity={RANGE_EDGE}
                          strokeWidth="0.75"
                          strokeLinejoin="round"
                        />
                      ))}
                    </g>
                  ) : null}
                </g>
              ) : null}
              {b.future ? (
                <path
                  data-fade=""
                  d={b.future}
                  fill="none"
                  stroke={lines[i].hue}
                  strokeWidth="2"
                  strokeDasharray="2.5 3.5"
                  strokeOpacity="0.55"
                  strokeLinecap="round"
                />
              ) : null}
              {b.past ? (
                <g clipPath={`url(#${uid}c${i})`}>
                  <path
                    d={b.past}
                    fill="none"
                    stroke={lines[i].hue}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={lines[i].dash}
                  />
                </g>
              ) : null}
            </g>
          )
        })}
        {halfAtH != null && halfAtH > t0 && halfAtH < t1 ? (
          (() => {
            const hx = ((halfAtH - t0) / (t1 - t0)) * W
            return (
              <g aria-hidden>
                <line x1={hx} x2={hx} y1={PAD} y2={PAD + IH} stroke="var(--text-primary)" strokeOpacity="0.8" strokeDasharray="2 3" />
                <text x={hx + 4} y={PAD + 9} className="font-mono" fontSize="9" fill="var(--text-muted)">
                  ½
                </text>
              </g>
            )
          })()
        ) : null}
        {doseTicks
          ? lines.flatMap((l, i) =>
              (selected != null && selected !== i) ? [] :
              [...l.taken.map((d) => ({ d, taken: true })), ...l.toCome.map((d) => ({ d, taken: false }))]
                .filter(({ d }) => d.atH >= t0 && d.atH <= t1)
                .map(({ d, taken }, j) => (
                  <rect
                    key={`${i}-${j}`}
                    x={(((d.atH - t0) / (t1 - t0)) * W - 1).toFixed(1)}
                    y={H - 7}
                    width="2"
                    height="6"
                    rx="1"
                    style={{ fill: taken ? "var(--text-primary)" : "var(--border-strong)" }}
                  />
                )),
            )
          : null}
        {/* Now: a thin line, no dot. */}
        {showNow && tx > 0 && tx <= W ? (
          <line x1={tx} x2={tx} y1="2" y2={H} stroke="var(--text-primary)" strokeOpacity="0.6" strokeWidth="1" />
        ) : null}
        <circle
          data-tip=""
          r="3.5"
          fill="var(--bg-surface)"
          stroke={lines[selected ?? 0]?.hue}
          strokeWidth="2"
          style={{ opacity: 0 }}
        />
        {scrub ? (
          <>
            <line x1={scrub.x} x2={scrub.x} y1="2" y2={H} stroke="var(--text-primary)" strokeOpacity="0.35" />
            <circle
              cx={scrub.x}
              cy={scrub.y}
              r="4"
              fill={lines[scrubLine ?? 0]?.hue}
              stroke="var(--bg-inset-deep)"
              strokeWidth="2"
            />
          </>
        ) : null}
        {showNow ? (
          <text
            x={tx.toFixed(1)}
            y={H + 12}
            textAnchor="middle"
            className="font-mono"
            fontSize="9"
            letterSpacing="0.08em"
            fill="var(--text-muted)"
          >
            TODAY
          </text>
        ) : null}
      </svg>

      {scrubLine != null ? (
        <div
          className="absolute inset-x-2.5 top-2.5 bottom-5 cursor-ew-resize touch-none"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            scrubAt(e.clientX)
          }}
          onPointerMove={(e) => {
            if (e.buttons || e.pointerType === "touch") scrubAt(e.clientX)
          }}
          onPointerUp={() => setScrub(null)}
          onPointerCancel={() => setScrub(null)}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setScrub(null)
          }}
        />
      ) : null}
      {scrub ? (
        <div
          className="pointer-events-none absolute top-0.5 z-30 -translate-x-1/2 rounded-lg bg-bg-surface-raised px-2 py-1 font-mono text-[10.5px] whitespace-nowrap text-foreground shadow-[0_6px_16px_-8px_rgb(0_0_0)]"
          style={{ left: `calc(10px + ${scrub.frac} * (100% - 20px))` }}
        >
          <span className="mr-1.5 text-text-muted">{scrub.label}</span>
          {scrub.value}
        </div>
      ) : null}
      {keyed ? <GraphKey open={keyOpen} onClose={() => setKeyOpen(false)} hue={lines[focusLine ?? 0]?.hue} /> : null}
    </div>
  )
}

/** The guide's example is drawn in the compound's hue, else the neutral
 *  chart line (the Half-life page's own explainer draws in it). */
const GUIDE_HUE = "var(--chart-line)"

/**
 * A mark of the key, drawn the way the graph draws it, in an 18 × 12 box.
 * Every value here is the graph's own (the line, the fill, the range, Now,
 * the ½ line and the ticks above), so the key can never show a mark the
 * graph does not.
 */
function KeyMark({ kind, hue, uid }: { kind: GuideKey; hue: string; uid: string }) {
  const box = (children: ReactNode) => (
    <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden className="shrink-0 overflow-visible">
      {children}
    </svg>
  )
  switch (kind) {
    case "line":
      return box(
        <>
          <defs>
            <linearGradient id={`${uid}k`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: hue }} stopOpacity={FILL_TOP} />
              <stop offset="1" style={{ stopColor: hue }} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 9.5C4 9.5 5 3 9 3s5 4 9 4V12H0Z" fill={`url(#${uid}k)`} />
          <path d="M0 9.5C4 9.5 5 3 9 3s5 4 9 4" fill="none" stroke={hue} strokeWidth="2" strokeLinecap="round" />
        </>,
      )
    case "range":
      return box(
        <>
          <path d="M0 2.5h18v7H0Z" style={{ fill: hue }} fillOpacity={RANGE_FILL} />
          <path d="M0 2.5h18M0 9.5h18" stroke={hue} strokeOpacity={RANGE_EDGE} strokeWidth="0.75" />
        </>,
      )
    case "ahead":
      return box(
        <path d="M1 6h16" stroke={hue} strokeWidth="2" strokeOpacity="0.55" strokeDasharray="2.5 3.5" strokeLinecap="round" />,
      )
    case "now":
      return box(<path d="M9 0v12" stroke="var(--text-primary)" strokeOpacity="0.6" strokeWidth="1" />)
    case "half":
      return box(<path d="M9 0v12" stroke="var(--text-primary)" strokeOpacity="0.8" strokeDasharray="2 3" />)
    case "taken":
      return box(<rect x="8" y="5" width="2" height="6" rx="1" style={{ fill: "var(--text-primary)" }} />)
    case "toCome":
      return box(<rect x="8" y="5" width="2" height="6" rx="1" style={{ fill: "var(--border-strong)" }} />)
  }
}

type GuideKey = "line" | "range" | "ahead" | "now" | "half" | "taken" | "toCome"

/** The key under the drawn example: a plain legend, in the order the eye
 *  meets the marks, in as few words as each mark needs. */
const GUIDE_KEY: [GuideKey, string][] = [
  ["line", "In you so far"],
  ["range", "Likely range"],
  ["ahead", "Ahead"],
  ["now", "Now"],
  ["half", "½ Last dose half gone"],
  ["taken", "Doses taken"],
  ["toCome", "Doses to come"],
]

/**
 * "READING THE CURVE" (Adrian's walk, W2): the "?" on a compound's page and
 * the one in Home's open graph both open this. Like the Half-life page's own
 * explainer, it explains with a DRAWN graph: one example (`guideExample`,
 * tested to show every mark apart), drawn by this same graph, tracing in as
 * the pop-up lands, with a plain key under it in place of pointers. Then one
 * line, and "Got it". Reduced motion: the pop-up fades and the example shows
 * drawn (the graph's own fallback).
 */
export function GraphKey({ open, onClose, hue = GUIDE_HUE }: { open: boolean; onClose: () => void; hue?: string }) {
  const uid = useId().replace(/:/g, "")
  const example = useMemo(() => {
    const g = guideExample()
    return { ...g, lines: [{ source: g.source, taken: g.taken, toCome: g.toCome, hue }] as GraphLine[] }
  }, [hue])
  return (
    <PopDialog open={open} onClose={onClose} title="Reading the curve" className="max-w-[360px]">
      <HalfLifeGraph
        lines={example.lines}
        t0={example.t0}
        t1={example.t1}
        nowH={example.nowH}
        unit=""
        drawKey={1}
        band
        halfAtH={example.halfAtH}
        doseTicks
        scrub={false}
        className="mt-4"
      />
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 px-0.5" aria-label="Key">
        {GUIDE_KEY.map(([kind, words]) => (
          <li key={kind} className="flex items-center gap-1.5 text-[12.5px] whitespace-nowrap text-text-muted">
            <KeyMark kind={kind} hue={hue} uid={uid} />
            {words}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] leading-snug text-text-muted">Estimated from your doses and your schedule.</p>
      <button type="button" onClick={onClose} className={cn(PRIMARY_BUTTON, "mt-4 w-full py-2.5")}>
        Got it
      </button>
    </PopDialog>
  )
}
