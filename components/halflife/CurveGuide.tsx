"use client"

import { useCallback } from "react"

import { PopDialog } from "@/components/feel/PopDialog"
import { GRAPH_VIEW, HalfLifeGraph, graphAnchors, type GraphAnchors, type GraphLine } from "@/components/halflife/HalfLifeGraph"
import { layoutGuide, type GuideLabel, type GuideSide } from "@/lib/halflife/model"
import { PRIMARY_BUTTON } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

type LabelKey = keyof GraphAnchors

/** The labels, and the side each prefers: over the chart, or under it. */
const LABELS: [LabelKey, string, GuideSide][] = [
  ["band", "Likely range", "top"],
  ["now", "Now", "top"],
  ["ahead", "Ahead", "top"],
  ["doses", "Your doses", "bot"],
  ["peak", "Peak", "bot"],
  ["half", "½ Last dose half gone", "bot"],
]

/** The inner lane's distance from the wrap's edge; the outer lane sits at 0. */
const LANE_INNER = 22
/** The pop-up scales in over 340ms (PopDialog): lay out again once it has. */
const AFTER_SCALE_IN_MS = 380

/**
 * Measure the guide and place its labels and leaders, straight onto the DOM.
 * The placing itself is `layoutGuide` (lib/halflife/model), which is tested:
 * every shown label holds its own leader, and no leader runs into another
 * label. Every label starts each layout shown and measurable, so one hidden by
 * the last layout is never measured at 0 wide (cold review S2).
 */
function place(
  wrap: HTMLDivElement,
  anchors: GraphAnchors,
): void {
  const svg = wrap.querySelector<SVGSVGElement>("[data-guide-chart] svg")
  const overlay = wrap.querySelector<SVGSVGElement>("[data-guide-lines]")
  if (!svg || !overlay) return
  // The pop-up may still be scaling in: measure in layout pixels, not the
  // scaled box.
  const W = wrap.getBoundingClientRect()
  const s = W.width / wrap.offsetWidth || 1
  const C = svg.getBoundingClientRect()
  const at = ([x, y]: [number, number]): [number, number] => [
    (C.left - W.left) / s + (x / GRAPH_VIEW.w) * (C.width / s),
    (C.top - W.top) / s + (y / GRAPH_VIEW.h) * (C.height / s),
  ]
  const els = new Map<LabelKey, HTMLElement>()
  const labels: GuideLabel<LabelKey>[] = []
  let labelH = 0
  for (const [key, , prefer] of LABELS) {
    const el = wrap.querySelector<HTMLElement>(`[data-guide-label="${key}"]`)
    if (!el) continue
    el.style.display = ""
    el.style.visibility = "hidden"
    const a = anchors[key]
    // A mark the chart does not draw has no label.
    if (!a) {
      el.style.display = "none"
      continue
    }
    const [px, py] = at(a)
    labels.push({ key, px, py, w: el.offsetWidth, prefer })
    labelH = Math.max(labelH, el.offsetHeight)
    els.set(key, el)
  }
  const placed = layoutGuide(labels, {
    width: wrap.offsetWidth,
    height: wrap.offsetHeight,
    labelH,
    laneInner: LANE_INNER,
  })
  let marks = ""
  const shown = new Set<LabelKey>()
  for (const p of placed) {
    const el = els.get(p.key)
    const it = labels.find((l) => l.key === p.key)
    if (!el || !it) continue
    shown.add(p.key)
    el.style.left = `${p.left}px`
    el.style.top = `${p.top}px`
    el.style.bottom = "auto"
    el.style.visibility = "visible"
    marks += `<line x1="${it.px.toFixed(1)}" y1="${p.y0.toFixed(1)}" x2="${it.px.toFixed(1)}" y2="${it.py.toFixed(1)}" stroke="var(--text-muted)" stroke-width="1"/><circle cx="${it.px.toFixed(1)}" cy="${it.py.toFixed(1)}" r="2" fill="var(--text-primary)"/>`
  }
  for (const [key, el] of els) if (!shown.has(key)) el.style.display = "none"
  overlay.innerHTML = marks
}

/**
 * "Reading the curve" (build-brief-final §3.11): the compound's own chart,
 * with a straight vertical leader from each mark to its label along the top or
 * the bottom, never overlapping: Likely range, Now, Ahead, Your doses, Peak
 * (when one is coming), ½ Last dose half gone. A mark the chart does not draw
 * has no label. No paragraph; "Got it" closes it.
 */
export function CurveGuide({
  open,
  onClose,
  lines,
  t0,
  t1,
  nowH,
  unit,
  halfAtH,
  peakAtH,
}: {
  open: boolean
  onClose: () => void
  lines: readonly GraphLine[]
  t0: number
  t1: number
  nowH: number
  unit: string
  halfAtH: number | null
  peakAtH: number | null
}) {
  // Laid out once the pop-up has mounted, again once it has finished scaling
  // in (and once its fonts have landed), and whenever it changes size. The
  // ref's cleanup stops all of it when the pop-up closes or the data changes.
  const layout = useCallback(
    (wrap: HTMLDivElement | null) => {
      if (!wrap) return
      const anchors = graphAnchors({ lines, t0, t1, nowH, band: true, halfAtH, peakAtH })
      let alive = true
      let raf = 0
      const run = () => {
        if (!alive) return
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(() => {
          if (alive) place(wrap, anchors)
        })
      }
      run()
      const settle = window.setTimeout(run, AFTER_SCALE_IN_MS)
      const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(run)
      ro?.observe(wrap)
      void document.fonts?.ready.then(run)
      return () => {
        alive = false
        cancelAnimationFrame(raf)
        window.clearTimeout(settle)
        ro?.disconnect()
      }
    },
    [lines, t0, t1, nowH, halfAtH, peakAtH],
  )

  return (
    <PopDialog open={open} onClose={onClose} title="Reading the curve" className="max-w-[360px]">
      <div ref={layout} className="relative mt-1 py-[46px]">
        <div data-guide-chart="">
          <HalfLifeGraph lines={lines} t0={t0} t1={t1} nowH={nowH} unit={unit} drawKey={null} band halfAtH={halfAtH} doseTicks />
        </div>
        <svg data-guide-lines="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" />
        {LABELS.map(([key, text]) => (
          <span
            key={key}
            data-guide-label={key}
            className="invisible absolute rounded-md bg-bg-surface-raised px-1.5 py-0.5 text-[11px] leading-[14px] whitespace-nowrap text-foreground"
            style={{ top: 0, left: 0 }}
          >
            {text}
          </span>
        ))}
      </div>
      <button type="button" onClick={onClose} className={cn(PRIMARY_BUTTON, "mt-4 w-full py-2.5")}>
        Got it
      </button>
    </PopDialog>
  )
}
