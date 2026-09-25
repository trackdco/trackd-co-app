"use client"

import { useId, useMemo, useState, type CSSProperties } from "react"

import { ThumbGroup } from "@/components/feel/SlidingThumb"
import { SolidIcon } from "@/components/feel/SolidIcon"
import { Fold } from "@/components/protocol/pages/Subpage"
import { CATEGORY_META, CATEGORY_DISPLAY_ORDER, type CompoundCategory } from "@/lib/compound-categories"
import { curveLines, hoursAt, hoursOf } from "@/lib/halflife/compoundCurve"
import { amountAt } from "@/lib/halflife/model"
import type { DayLogs } from "@/lib/home/doseLog"
import type { StackCompound } from "@/lib/home/stack"
import { cyclePatternText } from "@/lib/protocol/cyclePage"
import type { CycleRule } from "@/lib/protocol/cycleRule"
import {
  LANES_MAX,
  SMOOTH_AFTER_DAYS,
  TIMELINE_ZOOMS,
  earliestOffset,
  nextTurn,
  nowWords,
  offsetKey,
  onDaysIn,
  onRuns,
  onOnDay,
  rangeEndLabel,
  timelineRange,
  type TimelineZoom,
} from "@/lib/protocol/cycleTimeline"
import { CATEGORY_GLYPH } from "@/lib/solidGlyphs"
import { CARD_EYEBROW, SEGMENTED_ITEM, SEGMENTED_TRACK } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

export interface TimelineCycle {
  compound: StackCompound
  rule: CycleRule
  /** The cycle's colour, as a CSS value. */
  colour: string
}

/**
 * THE TIMELINE (build-brief-final §3.10; renamed from "Live timeline"). Cycles
 * only: a lane per cycle with its curve under it, over 1M / 3M / 1Y / All, a
 * cell a day up to 60 days and smooth bars past that, and the Today line. A
 * lane opens onto where the cycle is, when it next turns, and its pattern.
 *
 * Past four cycles the lanes group by type, one bar per type (darker where
 * more of its cycles are on that day), and a type opens onto a thin bar per
 * cycle, so 12 or 50 cycles still fit on a phone.
 */
