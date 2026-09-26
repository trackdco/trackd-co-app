import { describe, expect, it, vi } from "vitest"

import {
  MIX_PROMPT,
  MIX_PROMPTS,
  doseInPowderUnit,
  formatDrawUnits,
  mixDrawLine,
  mixDrawText,
  mixFillLevel,
  mixMissing,
  mixVial,
  parseAmount,
  undoMixVial,
  unitsToDraw,
} from "./mixDraw"

const base = { powderUnit: "mg", dose: 250, doseUnit: "mcg" }

describe("units to draw", () => {
  it("is the calculator's U-100 arithmetic", () => {
    // 10 mg in 2 mL is 5 mg/mL; 2.5 mg is 0.5 mL, which is 50 units.
    expect(unitsToDraw({ powder: 10, powderUnit: "mg", waterMl: 2, dose: 2.5, doseUnit: "mg" })).toBeCloseTo(50, 9)
    // 5 mg in 2.5 mL is 2 mg/mL; 1 mg is 0.5 mL.
    expect(unitsToDraw({ powder: 5, powderUnit: "mg", waterMl: 2.5, dose: 1, doseUnit: "mg" })).toBeCloseTo(50, 9)
  })

  it("converts a dose in mcg to the powder's mg", () => {
    // 5 mg in 2 mL is 2.5 mg/mL; 250 mcg is 0.25 mg, so 0.1 mL, 10 units.
    expect(unitsToDraw({ ...base, powder: 5, waterMl: 2 })).toBeCloseTo(10, 9)
    // The 1000x slip the other way round: the same dose written in mg is 1000 units.
    expect(unitsToDraw({ ...base, powder: 5, waterMl: 2, dose: 250, doseUnit: "mg" })).toBeCloseTo(10_000, 6)
  })

  it("reads IU against IU, and only against IU", () => {
    expect(unitsToDraw({ powder: 10, powderUnit: "iu", waterMl: 1, dose: 2, doseUnit: "iu" })).toBeCloseTo(20, 9)
    expect(unitsToDraw({ powder: 10, powderUnit: "mg", waterMl: 1, dose: 2, doseUnit: "iu" })).toBeNull()
    expect(unitsToDraw({ powder: 10, powderUnit: "iu", waterMl: 1, dose: 2, doseUnit: "mg" })).toBeNull()
  })

  it("is null while an input is missing", () => {
    expect(unitsToDraw({ ...base, powder: null, waterMl: 2 })).toBeNull()
    expect(unitsToDraw({ ...base, powder: 5, waterMl: null })).toBeNull()
    expect(unitsToDraw({ ...base, powder: 0, waterMl: 2 })).toBeNull()
    expect(unitsToDraw({ ...base, powder: 5, waterMl: 0 })).toBeNull()
  })

  it("is null without a planned dose or with a unit that has no volume", () => {
    expect(unitsToDraw({ ...base, powder: 5, waterMl: 2, dose: 0 })).toBeNull()
    expect(unitsToDraw({ ...base, powder: 5, waterMl: 2, dose: Number.NaN })).toBeNull()
    expect(unitsToDraw({ ...base, powder: 5, waterMl: 2, doseUnit: "tab" })).toBeNull()
  })
})

describe("dose in the powder's unit", () => {
  it("converts between mg, mcg and g", () => {
    expect(doseInPowderUnit(250, "mcg", "mg")).toBeCloseTo(0.25, 12)
    expect(doseInPowderUnit(0.5, "mg", "mcg")).toBeCloseTo(500, 9)
    expect(doseInPowderUnit(0.002, "g", "mg")).toBeCloseTo(2, 12)
    expect(doseInPowderUnit(3, "mg", "mg")).toBe(3)
  })
})

