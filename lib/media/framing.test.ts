/**
 * Regression suite for Spec 05 · Photo Adjust.
 *
 * The spec's hard promise is "the image cannot be zoomed out past the point where
 * it fails to fill the frame — no empty edges, no letterboxing". That is a
 * property of the clamping, so it is pinned here rather than trusted to the
 * gesture handlers. The other half — that the on-screen transform and the saved
 * crop describe the SAME region — is checked by round-tripping a framing through
 * `cropRect`.
 */
import { describe, expect, it } from "vitest"

import {
  clampFraming,
  coverScale,
  cropRect,
  DEFAULT_FRAMING,
  MAX_SCALE,
  maxOffset,
  outputSize,
  scaleAbout,
} from "@/lib/media/framing"

/** A 3:4 frame, the progress-photo shape. */
const FRAME = { width: 300, height: 400 }
/** A landscape phone photo — wider than the frame, so it crops left/right. */
const LANDSCAPE = { width: 4000, height: 3000 }
/** A tall photo — crops top/bottom instead. */
const TALL = { width: 1000, height: 2000 }

describe("cover", () => {
  it("scales to fill the frame on the constraining axis", () => {
    // Landscape into a portrait frame: height is the constraint.
    expect(coverScale(LANDSCAPE, FRAME)).toBeCloseTo(400 / 3000)
    // Tall into a portrait frame: width is the constraint.
    expect(coverScale(TALL, FRAME)).toBeCloseTo(300 / 1000)
  })

  it("never leaves a gap at any legal zoom", () => {
    for (const image of [LANDSCAPE, TALL, { width: 300, height: 400 }]) {
      for (const scale of [1, 1.5, 2, MAX_SCALE]) {
        const s = coverScale(image, FRAME) * scale
        expect(image.width * s).toBeGreaterThanOrEqual(FRAME.width - 0.001)
        expect(image.height * s).toBeGreaterThanOrEqual(FRAME.height - 0.001)
      }
    }
  })
})

describe("clamping", () => {
  it("refuses to zoom out past cover", () => {
    expect(clampFraming({ ...DEFAULT_FRAMING, scale: 0.2 }, LANDSCAPE, FRAME).scale).toBe(1)
    expect(clampFraming({ ...DEFAULT_FRAMING, scale: -3 }, LANDSCAPE, FRAME).scale).toBe(1)
  })

  it("caps zoom-in", () => {
    expect(clampFraming({ ...DEFAULT_FRAMING, scale: 99 }, LANDSCAPE, FRAME).scale).toBe(
      MAX_SCALE
    )
  })

  it("never lets the image pull away from an edge", () => {
    // A huge drag in each direction lands exactly on the limit, not past it.
    const limits = maxOffset(LANDSCAPE, FRAME, 1)
    const dragged = clampFraming(
      { scale: 1, offsetX: 99999, offsetY: -99999 },
      LANDSCAPE,
      FRAME
    )
    expect(dragged.offsetX).toBeCloseTo(limits.x)
    expect(dragged.offsetY).toBeCloseTo(-limits.y)
  })

  it("pins the axis that exactly fits", () => {
    // An image the same shape as the frame has no slack in either direction.
    const square = { width: 600, height: 800 }
    const limits = maxOffset(square, FRAME, 1)
    expect(limits.x).toBeCloseTo(0)
    expect(limits.y).toBeCloseTo(0)
    const moved = clampFraming({ scale: 1, offsetX: 50, offsetY: 50 }, square, FRAME)
    expect(moved.offsetX).toBeCloseTo(0)
    expect(moved.offsetY).toBeCloseTo(0)
  })

  it("survives nonsense without producing NaN", () => {
    const f = clampFraming(
      { scale: NaN, offsetX: NaN, offsetY: Infinity },
      LANDSCAPE,
      FRAME
    )
    expect(f.scale).toBe(1)
    expect(f.offsetX).toBe(0)
    expect(f.offsetY).toBe(0)
  })
})

describe("pinch", () => {
  it("zooms about the fingers, not the centre", () => {
    // Pinching at a point left of centre should push content right of it away —
    // i.e. the offset moves, rather than the frame zooming about its middle.
    const focal = { x: -80, y: 0 }
    const zoomed = scaleAbout(DEFAULT_FRAMING, 2, focal, LANDSCAPE, FRAME)
    expect(zoomed.scale).toBe(2)
    expect(zoomed.offsetX).not.toBe(0)
  })

  it("holds the centre still when the pinch is centred", () => {
    const zoomed = scaleAbout(DEFAULT_FRAMING, 2, { x: 0, y: 0 }, LANDSCAPE, FRAME)
    expect(zoomed.offsetX).toBeCloseTo(0)
    expect(zoomed.offsetY).toBeCloseTo(0)
  })

  it("still can't escape the frame", () => {
    const zoomed = scaleAbout(DEFAULT_FRAMING, 99, { x: 900, y: 900 }, LANDSCAPE, FRAME)
    const limits = maxOffset(LANDSCAPE, FRAME, zoomed.scale)
    expect(Math.abs(zoomed.offsetX)).toBeLessThanOrEqual(limits.x + 0.001)
    expect(Math.abs(zoomed.offsetY)).toBeLessThanOrEqual(limits.y + 0.001)
  })
})

