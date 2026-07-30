import { describe, expect, it } from "vitest"

import {
  computeRecon,
  equivalentAmount,
  formatConcentration,
  sanitizeAmount,
  toMg,
  trim,
  type MgUnit,
  type ReconResult,
} from "./recon"

/**
 * These pin the DISPLAYED figures — what a user actually reads off the screen —
 * captured from the pre-rebuild component (commit 0f3d0d2). Every one of them
 * still holds after the rounding fix below, which is the point: the fix moved
 * nothing a real user would have seen.
 *
 * Originally this file pinned the RAW numbers and the spec forbade changing any
 * calculation. Adrian overrode that on 2026-07-30 ("make sure you fix the
 * calculations, but make sure that they're accurate") once it emerged that the
 * old maths rounded the concentration to 3dp and then DIVIDED BY THE ROUNDED
 * VALUE. Pinning the display rather than the raw value is also the more honest
 * contract: intermediate precision is an implementation detail, and the figure
 * on screen is the product.
 */

type Case = [powder: string, powderUnit: MgUnit, bac: string, dose: string, doseUnit: MgUnit]

const run = (c: Case) =>
  computeRecon({
    powder: c[0],
    powderUnit: c[1],
    bac: c[2],
    dose: c[3],
    doseUnit: c[4],
  })

/** Exactly what the screen renders for a result. */
function displayed(r: ReconResult | null) {
  if (!r) return null
  return {
    concentration: formatConcentration(r.concentration),
    mlPerDose: r.mlPerDose != null ? trim(r.mlPerDose, 3) : null,
    units: r.unitsPerDose != null ? trim(r.unitsPerDose, 1) : null,
  }
}

type Display = { concentration: string; mlPerDose: string | null; units: string | null }

const BASELINE: Array<[Case, Display | null]> = [
  [["5", "mg", "2", "250", "mcg"], { concentration: "2.5", mlPerDose: "0.1", units: "10" }],
  [["10", "mg", "2", "500", "mcg"], { concentration: "5", mlPerDose: "0.1", units: "10" }],
  [["200", "mg", "1", "50", "mg"], { concentration: "200", mlPerDose: "0.25", units: "25" }],
  [["250", "mg", "2.5", "100", "mg"], { concentration: "100", mlPerDose: "1", units: "100" }],
  // A concentration that does not divide evenly, so the rounding shows.
  [["5000", "mcg", "3", "0.25", "mg"], { concentration: "1.667", mlPerDose: "0.15", units: "15" }],
  [["2", "mg", "1", "100", "mcg"], { concentration: "2", mlPerDose: "0.05", units: "5" }],
  [["15", "mg", "1.5", "2.5", "mg"], { concentration: "10", mlPerDose: "0.25", units: "25" }],
  // Repeating decimal: 0.0833… mL, 8.33… U.
  [["30", "mg", "0.5", "5", "mg"], { concentration: "60", mlPerDose: "0.083", units: "8.3" }],
  [["1", "mg", "3", "100", "mcg"], { concentration: "0.333", mlPerDose: "0.3", units: "30" }],
  [["100", "mg", "10", "10", "mg"], { concentration: "10", mlPerDose: "1", units: "100" }],
  [["6", "mg", "2", "1", "mg"], { concentration: "3", mlPerDose: "0.333", units: "33.3" }],
  [["3", "mg", "1", "300", "mcg"], { concentration: "3", mlPerDose: "0.1", units: "10" }],
  [["0.5", "mg", "2", "50", "mcg"], { concentration: "0.25", mlPerDose: "0.2", units: "20" }],
  // Absurd but reachable: the volume floors to 0 at 3dp.
  [["999999", "mg", "1", "1", "mg"], { concentration: "999999", mlPerDose: "0", units: "0" }],
  [["7", "mg", "0.001", "1", "mg"], { concentration: "7000", mlPerDose: "0", units: "0" }],
  // Concentration only.
  [["5", "mg", "2", "", "mg"], { concentration: "2.5", mlPerDose: null, units: null }],
  [["5", "mg", "2", "0", "mg"], { concentration: "2.5", mlPerDose: null, units: null }],
  // No result at all.
  [["", "mg", "2", "250", "mcg"], null],
  [["5", "mg", "", "250", "mcg"], null],
  [["0", "mg", "2", "250", "mcg"], null],
  [["5", "mg", "0", "250", "mcg"], null],
]