describe("the line under the vial", () => {
  it("names only what is missing, as an amount to type (ruling 4)", () => {
    expect(mixDrawLine({ ...base, powder: null, waterMl: null })).toEqual({ kind: "prompt", missing: "both" })
    expect(mixDrawLine({ ...base, powder: null, waterMl: 2 })).toEqual({ kind: "prompt", missing: "powder" })
    expect(mixDrawLine({ ...base, powder: 5, waterMl: null })).toEqual({ kind: "prompt", missing: "water" })
    expect(mixDrawText(mixDrawLine({ ...base, powder: null, waterMl: null }))).toBe(
      "Enter both amounts to see the units to draw",
    )
    expect(mixDrawText(mixDrawLine({ ...base, powder: null, waterMl: 2 }))).toBe(
      "Enter the powder amount to see the units to draw",
    )
    expect(mixDrawText(mixDrawLine({ ...base, powder: 5, waterMl: 0 }))).toBe(
      "Enter the water amount to see the units to draw",
    )
    expect(MIX_PROMPT).toBe(MIX_PROMPTS.both)
  })

  it("never tells anyone to go and add water", () => {
    for (const text of Object.values(MIX_PROMPTS)) {
      expect(text).toMatch(/^Enter /)
      expect(text).not.toMatch(/add (the )?water/i)
    }
  })

  it("reads a zero or a missing amount as missing", () => {
    expect(mixMissing(0, 0)).toBe("both")
    expect(mixMissing(5, 2)).toBeNull()
  })

  it("reports the draw for the planned dose", () => {
    const line = mixDrawLine({ ...base, powder: 5, waterMl: 2 })
    expect(line).toEqual({
      kind: "draw",
      units: "10",
      noun: "units",
      dose: "250 mcg",
      doseAmount: "250",
      doseUnit: "mcg",
    })
    expect(mixDrawText(line)).toBe("Draw 10 units for 250 mcg")
  })

  it("keeps the dose's figure and unit apart, one space between (F14)", () => {
    // The sheet sets the figure in Mono and the unit in Sans: a space inside
    // the Mono span read as the double gap in "for 2  mg".
    const line = mixDrawLine({ powder: 10, powderUnit: "mg", waterMl: 2, dose: 2, doseUnit: "mg" })
    if (line.kind !== "draw") throw new Error("expected a draw")
    expect(line.doseAmount).toBe("2")
    expect(line.doseUnit).toBe("mg")
    expect(line.dose).toBe("2 mg")
    expect(mixDrawText(line)).toBe("Draw 40 units for 2 mg")
    expect(mixDrawText(line)).not.toMatch(/ {2}/)
  })

  it("rounds like the calculator, to one decimal", () => {
    // 6 mg in 2 mL is 3 mg/mL; 0.25 mg is 0.0833 mL, 8.33 units.
    expect(mixDrawText(mixDrawLine({ ...base, powder: 6, waterMl: 2 }))).toBe("Draw 8.3 units for 250 mcg")
  })

  it("says one unit, and IU in capitals", () => {
    expect(
      mixDrawText(mixDrawLine({ powder: 10, powderUnit: "iu", waterMl: 1, dose: 0.1, doseUnit: "iu" })),
    ).toBe("Draw 1 unit for 0.1 IU")
  })

  it("stays empty when there is no honest figure", () => {
    const line = mixDrawLine({ ...base, powder: 5, waterMl: 2, dose: 0 })
    expect(line).toEqual({ kind: "none" })
    expect(mixDrawText(line)).toBe("")
  })
})

describe("display", () => {
  it("never shows a real draw as zero", () => {
    expect(formatDrawUnits(0.04)).toBe("0.04")
    expect(formatDrawUnits(12)).toBe("12")
    expect(formatDrawUnits(8.3333)).toBe("8.3")
  })

  it("reads only positive typed amounts", () => {
    expect(parseAmount("")).toBeNull()
    expect(parseAmount(".")).toBeNull()
    expect(parseAmount("0")).toBeNull()
    expect(parseAmount("2.5")).toBe(2.5)
  })
})

