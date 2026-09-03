"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, Tooltip, XAxis, YAxis } from "recharts";

import { cn } from "@/lib/utils";
import { CARD_EYEBROW, METRIC_VALUE, UNIT_SUFFIX } from "@/lib/ui-presets";
import { dateKeyToDate, type DateKey } from "@/lib/home/mockHomeData";
import {
  defaultRangeFor,
  kgToUnit,
  rangesForSpan,
  type WeightUnit,
} from "@/lib/weight";

/**
 * The Trend / Scale graph card, shared by `/weight` and a block's weight sheet.
 *
 * It was lifted out of `WeightView` when the block retrospective needed the same
 * graph over a bounded window. Rebuilding the chart there would have created the
 * second line idiom `ui-context.md` bans ("one line treatment, every series,
 * every graph"), and the two would have drifted the first time either was
 * retuned.
 *
 * The ONLY thing the scope changes is which ranges are on offer and what "All"
 * means. Stroke, curve, fill, the crossfade and the scrub are identical, because
 * a block's weight graph should look like the weight graph.
 */

const CHART_HEIGHT = 170;
const TREND_WINDOW = 7;
const DIMMED = "opacity-[0.3]";

type WeightMode = "trend" | "scale";

export interface WeightPoint {
  key: DateKey;
  kg: number;
}