export function CyclesTimeline({
  cycles,
  logs,
  todayKey,
}: {
  cycles: TimelineCycle[]
  logs: DayLogs
  todayKey: string
}) {
  const [zoom, setZoom] = useState<TimelineZoom>("3m")
  const [openLane, setOpenLane] = useState<string | null>(null)
  const earliest = useMemo(() => earliestOffset(cycles.map((c) => c.rule), todayKey), [cycles, todayKey])
  const [from, to] = timelineRange(zoom, earliest)
  const span = to - from
  const days = useMemo(
    () => cycles.map((c) => onDaysIn(c.rule, c.compound.pauses, todayKey, [from, to])),
    [cycles, todayKey, from, to],
  )
  const todayPct = ((0 - from) / span) * 100
  const grouped = cycles.length > LANES_MAX

  const groups = useMemo(() => {
    if (!grouped) return []
    const by = new Map<CompoundCategory, number[]>()
    cycles.forEach((c, i) => {
      const list = by.get(c.compound.category) ?? []
      list.push(i)
      by.set(c.compound.category, list)
    })
    return CATEGORY_DISPLAY_ORDER.filter((k) => by.has(k)).map((k) => ({ k, idx: by.get(k)! }))
  }, [cycles, grouped])

  return (
    <section className="animate-home-up inst-card px-4 pt-3.5 pb-4" style={{ animationDelay: "60ms" }}>
      <div className="flex items-center justify-between gap-3">
        <p className={CARD_EYEBROW}>Timeline</p>
        <ThumbGroup
          selection={zoom}
          thumbClassName="inst-thumb"
          role="group"
          aria-label="Range"
          className={cn(SEGMENTED_TRACK, "gap-0.5")}
        >
          {TIMELINE_ZOOMS.map((z) => (
            <button
              key={z.key}
              type="button"
              aria-pressed={zoom === z.key}
              onClick={() => setZoom(z.key)}
              className={cn(
                SEGMENTED_ITEM,
                "font-mono",
                zoom === z.key ? "text-bg-base" : "text-text-muted",
              )}
            >
              {z.label}
            </button>
          ))}
        </ThumbGroup>
      </div>

      <div className="relative mt-3 mb-2 h-3 font-mono text-[10px] text-text-muted">
        <span className="absolute left-0">{rangeEndLabel(todayKey, from, span)}</span>
        <span className="absolute -translate-x-1/2 text-foreground" style={{ left: `${todayPct}%` }}>
          Today
        </span>
        <span className="absolute right-0">{rangeEndLabel(todayKey, to - 1, span)}</span>
      </div>

      <div className="relative flex flex-col gap-3">
        {grouped
          ? groups.map(({ k, idx }) => {
              const open = openLane === `g:${k}`
              const counts = Array.from({ length: span }, (_, d) => idx.filter((i) => days[i][d]).length)
              return (
                <div key={k}>
                  <button
                    type="button"
                    onClick={() => setOpenLane(open ? null : `g:${k}`)}
                    aria-expanded={open}
                    className="block w-full text-left"
                  >
                    <span className="mb-1 flex items-center gap-1.5 text-[12px] text-foreground">
                      <SolidIcon name={CATEGORY_GLYPH[k] ?? "catPeptide"} size={12} hue={`var(--cat-${k})`} />
                      {CATEGORY_META[k].label}
                      <span className="font-mono text-[11px] text-text-muted">{idx.length}</span>
                    </span>
                    <Bar
                      on={counts.map((n) => n > 0)}
                      weight={counts.map((n) => n / idx.length)}
                      hue={`var(--cat-${k})`}
                      smooth={span > SMOOTH_AFTER_DAYS}
                      height={8}
                    />
                  </button>
                  <Fold open={open}>
                    {/* Full width, the name above: every bar lines up with Today. */}
                    <div className="flex flex-col gap-2 pt-2.5">
                      {idx.map((i) => (
                        <div key={cycles[i].compound.id}>
                          <span className="mb-0.5 block truncate text-[11px] text-text-muted">{cycles[i].compound.name}</span>
                          <Bar on={days[i]} hue={cycles[i].colour} smooth={span > SMOOTH_AFTER_DAYS} height={4} />
                        </div>
                      ))}
                    </div>
                  </Fold>
                </div>
              )
            })
          : cycles.map((c, i) => {
              const open = openLane === c.compound.id
              const onToday = onOnDay(c.rule, c.compound.pauses, todayKey)
              const turn = nextTurn(c.rule, c.compound.pauses, todayKey)
              return (
                <div key={c.compound.id}>
                  <button
                    type="button"
                    onClick={() => setOpenLane(open ? null : c.compound.id)}
                    aria-expanded={open}
                    className="block w-full text-left"
                  >
                    <span className="mb-1 flex items-baseline justify-between gap-2 text-[12px]">
                      <span className="truncate text-foreground">{c.compound.name}</span>
                      <span className="shrink-0 font-mono text-[11px] text-text-muted">
                        {nowWords(c.rule, c.compound.pauses, todayKey)}
                      </span>
                    </span>
                    <Bar on={days[i]} hue={c.colour} smooth={span > SMOOTH_AFTER_DAYS} height={7} />
                    <LaneCurve compound={c.compound} logs={logs} todayKey={todayKey} from={from} to={to} hue={c.colour} tall={open} />
                  </button>
                  <Fold open={open}>
                    {/* Over the Today line, which stops at the lanes. */}
                    <div className="inst-rows relative z-10 mt-2.5">
                      {[
                        ["Now", nowWords(c.rule, c.compound.pauses, todayKey)],
                        [onToday ? "Next off" : "Back on", turn ?? "None"],
                        ["Pattern", cyclePatternText(c.rule.pattern)],
                      ].map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between gap-3 px-3 py-2 text-[12px]">
                          <span className="text-text-muted">{label}</span>
                          <span className="font-mono text-[12px] text-foreground">{value}</span>
                        </div>
                      ))}
                    </div>
                  </Fold>
                </div>
              )
            })}
        <i
          aria-hidden
          className="pointer-events-none absolute -top-1 bottom-0 w-[1.5px] rounded-[1px] bg-foreground"
          style={{ left: `calc(${todayPct}% - 0.75px)` }}
        />
      </div>
    </section>
  )
}

/** One lane's bar: a cell a day, or smooth runs on a long range. `weight`
 *  (0..1) deepens a grouped cell by how many of its cycles are on. */
