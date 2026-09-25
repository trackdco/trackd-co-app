"use client"

import { useId, useMemo, useSyncExternalStore, type ReactNode } from "react"

import { cn } from "@/lib/utils"
import { containerColour } from "@/lib/containers/colour"
import { componentsOf } from "@/lib/compound-blends"
import type { DayLogs } from "@/lib/home/doseLog"
import type { StackCompound } from "@/lib/home/stack"
import { customHalfLives } from "@/lib/home/customCompounds"
import {
  curveLines,
  hoursOf,
  nextDoseAt,
  type CurveLine,
  type HalfLifeSource,
} from "@/lib/halflife/compoundCurve"
import {
  curvePoints,
  figuresAt,
  formatClearsIn,
  formatHalfLife,
  type HalfLifeFigures,
} from "@/lib/halflife/model"

import type { GraphLine } from "./HalfLifeGraph"

/* ------------------------------------------------------------------ time */

/**
 * "Now", refreshed each minute, so "Next dose 19h" does not go stale on an
 * open screen. Figures read it; nothing is stored.
 *
 * NULL until mounted: the server's "now" is not the phone's, and a curve drawn
 * from one and hydrated with the other does not match. The doses are device
 * data anyway, so there is nothing to draw on the server.
 */
export function useMinuteNow(): Date | null {
  const minute = useSyncExternalStore(subscribeMinute, currentMinute, serverMinute)
  return useMemo(() => (minute == null ? null : new Date(minute * 60_000)), [minute])
}

/** The clock as a store: checked every 15s and on return to the app, and only
 *  a new MINUTE re-renders, because the snapshot is the minute number. */
function subscribeMinute(onChange: () => void): () => void {
  const id = window.setInterval(onChange, 15_000)
  document.addEventListener("visibilitychange", onChange)
  return () => {
    window.clearInterval(id)
    document.removeEventListener("visibilitychange", onChange)
  }
}
const currentMinute = () => Math.floor(Date.now() / 60_000)
const serverMinute = () => null

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** How much history a curve shows, in hours: about fourteen half-lives, at
 *  least two days and at most sixteen (the prototype's 16 days back for a
 *  weekly injection, and about 2.3 days for a 4-hour peptide). */
export const graphBack = (hl: number) => clamp(14 * hl, 48, 384)
const sparkBack = (hl: number) => clamp(14 * hl, 48, 288)
/** Ahead of today: half the history, at most eight days. */
export const graphAhead = (hl: number) => Math.min(graphBack(hl) / 2, 192)

/* ---------------------------------------------------------------- pieces */

/** A blend component's dash, by position: solid, dashed, dotted. A fourth is
 *  told apart by dash and label alone (ui-context → "Pushed"). */
const DASHES: (string | undefined)[] = [undefined, "5 3.5", "1.4 3.2", "0.5 3"]
const blendHue = (i: number) => (i < 3 ? `var(--blend-${i + 1})` : "var(--text-muted)")

/** The collapsed row's sparkline: the past only, no today marker, no figure. */
export function Sparkline({
  lines,
  nowH,
  width = 64,
  height = 24,
  stroke = 1.6,
  className,
}: {
  lines: GraphLine[]
  nowH: number
  width?: number
  height?: number
  stroke?: number
  className?: string
}) {
  const uid = useId().replace(/:/g, "")
  const H = height
  const pad = 3
  const drawn = useMemo(() => {
    const back = Math.max(...lines.map((l) => sparkBack(l.source.halfLifeH)))
    const t0 = nowH - back
    const sets = lines.map((l) => curvePoints(l.taken, t0, nowH, 64, l.source.halfLifeH, l.source.route))
    const top = Math.max(1e-9, ...sets.flat().map((p) => p[1])) * 1.15
    return sets.map((pts) => {
      const d = pts
        .map(([t, v], i) => `${i ? "L" : "M"}${(((t - t0) / back) * width).toFixed(1)} ${(pad + (H - 2 * pad) * (1 - v / top)).toFixed(1)}`)
        .join("")
      return { line: d, area: d ? `${d}L${width} ${H - pad}L0 ${H - pad}Z` : "" }
    })
  }, [lines, nowH, width, H])
  return (
    <svg viewBox={`0 0 ${width} ${H}`} width={width} height={H} aria-hidden className={cn("block overflow-visible", className)}>
      <defs>
        <linearGradient id={`${uid}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: lines[0]?.hue }} stopOpacity="0.32" />
          <stop offset="1" style={{ stopColor: lines[0]?.hue }} stopOpacity="0.015" />
        </linearGradient>
      </defs>
      {drawn[0]?.area ? <path d={drawn[0].area} fill={`url(#${uid}s)`} /> : null}
      {drawn.map((d, i) =>
        d.line ? (
          <path
            key={i}
            d={d.line}
            fill="none"
            stroke={lines[i].hue}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={lines[i].dash}
          />
        ) : null,
      )}
    </svg>
  )
}

/**
 * The open card's rows (build-brief-final §3.3): Level (the word only),
 * Half-life ("est." where the catalogue says so), Next dose ("X days"), and
 * "Clears in" once nothing more is due. A row with no value is not drawn: a
 * dash where a fact should be tells the reader nothing (consistency fix #10).
 */
export function FigureRows({ source, figures }: { source: HalfLifeSource; figures: HalfLifeFigures }) {
  const stopped = figures.nextDoseInH == null
  const rows: [string, ReactNode][] = [
    ["Level", levelWord(figures)],
    [
      "Half-life",
      <>
        {formatHalfLife(source.halfLifeH)}
        {source.estimated ? <span className="ml-1 font-sans text-[11.5px] text-text-muted">est.</span> : null}
      </>,
    ],
    ...(figures.nextDoseInH == null ? [] : ([["Next dose", nextDoseWords(figures.nextDoseInH)]] as [string, ReactNode][])),
    ...(stopped && figures.clearsInH != null ? ([["Clears in", formatClearsIn(figures.clearsInH)]] as [string, ReactNode][]) : []),
  ]
  return (
    <div className="inst-rows px-3 py-0.5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between py-[9px]">
          <span className="text-[13px] text-text-muted">{label}</span>
          <span className="font-mono text-[13.5px] text-foreground">{value}</span>
        </div>
      ))}
    </div>
  )
}

