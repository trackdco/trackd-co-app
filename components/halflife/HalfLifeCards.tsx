"use client"

import { useId, useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react"

import { Container } from "@/components/containers"
import { ThumbGroup } from "@/components/feel/SlidingThumb"
import { cn } from "@/lib/utils"
import { CARD_EYEBROW, PRESS } from "@/lib/ui-presets"
import { containerColour } from "@/lib/containers/colour"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { blendFor, componentsOf } from "@/lib/compound-blends"
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
  formatAmount,
  formatClearsIn,
  formatDuration,
  formatHalfLife,
  formatHalfLifeShort,
  formatPercent,
  formatSteady,
  type HalfLifeFigures,
} from "@/lib/halflife/model"

import { HalfLifeGraph, type GraphLine } from "./HalfLifeGraph"

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

function Swatch({ hue, dash, width = 12 }: { hue: string; dash?: string; width?: number }) {
  return (
    <svg width={width} height="6" aria-hidden className="shrink-0">
      <line x1="1" y1="3" x2={width - 1} y2="3" stroke={hue} strokeWidth="2" strokeLinecap="round" strokeDasharray={dash} />
    </svg>
  )
}

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

/** The two figure tiles: Circulating, and Of last dose left. */
function FigureTiles({ hue, figures, unit }: { hue: string; figures: HalfLifeFigures; unit: string }) {
  const tile = "hl-tile flex flex-col items-center gap-1.5 rounded-xl px-3 py-3 text-center"
  return (
    <div className="grid grid-cols-2 gap-[7px]" style={{ "--hue": hue } as CSSProperties}>
      <div className={tile}>
        <span className="hl-figure font-mono text-2xl leading-none font-light tracking-[-0.02em]">
          {formatAmount(figures.circulating)}
          <span className="text-xs text-text-muted"> {unit}</span>
        </span>
        <span className="text-[11.5px] text-text-muted">Circulating</span>
      </div>
      <div className={tile}>
        <span className="hl-figure font-mono text-2xl leading-none font-light tracking-[-0.02em]">
          {figures.lastDoseLeft == null ? "—" : formatPercent(figures.lastDoseLeft)}
          {figures.lastDoseLeft == null ? null : <span className="text-xs text-text-muted">%</span>}
        </span>
        <span className="text-[11.5px] text-text-muted">Of last dose left</span>
      </div>
    </div>
  )
}

