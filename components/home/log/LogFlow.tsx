"use client"

import { createContext, useEffect, useLayoutEffect, useRef, type ReactNode } from "react"

import type { StackCompound } from "@/lib/home/stack"
import type { RowDraft } from "@/lib/home/logDraft"

/**
 * Flow B, as the rows see it. The host (Home, Quick log, the Calendar's day,
 * through `useLogRows`) owns the open row, its draft and the Track bar; a row
 * asks this for what to do with a tap and what to draw under itself. There is
 * one way to log a dose (consistency fix #0), so a row needs a provider.
 */
export interface LogFlow {
  /** `id#slot` of the open row, or null. */
  openKey: string | null
  /** The row still collapsing after it closed, so its panel stays drawn. */
  closingKey: string | null
  /** A tile's panel is open, so every other row condenses. */
  condensed: boolean
  /** The open row's draft, for its descriptor and amount. */
  draft: RowDraft | null
  /** The tick: un-log a logged dose, log the open one, else open it. */
  onTick: (dose: StackCompound, slot: number) => void
  /** The name or the line: open the row (edit mode when logged), or close it. */
  onOpen: (dose: StackCompound, slot: number) => void
  /** The open row's panel. */
  renderPanel: (dose: StackCompound, slot: number) => ReactNode
  /** Close the open row (a group folding over it, a sheet closing). */
  close: () => void
  /** First run: the row whose circle the "Tap the circle" bubble points at. */
  firstRunKey?: string | null
}

export const LogFlowContext = createContext<LogFlow | null>(null)

export const rowKey = (id: string, slot: number) => `${id}#${slot}`

/** Close the open row if it belongs to one of these compounds: a group that
 *  folds must not leave a hidden row open under the Track bar. */
export function closeRowIn(flow: LogFlow, ids: string[]): void {
  const open = flow.openKey
  if (open && ids.some((id) => open.startsWith(`${id}#`))) flow.close()
}

/** A finished day: the edge holds bold, then exhales thin (E4, 2px → 3.5px,
 *  held, → 0.75px over ~3s), then the card settles darker (D1) and stays. */
const EXHALE = {
  keyframes: [
    { strokeWidth: "2px", offset: 0 },
    { strokeWidth: "3.5px", offset: 0.18 },
    { strokeWidth: "3.5px", offset: 0.42 },
    { strokeWidth: "0.75px", offset: 1 },
  ],
  options: { duration: 3000, delay: 760, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "backwards" as const },
}
const SETTLE = { duration: 1800, delay: 760 + 960, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "backwards" as const }

/**
 * The Log card's outside border (L1, Adrian 2026-09-24): a hairline track that
 * FILLS amber a share per dose logged. When the last dose lands it holds bold
 * and exhales thin (E4), staying amber, and the card settles darker and stays.
 * Measured on every resize AND once fonts load: measured once, it drew short.
 */
export function LogEdge({ logged, due }: { logged: number; due: number }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const full = due > 0 && logged >= due
  const wasFull = useRef(full)

  useLayoutEffect(() => {
    const svg = svgRef.current
    const card = svg?.parentElement
    if (!svg || !card) return
    const size = () => {
      const w = card.offsetWidth + 10
      const h = card.offsetHeight + 10
      svg.setAttribute("width", String(w))
      svg.setAttribute("height", String(h))
      svg.querySelectorAll("rect").forEach((r) => {
        r.setAttribute("x", "1")
        r.setAttribute("y", "1")
        r.setAttribute("width", String(Math.max(0, w - 2)))
        r.setAttribute("height", String(Math.max(0, h - 2)))
        r.setAttribute("rx", "20")
      })
    }
    size()
    const ro = new ResizeObserver(size)
    ro.observe(card)
    void document.fonts?.ready.then(size)
    return () => ro.disconnect()
  }, [])

  // The finish plays on the moment the day completes, never on a load of a day
  // that already was.
  useEffect(() => {
    const was = wasFull.current
    wasFull.current = full
    if (!full || was) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const svg = svgRef.current
    const fill = svg?.querySelector<SVGRectElement>(".log-edge-fill")
    const card = svg?.parentElement
    fill?.animate(EXHALE.keyframes, EXHALE.options)
    if (card) {
      // The two tones read as COLOURS: a var() inside WAAPI keyframes is not
      // resolved everywhere (Safari), and an unresolved value snaps.
      const root = getComputedStyle(document.documentElement)
      const from = root.getPropertyValue("--bg-surface").trim()
      const to = root.getPropertyValue("--bg-surface-done").trim()
      if (from && to) card.animate([{ backgroundColor: from }, { backgroundColor: to }], SETTLE)
    }
  }, [full])

  const share = due > 0 ? Math.min(1, logged / due) : 0
  return (
    // Size and fill are set inline too: an SVG with neither is 300x150 and a
    // rect with no fill paints black, which is what a stale stylesheet shows.
    // Positioned inline as well: in the flow, sizing it to the card would grow
    // the card, which re-sizes it, without end.
    <svg
      ref={svgRef}
      className="log-edge"
      width="0"
      height="0"
      aria-hidden
      style={{ position: "absolute", left: -5, top: -5, pointerEvents: "none", overflow: "visible" }}
    >
      <rect className="log-edge-track" fill="none" pathLength={100} />
      <rect
        className="log-edge-fill"
        fill="none"
        pathLength={100}
        style={{ strokeDashoffset: 100 - 100 * share, opacity: logged > 0 ? 1 : 0 }}
      />
    </svg>
  )
}
