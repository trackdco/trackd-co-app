import { describe, expect, it } from "vitest"

import {
  APP_LABEL_STEP,
  BARREL_TAIL,
  BARREL_W,
  BARREL_X,
  DEFAULT_SYRINGE_SIZE,
  FLANGE_X,
  LABEL_SIZE,
  MIN_READABLE_UNITS,
  PLUNGER_FADE_X,
  STOPPER_W,
  SYRINGE_SIZES,
  THUMB_W,
  THUMB_X,
  TICK_MAJOR,
  TICK_MID,
  TICK_MINOR,
  VIEW_H,
  VIEW_W,
  barrelX,
  fillFraction,
  graduations,
  isSyringeSizeId,
  misuseKind,
  plungerOffset,
  scaleMarks,
  syringeSize,
  tickLength,
} from "./syringe"

describe("SYRINGE_SIZES", () => {
  it("offers exactly the three sizes the spec names, smallest first", () => {
    expect(SYRINGE_SIZES.map((s) => s.id)).toEqual(["0.3", "0.5", "1"])
    expect(SYRINGE_SIZES.map((s) => s.label)).toEqual(["0.3 mL", "0.5 mL", "1 mL"])
  })

  it("marks each barrel in U-100 units (1 mL = 100 U)", () => {
    for (const s of SYRINGE_SIZES) expect(s.units).toBe(s.ml * 100)
  })

  // `labelStep` is the PUBLIC calculator's scale, frozen as it shipped
  // (components/landing/LandingSyringeGraphic.tsx draws it over `graduations`).
  // The app prints its own, below (`scaleMarks`).
  it("uses the labelling intervals Adrian approved: 5 / 5 / 10", () => {
    expect(SYRINGE_SIZES.map((s) => s.labelStep)).toEqual([5, 5, 10])
    expect(SYRINGE_SIZES.map((s) => s.minorStep)).toEqual([1, 1, 2])
  })

  it("labels the capacity itself on every size, so the barrel end is never blank", () => {
    for (const s of SYRINGE_SIZES) expect(s.units % s.labelStep).toBe(0)
  })
})

describe("graduations", () => {
  it("runs from 0 to the capacity inclusive", () => {
    for (const s of SYRINGE_SIZES) {
      const g = graduations(s)
      expect(g[0]).toEqual({ units: 0, fraction: 0, labelled: true })
      expect(g[g.length - 1]).toEqual({ units: s.units, fraction: 1, labelled: true })
    }
  })

  it("steps by minorStep with no float drift off the end", () => {
    for (const s of SYRINGE_SIZES) {
      const g = graduations(s)
      expect(g.length).toBe(s.units / s.minorStep + 1)
      // Every tick is an exact multiple, not 29.999999999.
      for (const tick of g) expect(tick.units % s.minorStep).toBe(0)
    }
  })

  it("keeps the 10-40 unit band readable on every size (the spec's bar)", () => {
    for (const s of SYRINGE_SIZES) {
      const labelled = graduations(s)
        .filter((t) => t.labelled && t.units >= 10 && t.units <= 40)
        .map((t) => t.units)
      // At least four printed numbers inside the band, so no value in it is
      // more than half a label-step away from a number.
      expect(labelled.length).toBeGreaterThanOrEqual(4)
    }
    expect(
      graduations(syringeSize("1"))
        .filter((t) => t.labelled && t.units >= 10 && t.units <= 40)
        .map((t) => t.units),
    ).toEqual([10, 20, 30, 40])
  })

  it("puts fractions in step with the units", () => {
    const half = graduations(syringeSize("0.5")).find((t) => t.units === 25)
    expect(half?.fraction).toBe(0.5)
  })
})

describe("fillFraction — the proportionality the graphic exists for", () => {
  it("draws the SAME dose differently on a different barrel", () => {
    expect(fillFraction(10, syringeSize("0.5"))).toBeCloseTo(0.2, 10)
    expect(fillFraction(10, syringeSize("1"))).toBeCloseTo(0.1, 10)
    expect(fillFraction(10, syringeSize("0.3"))).toBeCloseTo(1 / 3, 10)
  })

  it("is empty with no result", () => {
    expect(fillFraction(null, syringeSize("1"))).toBe(0)
    expect(fillFraction(Number.NaN, syringeSize("1"))).toBe(0)
  })

  it("clamps rather than overflowing the barrel", () => {
    expect(fillFraction(250, syringeSize("1"))).toBe(1)
    expect(fillFraction(-5, syringeSize("1"))).toBe(0)
  })

  it("fills the barrel exactly at capacity", () => {
    for (const s of SYRINGE_SIZES) expect(fillFraction(s.units, s)).toBe(1)
  })
})

