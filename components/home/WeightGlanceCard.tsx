"use client"

import { useState } from "react"
import { CaretRight } from "@/components/icons"

import { cn } from "@/lib/utils"
import { CARD_EYEBROW, METRIC_VALUE, UNIT_SUFFIX } from "@/lib/ui-presets"
import type { DateKey } from "@/lib/home/mockHomeData"
import { kgToUnit, type WeightUnit } from "@/lib/weight"
import { sparkGeometry, sparkLastPoint } from "@/lib/progress/spark"

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

interface Stat {
  last: number | null
  /** Null until there are TWO readings to compare. */
  deltaText: string | null
}

function stat(vals: number[]): Stat {
  const last = vals.length ? vals[vals.length - 1] : null
  // A single reading has no trend. Defaulting the delta to 0 rendered a
  // confident "+0.0 kg" on a user's first ever weigh-in, which states a
  // measured fact ("you have not changed") that nothing measured. One reading
  // is a value, not a change.
  if (vals.length < 2) return { last, deltaText: null }
  const delta = vals[vals.length - 1] - vals[0]
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
export function WeightGlanceCard({
  series,
  unit,
  onOpenDetail,
  compact = false,
}: WeightGlanceCardProps & {
  /**
   * Progress's two-up grid (spec 08 · part two): the same card stacked into a
   * square instead of laid out in a row. Same data, same Trend/Scale toggle,
   * same tap target — a second weight card would be a second thing to keep in
   * step, and there is exactly one weight surface by design.
   */
  compact?: boolean
}) {
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

  if (compact) {
    return (
      <div className="flex flex-col rounded-2xl bg-bg-surface p-5">
        <p className={cn(CARD_EYEBROW, "truncate")}>Weight</p>
        {empty ? (
          // Tappable in the EMPTY state too. It used to be a bare paragraph, so
          // this was the one card on Progress that named something you could do
          // and then gave you no way to do it — the affordance only appeared
          // once a reading existed, which is exactly backwards.
          <button
            type="button"
            onClick={onOpenDetail}
            aria-label="Log your first weight"
            className="mt-3 flex flex-1 flex-col items-start text-left"
          >
            <span className="text-sm text-text-muted">No weight logged yet.</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onOpenDetail}
              aria-label="Open the weight view"
              className="mt-3 flex flex-1 flex-col items-start text-left"
            >
              <span className="relative block w-full">
                <ValueBlock active={mode === "trend"} s={trendStat} unit={unit} kind="trend" />
                <span className="absolute inset-0">
                  <ValueBlock active={mode === "scale"} s={scaleStat} unit={unit} kind="scale" />
                </span>
              </span>
              <svg
                viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
                className="mt-3 h-10 w-full"
                preserveAspectRatio="none"
                aria-hidden
              >
                <SparkLine
                  vals={scaleW}
                  color="var(--chart-line)"
                  gradientId="weightSparkScaleCompact"
                  active={mode === "scale"}
                />
                <SparkLine
                  vals={trendW}
                  color="var(--chart-trend)"
                  gradientId="weightSparkTrendCompact"
                  active={mode === "trend"}
                />
              </svg>
            </button>
            {/* The toggle stays: it is the card's only control and the spec
                names it explicitly. Full width here rather than railed right,
                because a third of a square is not enough for two labels. */}
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-full border border-border-default bg-bg-input p-0.5 text-[11px]">
              {(["trend", "scale"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={cn(
                    "rounded-full py-1 font-medium transition-colors duration-300 ease-out",
                    // Touch area extended to 44px with a transparent
                    // pseudo-element (25 + 2x10), so the pill keeps its compact
                    // look and stops being a 25px-tall target.
                    "relative before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-['']",
                    mode === m ? "bg-bg-surface-raised text-foreground" : "text-text-muted",
                  )}
                >
                  {m === "trend" ? "Trend" : "Scale"}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-bg-surface">
      {/* Header — label + the Trend/Scale toggle. */}
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-1.5">
        <div className="flex min-w-0 items-center">
          <p className={cn(CARD_EYEBROW, "truncate")}>Weight</p>
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
                  "relative before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-['']",
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
              <SparkLine
                vals={scaleW}
                color="var(--chart-line)"
                gradientId="weightSparkScale"
                active={mode === "scale"}
              />
              <SparkLine
                vals={trendW}
                color="var(--chart-trend)"
                gradientId="weightSparkTrend"
                active={mode === "trend"}
              />
            </svg>

            <CaretRight className="h-5 w-5 shrink-0 text-text-subtle" aria-hidden />
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
        <span className={METRIC_VALUE}>
          {s.last == null ? "—" : s.last.toFixed(1)}
        </span>
        <span className={UNIT_SUFFIX}>{unit}</span>
      </span>
      <span className="mt-1 block font-mono text-sm text-text-muted">
        {s.deltaText === null ? (
          // One reading: state what there is, claim no movement.
          <span className="font-sans">First reading</span>
        ) : (
          <>
            {s.deltaText} {unit} <span className="font-sans">{kind}</span>
          </>
        )}
      </span>
    </span>
  )
}

/**
 * One reading's line, in the SAME visual language as the consistency graph
 * beside it on Progress (Adrian, 2026-07-31): a monotone curve at 2.5, over a
 * gradient that fades from the line down to the baseline. It was a straight
 * 2px polyline with no fill, so the two charts on that screen read as two
 * different products. Only the COLOUR differs, which is the one thing that
 * should — scale and trend keep their own.
 *
 * That now holds for the raw Scale line too (Adrian, 2026-08-07). It used to
 * draw thinner and unfilled, matching `/weight`; both screens have since moved
 * to one weight and one fill for every series, so the distinction the old
 * `emphasis` prop encoded is gone. Which series you are reading is carried by
 * the crossfade and the colour, not by the stroke.
 */
function SparkLine({
  vals,
  color,
  gradientId,
  active,
}: {
  vals: number[]
  color: string
  gradientId: string
  active: boolean
}) {
  const cls = cn("transition-opacity duration-300 ease-out", active ? "opacity-100" : "opacity-0")
  if (vals.length <= 1) {
    // Single reading — just the white latest-point marker (spec).
    return <circle cx={SPARK_W} cy={SPARK_H / 2} r={3} fill="var(--accent-primary)" className={cls} />
  }
  const { line, area } = sparkGeometry(vals, SPARK_W, SPARK_H)
  const last = sparkLastPoint(vals, SPARK_W, SPARK_H)
  return (
    <g className={cls}>
      <defs>
        {/* Same stops as `consistencyFill`: 0.35 at the line, 0 at the base. */}
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {last && <circle cx={last.x} cy={last.y} r={2.5} fill="var(--accent-primary)" />}
    </g>
  )
}
