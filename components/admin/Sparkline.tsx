import type { CSSProperties } from "react"

import { sparkGeometry, sparkLastPoint } from "@/lib/progress/spark"
import { cn } from "@/lib/utils"

/**
 * The /admin sparkline, with two things the app's version does not have: a
 * dashed PROJECTION past the last real reading, and a GHOST of the previous
 * period behind the line.
 *
 * A SERVER COMPONENT, and a separate file from `components/admin/charts.tsx` on
 * purpose — that file's `Sparkline` is in use and is not ours to edit. Both
 * export a symbol named `Sparkline`, so a page importing both needs an alias.
 *
 * THE CURVE IS `lib/progress/spark.ts`, UNTOUCHED. Same Fritsch-Carlson
 * monotone geometry as the Home weight card and the /admin charts, so a trend
 * here looks like a trend everywhere else and no hand-rolled `<polyline>`
 * appears (ui-context.md → Charts). Everything below is composition around it:
 * clipping, aligning and labelling paths it produced.
 *
 * ── THE PROBLEM THIS FILE ACTUALLY SOLVES ────────────────────────────────────
 *
 * `sparkGeometry` normalises each array against ITS OWN min and max. Call it
 * twice and you get two charts on two different scales drawn on top of each
 * other, which for a "compare with the previous period" ghost is not a small
 * inaccuracy: it is the exact thing the ghost exists to show, drawn wrong. A
 * previous period that was half the size would trace the same shape at the same
 * height and read as "no change".
 *
 * Rather than fork the geometry to take an explicit domain, each series is drawn
 * in its own local scale and then moved onto the SHARED scale by an affine
 * `transform` on its group. The mapping in `spark.ts` is affine in y, so this is
 * exact rather than an approximation — see `alignY` for the derivation.
 * `vector-effect: non-scaling-stroke` keeps the stroke 2.5px through the y-scale
 * (and through the viewBox stretch), so nothing about the line weight moves.
 */

/** The min and the span a series is normalised against. */
interface Domain {
  min: number
  range: number
}

/**
 * `spark.ts` uses `max - min || 1` so a flat series still has a scale; this must
 * match it exactly or every alignment is off by the width of that fallback.
 */
function domainOf(values: number[]): Domain {
  const min = Math.min(...values)
  const max = Math.max(...values)
  return { min, range: max - min || 1 }
}

/**
 * The transform that moves a path drawn in `local` onto `shared`.
 *
 * `spark.ts` maps a value to `y = height - pad - ((v - min) / range) * usable`,
 * which is affine, so the composition of "un-map through local" and "re-map
 * through shared" is affine too:
 *
 *   v    = local.min + local.range * (height - pad - y) / usable
 *   y'   = height - pad - ((v - shared.min) / shared.range) * usable
 *        = (height - pad)(1 - k) - c + k * y
 *
 * with `k = local.range / shared.range` and
 * `c = ((local.min - shared.min) / shared.range) * usable`. That is exactly
 * `translate(0, offset) scale(1, k)`, which SVG can apply to a whole group for
 * free. When a series alone defines the shared domain, `k` is 1 and `offset` is
 * 0 and the transform is the identity.
 */
function alignY(local: Domain, shared: Domain, height: number, pad: number) {
  const usable = height - pad * 2
  const k = local.range / shared.range
  const c = ((local.min - shared.min) / shared.range) * usable
  return { k, offset: (height - pad) * (1 - k) - c }
}

const round = (n: number) => Number(n.toFixed(4))

/**
 * The y of ONE value on a series' own scale.
 *
 * `sparkLastPoint` answers this for the last element of an array, which is the
 * wrong point as soon as a projection is appended: the latest-reading marker
 * belongs on the last REAL reading, never on a forecast. Rather than restate
 * the mapping here and let the two drift, `sparkLastPoint` is handed a
 * three-element array pinned to the domain we want — its own min/max scan then
 * recovers exactly that domain, including the flat-series fallback, and the
 * arithmetic stays in `spark.ts` where it is tested.
 */
function yOf(
  value: number,
  domain: Domain,
  width: number,
  height: number,
  pad: number
): number {
  const point = sparkLastPoint(
    [domain.min, domain.min + domain.range, value],
    width,
    height,
    pad
  )
  return point ? point.y : height - pad
}

