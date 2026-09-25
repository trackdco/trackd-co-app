/**
 * The + fan's geometry (build-brief-final §3.6; round two "arc"): four items
 * 132px from the +'s centre, from the left round to straight up, and which one
 * a finger has slid onto. Pure: no DOM.
 */
export const FAN_RADIUS = 132
export const FAN_ANGLES = [180, 210, 240, 270]

/** Where item `i` sits from the +'s centre (screen axes: y grows down). */
export function fanOffset(i: number): { x: number; y: number } {
  const a = (FAN_ANGLES[i] * Math.PI) / 180
  // Rounded to a tenth of a pixel, and never -0.
  const r = (v: number) => Math.round(v * FAN_RADIUS * 10) / 10 + 0
  return { x: r(Math.cos(a)), y: r(Math.sin(a)) }
}

/**
 * The item nearest by angle to a finger at (dx, dy) from the +'s centre, when
 * it is 40 to 220px out, not below the +, and within 20 degrees of an item.
 * Null means none: lifting there closes the fan.
 */
export function fanHit(dx: number, dy: number): number | null {
  const d = Math.hypot(dx, dy)
  if (d < 40 || d > 220 || dy > 30) return null
  let ang = (Math.atan2(dy, dx) * 180) / Math.PI
  if (ang < 0) ang += 360
  let best: number | null = null
  let bd = Infinity
  FAN_ANGLES.forEach((a, i) => {
    const df = Math.abs(a - ang)
    if (df < bd) {
      bd = df
      best = i
    }
  })
  return bd <= 20 ? best : null
}
