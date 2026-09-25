import { describe, expect, it } from "vitest"

import {
  VIEWER,
  clampZoom,
  decideAxis,
  dismissFrame,
  dragTrackX,
  inside,
  isTap,
  originPercent,
  pinchZoom,
  rectTransform,
  rubberBand,
  shouldDismiss,
  snapIndex,
  trackX,
  transformCss,
  velocity,
  wheelZoom,
} from "./viewerGesture"

describe("decideAxis", () => {
  it("waits until the finger has moved past the slop", () => {
    expect(decideAxis(5, 5)).toBeNull()
    expect(decideAxis(0, VIEWER.axisSlop)).toBeNull()
  })

  it("sideways swipes, down drags, up does nothing", () => {
    expect(decideAxis(-20, 4)).toBe("x")
    expect(decideAxis(3, 20)).toBe("down")
    expect(decideAxis(3, -20)).toBe("none")
  })
})

describe("the swipe track", () => {
  const W = 390

  it("rests at minus one width per photo", () => {
    expect(trackX(0, W)).toBe(0)
    expect(trackX(2, W)).toBe(-780)
  })

  it("follows the finger between the ends", () => {
    expect(dragTrackX(1, W, 3, -100)).toBe(-490)
  })

  it("rubber-bands past the first photo", () => {
    expect(dragTrackX(0, W, 3, 100)).toBeCloseTo(100 * VIEWER.rubber)
  })

  it("rubber-bands past the last photo", () => {
    expect(dragTrackX(2, W, 3, -100)).toBeCloseTo(-780 - 100 * VIEWER.rubber)
  })

  it("rubber-bands both ways on a one-photo day", () => {
    expect(dragTrackX(0, W, 1, -60)).toBeCloseTo(-60 * VIEWER.rubber)
    expect(dragTrackX(0, W, 1, 60)).toBeCloseTo(60 * VIEWER.rubber)
  })

  it("rubberBand leaves values inside the range alone", () => {
    expect(rubberBand(-5, -10, 0)).toBe(-5)
  })
})

describe("velocity", () => {
  it("is distance over time across the samples", () => {
    expect(
      velocity([
        { x: 0, y: 0, t: 0 },
        { x: 50, y: 10, t: 50 },
        { x: 100, y: 20, t: 100 },
      ]),
    ).toEqual({ vx: 1, vy: 0.2 })
  })

  it("is zero with one sample", () => {
    expect(velocity([{ x: 4, y: 4, t: 9 }])).toEqual({ vx: 0, vy: 0 })
  })

  it("never divides by zero", () => {
    const v = velocity([
      { x: 0, y: 0, t: 5 },
      { x: 10, y: 0, t: 5 },
    ])
    expect(Number.isFinite(v.vx)).toBe(true)
  })
})

describe("snapIndex: projecting the release", () => {
  const W = 390

  it("stays on a short slow drag", () => {
    expect(snapIndex(1, 3, -60, 0, W)).toBe(1)
  })

  it("turns the page on a long drag", () => {
    expect(snapIndex(1, 3, -200, 0, W)).toBe(2)
    expect(snapIndex(1, 3, 200, 0, W)).toBe(0)
  })

  it("turns the page on a short fast flick", () => {
    // 40px, but at 1px/ms it projects 220px.
    expect(snapIndex(0, 3, -40, -1, W)).toBe(1)
  })

  it("does not turn on a long drag that is swinging back", () => {
    expect(snapIndex(0, 3, -140, 0.5, W)).toBe(0)
  })

  it("never goes past either end, and never more than one page", () => {
    expect(snapIndex(2, 3, -900, -5, W)).toBe(2)
    expect(snapIndex(0, 3, 900, 5, W)).toBe(0)
    expect(snapIndex(0, 5, -2000, -9, W)).toBe(1)
  })
})

describe("the down drag", () => {
  it("closes past 90px or on a fast flick", () => {
    expect(shouldDismiss(91, 0)).toBe(true)
    expect(shouldDismiss(30, 0.7)).toBe(true)
    expect(shouldDismiss(60, 0.2)).toBe(false)
  })

  it("follows the finger, fades the backdrop and the controls", () => {
    const f = dismissFrame(100, 160)
    expect(f.x).toBeCloseTo(30)
    expect(f.y).toBe(160)
    expect(f.scale).toBeCloseTo(1 - 160 / 1400)
    expect(f.backdrop).toBeCloseTo(0.5)
    expect(f.chrome).toBe(0)
  })

  it("shrinks no further after 300px and never below zero opacity", () => {
    const f = dismissFrame(0, 900)
    expect(f.scale).toBeCloseTo(1 - 300 / 1400)
    expect(f.backdrop).toBe(0)
  })

  it("holds still above the start", () => {
    expect(dismissFrame(0, -40)).toMatchObject({ y: 0, scale: 1, backdrop: 1, chrome: 1 })
  })
})

describe("zoom", () => {
  it("clamps to one to four", () => {
    expect(clampZoom(0.4)).toBe(1)
    expect(clampZoom(9)).toBe(VIEWER.maxZoom)
    expect(clampZoom(Number.NaN)).toBe(1)
  })

  it("pinch is the finger distance ratio", () => {
    expect(pinchZoom(100, 250)).toBe(2.5)
    expect(pinchZoom(100, 50)).toBe(1)
    expect(pinchZoom(0, 50)).toBe(1)
  })

  it("ctrl+wheel up zooms in, down zooms out", () => {
    expect(wheelZoom(1, -20)).toBeGreaterThan(1)
    expect(wheelZoom(2, 20)).toBeLessThan(2)
    expect(wheelZoom(1, 50)).toBe(1)
  })
})

describe("growing out of a tile", () => {
  const photo = { left: 20, top: 100, width: 300, height: 400 }
  const tile = { left: 20, top: 200, width: 100, height: 133 }

  it("moves the centre and scales the width", () => {
    const t = rectTransform(photo, tile)
    expect(t.x).toBeCloseTo(70 - 170)
    expect(t.y).toBeCloseTo(266.5 - 300)
    expect(t.s).toBeCloseTo(1 / 3)
  })

  it("is nothing from a box to itself", () => {
    expect(rectTransform(photo, photo)).toEqual({ x: 0, y: 0, s: 1 })
  })

  it("does not blow up on an unlaid-out box", () => {
    expect(rectTransform({ left: 0, top: 0, width: 0, height: 0 }, tile)).toEqual({ x: 0, y: 0, s: 1 })
  })

  it("writes a transform", () => {
    expect(transformCss({ x: 1, y: -2, s: 0.5 })).toBe("translate(1px, -2px) scale(0.5)")
  })
})

describe("taps", () => {
  const box = { left: 10, top: 10, width: 100, height: 100 }

  it("zooms about the finger", () => {
    expect(originPercent(35, 85, box)).toEqual({ x: 25, y: 75 })
    expect(originPercent(0, 0, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 50, y: 50 })
  })

  it("knows the photo from the dark around it", () => {
    expect(inside(50, 50, box)).toBe(true)
    expect(inside(5, 50, box)).toBe(false)
    expect(inside(50, 111, box)).toBe(false)
  })

  it("is a tap only if quick and never an axis", () => {
    expect(isTap(null, 120)).toBe(true)
    expect(isTap(null, 600)).toBe(false)
    expect(isTap("x", 120)).toBe(false)
    expect(isTap("hold", 120)).toBe(false)
  })
})