export interface SparklineProps {
  /**
   * Unique on the page. It names the gradient and the clip paths in `<defs>`,
   * and two sparklines sharing an id would have the second silently adopt the
   * first's fill and, worse, the first's clip.
   */
  id: string
  /** The real readings, oldest first. Fewer than two has no line to draw. */
  values: number[]
  /**
   * Readings that have NOT happened. Drawn dashed, past the last real point,
   * never filled and never marked with a dot.
   */
  projection?: number[]
  /**
   * The same metric over the previous period, drawn behind the line on the same
   * scale. Its own length is fine: it is fitted to the real window's width, so
   * a 28-day ghost lines up under a 30-day series week for week.
   */
  ghost?: number[]
  width?: number
  height?: number
  /** Keeps the stroke from clipping at the top and bottom edges. */
  pad?: number
  color?: string
  /** The tapered fill under the real portion. */
  fill?: boolean
  /** Reveal left to right on first paint. See `.animate-admin-draw`. */
  draw?: boolean
  /** Where this chart sits in the page's arrival stagger, in ms. */
  delay?: number
  /** Names the two non-data treatments in words as well as in paint. */
  legend?: boolean
  ghostLabel?: string
  projectionLabel?: string
  /** What the figures MEAN, for the accessible description ("signups"). */
  unit?: string
  className?: string
}