interface ChartPoint {
  i: number;
  scale: number;
  trend: number;
  label: string;
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function shortDate(key: DateKey): string {
  const d = dateKeyToDate(key);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** Trailing simple moving average — the smoothed "trend" that rides out the
 *  day-to-day scale noise. */
function movingAverage(values: number[], window: number): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

/** Observed width via ResizeObserver — ResponsiveContainer intermittently
 *  measures 0 on mobile Safari, so we size the chart explicitly. */
function useChartWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const dayNumber = (key: DateKey) =>
  Math.floor(dateKeyToDate(key).getTime() / 86_400_000);

export function WeightGraph({
  entries,
  unit,
  anchorKey,
  spanDays = null,
  className,
  style,
}: {
  /** Oldest → newest, already clipped to the scope if there is one. */
  entries: WeightPoint[];
  unit: WeightUnit;
  /** The day the ranges count BACK from: today on `/weight`, a block's last day
   *  inside a block, so a closed block does not measure from now. */
  anchorKey: DateKey;
  /** The scope's length in days, or null for the whole history. Decides which
   *  ranges are offered (`rangesForSpan`). */
  spanDays?: number | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  // Weight starts on the raw SCALE reading; the user can switch to the smoothed
  // trend themselves. (We never auto-select trend.)
  const [mode, setMode] = useState<WeightMode>("scale");

  const ranges = rangesForSpan(spanDays);
  const [rangeId, setRangeId] = useState<string>(() => defaultRangeFor(spanDays));
  // A scope can change under the component (another block selected), so a range
  // that is no longer offered has to fall back rather than window to nothing.
  const range = ranges.find((r) => r.id === rangeId) ?? ranges[ranges.length - 1];

  // Full chart series (display units), oldest → newest. Trend is the SMA over the
  // whole series so the window's left edge still has a proper trailing average.
  const scaleAll = useMemo(
    () => entries.map((e) => kgToUnit(e.kg, unit)),
    [entries, unit],
  );
  const trendAll = useMemo(() => movingAverage(scaleAll, TREND_WINDOW), [scaleAll]);

  // Window the series to the chosen range (by date, so a sparse log still works).
  const cutoffN =
    range.days === Number.POSITIVE_INFINITY
      ? -Infinity
      : dayNumber(anchorKey) - range.days;
  const windowed: ChartPoint[] = entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => dayNumber(e.key) >= cutoffN)
    .map(({ e, i }, j) => ({
      i: j,
      scale: Number(scaleAll[i].toFixed(2)),
      trend: Number(trendAll[i].toFixed(2)),
      label: shortDate(e.key),
    }));

  const hasData = windowed.length > 0;
  const focusedSeries = windowed.map((p) => (mode === "trend" ? p.trend : p.scale));
  const current = hasData ? focusedSeries[focusedSeries.length - 1] : null;
  // Null until there are TWO readings: one weigh-in is a value, not a change,
  // and defaulting to 0 rendered "+0.0 kg over this range" as though the user
  // had held steady when nothing had been measured twice.
  const delta =
    focusedSeries.length > 1
      ? focusedSeries[focusedSeries.length - 1] - focusedSeries[0]
      : null;
  const deltaText =
    delta === null ? null : `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)}`;

  const allVals = windowed.flatMap((p) => [p.scale, p.trend]);
  const min = hasData ? Math.min(...allVals) : 0;
  const max = hasData ? Math.max(...allVals) : 0;

  const [chartRef, chartWidth] = useChartWidth();

  return (
    <section className={cn("rounded-2xl bg-bg-surface p-5", className)} style={style}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={CARD_EYEBROW}>{mode === "trend" ? "Trend" : "Scale"}</p>
          {current != null ? (
            <>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className={METRIC_VALUE}>{current.toFixed(1)}</span>
                <span className={UNIT_SUFFIX}>{unit}</span>
              </div>
              <p className="mt-1 font-mono text-sm text-text-muted">
                {deltaText === null ? (
                  <span className="font-sans">One reading in this range</span>
                ) : (
                  <>
                    {deltaText} {unit}{" "}
                    <span className="font-sans">over this range</span>
                  </>
                )}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-text-muted">No readings in range.</p>
          )}
        </div>

        {/* Mode toggle. */}
        <div className="inline-flex shrink-0 rounded-full border border-border-default bg-bg-input p-0.5 text-xs">
          {(["trend", "scale"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn(
                "rounded-full px-3 py-1 font-medium transition-colors duration-300 ease-out",
                mode === m ? "bg-bg-surface-raised text-foreground" : "text-text-muted",
              )}
            >
              {m === "trend" ? "Trend" : "Scale"}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={chartRef}
        className="mt-4 -mx-1 select-none"
        style={{ touchAction: "pan-y", height: CHART_HEIGHT }}
      >
        {hasData && chartWidth > 0 ? (
          <AreaChart
            key={rangeId}
            width={chartWidth}
            height={CHART_HEIGHT}
            data={windowed}
            margin={{ top: 6, right: 6, bottom: 0, left: 6 }}
          >
            <defs>
              {/* Both series get the same treatment — a fill fading from the
                  line down to the base, "thick to thin" — the shared app graph
                  style (see Consistency). Only the COLOUR differs between them
                  (Adrian, 2026-08-07); weight and fill no longer do, so the
                  two series read as one chart rather than two idioms. */}
              <linearGradient id="weightTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-trend)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--chart-trend)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="weightScaleFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-line)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--chart-line)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="i" hide />
            <YAxis hide domain={[min - 0.6, max + 0.6]} />
            <Tooltip
              content={<ScrubTip unit={unit} mode={mode} />}
              cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
              isAnimationActive={false}
              position={{ y: 0 }}
              offset={0}
            />
            {/* Raw scale — dims via opacity crossfade when Trend is active.
                Same 2.5 stroke and tapered fill as the trend, in its own
                periwinkle: the ACTIVE mode is what tells them apart now. */}
            <Area
              type="monotone"
              dataKey="scale"
              stroke="var(--chart-line)"
              strokeWidth={2.5}
              fill="url(#weightScaleFill)"
              dot={false}
              activeDot={
                mode === "scale"
                  ? { r: 4, fill: "var(--chart-line)", stroke: "var(--bg-surface)", strokeWidth: 2 }
                  : false
              }
              isAnimationActive
              animationDuration={450}
              animationEasing="ease-out"
              className={cn(
                "transition-opacity duration-300 ease-out",
                mode === "scale" ? "opacity-100" : DIMMED,
              )}
            />
            {/* Smoothed trend — the prominent filled line. */}
            <Area
              type="monotone"
              dataKey="trend"
              stroke="var(--chart-trend)"
              strokeWidth={2.5}
              fill="url(#weightTrendFill)"
              dot={false}
              activeDot={
                mode === "trend"
                  ? { r: 4, fill: "var(--chart-trend)", stroke: "var(--bg-surface)", strokeWidth: 2 }
                  : false
              }
              isAnimationActive
              animationDuration={450}
              animationEasing="ease-out"
              className={cn(
                "transition-opacity duration-300 ease-out",
                mode === "trend" ? "opacity-100" : DIMMED,
              )}
            />
          </AreaChart>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-sm text-text-muted">
            {entries.length === 0
              ? "Log your weight to start your trend."
              : "No readings in this range."}
          </div>
        )}
      </div>

      {/* Legend — the inactive series label dims to match the graph. */}
      <div className="mt-2 flex items-center gap-4 px-1">
        <LegendDot color="var(--chart-trend)" label="Trend" dim={mode !== "trend"} />
        <LegendDot color="var(--chart-line)" label="Scale" dim={mode !== "scale"} />
      </div>

      {/* Time-range selector. A scope only offers the ranges it CONTAINS, so a
          six week block has no 3M button promising a picture it cannot draw.
          One range means there is no choice to make, so no control is drawn. */}
      {ranges.length > 1 && (
        <div
          className="mt-4 grid gap-1 rounded-full border border-border-default bg-bg-input p-0.5"
          style={{ gridTemplateColumns: `repeat(${ranges.length}, minmax(0, 1fr))` }}
        >
          {ranges.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRangeId(r.id)}
              aria-pressed={range.id === r.id}
              className={cn(
                "rounded-full py-1.5 text-xs font-medium transition-colors duration-300 ease-out",
                range.id === r.id
                  ? "bg-bg-surface-raised text-foreground"
                  : "text-text-muted",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Scrub label — recharts injects active/payload while a finger is down. */
function ScrubTip({
  active,
  payload,
  unit,
  mode,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  unit: WeightUnit;
  mode: WeightMode;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const value = mode === "trend" ? point.trend : point.scale;
  return (
    <div className="rounded-lg border border-border-default bg-bg-surface-raised px-2.5 py-1.5 shadow-lg">
      <p className="font-mono text-sm font-medium tabular-nums text-foreground">
        {value.toFixed(1)} {unit}
      </p>
      <p className="text-[11px] text-text-muted">
        {point.label}
        {mode === "trend" ? ` · ${TREND_WINDOW}-day avg` : ""}
      </p>
    </div>
  );
}

function LegendDot({
  color,
  label,
  dim,
}: {
  color: string;
  label: string;
  dim: boolean;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-[11px] transition-opacity duration-300 ease-out",
        dim ? "text-text-muted opacity-50" : "text-foreground opacity-100",
      )}
    >
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
