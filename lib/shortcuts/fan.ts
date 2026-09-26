/**
 * The + fan's geometry (build-brief-final §3.6; round two "arc"): four items
 * 132px from the +'s centre, from the left round to straight up, and which one
 * a finger has slid onto. Pure: no DOM.
 */
export const FAN_RADIUS = 132
export const FAN_ANGLES = [180, 210, 240, 270]
/** An item's rounded square, and how much it grows when lit (`.fan-item[data-hot="true"]`). */
export const FAN_ITEM = 48
export const FAN_HOT_SCALE = 1.14

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

/**
 * An item's `data-hot` (W45): "true" is the one under the finger, drawn white;
 * "dim" is every other one while one is lit; "false" is plain.
 *
 * Nothing is dimmed while the fan folds away: the dim rule sets the item's
 * opacity to one half, which would hold the others at half through the fold
 * instead of letting them fade out. The picked one stays white as it goes.
 */
export function fanItemState(i: number, hot: number | null, open: boolean): "true" | "dim" | "false" {
  if (hot === i) return "true"
  return open && hot != null ? "dim" : "false"
}

/** Clear space between an item's square and its label's backing (D27), and above the top one. */
const LABEL_GAP = 18
const LABEL_GAP_UP = 8

/**
 * Where an item's label sits, in its square's own box (top-left 0,0; a
 * `FAN_ITEM` square), as the final check places it (`plus7.js`): the one
 * straight up has its label above, right-aligned to it; the rest to its left,
 * along the line out from the square's centre. The label has a backing now
 * (D27), so the gap clears the square even while it is lit and grown.
 *
 * `left` and `top` are the anchor; `transform` hangs the label off it.
 */
export function fanLabelPlace(i: number): { left: number; top: number; transform: string } {
  const { x, y } = fanOffset(i)
  const cx = x / FAN_RADIUS
  const cy = y / FAN_RADIUS
  const half = FAN_ITEM / 2
  if (Math.abs(cx) <= 0.3) return { left: FAN_ITEM, top: -LABEL_GAP_UP, transform: "translate(-100%, -100%)" }
  const r = half + LABEL_GAP
  const round = (v: number) => Math.round(v * 10) / 10 + 0
  return { left: round(half + cx * r), top: round(half + cy * r), transform: "translate(-100%, -50%)" }
}