describe("misuseKind", () => {
  it("says nothing until there is a result", () => {
    expect(misuseKind(null, syringeSize("1"))).toBeNull()
  })

  it("fires under 2 units, and not at exactly 2", () => {
    expect(misuseKind(1.9, syringeSize("1"))).toBe("under")
    expect(misuseKind(0, syringeSize("1"))).toBe("under")
    expect(misuseKind(MIN_READABLE_UNITS, syringeSize("1"))).toBeNull()
  })

  it("fires over the SELECTED capacity, not a fixed number", () => {
    expect(misuseKind(40, syringeSize("0.3"))).toBe("over")
    expect(misuseKind(40, syringeSize("0.5"))).toBeNull()
    expect(misuseKind(60, syringeSize("0.5"))).toBe("over")
    expect(misuseKind(60, syringeSize("1"))).toBeNull()
  })

  it("does not fire at exactly capacity — a full barrel is drawable", () => {
    for (const s of SYRINGE_SIZES) expect(misuseKind(s.units, s)).toBeNull()
  })
})

describe("barrelX", () => {
  it("maps 0 and 1 to the barrel's ends", () => {
    expect(barrelX(0)).toBe(BARREL_X)
    expect(barrelX(1)).toBe(BARREL_X + BARREL_W)
  })
})

describe("plungerOffset — the plunger travels with the draw", () => {
  it("moves exactly as far as the draw's edge", () => {
    for (const f of [0, 0.2, 0.4, 5 / 6, 1]) {
      expect(BARREL_X + plungerOffset(f)).toBeCloseTo(barrelX(f), 10)
    }
  })

  it("clamps like the fill, so nothing can push it out of its box", () => {
    expect(plungerOffset(-1)).toBe(0)
    expect(plungerOffset(3)).toBe(BARREL_W)
    expect(plungerOffset(Number.NaN)).toBe(0)
  })
})

describe("scaleMarks — the app's printed scale (W37, D21)", () => {
  const printed = (id: "0.3" | "0.5" | "1") =>
    scaleMarks(syringeSize(id))
      .filter((t) => t.labelled)
      .map((t) => t.units)

  it("prints every 20 on 1 mL, so '90' and '100' can no longer run together", () => {
    expect(printed("1")).toEqual([0, 20, 40, 60, 80, 100])
  })

  it("keeps a mid tick on each unprinted ten of 1 mL", () => {
    const mids = scaleMarks(syringeSize("1"))
      .filter((t) => t.kind === "mid")
      .map((t) => t.units)
    expect(mids).toEqual([10, 30, 50, 70, 90])
  })

  it("keeps printing every 5 on 0.3 and 0.5 mL", () => {
    expect(printed("0.3")).toEqual([0, 5, 10, 15, 20, 25, 30])
    expect(printed("0.5")).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50])
    expect(APP_LABEL_STEP).toEqual({ "0.3": 5, "0.5": 5, "1": 20 })
  })

  it("puts its ticks where the public scale puts them, labelled or not", () => {
    for (const s of SYRINGE_SIZES) {
      expect(scaleMarks(s).map((t) => [t.units, t.fraction])).toEqual(
        graduations(s).map((t) => [t.units, t.fraction]),
      )
      for (const t of scaleMarks(s)) expect(t.labelled).toBe(t.kind === "major")
    }
  })

  it("keeps the 10-40 band readable on every size: each ten is printed or a mid tick", () => {
    for (const s of SYRINGE_SIZES) {
      const marks = new Map(scaleMarks(s).map((t) => [t.units, t.kind]))
      for (const u of [10, 20, 30]) expect(["major", "mid"]).toContain(marks.get(u))
      if (s.units >= 40) expect(["major", "mid"]).toContain(marks.get(40))
    }
  })

  it("draws three tick lengths, longest for a printed number", () => {
    expect(tickLength("major")).toBe(TICK_MAJOR)
    expect(tickLength("mid")).toBe(TICK_MID)
    expect(tickLength("minor")).toBe(TICK_MINOR)
    expect(TICK_MAJOR).toBeGreaterThan(TICK_MID)
    expect(TICK_MID).toBeGreaterThan(TICK_MINOR)
  })
})

