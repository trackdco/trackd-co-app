/**
 * The maths behind the photo adjust step (Spec 05) — zoom + reposition inside a
 * FIXED frame, with the image always covering it.
 *
 * Kept pure and separate from the sheet so the clamping rules (the part that
 * actually guarantees "no empty edges, ever") are testable without a DOM, a
 * pointer, or a canvas.
 *
 * Coordinate model:
 *  - The image is first scaled to COVER the frame (`coverScale`), then multiplied
 *    by the user's `scale` (>= 1, so it can never be zoomed out past cover).
 *  - `offsetX/Y` are in FRAME pixels, measured from centred. Positive x moves the
 *    image right, revealing more of its left edge.
 *
 * Pure helpers only; no React, no side effects (Context/code-standards.md).
 */

/**
 * The frame ratio each photo surface uses, as width / height. Declared together
 * so a surface and the card it later renders in can't drift apart — the whole
 * point of framing a progress photo is that it matches the shape you'll see it in.
 */
/** Progress photos — matches `aspect-[3/4]` on the card and the compare sheet. */
export const PROGRESS_PHOTO_ASPECT = 3 / 4
/** Profile picture — square, because it renders as a circle. */
export const AVATAR_ASPECT = 1
/** Bloodwork + journal photos. These are DOCUMENTS (a lab report, a screenshot),
 *  so the tallest ratio the app uses keeps the most of a page in frame; the user
 *  can still zoom out to cover and pan to whatever matters. */
export const DOCUMENT_ASPECT = 3 / 4

/** What the user set: how far in, and how far off centre. */
export interface Framing {
  /** Zoom multiplier over "just covers the frame". Never below 1. */
  scale: number
  /** Horizontal offset in frame pixels, from centred. */
  offsetX: number
  /** Vertical offset in frame pixels, from centred. */
  offsetY: number
}

/** Opening state: filling the frame, centred, nothing cropped by choice. */
export const DEFAULT_FRAMING: Framing = { scale: 1, offsetX: 0, offsetY: 0 }

/** Zooming in further than this stops being framing and starts being pixels. */
export const MAX_SCALE = 4

export interface Size {
  width: number
  height: number
}

/**
 * The scale at which the image exactly covers the frame — the floor for every
 * zoom, which is what makes letterboxing unreachable rather than merely
 * discouraged.
 */
export function coverScale(image: Size, frame: Size): number {
  if (image.width <= 0 || image.height <= 0) return 1
  // An UNMEASURED frame (0×0, before the layout settles) would otherwise return
  // scale 0, and every later division by it yields NaN — which a canvas silently
  // turns into a blank image rather than an error. 1 is a harmless stand-in; the
  // caller shouldn't be cropping against an unmeasured frame at all.
  if (frame.width <= 0 || frame.height <= 0) return 1
  return Math.max(frame.width / image.width, frame.height / image.height)
}

/**
 * How far the image may travel before an edge would enter the frame. Zero on an
 * axis means that axis exactly fits and must not move at all.
 */
export function maxOffset(image: Size, frame: Size, scale: number): {
  x: number
  y: number
} {
  const s = coverScale(image, frame) * scale
  return {
    x: Math.max(0, (image.width * s - frame.width) / 2),
    y: Math.max(0, (image.height * s - frame.height) / 2),
  }
}

/** Clamp a value into [-limit, limit]. */
function clamp(value: number, limit: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(limit, Math.max(-limit, value))
}

/**
 * Force a framing to be legal: zoom within [1, MAX_SCALE] and the image still
 * covering the frame on both axes. Every gesture result goes through this, so
 * there is no path — pinch, drag, or a restored framing from an earlier
 * session — that can produce an empty edge.
 */
export function clampFraming(
  framing: Framing,
  image: Size,
  frame: Size
): Framing {
  const scale = Math.min(
    MAX_SCALE,
    Math.max(1, Number.isFinite(framing.scale) ? framing.scale : 1)
  )
  const max = maxOffset(image, frame, scale)
  return {
    scale,
    offsetX: clamp(framing.offsetX, max.x),
    offsetY: clamp(framing.offsetY, max.y),
  }
}

/**
 * Keep the point under the user's fingers still while the zoom changes.
 *
 * Without this a pinch zooms about the frame's centre, so the subject slides out
 * from under the gesture and framing becomes a fight. `focal` is the pinch
 * midpoint in frame coordinates, measured from the frame's centre.
 */
export function scaleAbout(
  framing: Framing,
  nextScale: number,
  focal: { x: number; y: number },
  image: Size,
  frame: Size
): Framing {
  const from = Math.max(1, framing.scale)
  const to = Math.min(MAX_SCALE, Math.max(1, nextScale))
  const ratio = to / from
  return clampFraming(
    {
      scale: to,
      // The focal point's image-space position is held fixed: the offset grows by
      // the same ratio as the zoom, about that point rather than about centre.
      offsetX: focal.x + (framing.offsetX - focal.x) * ratio,
      offsetY: focal.y + (framing.offsetY - focal.y) * ratio,
    },
    image,
    frame
  )
}

/** The source rectangle, in IMAGE pixels, that the frame is showing. */
export interface CropRect {
  sx: number
  sy: number
  sWidth: number
  sHeight: number
}

/**
 * Convert a framing into the crop to draw. This is the bridge between what the
 * user saw and what gets written — the on-screen transform and this rectangle
 * must describe the same region, or the saved photo won't match the preview.
 */
export function cropRect(
  framing: Framing,
  image: Size,
  frame: Size
): CropRect {
  const { scale, offsetX, offsetY } = clampFraming(framing, image, frame)
  const s = coverScale(image, frame) * scale
  // The frame, measured back in image pixels.
  const sWidth = Math.min(image.width, frame.width / s)
  const sHeight = Math.min(image.height, frame.height / s)
  // Offsetting the image right (+x) reveals more of its LEFT side, so the source
  // rectangle moves the opposite way.
  const centerX = image.width / 2 - offsetX / s
  const centerY = image.height / 2 - offsetY / s
  const sx = Math.min(
    Math.max(0, centerX - sWidth / 2),
    Math.max(0, image.width - sWidth)
  )
  const sy = Math.min(
    Math.max(0, centerY - sHeight / 2),
    Math.max(0, image.height - sHeight)
  )
  return { sx, sy, sWidth, sHeight }
}

/**
 * Output pixel size for a crop: the frame's aspect, capped on the long edge so a
 * 48MP phone photo doesn't become a 20MB upload, and never upscaled beyond what
 * the crop actually contains.
 */
export function outputSize(crop: CropRect, maxEdge: number): Size {
  // A non-finite crop must not become a non-finite canvas size — `canvas.width =
  // NaN` coerces to 0 and encodes a blank image instead of failing loudly.
  if (
    !Number.isFinite(crop.sWidth) ||
    !Number.isFinite(crop.sHeight) ||
    crop.sWidth <= 0 ||
    crop.sHeight <= 0
  ) {
    return { width: 1, height: 1 }
  }
  const ratio = crop.sWidth / crop.sHeight
  let width = crop.sWidth
  let height = crop.sHeight
  if (width > maxEdge || height > maxEdge) {
    if (width >= height) {
      width = maxEdge
      height = maxEdge / ratio
    } else {
      height = maxEdge
      width = maxEdge * ratio
    }
  }
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }
}
