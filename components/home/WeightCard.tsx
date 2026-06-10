"use client"

import { useEffect, useRef, useState } from "react"
import { Area, AreaChart, Tooltip, XAxis, YAxis } from "recharts"

import { cn } from "@/lib/utils"
import type { DateKey } from "@/lib/home/mockHomeData"

const CHART_HEIGHT = 150
const TREND_WINDOW = 7

type WeightMode = "trend" | "scale"

interface WeightSample {
  key: DateKey
  date: Date
  kg: number
}

interface WeightCardProps {
  /** Resolved series, oldest → newest. */
  series: WeightSample[]
  /** The day the headline + delta are scoped to. */
  selectedKey: DateKey
  unit: string
  /** Describes what the delta is measured against, e.g. "vs. yesterday". */
  scopeLabel: string
  onOpenDetail: () => void
  /** Opens the "log today's weight" sheet (persists to body_metrics). */
  onLogWeight: () => void
}

interface ChartPoint {
  i: number
  kg: number
  trend: number
  label: string
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

function shortDate(d: Date): string {
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

/** Trailing simple moving average — the smoothed "trend" that rides out the
 *  day-to-day scale noise (MacroFactor-style). */
function movingAverage(values: number[], window: number): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}

/**
 * Measure a container's width with a ResizeObserver. We render recharts at an
 * explicit pixel width rather than via ResponsiveContainer — ResponsiveContainer
 * intermittently measures 0 on mobile Safari (the chart then never appears),
 * whereas an observed width is reliable. setState lives in the observer callback,
 * not the effect body.
 */
function useChartWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      if (w > 0) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/**
 * The press-and-hold scrubber label. Recharts injects `active`/`payload`; while a
 * finger is down on the graph it shows the focused series' value at the touched
 * point — and in trend mode says so (the average) — clearing on release. Neutral
 * value (no good/bad colouring).
 */
function ScrubTip({
  active,
  payload,
  unit,
  mode,
}: {
  active?: boolean
  payload?: { payload: ChartPoint }[]
  unit: string
  mode: WeightMode
}) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  const value = mode === "trend" ? point.trend : point.kg
  return (
    <div className="rounded-lg border border-border-default bg-bg-surface-raised px-2.5 py-1.5 shadow-lg">
      <p className="font-mono text-sm font-semibold text-foreground">
        {value.toFixed(1)} {unit}
      </p>
      <p className="text-[11px] text-text-muted">
        {point.label}
        {mode === "trend" ? ` · ${TREND_WINDOW}-day avg` : ""}
      </p>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
      <span
        aria-hidden
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  )
}

/**
 * Weight card: a large mono value + a neutral change vs. the prior reading, over
 * a two-line mini-graph — the raw scale weight (periwinkle) and the smoothed
 * trend (teal), so a noisy scale still has a stable line to read. A Trend/Scale
 * toggle switches which the headline + scrubber follow. Press-and-hold to scrub.
 * Everything is neutral (no green/red good/bad — health data is categorical, not
 * evaluative). Tapping the value navigates to the weight detail; the graph is a
 * scrub surface and does not navigate.
 */