describe("computeRecon — the figures on screen, pinned", () => {
  for (const [input, expected] of BASELINE) {
    const label = `${input[0]}${input[1]} in ${input[2]}mL, dose ${input[3] || "(none)"}${input[4]}`
    it(label, () => {
      expect(displayed(run(input))).toEqual(expected)
    })
  }
})

describe("the rounding fix (Adrian, 2026-07-30)", () => {
  it("no longer divides by a rounded concentration", () => {
    // 5 mcg in 2 mL is 0.0025 mg/mL. The old maths rounded that to 0.003 and
    // divided by it, giving 83.333 mL — 20% short of the real answer.
    const r = run(["5", "mcg", "2", "250", "mcg"])
    expect(r?.concentration).toBeCloseTo(0.0025, 12)
    expect(r?.mlPerDose).toBeCloseTo(100, 9)
    expect(r?.unitsPerDose).toBeCloseTo(10000, 6)
  })

  it("holds volume x concentration = dose, which the old maths did not", () => {
    const cases: Case[] = [
      ["5", "mcg", "2", "250", "mcg"],
      ["1", "mg", "3", "100", "mcg"],
      ["5000", "mcg", "3", "0.25", "mg"],
      ["7", "mg", "3", "1", "mg"],
      ["2", "mg", "7", "150", "mcg"],
    ]
    for (const c of cases) {
      const r = run(c)
      const doseMg = toMg(parseFloat(c[3]), c[4])
      expect(r!.mlPerDose! * r!.concentration).toBeCloseTo(doseMg, 12)
    }
  })

  it("keeps units and volume in step: units are always volume x 100", () => {
    for (const c of BASELINE.map(([i]) => i)) {
      const r = run(c)
      if (r?.mlPerDose == null) continue
      expect(r.unitsPerDose).toBeCloseTo(r.mlPerDose * 100, 9)
    }
  })
})

describe("formatConcentration", () => {
  it("stays at 3dp for ordinary strengths", () => {
    expect(formatConcentration(2.5)).toBe("2.5")
    expect(formatConcentration(200)).toBe("200")
    expect(formatConcentration(5 / 3)).toBe("1.667")
  })

  it("adds decimals for a weak solution rather than rounding it away", () => {
    // At 3dp this read "0.003", and the working panel then showed a division
    // that did not check out by hand.
    expect(formatConcentration(0.0025)).toBe("0.0025")
    expect(formatConcentration(0.000333)).toBe("0.000333")
  })

  it("caps the decimals so it never becomes unreadable", () => {
    expect(formatConcentration(0.0000001).length).toBeLessThanOrEqual(9)
  })

  it("handles nothing gracefully", () => {
    expect(formatConcentration(0)).toBe("0")
    expect(formatConcentration(Number.NaN)).toBe("0")
  })
})

describe("computeRecon — the gates that decide whether there is a result", () => {
  it("needs BOTH powder and BAC water, not either", () => {
    expect(run(["5", "mg", "", "", "mg"])).toBeNull()
    expect(run(["", "mg", "2", "", "mg"])).toBeNull()
    expect(run(["5", "mg", "2", "", "mg"])).not.toBeNull()
  })

  it("treats a negative figure as no result", () => {
    // `sanitizeAmount` strips the minus before this ever runs, but the guard is
    // the thing being asserted, not the field.
    expect(run(["-5", "mg", "2", "1", "mg"])).toBeNull()
    expect(run(["5", "mg", "-2", "1", "mg"])).toBeNull()
  })

  it("keeps the concentration when only the dose is unusable", () => {
    const r = run(["5", "mg", "2", "-1", "mg"])
    expect(r?.concentration).toBeCloseTo(2.5, 12)
    expect(r?.mlPerDose).toBeNull()
    expect(r?.unitsPerDose).toBeNull()
  })
})

