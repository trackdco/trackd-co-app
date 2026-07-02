"use client"

import { useState } from "react"
import { ChevronRight, Scale } from "lucide-react"

import { cn } from "@/lib/utils"
import { CARD_ICON_BADGE, CARD_TITLE } from "@/lib/ui-presets"
import type { DateKey } from "@/lib/home/mockHomeData"
import { kgToUnit, type WeightUnit } from "@/lib/weight"

interface WeightGlanceCardProps {
  /** Bodyweight points, oldest → newest. */
  series: { key: DateKey; kg: number }[]
  unit: WeightUnit
  /** Tap → the full Weight view. Logging happens there (and via the + menu). */
  onOpenDetail: () => void
}

type WeightMode = "trend" | "scale"

const TREND_WINDOW = 7
const WINDOW = 30
const SPARK_W = 132
const SPARK_H = 40

/** Trailing simple moving average — the smoothed trend line. */
function movingAverage(values: number[], window: number): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}

function sparkPoints(vals: number[]): string {
  if (vals.length === 0) return ""
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  return vals
    .map((v, i) => {
      const x = vals.length > 1 ? (i / (vals.length - 1)) * SPARK_W : SPARK_W
      const y = SPARK_H - ((v - min) / range) * (SPARK_H - 4) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
}

interface Stat {
  last: number | null
  deltaText: string
}

function stat(vals: number[]): Stat {
  const last = vals.length ? vals[vals.length - 1] : null
  const delta = vals.length > 1 ? vals[vals.length - 1] - vals[0] : 0
  return { last, deltaText: `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)}` }
}

/**
 * Home / Progress weight card — DISPLAY ONLY. Latest bodyweight + delta + a mini
 * sparkline, read from the user's `weight_logs`. A **Trend / Scale** toggle right
 * on the card switches what it shows — the smoothed trend vs the raw scale — with
 * an opacity **crossfade** (value, delta, and sparkline all fade between, matching
 * the full Weight view). Tapping the card opens that view; logging happens there
 * and via the + menu. Neutral presentation — no good/bad colouring.
 */
export function WeightGlanceCard({ series, unit, onOpenDetail }: WeightGlanceCardProps) {
  // Starts on the raw SCALE reading; the user can switch to the smoothed trend
  // themselves (matches the full Weight view — never auto-selects trend).
  const [mode, setMode] = useState<WeightMode>("scale")
  const empty = series.length === 0

  const scaleAll = series.map((p) => kgToUnit(p.kg, unit))
  const trendAll = movingAverage(scaleAll, TREND_WINDOW)
  const scaleW = scaleAll.slice(-WINDOW)
  const trendW = trendAll.slice(-WINDOW)
  const scaleStat = stat(scaleW)
  const trendStat = stat(trendW)

  return (
    <div className="rounded-2xl border border-border-default bg-bg-surface">
      {/* Header — label + the Trend/Scale toggle. */}
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-1.5">
        <div className="flex min-w-0 items-center gap-3.5">
          <span aria-hidden className={CARD_ICON_BADGE}>
            <Scale className="h-5 w-5" />
          </span>
          <p className={`${CARD_TITLE} truncate`}>Weight</p>
        </div>

        {!empty && (
          <div className="inline-flex shrink-0 rounded-full border border-border-default bg-bg-input p-0.5 text-[11px]">
            {(["trend", "scale"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={cn(
                  "rounded-full px-2.5 py-1 font-medium transition-colors duration-300 ease-out",
                  mode === m ? "bg-bg-surface-raised text-foreground" : "text-text-muted",
                )}
              >
                {m === "trend" ? "Trend" : "Scale"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content — tappable into the full Weight view. */}
      <button
        type="button"
        onClick={onOpenDetail}
        aria-label="Open the weight view"
        className="flex w-full items-center gap-4 rounded-b-2xl px-5 pb-5 text-left transition-colors hover:bg-bg-surface-raised/30"
      >
        {empty ? (
          <p className="text-sm text-text-muted">
            No weight logged yet. Track it from the + menu.
          </p>
        ) : (
          <>
            {/* Value + delta — the two modes crossfade in place. */}
            <span className="relative block min-w-0 flex-1">
              <ValueBlock active={mode === "trend"} s={trendStat} unit={unit} kind="trend" />
              <span className="absolute inset-0">
                <ValueBlock active={mode === "scale"} s={scaleStat} unit={unit} kind="scale" />
              </span>
            </span>

            {/* Sparkline — both lines rendered, crossfading by mode. */}
            <svg
              viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
              className="h-10 w-[7.5rem] shrink-0"
              preserveAspectRatio="none"
              aria-hidden
            >
              <SparkLine vals={scaleW} color="var(--chart-line)" active={mode === "scale"} />
              <SparkLine vals={trendW} color="var(--chart-trend)" active={mode === "trend"} />
            </svg>

            <ChevronRight className="h-5 w-5 shrink-0 text-text-subtle" aria-hidden />
          </>
        )}
      </button>
    </div>
  )
}

function ValueBlock({
  active,
  s,
  unit,
  kind,
}: {
  active: boolean
  s: Stat
  unit: WeightUnit
  kind: WeightMode
}) {
  return (
    <span
      className={cn(
        "block transition-opacity duration-300 ease-out",
        active ? "opacity-100" : "opacity-0",
      )}
    >
      <span className="flex items-baseline gap-1.5">
        <span className="font-mono text-3xl font-semibold text-foreground">
          {s.last == null ? "—" : s.last.toFixed(1)}
        </span>
        <span className="text-sm text-text-muted">{unit}</span>
      </span>
      <span className="mt-1 block font-mono text-sm text-text-muted">
        {s.deltaText} {unit} <span className="font-sans">{kind}</span>
      </span>
    </span>
  )
}

function SparkLine({
  vals,
  color,
  active,
}: {
  vals: number[]
  color: string
  active: boolean
}) {
  const cls = cn("transition-opacity duration-300 ease-out", active ? "opacity-100" : "opacity-0")
  if (vals.length <= 1) {
    return <circle cx={SPARK_W} cy={SPARK_H / 2} r={3} fill={color} className={cls} />
  }
  return (
    <polyline
      points={sparkPoints(vals)}
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinejoin="round"
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      className={cls}
    />
  )
}
