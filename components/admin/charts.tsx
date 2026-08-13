import { percent, type FunnelStep, type Tally } from "@/lib/admin/aggregate"
import { sparkGeometry, sparkLastPoint } from "@/lib/progress/spark"

/**
 * Chart primitives for /admin. Inline SVG, server-rendered, no chart library and
 * no client JavaScript — every one of these is a pure function of data the page
 * already holds.
 *
 * TIME uses the app's line-and-tapered-fill treatment via the shared
 * `lib/progress/spark.ts` geometry, so a trend here looks like a trend
 * everywhere else. CATEGORIES use horizontal ranked bars, which /admin is
 * explicitly allowed and the app is not (`ui-context.md` → Admin).
 */

/** The four admin series colours, cycled by rank. */
const SERIES = [
  "var(--admin-series-1)",
  "var(--admin-series-2)",
  "var(--admin-series-3)",
  "var(--admin-series-4)",
] as const

/**
 * A trend over time — the same 2.5px monotone curve over the same tapered fill
 * the app's glance cards use.
 *
 * `id` must be unique on the page: it names the gradient in `<defs>`, and two
 * sparklines sharing one id would have the second silently adopt the first's
 * fill.
 */
export function Sparkline({
  id,
  points,
  width = 260,
  height = 48,
  color = "var(--admin-series-1)",
}: {
  id: string
  points: { day: string; count: number }[]
  width?: number
  height?: number
  color?: string
}) {
  const values = points.map((p) => p.count)
  if (values.length < 2) {
    return (
      <div className="flex h-12 items-center text-xs text-text-subtle">
        Not enough days yet
      </div>
    )
  }

  const { line, area } = sparkGeometry(values, width, height)
  const last = sparkLastPoint(values, width, height)

  /**
   * The latest-point dot is drawn in CSS, OUTSIDE the SVG's coordinate space.
   *
   * `preserveAspectRatio="none"` stretches this 260-wide viewBox to the card's
   * real width — roughly 506px in the two-column layout, a ~1.95x horizontal
   * scale — so a `<circle r="2.5">` inside the SVG renders as a 10x5 smear. The
   * app's glance spark gets away with an in-SVG circle only because it renders
   * at 1.1x. Positioning the dot with CSS makes it round at any card width.
   *
   * `sparkLastPoint` always returns `x === width`, i.e. the right edge, and the
   * vertical scale is 1:1 because the height attribute matches the viewBox
   * height — so `top` is the y value in pixels, unconverted.
   */
  return (
    <div className="relative" style={{ height }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${points.length} days, ending at ${values[values.length - 1]}`}
        className="block"
      >
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${id}-fill)`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {last && (
        <span
          aria-hidden
          className="pointer-events-none absolute size-[5px] -translate-x-full -translate-y-1/2 rounded-full bg-accent-primary"
          style={{ left: "100%", top: last.y }}
        />
      )}
    </div>
  )
}

/**
 * A ranked categorical tally as horizontal bars.
 *
 * Bars are scaled against the TOP row, not against the total, so the shape shows
 * relative standing rather than compressing everything into the left edge when
 * one category dominates. Each row carries its own figure, so the bar is a
 * reading aid and never the only way to get the number.
 */
export function RankedBars({
  items,
  limit = 8,
  showPct = false,
  total,
}: {
  items: Tally[]
  limit?: number
  /** Print each row's share of `total` beside its count. */
  showPct?: boolean
  total?: number
}) {
  if (items.length === 0) {
    return <p className="text-sm text-text-muted">Nothing recorded yet.</p>
  }

  const shown = items.slice(0, limit)
  const max = shown[0]?.count ?? 0
  const denominator = total ?? items.reduce((n, i) => n + i.count, 0)

  return (
    <div className="space-y-3">
      {shown.map((item, i) => {
        // `percent()` rather than a local copy of the same arithmetic — it is
        // the tested one, and it is what the "— never 0" rule is implemented in.
        const pct = percent(item.count, denominator)
        return (
          <div key={item.key}>
            <div className="flex items-baseline justify-between gap-4">
              <span className="min-w-0 truncate text-sm text-foreground">{item.label}</span>
              <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
                {item.count.toLocaleString()}
                {showPct && pct !== null && (
                  <span className="ml-1.5 text-xs text-text-muted">{pct}%</span>
                )}
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-bg-input">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${max > 0 ? Math.max(2, (item.count / max) * 100) : 0}%`,
                  backgroundColor: SERIES[i % SERIES.length],
                }}
              />
            </div>
          </div>
        )
      })}
      {items.length > limit && (
        <p className="pt-1 text-xs text-text-subtle">
          + {items.length - limit} more
        </p>
      )}
    </div>
  )
}

