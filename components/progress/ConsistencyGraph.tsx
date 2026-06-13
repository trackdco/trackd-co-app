"use client";

import { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";
import { Area, AreaChart, Tooltip, XAxis, YAxis } from "recharts";

import { cn } from "@/lib/utils";
import { CARD_ICON_BADGE, CARD_TITLE } from "@/lib/ui-presets";
import { dateKeyToDate } from "@/lib/home/mockHomeData";
import {
  doseDayCount,
  overallPct,
  type AdherencePoint,
} from "@/lib/progress/consistency";

const CHART_HEIGHT = 150;

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function shortDate(key: string): string {
  const d = dateKeyToDate(key);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

const RANGES: { id: string; label: string; days: number }[] = [
  { id: "30", label: "30D", days: 30 },
  { id: "90", label: "90D", days: 90 },
  { id: "all", label: "All", days: Number.POSITIVE_INFINITY },
];

/** Observed width — ResponsiveContainer measures 0 on mobile Safari at times. */
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

/**
 * For the line: carry the previous day's adherence across rest days (null pct) so
 * the line holds flat instead of sloping between dose days. Leading rest days stay
 * null (nothing to carry yet). A pure pass, kept out of render for the React
 * compiler's no-reassign-during-render rule.
 */
function carryForwardPct(points: AdherencePoint[]): (number | null)[] {
  const out: (number | null)[] = [];
  let last: number | null = null;
  for (const p of points) {
    if (p.pct != null) last = p.pct;
    out.push(last);
  }
  return out;
}

interface ChartBar {
  i: number;
  /** The day's real adherence — null on a rest day (drives the scrub label). */
  pct: number | null;
  /** What the LINE draws: rest days hold the previous day's value (a flat step). */
  linePct: number | null;
  key: string;
  due: number;
  logged: number;
}

/** Scrub label — press-and-drag across the bars to read each day. */
function ScrubTip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartBar }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-border-default bg-bg-surface-raised px-2.5 py-1.5 shadow-lg">
      <p className="font-mono text-sm font-semibold text-foreground">
        {p.pct == null ? "Rest day" : `${p.pct}%`}
      </p>
      <p className="text-[11px] text-text-muted">
        {shortDate(p.key)}
        {p.due > 0 ? ` · ${p.logged}/${p.due} logged` : ""}
      </p>
    </div>
  );
}

/**
 * The consistency graph (Step 6) — a LINE of how much of each day's protocol you
 * logged (100% at the top falling to 0) with a teal gradient fill fading downward
 * (thick at the line → thin at the base), matching the Weight view's chart so the
 * app's graphs read as one. Press-and-drag to scrub any day. A behavioural read,
 * so it carries an accent (it's not health data); rest days have no dose due, so
 * the line holds flat at the previous day's value (a step) — the scrubber still
 * labels them "Rest day".
 */
export function ConsistencyGraph({ points }: { points: AdherencePoint[] }) {
  const [rangeId, setRangeId] = useState("30");
  const [chartRef, chartWidth] = useChartWidth();

  const range = RANGES.find((r) => r.id === rangeId) ?? RANGES[0];
  const windowed =
    range.days === Number.POSITIVE_INFINITY ? points : points.slice(-range.days);
  const overall = overallPct(windowed);
  const doseDays = doseDayCount(windowed);

  // Carry the last real adherence forward across rest days so the line stays flat
  // at the previous day's value instead of sloping between dose days. Leading rest
  // days (before the first dose) stay null, so the line simply starts there.
  const lineVals = carryForwardPct(windowed);
  const data: ChartBar[] = windowed.map((p, i) => ({
    i,
    pct: p.pct,
    linePct: lineVals[i],
    key: p.key,
    due: p.due,
    logged: p.logged,
  }));

  return (
    <section className="rounded-2xl border border-border-default bg-bg-surface p-5">
      <div className="flex items-center gap-3.5">
        <span className={CARD_ICON_BADGE} aria-hidden>
          <Activity className="h-5 w-5" />
        </span>
        <p className={CARD_TITLE}>Consistency</p>
      </div>
      {overall != null ? (
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="font-mono text-3xl font-semibold text-foreground">
            {overall}
          </span>
          <span className="text-sm text-text-muted">% adherence</span>
        </div>
      ) : (
        <p className="mt-2 text-sm text-text-muted">No doses in range.</p>
      )}

      <div
        ref={chartRef}
        className="mt-3 -mx-1 select-none"
        style={{ touchAction: "pan-y", height: CHART_HEIGHT }}
      >
        {doseDays > 0 && chartWidth > 0 ? (
          <AreaChart
            key={rangeId}
            width={chartWidth}
            height={CHART_HEIGHT}
            data={data}
            margin={{ top: 6, right: 6, bottom: 0, left: 6 }}
          >
            <defs>
              {/* Fill fades from the line down to the base — "thick to thin". */}
              <linearGradient id="consistencyFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-trend)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--chart-trend)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="i" hide />
            <YAxis hide domain={[0, 100]} />
            <Tooltip
              content={<ScrubTip />}
              cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
              isAnimationActive={false}
              position={{ y: 0 }}
            />
            <Area
              type="monotone"
              dataKey="linePct"
              stroke="var(--chart-trend)"
              strokeWidth={2.5}
              fill="url(#consistencyFill)"
              dot={false}
              activeDot={{
                r: 4,
                fill: "var(--chart-trend)",
                stroke: "var(--bg-surface)",
                strokeWidth: 2,
              }}
              isAnimationActive
              animationDuration={450}
              animationEasing="ease-out"
            />
          </AreaChart>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-sm text-text-muted">
            Log your doses to build your consistency.
          </div>
        )}
      </div>

      {/* Range selector — match the Weight view. */}
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-full border border-border-default bg-bg-input p-0.5">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setRangeId(r.id)}
            aria-pressed={rangeId === r.id}
            className={cn(
              "rounded-full py-1.5 text-xs font-medium transition-colors duration-300 ease-out",
              rangeId === r.id ? "bg-bg-surface-raised text-foreground" : "text-text-muted",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-text-muted">
        How closely you&apos;re sticking to your protocol.
      </p>
    </section>
  );
}