export function Sparkline({
  id,
  values,
  projection = [],
  ghost = [],
  width = 260,
  height = 48,
  pad = 3,
  color = "var(--admin-series-1)",
  fill = true,
  draw = false,
  delay = 0,
  legend,
  ghostLabel = "Previous period",
  projectionLabel = "Projected",
  unit,
  className,
}: SparklineProps) {
  if (values.length < 2) {
    // `--text-muted`, not `--text-subtle`: this sits on glass, where subtle's
    // ~1.9:1 gets worse, not better (see the contrast note in `globals.css`).
    return (
      <div
        className={cn("flex items-center text-xs text-text-muted", className)}
        style={{ height }}
      >
        Not enough history yet
      </div>
    )
  }

  const hasProjection = projection.length > 0
  const hasGhost = ghost.length >= 2

  /**
   * ONE call for the real series AND the projection together, so the curve is
   * continuous through the joint. Two calls would each fit their own domain and
   * meet at a visible kink at the very point a reader is looking hardest.
   */
  const main = hasProjection ? [...values, ...projection] : values
  const mainDomain = domainOf(main)
  const shared = hasGhost ? domainOf([...main, ...ghost]) : mainDomain

  const mainGeom = sparkGeometry(main, width, height, pad)
  const mainAlign = alignY(mainDomain, shared, height, pad)
  const mainTransform = `translate(0 ${round(mainAlign.offset)}) scale(1 ${round(mainAlign.k)})`

  /** Where the real data stops and the forecast starts, in viewBox units. */
  const realWidth = ((values.length - 1) / (main.length - 1)) * width

  /**
   * The fill has to close on the BASELINE AFTER the transform, so the local y it
   * closes on is the one the transform lands at `height`. With an identity
   * transform this is `height`, i.e. exactly what `sparkGeometry` already
   * returns in `area` — which is why the closing segment is rebuilt from `line`
   * rather than `area` being used directly. Two straight segments, not geometry.
   */
  const base = round((height - mainAlign.offset) / mainAlign.k)
  const areaPath = `${mainGeom.line} L ${width},${base} L 0,${base} Z`

  const ghostGeom = hasGhost ? sparkGeometry(ghost, realWidth, height, pad) : null
  const ghostAlign = hasGhost ? alignY(domainOf(ghost), shared, height, pad) : null
  const ghostTransform = ghostAlign
    ? `translate(0 ${round(ghostAlign.offset)}) scale(1 ${round(ghostAlign.k)})`
    : undefined

  /**
   * THE LATEST-READING DOT IS DRAWN IN CSS, OUTSIDE THE STRETCHED SPACE.
   *
   * `preserveAspectRatio="none"` stretches this viewBox to the panel's real
   * width — roughly 2x in a two-column layout — so a `<circle r="2.5">` renders
   * as a smear. Vertical scale is 1:1 because the `height` attribute matches the
   * viewBox height, so `top` is the y value in pixels unconverted; `left` is a
   * percentage because x is the axis that stretches.
   *
   * There is deliberately NO marker at the end of the projection. A dot is the
   * house sign for "this is the latest reading", and putting one on a forecast
   * would be the single most misleading pixel on the page.
   */
  const dotY = yOf(values[values.length - 1], mainDomain, width, height, pad)
  const dotTop = round(mainAlign.offset + mainAlign.k * dotY)
  const dotLeft = round((realWidth / width) * 100)

  const last = values[values.length - 1]
  const described = [
    `${values.length} points, ending at ${last.toLocaleString()}${unit ? ` ${unit}` : ""}`,
    hasProjection ? `${projection.length} projected, shown dashed` : null,
    hasGhost ? `${ghostLabel.toLowerCase()} shown behind` : null,
  ]
    .filter(Boolean)
    .join(". ")

  const showLegend = legend ?? (hasProjection || hasGhost)

  /**
   * With a projection the dot is mid-chart and centres on its x. Without one it
   * sits ON the right edge, where centring would hang half of it outside the
   * box — and a `GlassGroup` clips its children, so half a dot would go
   * missing. Same reasoning as the app's glance spark.
   */
  const dotStyle = {
    left: `${dotLeft}%`,
    top: dotTop,
    "--admin-delay": `${delay + 700}ms`,
  } as CSSProperties

  return (
    <div className={className}>
      <div className="relative" style={{ height }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          preserveAspectRatio="none"
          role="img"
          aria-label={described}
          className="block"
        >
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
            {/* The two halves of the timeline. The clips live in UNTRANSFORMED
                viewBox space (they wrap the aligned groups rather than sitting
                inside them), so the split is at the same x whatever the y
                alignment is doing. The rects overrun vertically because a
                stroke is wider than the path; the viewBox does the real
                cropping. */}
            <clipPath id={`${id}-real`}>
              <rect x={-4} y={-height} width={realWidth + 4} height={height * 3} />
            </clipPath>
            {hasProjection && (
              <clipPath id={`${id}-proj`}>
                <rect
                  x={realWidth}
                  y={-height}
                  width={width - realWidth + 4}
                  height={height * 3}
                />
              </clipPath>
            )}
            {draw && (
              <clipPath id={`${id}-draw`}>
                <rect
                  className="animate-admin-draw"
                  x={0}
                  y={-height}
                  width={width}
                  height={height * 3}
                  style={
                    {
                      "--admin-draw-width": `${width}px`,
                      "--admin-delay": `${delay}ms`,
                    } as CSSProperties
                  }
                />
              </clipPath>
            )}
          </defs>

          <g clipPath={draw ? `url(#${id}-draw)` : undefined}>
            {/* THE GHOST, first so everything else paints over it.
                Same hue and same 2.5px stroke, at ~0.3 opacity: "emphasis is
                opacity, not weight" (ui-context.md → Charts). A different hue
                would say "different metric" and a thinner line would say
                "less important", and it is neither. It is the same number, then. */}
            {ghostGeom && ghostGeom.line && (
              <g transform={ghostTransform}>
                <path
                  d={ghostGeom.line}
                  fill="none"
                  stroke={color}
                  strokeOpacity="0.3"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )}

            {/* The tapered fill, under the REAL portion only. A filled
                projection would read as measured area. */}
            {fill && (
              <g clipPath={`url(#${id}-real)`}>
                <g transform={mainTransform}>
                  <path d={areaPath} fill={`url(#${id}-fill)`} />
                </g>
              </g>
            )}

            <g clipPath={`url(#${id}-real)`}>
              <g transform={mainTransform}>
                <path
                  d={mainGeom.line}
                  fill="none"
                  stroke={color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            </g>

            {hasProjection && (
              <>
                {/* Where measurement stops. A reader should be able to see the
                    boundary without having to notice that the dashes started. */}
                <line
                  x1={realWidth}
                  y1={0}
                  x2={realWidth}
                  y2={height}
                  stroke="var(--admin-glass-line)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                <g clipPath={`url(#${id}-proj)`}>
                  <g transform={mainTransform}>
                    {/* Round caps on a 3-4 dash make this a row of dots, which
                        is about as far from "a line of readings" as a stroke
                        gets. The dash pattern is in DEVICE units because of
                        non-scaling-stroke, so it looks the same on a narrow
                        tile and a full-width panel. */}
                    <path
                      d={mainGeom.line}
                      fill="none"
                      stroke={color}
                      strokeOpacity="0.5"
                      strokeWidth="2"
                      strokeDasharray="1 5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                </g>
              </>
            )}
          </g>
        </svg>

        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute size-[5px] -translate-y-1/2 rounded-full bg-accent-primary",
            hasProjection ? "-translate-x-1/2" : "-translate-x-full",
            draw && "animate-admin-value"
          )}
          style={dotStyle}
        />
      </div>

      {showLegend && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-text-muted">
          {hasProjection && (
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-0 w-5 shrink-0 border-t-2 border-dotted"
                style={{ borderColor: color, opacity: 0.5 }}
              />
              {projectionLabel}
            </span>
          )}
          {hasGhost && (
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-0.5 w-5 shrink-0 rounded-full"
                style={{ backgroundColor: color, opacity: 0.3 }}
              />
              {ghostLabel}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
