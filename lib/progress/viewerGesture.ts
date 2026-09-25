/**
 * The photo viewer's gesture maths (build-brief-final §3.15). Pure, no React,
 * no DOM: the viewer reads pointers and paints; everything that decides what a
 * gesture MEANS lives here so it can be tested.
 *
 * - One finger that moves 9px picks an axis: sideways swipes between the day's
 *   photos, down drags the photo away to close, up does nothing.
 * - Sideways past the first or last photo rubber-bands (a third of the pull).
 * - On release the swipe is projected 180ms ahead at its current speed, so a
 *   short fast flick turns the page and a long slow drag that drifts back does
 *   not.
 * - Down past 90px, or flicked faster than 0.6px/ms, closes; the backdrop fades
 *   as the photo follows the finger.
 * - Pinch, ctrl+wheel and Safari's gesture scale all clamp to 1..4 and spring
 *   back to 1 on release.
 */

export const VIEWER = {
  /** Growing out of a tile (and the swipe settle). */
  growMs: 420,
  ease: "cubic-bezier(.22,1,.36,1)",
  /** Zoom springs back to 1 on release. */
  springMs: 420,
  spring: "cubic-bezier(.34,1.3,.64,1)",
  /** A page turn after a swipe. */
  snapMs: 380,
  /** Shrinking back into the tile. */
  closeMs: 300,
  /** Movement before a finger commits to an axis. */
  axisSlop: 9,
  /** A mouse held still this long zooms in (there is no pinch on a mouse). */
  holdMs: 400,
  holdZoom: 2.2,
  maxZoom: 4,
  /** How much of a pull past the ends the track follows. */
  rubber: 0.35,
  /** How far ahead a released swipe is projected. */
  projectMs: 180,
  dismissPx: 90,
  /** px per ms. */
  dismissVelocity: 0.6,
  /** A press shorter than this, that never picked an axis, is a tap. */
  tapMs: 400,
  /** The photo's corner, so a shrinking photo keeps the tile's corner. */
  radius: 12,
} as const

export type Axis = "x" | "down" | "none"

/** The axis a one-finger drag commits to, or null while it is still a press. */
export function decideAxis(dx: number, dy: number, slop: number = VIEWER.axisSlop): Axis | null {
  if (Math.hypot(dx, dy) <= slop) return null
  if (Math.abs(dx) > Math.abs(dy)) return "x"
  return dy > 0 ? "down" : "none"
}

/** `x` inside [min, max] as is; past either end, only `k` of the overshoot. */
export function rubberBand(x: number, min: number, max: number, k: number = VIEWER.rubber): number {
  if (x > max) return max + (x - max) * k
  if (x < min) return min + (x - min) * k
  return x
}

/** The track's resting offset for photo `index`. */
export function trackX(index: number, width: number): number {
  return index === 0 ? 0 : -index * width
}

/** The track's offset while a swipe is `dx` from where it started. */
export function dragTrackX(index: number, width: number, count: number, dx: number): number {
  const min = trackX(Math.max(0, count - 1), width)
  return rubberBand(trackX(index, width) + dx, min, 0)
}

export interface Sample {
  x: number
  y: number
  /** ms */
  t: number
}

/** Speed across the recent samples, px per ms. Zero with fewer than two. */
export function velocity(samples: readonly Sample[]): { vx: number; vy: number } {
  if (samples.length < 2) return { vx: 0, vy: 0 }
  const a = samples[0]
  const b = samples[samples.length - 1]
  const dt = Math.max(1, b.t - a.t)
  return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt }
}

/**
 * The photo a released swipe lands on: the drag projected `projectMs` ahead,
 * past a third of the width turns one page, never more, never past the ends.
 */
export function snapIndex(
  index: number,
  count: number,
  dx: number,
  vx: number,
  width: number,
  projectMs: number = VIEWER.projectMs,
): number {
  const projected = dx + vx * projectMs
  const third = width / 3
  if (projected < -third) return Math.min(count - 1, index + 1)
  if (projected > third) return Math.max(0, index - 1)
  return index
}

/** A down drag that closes the viewer on release. */
export function shouldDismiss(dy: number, vy: number): boolean {
  return dy > VIEWER.dismissPx || vy > VIEWER.dismissVelocity
}

/**
 * The photo, backdrop and controls while a down drag is `dx`, `dy` from where
 * it started: the photo follows the finger down (and a little sideways) and
 * shrinks slightly; the backdrop fades over 320px, the controls over 100px.
 */
export function dismissFrame(dx: number, dy: number): {
  x: number
  y: number
  scale: number
  backdrop: number
  chrome: number
} {
  const down = Math.max(0, dy)
  return {
    x: dx * 0.3,
    y: down,
    scale: 1 - Math.min(down, 300) / 1400,
    backdrop: Math.max(0, 1 - down / 320),
    chrome: Math.max(0, 1 - down / 100),
  }
}

export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1
  return Math.min(VIEWER.maxZoom, Math.max(1, z))
}

/** Two fingers that started `d0` apart and are now `d` apart. */
export function pinchZoom(d0: number, d: number): number {
  if (d0 <= 0) return 1
  return clampZoom(d / d0)
}

/** A trackpad pinch in Chromium arrives as ctrl + wheel; up is in. */
export function wheelZoom(z: number, deltaY: number): number {
  return clampZoom(z * Math.exp(-deltaY * 0.01))
}

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/**
 * The transform (origin at the centre) that lays `from` over `to`: the centre
 * moves, the width scales. The grow runs it backwards, from the tile to none;
 * the close runs it forwards, from wherever the photo is to the tile.
 */
export function rectTransform(from: Box, to: Box): { x: number; y: number; s: number } {
  if (from.width <= 0) return { x: 0, y: 0, s: 1 }
  return {
    x: to.left + to.width / 2 - (from.left + from.width / 2),
    y: to.top + to.height / 2 - (from.top + from.height / 2),
    s: to.width / from.width,
  }
}

/** A point as a transform-origin inside `box`, in percent. */
export function originPercent(x: number, y: number, box: Box): { x: number; y: number } {
  if (box.width <= 0 || box.height <= 0) return { x: 50, y: 50 }
  return {
    x: ((x - box.left) / box.width) * 100,
    y: ((y - box.top) / box.height) * 100,
  }
}

export function inside(x: number, y: number, box: Box): boolean {
  return x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height
}

/** A press that never picked an axis and let go quickly. */
export function isTap(axis: Axis | "hold" | null, elapsedMs: number): boolean {
  return axis === null && elapsedMs < VIEWER.tapMs
}

/** A CSS transform for `rectTransform`'s result. */
export function transformCss(t: { x: number; y: number; s: number }): string {
  return `translate(${t.x}px, ${t.y}px) scale(${t.s})`
}