describe("the vial's level", () => {
  it("is dry until both powder and water are in", () => {
    expect(mixFillLevel(null, 2)).toBe(0)
    expect(mixFillLevel(5, null)).toBe(0)
  })

  it("rises with the water and stops short of the cap", () => {
    expect(mixFillLevel(5, 1)).toBeLessThan(mixFillLevel(5, 2))
    expect(mixFillLevel(5, 3.2)).toBeCloseTo(0.82, 9)
    expect(mixFillLevel(5, 10)).toBeCloseTo(0.82, 9)
  })
})

/* ------------------------------------------------ the writes (cold review S6) */

const ok = () => Promise.resolve({ ok: true })
const fail = () => Promise.resolve({ ok: false })

describe("mixing a vial: two writes, made safe (S6)", () => {
  it("saves a changed powder, then mixes", async () => {
    const savePowder = vi.fn(ok)
    const mix = vi.fn(ok)
    const r = await mixVial({ stored: 5, typed: 10, savePowder, mix })
    expect(r).toEqual({ ok: true, restorePowder: 5 })
    expect(savePowder.mock.calls).toEqual([[10]])
    expect(mix).toHaveBeenCalledTimes(1)
  })

  it("writes no powder when it matches what the vial holds", async () => {
    const savePowder = vi.fn(ok)
    const r = await mixVial({ stored: 30, typed: 30, savePowder, mix: ok })
    expect(r).toEqual({ ok: true, restorePowder: null })
    expect(savePowder).not.toHaveBeenCalled()
  })

  it("PUTS THE POWDER BACK when the mix fails after it landed", async () => {
    const savePowder = vi.fn(ok)
    const r = await mixVial({ stored: 5, typed: 10, savePowder, mix: fail })
    expect(r).toEqual({ ok: false, refusal: undefined, restored: true })
    // Typed, then restored to what the vial held: left as it was.
    expect(savePowder.mock.calls).toEqual([[10], [5]])
  })

  it("says when the powder could not be put back", async () => {
    const savePowder = vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false })
    const r = await mixVial({ stored: 5, typed: 10, savePowder, mix: fail })
    expect(r).toEqual({ ok: false, refusal: undefined, restored: false })
  })

  it("never mixes when the powder did not save, and changes nothing", async () => {
    const mix = vi.fn(ok)
    const r = await mixVial({ stored: 5, typed: 10, savePowder: () => Promise.resolve({ ok: false, refusal: "read-only" }), mix })
    expect(r).toEqual({ ok: false, refusal: "read-only", restored: true })
    expect(mix).not.toHaveBeenCalled()
  })

  it("carries the read-only refusal of the mix itself", async () => {
    const r = await mixVial({ stored: 5, typed: 5, savePowder: ok, mix: () => Promise.resolve({ ok: false, refusal: "read-only" }) })
    expect(r).toEqual({ ok: false, refusal: "read-only", restored: true })
  })
})

describe("undoing a mix", () => {
  it("unmixes, then restores the powder", async () => {
    const calls: string[] = []
    const r = await undoMixVial({
      restorePowder: 5,
      unmix: () => (calls.push("unmix"), ok()),
      savePowder: (n) => (calls.push(`powder ${n}`), ok()),
    })
    expect(r).toEqual({ ok: true })
    expect(calls).toEqual(["unmix", "powder 5"])
  })

  it("fails when the powder cannot be put back, not only when the unmix does", async () => {
    expect(await undoMixVial({ restorePowder: 5, unmix: ok, savePowder: fail })).toEqual({ ok: false })
    const savePowder = vi.fn(ok)
    expect(await undoMixVial({ restorePowder: 5, unmix: fail, savePowder })).toEqual({ ok: false })
    expect(savePowder).not.toHaveBeenCalled()
  })

  it("touches no powder that was never changed", async () => {
    const savePowder = vi.fn(ok)
    expect(await undoMixVial({ restorePowder: null, unmix: ok, savePowder })).toEqual({ ok: true })
    expect(savePowder).not.toHaveBeenCalled()
  })
})
