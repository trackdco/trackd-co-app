/**
 * Sparkline geometry — pure, no React (`code-standards.md`).
 *
 * The weight glance card drew a straight-segment `<polyline>` with no fill while
 * the consistency graph beside it drew a smooth, gradient-filled area. Two
 * charts of the same size, on the same screen, in two different visual
 * languages. Adrian asked for one (2026-07-31), so this produces the same shape
 * Recharts' `type="monotone"` does, and the card fills it with the same
 * top-down gradient.
 *
 * MONOTONE, not a plain Catmull-Rom or cardinal spline. A smoothing curve that
 * overshoots invents readings the user never recorded — a dip below every
 * surrounding weigh-in, or a peak above them — which on a bodyweight chart is a
 * measurement that did not happen. Fritsch-Carlson clamps the tangents so the
 * curve never leaves the range of the points it joins.
 */

export interface SparkGeometry {
  /** `d` for the line itself. */
  line: string
  /** `d` for the filled area beneath it, closed along the baseline. */
  area: string
}

/**
 * Map values to a smooth path across `width` x `height`.
 *
 * `values` are in their own units and are normalised here. Fewer than two points
 * has no line to draw and returns empty strings — the caller renders its
 * single-point marker instead.
 */
export function sparkGeometry(
  values: number[],
  width: number,
  height: number,
  /** Keeps the stroke from clipping at the top and bottom edges. */
  pad = 2
): SparkGeometry {
  if (values.length < 2) return { line: "", area: "" }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const usable = height - pad * 2

  const xs = values.map((_, i) => (i / (values.length - 1)) * width)
  const ys = values.map((v) => height - pad - ((v - min) / range) * usable)

  // Fritsch-Carlson monotone tangents.
  const n = values.length
  const slopes: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1] - xs[i]
    slopes.push(dx === 0 ? 0 : (ys[i + 1] - ys[i]) / dx)
  }
  const tangents: number[] = new Array(n)
  tangents[0] = slopes[0]
  tangents[n - 1] = slopes[n - 2]
  for (let i = 1; i < n - 1; i++) {
    // A sign change is a turning point: a zero tangent there is what stops the
    // curve bulging past the reading it turns on.
    tangents[i] =
      slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2
  }
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) {
      tangents[i] = 0
      tangents[i + 1] = 0
      continue
    }
    const a = tangents[i] / slopes[i]
    const b = tangents[i + 1] / slopes[i]
    const h = Math.hypot(a, b)
    if (h > 3) {
      tangents[i] = ((3 / h) * a) * slopes[i]
      tangents[i + 1] = ((3 / h) * b) * slopes[i]
    }
  }

  const f = (v: number) => Number(v.toFixed(2))
  let line = `M ${f(xs[0])},${f(ys[0])}`
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1] - xs[i]
    const c1x = xs[i] + dx / 3
    const c1y = ys[i] + (tangents[i] * dx) / 3
    const c2x = xs[i + 1] - dx / 3
    const c2y = ys[i + 1] - (tangents[i + 1] * dx) / 3
    line += ` C ${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(xs[i + 1])},${f(ys[i + 1])}`
  }

  // Closed down to the baseline so the gradient has something to fade into.
  const area = `${line} L ${f(xs[n - 1])},${f(height)} L ${f(xs[0])},${f(height)} Z`
  return { line, area }
}

/** Where the newest reading sits, for the latest-point marker. */
export function sparkLastPoint(
  values: number[],
  width: number,
  height: number,
  pad = 2
): { x: number; y: number } | null {
  if (values.length === 0) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const usable = height - pad * 2
  return {
    x: width,
    y: height - pad - ((values[values.length - 1] - min) / range) * usable,
  }
}