describe("the saved crop", () => {
  it("matches the frame's aspect at rest", () => {
    const crop = cropRect(DEFAULT_FRAMING, LANDSCAPE, FRAME)
    expect(crop.sWidth / crop.sHeight).toBeCloseTo(FRAME.width / FRAME.height, 4)
  })

  it("stays inside the source image at every zoom and offset", () => {
    for (const image of [LANDSCAPE, TALL]) {
      for (const scale of [1, 1.7, MAX_SCALE]) {
        for (const [dx, dy] of [
          [0, 0],
          [9999, 9999],
          [-9999, -9999],
        ]) {
          const crop = cropRect({ scale, offsetX: dx, offsetY: dy }, image, FRAME)
          expect(crop.sx).toBeGreaterThanOrEqual(-0.001)
          expect(crop.sy).toBeGreaterThanOrEqual(-0.001)
          expect(crop.sx + crop.sWidth).toBeLessThanOrEqual(image.width + 0.001)
          expect(crop.sy + crop.sHeight).toBeLessThanOrEqual(image.height + 0.001)
        }
      }
    }
  })

  it("takes a smaller source region as you zoom in", () => {
    const wide = cropRect(DEFAULT_FRAMING, LANDSCAPE, FRAME)
    const tight = cropRect({ ...DEFAULT_FRAMING, scale: 2 }, LANDSCAPE, FRAME)
    expect(tight.sWidth).toBeLessThan(wide.sWidth)
    expect(tight.sHeight).toBeLessThan(wide.sHeight)
  })

  it("centres by default — no smart framing", () => {
    const crop = cropRect(DEFAULT_FRAMING, LANDSCAPE, FRAME)
    expect(crop.sx + crop.sWidth / 2).toBeCloseTo(LANDSCAPE.width / 2)
    expect(crop.sy + crop.sHeight / 2).toBeCloseTo(LANDSCAPE.height / 2)
  })

  it("moves the source the opposite way to the image", () => {
    // Dragging the image RIGHT reveals more of its left, so the crop moves LEFT.
    const centred = cropRect(DEFAULT_FRAMING, LANDSCAPE, FRAME)
    const dragged = cropRect(
      { ...DEFAULT_FRAMING, offsetX: 40 },
      LANDSCAPE,
      FRAME
    )
    expect(dragged.sx).toBeLessThan(centred.sx)
  })
})

describe("an unmeasured frame", () => {
  // The real failure: confirm tapped before the ResizeObserver has measured. A
  // zero frame used to make coverScale 0, which propagated NaN into the canvas
  // size — and canvas.width = NaN coerces to 0, so toBlob returns a BLANK image
  // that would be uploaded as the user's photo. Nothing here may be non-finite.
  const ZERO = { width: 0, height: 0 }

  it("never yields a non-finite scale", () => {
    expect(Number.isFinite(coverScale(LANDSCAPE, ZERO))).toBe(true)
  })

  it("never yields a non-finite crop", () => {
    const crop = cropRect(DEFAULT_FRAMING, LANDSCAPE, ZERO)
    for (const v of [crop.sx, crop.sy, crop.sWidth, crop.sHeight]) {
      expect(Number.isFinite(v)).toBe(true)
    }
  })

  it("never yields a non-finite output size", () => {
    const out = outputSize(cropRect(DEFAULT_FRAMING, LANDSCAPE, ZERO), 1600)
    expect(Number.isFinite(out.width)).toBe(true)
    expect(Number.isFinite(out.height)).toBe(true)
    expect(out.width).toBeGreaterThan(0)
    expect(out.height).toBeGreaterThan(0)
  })

  it("rejects a garbage crop outright", () => {
    const out = outputSize({ sx: 0, sy: 0, sWidth: NaN, sHeight: NaN }, 1600)
    expect(out).toEqual({ width: 1, height: 1 })
  })
})

describe("output size", () => {
  it("keeps the frame's aspect", () => {
    const crop = cropRect(DEFAULT_FRAMING, LANDSCAPE, FRAME)
    const out = outputSize(crop, 1600)
    expect(out.width / out.height).toBeCloseTo(FRAME.width / FRAME.height, 2)
  })

  it("caps the long edge", () => {
    const out = outputSize(
      { sx: 0, sy: 0, sWidth: 6000, sHeight: 8000 },
      1600
    )
    expect(Math.max(out.width, out.height)).toBe(1600)
  })

  it("never upscales a small crop", () => {
    const out = outputSize({ sx: 0, sy: 0, sWidth: 300, sHeight: 400 }, 1600)
    expect(out.width).toBe(300)
    expect(out.height).toBe(400)
  })
})