function Bar({
  on,
  weight,
  hue,
  smooth,
  height,
}: {
  on: boolean[]
  weight?: number[]
  hue: string
  smooth: boolean
  height: number
}) {
  const style = { "--hue": hue, height } as CSSProperties
  if (smooth) {
    const n = on.length
    return (
      <span aria-hidden className="cy-track block" style={style}>
        {onRuns(on).map(([a, b]) => (
          <i key={a} style={{ left: `${(a / n) * 100}%`, width: `${Math.max(0.6, ((b - a) / n) * 100)}%` }} />
        ))}
      </span>
    )
  }
  return (
    <span aria-hidden className="cy-cells" style={{ ...style, gap: on.length > 40 ? 0 : 1 }}>
      {on.map((v, d) => (
        <i
          key={d}
          data-on={v ? "true" : "false"}
          style={v && weight ? { opacity: 0.35 + 0.65 * (weight[d] ?? 1) } : undefined}
        />
      ))}
    </span>
  )
}

/** The compound's level across the range, under its lane: taken doses solid,
 *  the ones to come dashed. None for a compound with no half-life.
 *
 *  Each point is the AVERAGE level over its slice of the range, not the level
 *  at an instant: at a month or more, a daily peptide's every spike would draw
 *  a comb. Averaged, a compound that clears between doses reads as the steady
 *  level it keeps, and a weekly one keeps its rise and fall. */
function LaneCurve({
  compound,
  logs,
  todayKey,
  from,
  to,
  hue,
  tall,
}: {
  compound: StackCompound
  logs: DayLogs
  todayKey: string
  from: number
  to: number
  hue: string
  tall: boolean
}) {
  const gid = useId().replace(/:/g, "")
  const path = useMemo(() => {
    const t0 = hoursAt(offsetKey(todayKey, from), "00:00")
    const t1 = hoursAt(offsetKey(todayKey, to), "00:00")
    const now = new Date()
    const line = curveLines(compound, logs, now, t1).find((l) => l.source)
    if (!line?.source) return null
    const doses = [...line.taken, ...line.toCome]
    if (doses.length === 0) return null
    // A slice is at least a day, so a daily dose averages to its level.
    const B = Math.min(150, to - from)
    const step = (t1 - t0) / B
    const pts: [number, number][] = []
    for (let i = 0; i <= B; i++) {
      const t = t0 + step * i
      let sum = 0
      for (let k = 0; k < 8; k++) sum += amountAt(doses, t - step / 2 + (step * k) / 7, line.source.halfLifeH, line.source.route)
      pts.push([t, sum / 8])
    }
    const max = Math.max(...pts.map((p) => p[1]))
    if (!(max > 0)) return null
    const W = 300
    const H = 100
    const X = (t: number) => ((t - t0) / (t1 - t0)) * W
    const Y = (v: number) => H - (v / (max * 1.12)) * H
    const nowH = hoursOf(now)
    const past = pts.filter((p) => p[0] <= nowH)
    const ahead = pts.filter((p) => p[0] >= nowH)
    const d = (ps: typeof pts) => (ps.length ? "M" + ps.map((p) => `${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join("L") : "")
    const area = past.length ? `${d(past)}L${X(past[past.length - 1][0]).toFixed(1)} ${H}L${X(past[0][0]).toFixed(1)} ${H}Z` : ""
    return { past: d(past), ahead: d(ahead), area }
  }, [compound, logs, todayKey, from, to])
  if (!path) return null
  return (
    <svg
      viewBox="0 0 300 100"
      preserveAspectRatio="none"
      aria-hidden
      className="mt-1 block w-full transition-[height] duration-300"
      style={{ height: tall ? 44 : 24 }}
    >
      <defs>
        <linearGradient id={`lc${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={hue} stopOpacity="0.32" />
          <stop offset="1" stopColor={hue} stopOpacity="0" />
        </linearGradient>
      </defs>
      {path.area ? <path d={path.area} fill={`url(#lc${gid})`} /> : null}
      <path d={path.past} fill="none" stroke={hue} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <path
        d={path.ahead}
        fill="none"
        stroke={hue}
        strokeWidth={1.4}
        strokeDasharray="3 3"
        opacity={0.85}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
