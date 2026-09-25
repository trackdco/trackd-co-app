"use client"

import { useCallback } from "react"

import { PopDialog } from "@/components/feel/PopDialog"
import { GRAPH_VIEW, HalfLifeGraph, graphAnchors, type GraphAnchors, type GraphLine } from "@/components/halflife/HalfLifeGraph"
import { PRIMARY_BUTTON } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

/** The labels, and the row each prefers: over the chart, or under it. */
const LABELS: [keyof GraphAnchors, string, "top" | "bot"][] = [
  ["band", "Likely range", "top"],
  ["now", "Now", "top"],
  ["ahead", "Ahead", "top"],
  ["doses", "Your doses", "bot"],
  ["peak", "Peak", "bot"],
  ["half", "½ Last dose half gone", "bot"],
]

interface Placed {
  el: HTMLElement
  px: number
  py: number
  w: number
  left?: number
}

const GAP = 6
/** The inner lane's distance from the wrap's edge; the outer lane sits at 0. */
const LANE_INNER = 22
/** How far a leader must stay inside its label, so it reads as the label's. */
const INSET = 5

/**
 * Lay labels along one lane: each as near over its mark as it can sit, pushed
 * right past the one before and then back left from the edge, never touching.
 * When one cannot keep its mark inside it (its leader would not be STRAIGHT),
 * the widest label is handed back; so is one whose leader would cross `avoid`, the
 * labels of the lane nearer the chart.
 */
function laneFit(list: Placed[], width: number, avoid: Placed[] = []): Placed[] {
  // The leader stays INSET inside its label, except at the chart's own edge,
  // where the label cannot move further out than the edge.
  const holds = (it: Placed, left: number) =>
    left >= 0 &&
    left + it.w <= width + 0.5 &&
    it.px >= left + Math.min(INSET, it.px - left) &&
    it.px <= left + it.w - Math.min(INSET, left + it.w - it.px)
  const ideal = (it: Placed) => Math.max(0, Math.min(width - it.w, it.px - it.w / 2))
  let items = list.filter(
    (it) => holds(it, ideal(it)) && !avoid.some((o) => o.left != null && it.px > o.left - 3 && it.px < o.left + o.w + 3),
  )
  const refused = list.filter((it) => !items.includes(it))
  items.sort((a, b) => a.px - b.px)
  for (;;) {
    const lefts = items.map(ideal)
    for (let i = 1; i < items.length; i++) lefts[i] = Math.max(lefts[i], lefts[i - 1] + items[i - 1].w + GAP)
    for (let i = items.length - 1; i >= 0; i--) {
      const edge = i === items.length - 1 ? width : lefts[i + 1] - GAP
      lefts[i] = Math.min(lefts[i], edge - items[i].w)
    }
    if (items.every((it, i) => holds(it, lefts[i]))) {
      items.forEach((it, i) => (it.left = lefts[i]))
      return refused
    }
    // Hand back the WIDEST label: it is the likeliest to fit further out,
    // where its leader can pass between the narrow ones.
    const widest = items.reduce((w, it, i) => (it.w > items[w].w ? i : w), 0)
    refused.push(items[widest])
    items = items.filter((_, i) => i !== widest)
  }
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
  // Laid out once the pop-up has mounted, straight onto the DOM: the labels
  // are measured, then placed, and the leaders drawn to their marks.
  const layout = useCallback(
    (wrap: HTMLDivElement | null) => {
      if (!wrap) return
      requestAnimationFrame(() => {
        const svg = wrap.querySelector<SVGSVGElement>("[data-guide-chart] svg")
        const overlay = wrap.querySelector<SVGSVGElement>("[data-guide-lines]")
        if (!svg || !overlay) return
        const A = graphAnchors({ lines, t0, t1, nowH, band: true, halfAtH, peakAtH })
        // The pop-up scales in: measure in layout pixels, not the scaled box.
        const W = wrap.getBoundingClientRect()
        const s = W.width / wrap.offsetWidth || 1
        const C = svg.getBoundingClientRect()
        const at = ([x, y]: [number, number]): [number, number] => [
          (C.left - W.left) / s + (x / GRAPH_VIEW.w) * (C.width / s),
          (C.top - W.top) / s + (y / GRAPH_VIEW.h) * (C.height / s),
        ]
        const rows: Record<"top" | "bot", Placed[]> = { top: [], bot: [] }
        for (const [key, , row] of LABELS) {
          const el = wrap.querySelector<HTMLElement>(`[data-guide-label="${key}"]`)
          const a = A[key]
          if (!el) continue
          if (!a) {
            el.style.display = "none"
            continue
          }
          const [px, py] = at(a)
          rows[row].push({ el, px, py, w: el.offsetWidth })
        }
        const width = wrap.offsetWidth
        // Inner lanes first, each side's own labels; what does not fit tries
        // the outer lane on its side, then the other side.
        const lanes: Record<"top" | "bot", [Placed[], Placed[]]> = { top: [[], []], bot: [[], []] }
        const all = [...rows.top, ...rows.bot]
        all.forEach((it) => (it.left = undefined))
        const left: Record<"top" | "bot", Placed[]> = {
          top: laneFit(rows.top, width),
          bot: laneFit(rows.bot, width),
        }
        lanes.top[0] = rows.top.filter((it) => it.left != null)
        lanes.bot[0] = rows.bot.filter((it) => it.left != null)
        for (const side of ["top", "bot"] as const) {
          const other = side === "top" ? "bot" : "top"
          const outer = [...lanes[side][1], ...left[side]]
          const back = laneFit(outer, width, lanes[side][0])
          lanes[side][1] = outer.filter((it) => !back.includes(it))
          if (back.length) left[other] = [...left[other], ...back]
        }
        // A last try on the other side's outer lane for what was handed across.
        for (const side of ["bot", "top"] as const) {
          const extra = left[side].filter((it) => it.left == null && !lanes[side][1].includes(it))
          if (!extra.length) continue
          const outer = [...lanes[side][1], ...extra]
          const back = laneFit(outer, width, lanes[side][0])
          lanes[side][1] = outer.filter((it) => !back.includes(it))
          back.forEach((it) => (it.left = undefined))
        }
        let lines_ = ""
        const shown = new Set<Placed>()
        for (const side of ["top", "bot"] as const) {
          lanes[side].forEach((lane, depth) => {
            for (const it of lane) {
              if (it.left == null) continue
              shown.add(it)
              it.el.style.left = `${it.left}px`
              // The inner lane sits next to the chart, the outer one beyond it.
              const off = depth === 0 ? LANE_INNER : 0
              it.el.style.top = side === "top" ? `${off}px` : "auto"
              it.el.style.bottom = side === "bot" ? `${off}px` : "auto"
              it.el.style.visibility = "visible"
              const ly = side === "top" ? it.el.offsetTop + it.el.offsetHeight : it.el.offsetTop
              lines_ += `<line x1="${it.px.toFixed(1)}" y1="${ly.toFixed(1)}" x2="${it.px.toFixed(1)}" y2="${it.py.toFixed(1)}" stroke="var(--text-muted)" stroke-width="1"/><circle cx="${it.px.toFixed(1)}" cy="${it.py.toFixed(1)}" r="2" fill="var(--text-primary)"/>`
            }
          })
        }
        all.forEach((it) => {
          if (!shown.has(it)) it.el.style.display = "none"
        })
        overlay.innerHTML = lines_
      })
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
