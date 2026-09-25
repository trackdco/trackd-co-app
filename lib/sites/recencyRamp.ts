/**
 * THE AMBER RECENCY RAMP (build-brief-final §2.5): how a site used d days ago
 * is shaded on the body map.
 *
 * Heat is unchanged (`1 − (d+1)/(W+1)`, IM 7 days, Sub-Q 5). What changed is the
 * paint: a solid step pre-mixed in OKLCH at a fixed hue, where the map used to
 * lay amber over the grey at an opacity, which drifts olive. For heat h in
 * (0, 1], t = h^0.85; L and C run in a straight line from the region grey to
 * amber, and the hue from amber−4° to amber. The base colour that makes a plain
 * `color-mix(in oklch)` do exactly that is `--ramp-base` (globals.css), restated
 * per map tone, so this module only decides HOW MUCH amber.
 *
 * Pure; no React.
 */

/** How far toward amber a heat sits: 0 for none, 1 for today. */
export function rampT(heat: number): number {
  if (!(heat > 0)) return 0
  return Math.pow(Math.min(1, heat), 0.85)
}

/** The fill for a shaded site, or null when it is not shaded at all. */
export function rampFill(heat: number): string | null {
  const t = rampT(heat)
  if (t === 0) return null
  if (t === 1) return "var(--accent-amber)"
  return `color-mix(in oklch, var(--accent-amber) ${(t * 100).toFixed(1)}%, var(--ramp-base))`
}