/** The raised grey card of rows: Half-life, Next dose, Steady, Clears in. */
export function FigureRows({ source, figures }: { source: HalfLifeSource; figures: HalfLifeFigures }) {
  const rows: [string, ReactNode][] = [
    [
      "Half-life",
      <>
        {formatHalfLife(source.halfLifeH)}
        {source.estimated ? <span className="ml-1 font-sans text-[11.5px] text-text-muted">est.</span> : null}
      </>,
    ],
    ["Next dose", figures.nextDoseInH == null ? "—" : formatDuration(figures.nextDoseInH)],
    ["Steady", formatSteady(figures.steady) ?? "—"],
    ["Clears in", figures.clearsInH == null ? "—" : formatClearsIn(figures.clearsInH)],
  ]
  return (
    <div className="lifted-card rounded-xl px-3 py-0.5">
      {rows.map(([label, value], i) => (
        <div key={label} className={cn("flex items-baseline justify-between py-[9px]", i > 0 && "hairline-t")}>
          <span className="text-[13px] text-text-muted">{label}</span>
          <span className="font-mono text-[13.5px] text-foreground">{value}</span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ rows */

export function UpArrowIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M2.5 7.5L6 4l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function UpArrow() {
  return (
    <span
      aria-hidden
      className="hl-up absolute top-1/2 right-[-4px] -mt-[15px] flex h-[30px] w-[30px] items-center justify-center rounded-full bg-bg-surface-raised text-foreground"
    >
      <UpArrowIcon />
    </span>
  )
}

/**
 * One compound's row: a header that opens and closes it, and a body that
 * unfolds beneath. Only one row of a card is open at a time; the others
 * condense (`data-mini`).
 */
function CurveRow({
  compound,
  name = compound.name,
  meta,
  spark,
  open,
  mini,
  first,
  onToggle,
  children,
}: {
  compound: StackCompound
  /** What the row is called, when not the compound's catalogue name. */
  name?: string
  meta: ReactNode
  spark: ReactNode
  open: boolean
  mini: boolean
  first: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const bodyId = useId()
  return (
    <div className={cn("hl-row", !first && "hairline-t")} data-open={open ? "true" : "false"} data-mini={mini ? "true" : "false"}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className={cn(PRESS.row, "hl-head relative flex w-full items-center gap-[11px] text-left")}
      >
        <span className="hl-cont flex shrink-0 items-end justify-center">
          <Container
            name={compound.name}
            inventoryType={inventoryTypeForCompound(compound.name, compound.method, compound.inventoryForm)}
            category={compound.category}
            size={30}
            className="h-full w-full"
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="hl-name truncate text-foreground">{name}</span>
          <span className="hl-meta font-mono text-[9.5px] tracking-[0.07em] whitespace-nowrap text-text-muted">{meta}</span>
        </span>
        <span className="hl-spark shrink-0">{spark}</span>
        <UpArrow />
      </button>
      <div id={bodyId} className="hl-body" aria-hidden={!open}>
        <div>
          <div className="hl-pad flex flex-col gap-[9px] pb-3.5">{children}</div>
        </div>
      </div>
    </div>
  )
}

/** Which row of a card is open, and a count that tells its graph to draw. */
function useOpenRow() {
  const [openId, setOpenId] = useState<string | null>(null)
  const [draws, setDraws] = useState(0)
  const toggle = (id: string) => {
    setOpenId((cur) => (cur === id ? null : id))
    if (openId !== id) setDraws((n) => n + 1)
  }
  return { openId, draws, toggle }
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

/* ------------------------------------------------------------------ cards */

/**
 * The Protocol half-life card (Option A: per-compound rows, tap to expand),
 * for single compounds. A compound with no half-life draws no row, and with
 * none at all the card is not shown.
 */
export function HalfLifeCard({
  compounds,
  logs,
  userId,
}: {
  compounds: readonly StackCompound[]
  logs: DayLogs
  userId: string
}) {
  const now = useMinuteNow()
  const { singles, nowH } = useHalfLifeModels(compounds, logs, userId, now)
  const { openId, draws, toggle } = useOpenRow()
  if (singles.length === 0) return null
  return (
    <section className="flow-card rounded-2xl bg-bg-surface px-5 pt-5 pb-1" aria-label="Half-life">
      <h2 className={CARD_EYEBROW}>Half-life</h2>
      <div className="mt-1.5">
        {singles.map((m, i) => {
          const hl = m.line.source.halfLifeH
          const open = openId === m.compound.id
          return (
            <CurveRow
              key={m.compound.id}
              compound={m.compound}
              first={i === 0}
              open={open}
              mini={openId !== null && !open}
              onToggle={() => toggle(m.compound.id)}
              meta={`t½ ${formatHalfLifeShort(hl)}`}
              spark={<Sparkline lines={m.graph} nowH={nowH} />}
            >
              <HalfLifeGraph
                lines={m.graph}
                t0={nowH - graphBack(hl)}
                t1={nowH + graphAhead(hl)}
                nowH={nowH}
                unit={m.line.unit}
                drawKey={open ? draws : null}
              />
              <FigureTiles hue={m.hue} figures={m.figures} unit={m.line.unit} />
              <FigureRows source={m.line.source} figures={m.figures} />
            </CurveRow>
          )
        })}
      </div>
    </section>
  )
}

/**
 * Blends (Wolverine, Glow, KLOW, CJC + Ipamorelin, NDT): one line per
 * component in Sorbet, told apart by dash too. Tabs on the sliding thumb
 * isolate a line; "All" shows a small tinted tile per component (F1 + L1), a
 * component shows its own tiles and rows.
 */
export function BlendsCard({
  compounds,
  logs,
  userId,
}: {
  compounds: readonly StackCompound[]
  logs: DayLogs
  userId: string
}) {
  const now = useMinuteNow()
  const { blends, nowH } = useHalfLifeModels(compounds, logs, userId, now)
  const { openId, draws, toggle } = useOpenRow()
  const [selected, setSelected] = useState<Record<string, number | null>>({})
  if (blends.length === 0) return null
  return (
    <section className="flow-card rounded-2xl bg-bg-surface px-5 pt-5 pb-1" aria-label="Blends">
      <h2 className={CARD_EYEBROW}>Blends</h2>
      <div className="mt-1.5">
        {blends.map((b, i) => {
          const open = openId === b.compound.id
          const sel = selected[b.compound.id] ?? null
          const hl = Math.max(...b.drawn.map((l) => l.source.halfLifeH))
          const pick = sel == null ? null : b.drawn[sel]
          return (
            <CurveRow
              key={b.compound.id}
              compound={b.compound}
              // "Glow", not "Glow (BPC-157 + TB-500 + GHK-Cu)": the parts are
              // the line beneath it.
              name={blendFor(b.compound.name)?.label ?? b.compound.name}
              first={i === 0}
              open={open}
              mini={openId !== null && !open}
              onToggle={() => toggle(b.compound.id)}
              meta={b.all.map((l) => l.label).join(" · ")}
              spark={<Sparkline lines={b.graph} nowH={nowH} width={70} />}
            >
              <ThumbGroup
                selection={sel}
                thumbClassName="rounded-full bg-bg-surface-raised"
                role="group"
                aria-label={`${b.compound.name} components`}
                className="flex rounded-full bg-bg-input p-[3px]"
              >
                {[null, ...b.drawn.map((_, k) => k)].map((k) => (
                  <button
                    key={k ?? "all"}
                    type="button"
                    aria-pressed={sel === k}
                    onClick={() => setSelected((s) => ({ ...s, [b.compound.id]: k }))}
                    className={cn(
                      PRESS.pill,
                      "flex flex-1 items-center justify-center gap-[5px] rounded-full px-1 py-1.5 text-[11.5px] transition-colors duration-300 ease-out",
                      sel === k ? "text-foreground" : "text-text-muted",
                    )}
                  >
                    {k == null ? "All" : (
                      <>
                        <Swatch hue={blendHue(k)} dash={DASHES[k]} />
                        {b.drawn[k].label}
                      </>
                    )}
                  </button>
                ))}
              </ThumbGroup>
              <HalfLifeGraph
                lines={b.graph}
                t0={nowH - graphBack(hl)}
                t1={nowH + graphAhead(hl)}
                nowH={nowH}
                unit={pick?.unit ?? b.drawn[0].unit}
                drawKey={open ? draws : null}
                selected={sel}
              />
              <div key={sel ?? "all"} className="animate-hl-swap flex flex-col gap-[9px]">
                {pick ? (
                  <>
                    <FigureTiles hue={blendHue(sel!)} figures={b.figures[pick.index]!} unit={pick.unit} />
                    <FigureRows source={pick.source} figures={b.figures[pick.index]!} />
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-[7px]">
                    {b.all.map((l, idx) => {
                      const k = b.drawn.findIndex((d) => d.index === idx)
                      const f = b.figures[idx]
                      const hue = k >= 0 ? blendHue(k) : "var(--text-muted)"
                      return (
                        <div
                          key={l.name}
                          className={cn("flex flex-col gap-[3px] rounded-xl px-[11px] py-2.5", f ? "hl-tile-flat" : "hl-tile-none")}
                          style={{ "--hue": hue } as CSSProperties}
                        >
                          <span className="flex items-center gap-1.5 text-xs text-foreground">
                            {k >= 0 ? <Swatch hue={hue} dash={DASHES[k]} /> : null}
                            {l.name}
                          </span>
                          {f ? (
                            <>
                              <span className="hl-figure mt-1 font-mono text-[19px] font-light tracking-[-0.02em]">
                                {formatAmount(f.circulating)}
                                <span className="ml-0.5 font-sans text-[11px] text-text-muted">{l.unit}</span>
                              </span>
                              <span className="text-[11px] text-text-muted">
                                {f.lastDoseLeft == null ? "No dose yet" : `${formatPercent(f.lastDoseLeft)}% of last dose left`}
                              </span>
                            </>
                          ) : (
                            <span className="mt-1.5 text-[11.5px] text-text-muted">No half-life data</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </CurveRow>
          )
        })}
      </div>
    </section>
  )
}
