import { describe, expect, it } from "vitest"

import {
  FAN_HOT_SCALE,
  FAN_ITEM,
  fanHit,
  fanItemState,
  fanLabelPlace,
  fanOffset,
} from "@/lib/shortcuts/fan"

describe("the + fan", () => {
  it("sets the four items on a 132px arc from the left round to straight up", () => {
    expect(fanOffset(0)).toEqual({ x: -132, y: 0 })
    expect(fanOffset(3)).toEqual({ x: 0, y: -132 })
    expect(Math.hypot(fanOffset(1).x, fanOffset(1).y)).toBeCloseTo(132, 0)
  })

  it("picks the item a finger slid toward, and none too close, too far or below", () => {
    expect(fanHit(-120, -5)).toBe(0)
    expect(fanHit(-2, -130)).toBe(3)
    expect(fanHit(-66, -114)).toBe(2)
    expect(fanHit(-20, -10)).toBeNull()
    expect(fanHit(-300, 0)).toBeNull()
    expect(fanHit(-100, 60)).toBeNull()
    expect(fanHit(100, -100)).toBeNull()
  })
})

describe("W45: the item under the finger turns white, the rest dim", () => {
  it("lights the one, dims the others while the fan is open", () => {
    expect([0, 1, 2, 3].map((i) => fanItemState(i, 2, true))).toEqual(["dim", "dim", "true", "dim"])
    expect([0, 1, 2, 3].map((i) => fanItemState(i, null, true))).toEqual(["false", "false", "false", "false"])
  })

  it("keeps the picked one white as the fan folds, and never holds the others at half", () => {
    // `.fan-item[data-hot="dim"]` sets opacity .5, which would beat the fold's fade.
    expect([0, 1, 2, 3].map((i) => fanItemState(i, 1, false))).toEqual(["false", "true", "false", "false"])
  })
})

/* ------------------------------------------------ D27: labels on a backing */

type Box = { x0: number; y0: number; x1: number; y1: number }

/** A label's backing box around the +'s centre, `w` wide and 22 tall (12px text, 3px padding). */
function labelBox(i: number, w: number): Box {
  const { x, y } = fanOffset(i)
  const p = fanLabelPlace(i)
  const ax = x - FAN_ITEM / 2 + p.left
  const ay = y - FAN_ITEM / 2 + p.top
  const h = 22
  const up = p.transform === "translate(-100%, -100%)"
  return up ? { x0: ax - w, y0: ay - h, x1: ax, y1: ay } : { x0: ax - w, y0: ay - h / 2, x1: ax, y1: ay + h / 2 }
}

/** Whether a point is inside item `i`'s square drawn lit (grown, its radius 14 grown with it). */
function inLitSquare(i: number, px: number, py: number): boolean {
  const { x, y } = fanOffset(i)
  const half = (FAN_ITEM / 2) * FAN_HOT_SCALE
  const r = 14 * FAN_HOT_SCALE
  const dx = Math.abs(px - x)
  const dy = Math.abs(py - y)
  if (dx > half || dy > half) return false
  const cx = Math.max(dx - (half - r), 0)
  const cy = Math.max(dy - (half - r), 0)
  return Math.hypot(cx, cy) <= r
}

function edgePoints(b: Box): [number, number][] {
  const out: [number, number][] = []
  for (let t = 0; t <= 1; t += 0.05) {
    out.push([b.x0 + (b.x1 - b.x0) * t, b.y0], [b.x0 + (b.x1 - b.x0) * t, b.y1])
    out.push([b.x0, b.y0 + (b.y1 - b.y0) * t], [b.x1, b.y0 + (b.y1 - b.y0) * t])
  }
  return out
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

describe("D27: each label sits on a backing that clears every square", () => {
  // The four labels at 12px Plex Sans, generously measured, plus 14px padding.
  const widths = [60, 64, 100, 76]

  it("never covers any square, even the one lit and grown", () => {
    for (let i = 0; i < 4; i++) {
      const box = labelBox(i, widths[i])
      for (let j = 0; j < 4; j++) {
        for (const [px, py] of edgePoints(box)) expect(inLitSquare(j, px, py), `label ${i} on square ${j}`).toBe(false)
      }
    }
  })

  it("never overlaps another label", () => {
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) expect(overlaps(labelBox(i, widths[i]), labelBox(j, widths[j]))).toBe(false)
    }
  })

  it("stays on a 320-point screen with the + 48 points in from the right", () => {
    for (let i = 0; i < 4; i++) {
      const box = labelBox(i, widths[i])
      expect(48 - box.x0).toBeLessThanOrEqual(320 - 16)
    }
  })
})