/** Level, the word only (round one: Climbing / Holding / Dropping). */
export function levelWord(figures: HalfLifeFigures): string {
  if (figures.nextDoseInH == null) return "Dropping"
  return figures.steady.kind === "in" ? "Climbing" : "Holding"
}

/** Next dose as days: "Today", "1 day", "3 days". */
export function nextDoseWords(h: number): string {
  const d = Math.round(h / 24)
  return d <= 0 ? "Today" : d === 1 ? "1 day" : `${d} days`
}

/* ----------------------------------------------------------------- model */

export interface SingleModel {
  compound: StackCompound
  hue: string
  line: CurveLine & { source: HalfLifeSource }
  /** Built once per data change, so a row opening does not rebuild every
   *  graph on the card (a new array each render did: a 100ms hitch). */
  graph: GraphLine[]
  figures: HalfLifeFigures
}

interface BlendModel {
  compound: StackCompound
  hue: string
  /** Components WITH a half-life, in blend order; they are the graph's lines. */
  drawn: (CurveLine & { source: HalfLifeSource; index: number })[]
  all: CurveLine[]
  graph: GraphLine[]
  figures: (HalfLifeFigures | null)[]
}

export function useHalfLifeModels(
  compounds: readonly StackCompound[],
  logs: DayLogs,
  userId: string,
  now: Date | null,
) {
  const customs = useMemo(() => (now ? customHalfLives(userId) : new Map<string, number>()), [userId, now])
  return useMemo(() => {
    if (!now) return { singles: [] as SingleModel[], blends: [] as BlendModel[], nowH: 0 }
    const nowH = hoursOf(now)
    const singles: SingleModel[] = []
    const blends: BlendModel[] = []
    for (const c of compounds) {
      const hue = containerColour({ category: c.category })
      const next = nextDoseAt(c, logs, now)
      // Enough schedule ahead for the longest window any line could show.
      const lines = curveLines(c, logs, now, nowH + 192, customs)
      const figuresOf = (l: CurveLine) =>
        l.source
          ? figuresAt({ doses: l.taken, halfLifeH: l.source.halfLifeH, route: l.source.route, nowH, nextDoseAtH: next })
          : null
      if (componentsOf(c.name)) {
        const drawn = lines
          .map((l, index) => ({ ...l, index }))
          .filter((l): l is CurveLine & { source: HalfLifeSource; index: number } => l.source != null)
        if (drawn.length === 0) continue
        const graph = drawn.map((l, k) => ({
          source: l.source,
          taken: l.taken,
          toCome: l.toCome,
          hue: blendHue(k),
          dash: DASHES[k],
        }))
        blends.push({ compound: c, hue, drawn, all: lines, graph, figures: lines.map(figuresOf) })
      } else {
        const line = lines[0]
        if (!line?.source) continue
        const src = line.source
        singles.push({
          compound: c,
          hue,
          line: line as SingleModel["line"],
          graph: [{ source: src, taken: line.taken, toCome: line.toCome, hue }],
          figures: figuresOf(line)!,
        })
      }
    }
    return { singles, blends, nowH }
  }, [compounds, logs, customs, now])
}