/**
 * The onboarding funnel.
 *
 * Every step carries BOTH percentages — of the top of the funnel, and of the
 * step immediately above. Showing only one is the classic way to mislead
 * yourself here: "40% reach step 4" and "40% of step 3 reach step 4" are
 * different sentences, and only the second one tells you which step is leaking.
 */
export function Funnel({ steps }: { steps: FunnelStep[] }) {
  if (steps.length === 0) {
    return <p className="text-sm text-text-muted">No accounts yet.</p>
  }

  return (
    <div className="space-y-4">
      {steps.map((step, i) => (
        <div key={step.label}>
          <div className="flex items-baseline justify-between gap-4">
            <span className="min-w-0 truncate text-sm text-foreground">{step.label}</span>
            <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
              {step.count.toLocaleString()}
              <span className="ml-1.5 text-xs text-text-muted">
                {step.pctOfTop === null ? "—" : `${step.pctOfTop}%`}
              </span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-input">
            <div
              className="h-full rounded-full"
              style={{
                width: `${step.pctOfTop ?? 0}%`,
                backgroundColor: SERIES[i % SERIES.length],
              }}
            />
          </div>
          {i > 0 && (
            <p className="mt-1 text-[11px] text-text-subtle">
              {step.pctOfPrev === null
                ? "— of the step above"
                : `${step.pctOfPrev}% of the step above`}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * A labelled split as one stacked bar, for a small number of mutually exclusive
 * categories.
 *
 * CAPPED AT FOUR SEGMENTS, WITH THE REST ROLLED INTO "OTHER". There are exactly
 * four series colours, and the segments carry no inline label — the only way to
 * read one is to match its colour to the legend. Cycling `i % 4` past four
 * therefore produced two periwinkle segments and two periwinkle legend dots,
 * making the mapping ambiguous and breaking "colour is never the only signal".
 * Both real call sites overflowed: "By category" tallies up to nine categories
 * and "By route" five.
 *
 * Every segment also carries a `<title>`, so hovering names it and assistive
 * tech can read it without the legend at all.
 */
const MAX_SEGMENTS = 4

export function SplitBar({ items }: { items: Tally[] }) {
  const total = items.reduce((n, i) => n + i.count, 0)
  if (total === 0) {
    return <p className="text-sm text-text-muted">Nothing recorded yet.</p>
  }

  const head = items.slice(0, MAX_SEGMENTS - 1)
  const tail = items.slice(MAX_SEGMENTS - 1)
  const segments =
    tail.length > 1
      ? [
          ...head,
          {
            key: "__other",
            label: `Other (${tail.length})`,
            count: tail.reduce((n, i) => n + i.count, 0),
          },
        ]
      : items

  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-bg-input">
        {segments.map((item, i) => {
          const pct = Math.round((item.count / total) * 100)
          return (
            <div
              key={item.key}
              title={`${item.label}: ${item.count.toLocaleString()} (${pct}%)`}
              style={{
                width: `${(item.count / total) * 100}%`,
                backgroundColor: SERIES[i % SERIES.length],
              }}
            />
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((item, i) => (
          <span key={item.key} className="flex items-center gap-1.5 text-xs">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: SERIES[i % SERIES.length] }}
            />
            <span className="text-text-muted">{item.label}</span>
            <span className="font-mono tabular-nums text-foreground">{item.count}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
