"use client"

import { ChevronRight } from "lucide-react"

import type { DateKey } from "@/lib/home/mockHomeData"
import { kgToUnit, type WeightUnit } from "@/lib/weight"

interface WeightGlanceCardProps {
  /** Bodyweight points, oldest → newest. */
  series: { key: DateKey; kg: number }[]
  unit: WeightUnit
  /** Tap → the full Weight view. Logging happens there (and via the + menu). */
  onOpenDetail: () => void
}

const TREND_WINDOW = 7
const SPARK_W = 132
const SPARK_H = 40

/** Trailing simple moving average — the smoothed trend line. */
function movingAverage(values: number[], window: number): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}

/**
 * Home weight card — DISPLAY ONLY (Context/Feature Specs/08 → C, revised). Shows
 * the latest bodyweight + a small trend delta + a mini sparkline, read from the
 * user's `weight_logs`. There is no log button here: tracking happens in the
 * Weight view (reached via the + menu). Tapping the card opens that view.
 * Neutral presentation — no good/bad colouring.
 */
export function WeightGlanceCard({
  series,
  unit,
  onOpenDetail,
}: WeightGlanceCardProps) {
  const empty = series.length === 0

  // Display-unit values + smoothed trend; the sparkline follows the trend.
  const scale = series.map((p) => kgToUnit(p.kg, unit))
  const trend = movingAverage(scale, TREND_WINDOW)
  const last = scale.length ? scale[scale.length - 1] : null
  // Delta over the visible window (latest vs the oldest point shown), trend-based.
  const windowVals = trend.slice(-30)
  const delta =
    windowVals.length > 1 ? windowVals[windowVals.length - 1] - windowVals[0] : 0
  const deltaText = `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)}`

  // Mini sparkline path from the trend (last 30 points).
  const sparkVals = windowVals
  const min = sparkVals.length ? Math.min(...sparkVals) : 0
  const max = sparkVals.length ? Math.max(...sparkVals) : 1
  const range = max - min || 1
  const points = sparkVals
    .map((v, i) => {
      const x = sparkVals.length > 1 ? (i / (sparkVals.length - 1)) * SPARK_W : SPARK_W
      const y = SPARK_H - ((v - min) / range) * (SPARK_H - 4) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")

  return (
    <button
      type="button"
      onClick={onOpenDetail}
      aria-label="Open the weight view"
      className="flex w-full items-center gap-4 rounded-2xl border border-border-default bg-bg-surface p-5 text-left transition-colors hover:bg-bg-surface-raised/40"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
          Weight
        </p>
        {empty ? (
          <p className="mt-2 text-sm text-text-muted">
            No weight logged yet. Track it from the + menu.
          </p>
        ) : (
          <>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="font-mono text-3xl font-semibold text-foreground">
                {last!.toFixed(1)}
              </span>
              <span className="text-sm text-text-muted">{unit}</span>
            </div>
            <p className="mt-1 font-mono text-sm text-text-muted">
              {deltaText} {unit} <span className="font-sans">trend</span>
            </p>
          </>
        )}
      </div>

      {!empty && sparkVals.length > 0 && (
        <svg
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          className="h-10 w-[7.5rem] shrink-0"
          preserveAspectRatio="none"
          aria-hidden
        >
          {sparkVals.length > 1 ? (
            <polyline
              points={points}
              fill="none"
              stroke="var(--chart-trend)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <circle cx={SPARK_W} cy={SPARK_H / 2} r={3} fill="var(--chart-trend)" />
          )}
        </svg>
      )}

      <ChevronRight className="h-5 w-5 shrink-0 text-text-subtle" aria-hidden />
    </button>
  )
}