describe("the drawing's box", () => {
  it("draws the syringe full size again: the barrel is about two thirds of the box (W37, D21)", () => {
    // The first build reserved a barrel length of travel inside the box and
    // the barrel fell to 42% of it, drawn small and pushed left.
    expect(BARREL_W / VIEW_W).toBeGreaterThanOrEqual(0.6)
    // The needle's tip to the thumb rest spans the box at an empty draw.
    expect(THUMB_X + THUMB_W).toBeGreaterThanOrEqual(VIEW_W * 0.9)
  })

  it("is one fixed box, at every draw and on every barrel", () => {
    // Nothing about the box depends on the fill or the size.
    expect([VIEW_W, VIEW_H]).toEqual([320, 56])
  })

  it("shows an empty syringe whole, and fades the plunger out only past its resting place", () => {
    expect(THUMB_X + THUMB_W).toBeLessThanOrEqual(PLUNGER_FADE_X)
    expect(PLUNGER_FADE_X).toBeLessThan(VIEW_W)
  })

  it("keeps the rod running through the flange at every draw, so the plunger never breaks", () => {
    // The rod starts at the stopper's back; even at a full draw that is still
    // inside the glass, so the rod always passes out through the flange.
    expect(barrelX(1) + STOPPER_W).toBeLessThanOrEqual(FLANGE_X)
    // And the thumb rest leaves through the fade as soon as it moves far.
    expect(THUMB_X + plungerOffset(0.1)).toBeGreaterThan(PLUNGER_FADE_X)
  })

  it("keeps the stopper inside the glass at a full draw", () => {
    expect(barrelX(1) + STOPPER_W).toBeLessThanOrEqual(BARREL_X + BARREL_W + BARREL_TAIL)
  })

  it("keeps every printed number apart, and the last clear of the flange", () => {
    // Plex Mono and Geist Mono both advance 0.6em per digit.
    const half = (units: number) => (String(units).length * 0.6 * LABEL_SIZE) / 2
    for (const s of SYRINGE_SIZES) {
      const printed = scaleMarks(s).filter((t) => t.labelled)
      for (let i = 1; i < printed.length; i++) {
        const a = printed[i - 1]
        const b = printed[i]
        const air = barrelX(b.fraction) - barrelX(a.fraction) - half(a.units) - half(b.units)
        // At least 6 units of air: about 7px on a 375px phone.
        expect(air).toBeGreaterThanOrEqual(6)
      }
      const last = printed[printed.length - 1]
      expect(barrelX(last.fraction) + half(last.units)).toBeLessThanOrEqual(FLANGE_X)
    }
  })
})

describe("syringeSize", () => {
  it("resolves each id", () => {
    for (const s of SYRINGE_SIZES) expect(syringeSize(s.id)).toBe(s)
  })
})

describe("isSyringeSizeId", () => {
  it("accepts every real id", () => {
    for (const s of SYRINGE_SIZES) expect(isSyringeSizeId(s.id)).toBe(true)
  })

  it("rejects anything else, so a stale stored preference cannot select a barrel", () => {
    expect(isSyringeSizeId(null)).toBe(false)
    expect(isSyringeSizeId(undefined)).toBe(false)
    expect(isSyringeSizeId("")).toBe(false)
    expect(isSyringeSizeId("0.4")).toBe(false)
    expect(isSyringeSizeId("1 mL")).toBe(false)
    expect(isSyringeSizeId("__proto__")).toBe(false)
  })
})

describe("DEFAULT_SYRINGE_SIZE", () => {
  it("is a real size, and the all-round 0.5 mL one", () => {
    expect(isSyringeSizeId(DEFAULT_SYRINGE_SIZE)).toBe(true)
    expect(DEFAULT_SYRINGE_SIZE).toBe("0.5")
  })

  it("cannot raise a misuse warning on a draw that fits every barrel", () => {
    const d = syringeSize(DEFAULT_SYRINGE_SIZE)
    for (const u of [2, 10, 25, 30]) expect(misuseKind(u, d)).toBeNull()
  })
})
