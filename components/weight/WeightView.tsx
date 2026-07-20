"use client";

import {
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { Check, ClockCounterClockwise, Scales, Trash } from "@/components/icons";
import { Area, AreaChart, Tooltip, XAxis, YAxis } from "recharts";

import { cn } from "@/lib/utils";
import { CARD_ICON_BADGE, CARD_TITLE, PAGE_TITLE } from "@/lib/ui-presets";
import { Input } from "@/components/ui/input";
import {
  dateKeyToDate,
  type DateKey,
} from "@/lib/home/mockHomeData";
import {
  formatWeight,
  kgToUnit,
  sanitizeWeightInput,
  unitForPreference,
  unitToKg,
  type WeightUnit,
} from "@/lib/weight";
import { deleteWeight, logWeight } from "@/app/(app)/weight/actions";

interface Entry {
  key: DateKey;
  kg: number;
}

/** Optimistic mutation applied to the entry list before the server confirms.
 *  `upsert` covers both a new log and an edit (one row per day, last write wins);
 *  `remove` is a delete. */
type OptimisticAction =
  | { type: "upsert"; key: DateKey; kg: number }
  | { type: "remove"; key: DateKey };

/** Apply an optimistic mutation, keeping the list sorted oldest → newest so the
 *  moving-average / chart stay correct. (`DateKey` is "YYYY-MM-DD", which sorts
 *  chronologically as a string.) */
function applyEntryMutation(state: Entry[], action: OptimisticAction): Entry[] {
  if (action.type === "remove") {
    return state.filter((e) => e.key !== action.key);
  }
  const next = state.filter((e) => e.key !== action.key);
  next.push({ key: action.key, kg: action.kg });
  next.sort((a, b) => a.key.localeCompare(b.key));
  return next;
}

/** A month bucket in the entry log — newest month first, entries newest-first. */
interface LogMonth {
  key: string; // "YYYY-MM"
  label: string; // "June 2026"
  rows: Entry[];
}

interface WeightViewProps {
  /** The user's weight_logs, oldest → newest. */
  entries: Entry[];
  /** "metric" | "imperial" from the profile. */
  unitPreference: string;
  todayKey: DateKey;
}

const CHART_HEIGHT = 170;
const TREND_WINDOW = 7;
const DIMMED = "opacity-[0.3]";

type WeightMode = "trend" | "scale";

const RANGES: { id: string; label: string; days: number }[] = [
  { id: "1w", label: "1W", days: 7 },
  { id: "1m", label: "1M", days: 30 },
  { id: "3m", label: "3M", days: 90 },
  { id: "6m", label: "6M", days: 180 },
  { id: "1y", label: "1Y", days: 365 },
  { id: "all", label: "All", days: Number.POSITIVE_INFINITY },
];

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function shortDate(key: DateKey): string {
  const d = dateKeyToDate(key);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function longDate(key: DateKey): string {
  const d = dateKeyToDate(key);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "YYYY-MM" → "June 2026" — the entry-log month headers. */
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return `${MONTHS_FULL[m - 1]} ${y}`;
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

interface ChartPoint {
  i: number;
  scale: number;
  trend: number;
  label: string;
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
      <p className="font-mono text-sm font-semibold text-foreground">
        {value.toFixed(1)} {unit}
      </p>
      <p className="text-[11px] text-text-muted">
        {point.label}
        {mode === "trend" ? ` · ${TREND_WINDOW}-day avg` : ""}
      </p>
    </div>
  );
}

/**
 * The Weight view (Context/Feature Specs/08 → C, + 07). Three stacked cards that
 * fade up: log/back-date a reading; the Trend/Scale graph (the inactive series
 * crossfades to dimmed, matching the app's nav fade) with a time-range selector;
 * and the full entry log (edit by re-logging a day, or delete). Bodyweight only,
 * presented neutrally — no good/bad colouring, no paywall copy.
 */
export function WeightView({ entries, unitPreference, todayKey }: WeightViewProps) {
  const router = useRouter();
  const unit = unitForPreference(unitPreference);

  // Optimistic view of the log: a save/edit/delete shows INSTANTLY, then either
  // commits (the server confirms and `router.refresh()` re-fetches the canonical
  // data, holding the optimistic value until it lands) or rolls back automatically
  // when the transition ends without a refresh (the failure path), surfacing an
  // error. Everything below derives from `viewEntries`, not the raw prop.
  const [viewEntries, applyOptimistic] = useOptimistic(entries, applyEntryMutation);
  const [, startTransition] = useTransition();

  // Weight starts on the raw SCALE reading; the user can switch to the smoothed
  // trend themselves. (We never auto-select trend.)
  const [mode, setMode] = useState<WeightMode>("scale");
  const [rangeId, setRangeId] = useState<string>("3m");

  // Track-weight form. Editing a past entry loads it here.
  const [dateKey, setDateKey] = useState<DateKey>(todayKey);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [busyDelete, setBusyDelete] = useState<string | null>(null);

  // Full chart series (display units), oldest → newest. Trend is the SMA over the
  // whole series so the window's left edge still has a proper trailing average.
  const scaleAll = useMemo(
    () => viewEntries.map((e) => kgToUnit(e.kg, unit)),
    [viewEntries, unit],
  );
  const trendAll = useMemo(
    () => movingAverage(scaleAll, TREND_WINDOW),
    [scaleAll],
  );

  // Window the series to the chosen range (by date, so a sparse log still works).
  const range = RANGES.find((r) => r.id === rangeId) ?? RANGES[2];
  const cutoffN =
    range.days === Number.POSITIVE_INFINITY
      ? -Infinity
      : Math.floor(dateKeyToDate(todayKey).getTime() / 86_400_000) - range.days;
  const windowed: ChartPoint[] = viewEntries
    .map((e, i) => ({ e, i }))
    .filter(
      ({ e }) =>
        Math.floor(dateKeyToDate(e.key).getTime() / 86_400_000) >= cutoffN,
    )
    .map(({ e, i }, j) => ({
      i: j,
      scale: Number(scaleAll[i].toFixed(2)),
      trend: Number(trendAll[i].toFixed(2)),
      label: shortDate(e.key),
    }));

  const hasData = windowed.length > 0;
  const focusedSeries = windowed.map((p) => (mode === "trend" ? p.trend : p.scale));
  const current = hasData ? focusedSeries[focusedSeries.length - 1] : null;
  const delta =
    focusedSeries.length > 1
      ? focusedSeries[focusedSeries.length - 1] - focusedSeries[0]
      : 0;
  const deltaText = `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)}`;

  const allVals = windowed.flatMap((p) => [p.scale, p.trend]);
  const min = hasData ? Math.min(...allVals) : 0;
  const max = hasData ? Math.max(...allVals) : 0;

  const [chartRef, chartWidth] = useChartWidth();

  // Entry log grouped by month — newest month first, newest entry first within.
  // Months simply stack and scroll (no dropdown), mirroring the journal feed.
  const logMonths = useMemo<LogMonth[]>(() => {
    const byMonth = new Map<string, Entry[]>();
    for (let i = viewEntries.length - 1; i >= 0; i--) {
      const e = viewEntries[i];
      const mk = e.key.slice(0, 7);
      const arr = byMonth.get(mk);
      if (arr) arr.push(e);
      else byMonth.set(mk, [e]);
    }
    return [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, rows]) => ({ key, label: monthLabel(key), rows }));
  }, [viewEntries]);

  function handleSave() {
    const n = parseFloat(value);
    if (!Number.isFinite(n)) {
      setError("Enter your weight.");
      return;
    }
    const kg = unitToKg(n, unit);
    if (kg < 30 || kg > 300) {
      setError(
        unit === "lbs"
          ? "Weight must be between 66 and 661 lbs."
          : "Weight must be between 30 and 300 kg.",
      );
      return;
    }
    const savedKey = dateKey;
    setSaving(true);
    setError(null);
    startTransition(async () => {
      // Show the new reading on the graph + log immediately.
      applyOptimistic({ type: "upsert", key: savedKey, kg });
      try {
        const res = await logWeight(kg, savedKey);
        if (res.ok) {
          setSavedFlash(true);
          window.setTimeout(() => setSavedFlash(false), 1400);
          setValue("");
          setDateKey(todayKey);
          router.refresh(); // commit: holds the optimistic value until fresh data lands
        } else {
          // The transition ends here with no refresh → the optimistic entry rolls
          // back automatically. Keep the typed value so the user can retry.
          setError(res.error ?? "Couldn't save. Try again.");
        }
      } catch {
        // The action itself rejected (e.g. a network error before it could return
        // its { ok: false } contract). Optimistic entry rolls back; show an error.
        setError("Couldn't save. Try again.");
      } finally {
        setSaving(false); // always clear busy, even on a rejected promise
      }
    });
  }

  function handleDelete(key: DateKey) {
    setBusyDelete(key);
    setError(null);
    startTransition(async () => {
      // Drop the row from the list + graph immediately.
      applyOptimistic({ type: "remove", key });
      try {
        const res = await deleteWeight(key);
        if (res.ok) {
          router.refresh();
        } else {
          // Transition ends with no refresh → the row reappears (rollback) + error.
          setError(res.error ?? "Couldn't delete that entry. Try again.");
        }
      } catch {
        setError("Couldn't delete that entry. Try again.");
      } finally {
        setBusyDelete(null); // always clear busy, even on a rejected promise
      }
    });
  }

  function editEntry(entry: Entry) {
    setDateKey(entry.key);
    setValue(formatWeight(entry.kg, unit));
    setError(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5">
      <header className="animate-home-up px-1" style={{ animationDelay: "0ms" }}>
        <h1 className={PAGE_TITLE}>Weight</h1>
        <p className="mt-0.5 text-sm text-text-muted">
          Log your bodyweight and watch the trend.
        </p>
      </header>

      {/* ── Track your weight ─────────────────────────────────────── */}
      <section
        className="animate-home-up relative rounded-2xl border border-border-default bg-bg-surface p-5"
        style={{ animationDelay: "70ms" }}
      >
        <div className="flex items-center gap-3.5">
          <span aria-hidden className={CARD_ICON_BADGE}>
            <Scales className="h-5 w-5" />
          </span>
          <h2 className={CARD_TITLE}>Track your weight</h2>
        </div>
        <div className="mt-4 flex gap-3">
          <label className="block flex-1 min-w-0">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
              Weight
            </span>
            <div className="relative">
              <Input
                inputMode="decimal"
                value={value}
                onChange={(e) => {
                  setError(null);
                  setValue(sanitizeWeightInput(e.target.value));
                }}
                placeholder={unit === "lbs" ? "e.g. 198" : "e.g. 90"}
                aria-label={`Weight in ${unit}`}
                aria-invalid={error ? true : undefined}
                className="h-12 rounded-xl border-border-default bg-bg-input pr-12 font-mono text-base dark:bg-bg-input"
              />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-text-muted">
                {unit}
              </span>
            </div>
          </label>

          <label className="block w-[8.5rem] max-w-[44%] shrink-0">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
              Date
            </span>
            <Input
              type="date"
              value={dateKey}
              max={todayKey}
              onChange={(e) => setDateKey(e.target.value || todayKey)}
              aria-label="Date logged"
              className="h-12 rounded-xl border-border-default bg-bg-input px-3 font-mono text-sm [color-scheme:dark] dark:bg-bg-input"
            />
          </label>
        </div>

        {error && <p className="mt-2 px-1 text-sm text-state-error">{error}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-4 w-full rounded-xl bg-accent-primary py-3 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
        >
          {saving
            ? "Saving…"
            : dateKey === todayKey
              ? "Done"
              : `Log for ${shortDate(dateKey)}`}
        </button>

        {/* Brief saved tick — UI feedback only (sanctioned green). */}
        {savedFlash && (
          <div
            aria-hidden
            className="animate-shortcut-fade pointer-events-none absolute right-5 top-5 flex items-center gap-1.5 rounded-full bg-accent-green/15 px-2.5 py-1 text-xs font-medium text-accent-green"
          >
            <Check className="h-3.5 w-3.5" /> Saved
          </div>
        )}
      </section>

      {/* ── Trend / Scale graph ───────────────────────────────────── */}
      <section
        className="animate-home-up rounded-2xl border border-border-default bg-bg-surface p-5"
        style={{ animationDelay: "140ms" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
              {mode === "trend" ? "Trend" : "Scale"}
            </p>
            {current != null ? (
              <>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="font-mono text-3xl font-semibold text-foreground">
                    {current.toFixed(1)}
                  </span>
                  <span className="text-sm text-text-muted">{unit}</span>
                </div>
                <p className="mt-1 font-mono text-sm text-text-muted">
                  {deltaText} {unit}{" "}
                  <span className="font-sans">over this range</span>
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
                  mode === m
                    ? "bg-bg-surface-raised text-foreground"
                    : "text-text-muted",
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
                {/* Trend fill fades from the line down to the base — "thick to
                    thin" — the shared app graph treatment (see Consistency). */}
                <linearGradient id="weightTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-trend)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-trend)" stopOpacity={0} />
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
              {/* Raw scale — dims via opacity crossfade when Trend is active. */}
              <Area
                type="monotone"
                dataKey="scale"
                stroke="var(--chart-line)"
                strokeWidth={1.5}
                fill="transparent"
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
          <LegendDot
            color="var(--chart-trend)"
            label="Trend"
            dim={mode !== "trend"}
          />
          <LegendDot
            color="var(--chart-line)"
            label="Scale"
            dim={mode !== "scale"}
          />
        </div>

        {/* Time-range selector — expand the window to see the longer term. */}
        <div className="mt-4 grid grid-cols-6 gap-1 rounded-full border border-border-default bg-bg-input p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRangeId(r.id)}
              aria-pressed={rangeId === r.id}
              className={cn(
                "rounded-full py-1.5 text-xs font-medium transition-colors duration-300 ease-out",
                rangeId === r.id
                  ? "bg-bg-surface-raised text-foreground"
                  : "text-text-muted",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Entry log ─────────────────────────────────────────────── */}
      <section
        className="animate-home-up rounded-2xl border border-border-default bg-bg-surface p-5"
        style={{ animationDelay: "210ms" }}
      >
        <div className="flex items-center gap-3.5">
          <span aria-hidden className={CARD_ICON_BADGE}>
            <ClockCounterClockwise className="h-5 w-5" />
          </span>
          <h2 className={CARD_TITLE}>Entry log</h2>
        </div>
        {logMonths.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">
            Nothing logged yet. Add today&apos;s weight above.
          </p>
        ) : (
          <div className="mt-3 space-y-5">
            {logMonths.map((group) => (
              <div key={group.key}>
                <h3 className="px-1 pb-2 font-display text-lg font-medium text-foreground">
                  {group.label}
                </h3>
                <ul className="overflow-hidden rounded-2xl bg-bg-surface-raised">
                  {group.rows.map((entry, i) => (
                    <li
                      key={entry.key}
                      className={cn(
                        "flex items-center",
                        i > 0 && "border-t border-border-default",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => editEntry(entry)}
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-input/40"
                        aria-label={`Edit weight for ${longDate(entry.key)}`}
                      >
                        <span className="truncate text-sm text-text-muted">
                          {longDate(entry.key)}
                          {entry.key === todayKey && (
                            <span className="ml-2 text-xs text-accent-amber">Today</span>
                          )}
                        </span>
                        <span className="shrink-0 font-mono text-sm font-medium text-foreground tabular-nums">
                          {formatWeight(entry.kg, unit)} {unit}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.key)}
                        disabled={busyDelete === entry.key}
                        aria-label={`Delete weight for ${longDate(entry.key)}`}
                        className="mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:text-state-error disabled:opacity-50"
                      >
                        <Trash className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
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
      <span
        aria-hidden
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