export function WeightCard({
  series,
  selectedKey,
  unit,
  scopeLabel,
  onOpenDetail,
  onLogWeight,
}: WeightCardProps) {
  const [chartRef, chartWidth] = useChartWidth()
  const [mode, setMode] = useState<WeightMode>("trend")

  // Blank template / brand-new user — no readings yet. Show an empty state
  // rather than computing a chart over zero points (which would read NaN).
  if (series.length === 0) {
    return (
      <section className="rounded-2xl border border-border-default bg-bg-surface p-5">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
          Weight
        </p>
        <p className="mt-3 text-sm text-text-muted">
          No weight logged yet. Track your weight to start your trend.
        </p>
        <button
          type="button"
          onClick={onLogWeight}
          className="mt-4 w-full rounded-xl border border-border-default py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-surface-raised/40"
        >
          Log today&apos;s weight
        </button>
      </section>
    )
  }

  const scaleValues = series.map((p) => p.kg)
  const trendValues = movingAverage(scaleValues, TREND_WINDOW)

  const data: ChartPoint[] = series.map((p, i) => ({
    i,
    kg: p.kg,
    trend: Number(trendValues[i].toFixed(2)),
    label: shortDate(p.date),
  }))

  // Headline + delta, scoped to the selected day, for the focused series.
  const selIdx = series.findIndex((s) => s.key === selectedKey)
  const at = selIdx >= 0 ? selIdx : series.length - 1
  const focused = mode === "trend" ? trendValues : scaleValues
  const current = focused[at]
  const delta = at > 0 ? current - focused[at - 1] : 0
  const deltaText = `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)}`

  const allValues = [...scaleValues, ...trendValues]
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)

  return (
    <section className="rounded-2xl border border-border-default bg-bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onOpenDetail}
          className="min-w-0 text-left"
        >
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
            Weight
          </p>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-semibold text-foreground">
              {current.toFixed(1)}
            </span>
            <span className="text-sm text-text-muted">{unit}</span>
          </div>
          <p className="mt-1 font-mono text-sm text-text-muted">
            {deltaText} {unit} <span className="font-sans">{scopeLabel}</span>
          </p>
        </button>

        {/* Mode toggle — switches the headline + scrubber focus. */}
        <div className="inline-flex shrink-0 rounded-full border border-border-default bg-bg-input p-0.5 text-xs">
          {(["trend", "scale"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn(
                "rounded-full px-3 py-1 font-medium transition-colors",
                mode === m
                  ? "bg-bg-surface-raised text-foreground"
                  : "text-text-muted"
              )}
            >
              {m === "trend" ? "Trend" : "Scale"}
            </button>
          ))}
        </div>
      </div>

      {/* Scrub surface — pan-y lets vertical page scroll pass through while a
          horizontal press-and-hold drives the scrubber. */}
      <div
        ref={chartRef}
        className="mt-4 -mx-1 select-none"
        style={{ touchAction: "pan-y", height: CHART_HEIGHT }}
      >
        {chartWidth > 0 ? (
          <AreaChart
            width={chartWidth}
            height={CHART_HEIGHT}
            data={data}
            margin={{ top: 6, right: 6, bottom: 0, left: 6 }}
          >
            <XAxis dataKey="i" hide />
            <YAxis hide domain={[min - 0.6, max + 0.6]} />
            <Tooltip
              content={<ScrubTip unit={unit} mode={mode} />}
              cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
              isAnimationActive={false}
              position={{ y: 0 }}
              offset={0}
            />
            {/* Raw scale weight — thin overlay line, no fill. */}
            <Area
              type="monotone"
              dataKey="kg"
              stroke="var(--chart-line)"
              strokeWidth={1.5}
              strokeOpacity={0.55}
              fill="transparent"
              dot={false}
              activeDot={
                mode === "scale"
                  ? { r: 4, fill: "var(--chart-line)", stroke: "var(--bg-surface)", strokeWidth: 2 }
                  : false
              }
              isAnimationActive={false}
            />
            {/* Smoothed trend — the prominent, filled line. */}
            <Area
              type="monotone"
              dataKey="trend"
              stroke="var(--chart-trend)"
              strokeWidth={2.5}
              fill="var(--chart-trend-fill)"
              dot={false}
              activeDot={
                mode === "trend"
                  ? { r: 4, fill: "var(--chart-trend)", stroke: "var(--bg-surface)", strokeWidth: 2 }
                  : false
              }
              isAnimationActive={false}
            />
          </AreaChart>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-4">
          <LegendDot color="var(--chart-line)" label="Scale" />
          <LegendDot color="var(--chart-trend)" label="Trend" />
        </div>
      </div>

      <button
        type="button"
        onClick={onLogWeight}
        className="mt-3 w-full rounded-xl border border-border-default py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-surface-raised/40"
      >
        Log today&apos;s weight
      </button>
    </section>
  )
}