describe("toMg", () => {
  it("passes mg through untouched", () => {
    expect(toMg(250, "mg")).toBe(250)
  })

  it("divides mcg by 1000", () => {
    expect(toMg(250, "mcg")).toBe(0.25)
    expect(toMg(5000, "mcg")).toBe(5)
  })
})

describe("trim", () => {
  it("drops trailing zeros after fixing", () => {
    expect(trim(2.5, 3)).toBe("2.5")
    expect(trim(2.0, 3)).toBe("2")
    expect(trim(0.08333333, 3)).toBe("0.083")
    expect(trim(33.33, 1)).toBe("33.3")
  })
})

describe("sanitizeAmount — pinned to the pre-rebuild field behaviour", () => {
  const CASES: Array<[string, string]> = [
    ["12.3456", "12.345"],
    ["1234567", "123456"],
    ["1.2.3", "1.23"],
    ["abc12x.5y", "12.5"],
    [".5", ".5"],
    ["12345678.9999", "123456.999"],
    ["", ""],
    [".", "."],
    // Below 3dp resolution: the field keeps the zeros the user typed.
    ["0.0001", "0.000"],
  ]

  for (const [input, expected] of CASES) {
    it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      expect(sanitizeAmount(input)).toBe(expected)
    })
  }

  it("strips a minus sign, so a negative can never be typed", () => {
    expect(sanitizeAmount("-5")).toBe("5")
  })
})

describe("equivalentAmount — the live line that catches a 1000x slip", () => {
  it("shows a mcg figure in mg", () => {
    expect(equivalentAmount("250", "mcg")).toBe("0.25 mg")
    expect(equivalentAmount("500", "mcg")).toBe("0.5 mg")
    expect(equivalentAmount("2500", "mcg")).toBe("2.5 mg")
  })

  it("shows a mg figure in mcg", () => {
    expect(equivalentAmount("5", "mg")).toBe("5000 mcg")
    expect(equivalentAmount("0.25", "mg")).toBe("250 mcg")
  })

  it("keeps a sub-mcg entry visible rather than collapsing it to 0 mg", () => {
    expect(equivalentAmount("1", "mcg")).toBe("0.001 mg")
    expect(equivalentAmount("2.5", "mcg")).toBe("0.0025 mg")
  })

  it("NEVER renders 0 for anything the field will accept", () => {
    // The field allows 3 decimals, so these are all reachable by typing. At 4dp
    // every one of them read "= 0 mg", which says "this is nothing".
    for (const v of ["0.001", "0.004", "0.01", "0.049", "0.05", "0.5"]) {
      const out = equivalentAmount(v, "mcg")
      expect(out).not.toBe("0 mg")
      expect(out).not.toBeNull()
    }
    expect(equivalentAmount("0.001", "mcg")).toBe("0.000001 mg")
  })

  it("does not collapse two different entries onto the same reading", () => {
    expect(equivalentAmount("0.001", "mcg")).not.toBe(
      equivalentAmount("0.004", "mcg"),
    )
  })

  it("says nothing when there is no usable figure", () => {
    expect(equivalentAmount("", "mcg")).toBeNull()
    expect(equivalentAmount("0", "mcg")).toBeNull()
    expect(equivalentAmount(".", "mg")).toBeNull()
    expect(equivalentAmount("abc", "mg")).toBeNull()
  })

  it("round-trips: converting back lands on the figure you started from", () => {
    for (const v of ["250", "5", "0.5", "1000"]) {
      const asMg = equivalentAmount(v, "mcg")
      expect(asMg).not.toBeNull()
      const back = equivalentAmount(asMg!.replace(" mg", ""), "mg")
      expect(back).toBe(`${v} mcg`)
    }
  })
})
