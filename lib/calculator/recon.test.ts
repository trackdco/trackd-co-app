import { describe, expect, it } from "vitest"

import {
  computeRecon,
  equivalentAmount,
  sanitizeAmount,
  toMg,
  trim,
  type MgUnit,
  type ReconResult,
} from "./recon"

/**
 * The spec 07 rebuild is a PRESENTATION change: "Do NOT change any calculation.
 * The arithmetic is correct and must produce identical results before and after."
 *
 * Every expectation below was captured by running the pre-rebuild component's
 * inline maths (commit 0f3d0d2) over this table, not by re-deriving what the
 * answer ought to be. That is deliberate: if a future refactor makes the
 * calculator *more* correct, this suite fails, and that is the point. Changing a
 * figure here is changing the product, and needs Adrian, not a passing build.
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

const BASELINE: Array<[Case, ReconResult | null]> = [
  [
    ["5", "mg", "2", "250", "mcg"],
    { concentration: 2.5, mlPerDose: 0.1, unitsPerDose: 10, powderMg: 5, doseMg: 0.25 },
  ],
  [
    ["10", "mg", "2", "500", "mcg"],
    { concentration: 5, mlPerDose: 0.1, unitsPerDose: 10, powderMg: 10, doseMg: 0.5 },
  ],
  [
    ["200", "mg", "1", "50", "mg"],
    { concentration: 200, mlPerDose: 0.25, unitsPerDose: 25, powderMg: 200, doseMg: 50 },
  ],
  [
    ["250", "mg", "2.5", "100", "mg"],
    { concentration: 100, mlPerDose: 1, unitsPerDose: 100, powderMg: 250, doseMg: 100 },
  ],
  [
    // 5000 mcg powder — the mcg path, and a concentration that does not divide
    // evenly, so the 3dp rounding shows.
    ["5000", "mcg", "3", "0.25", "mg"],
    { concentration: 1.667, mlPerDose: 0.15, unitsPerDose: 15, powderMg: 5, doseMg: 0.25 },
  ],
  [
    ["2", "mg", "1", "100", "mcg"],
    { concentration: 2, mlPerDose: 0.05, unitsPerDose: 5, powderMg: 2, doseMg: 0.1 },
  ],
  [
    ["15", "mg", "1.5", "2.5", "mg"],
    { concentration: 10, mlPerDose: 0.25, unitsPerDose: 25, powderMg: 15, doseMg: 2.5 },
  ],
  [
    // Lands on a repeating decimal: 0.0833… → 0.083 mL → 8.3 U.
    ["30", "mg", "0.5", "5", "mg"],
    { concentration: 60, mlPerDose: 0.083, unitsPerDose: 8.3, powderMg: 30, doseMg: 5 },
  ],
  [
    ["1", "mg", "3", "100", "mcg"],
    { concentration: 0.333, mlPerDose: 0.3, unitsPerDose: 30, powderMg: 1, doseMg: 0.1 },
  ],
  [
    ["100", "mg", "10", "10", "mg"],
    { concentration: 10, mlPerDose: 1, unitsPerDose: 100, powderMg: 100, doseMg: 10 },
  ],
  [
    ["6", "mg", "2", "1", "mg"],
    { concentration: 3, mlPerDose: 0.333, unitsPerDose: 33.3, powderMg: 6, doseMg: 1 },
  ],
  [
    ["3", "mg", "1", "300", "mcg"],
    { concentration: 3, mlPerDose: 0.1, unitsPerDose: 10, powderMg: 3, doseMg: 0.3 },
  ],
  [
    ["0.5", "mg", "2", "50", "mcg"],
    { concentration: 0.25, mlPerDose: 0.2, unitsPerDose: 20, powderMg: 0.5, doseMg: 0.05 },
  ],
  [
    // Absurd but reachable: the 3dp rounding floors the volume to 0.
    ["999999", "mg", "1", "1", "mg"],
    { concentration: 999999, mlPerDose: 0, unitsPerDose: 0, powderMg: 999999, doseMg: 1 },
  ],
  [
    ["7", "mg", "0.001", "1", "mg"],
    { concentration: 7000, mlPerDose: 0, unitsPerDose: 0, powderMg: 7, doseMg: 1 },
  ],
  // Concentration only — no dose yet, and a zero dose, both leave the
  // dose-dependent figures null rather than zero.
  [
    ["5", "mg", "2", "", "mg"],
    { concentration: 2.5, mlPerDose: null, unitsPerDose: null, powderMg: 5, doseMg: null },
  ],
  [
    ["5", "mg", "2", "0", "mg"],
    { concentration: 2.5, mlPerDose: null, unitsPerDose: null, powderMg: 5, doseMg: null },
  ],
  // No result at all: either half of the concentration is missing or non-positive.
  [["", "mg", "2", "250", "mcg"], null],
  [["5", "mg", "", "250", "mcg"], null],
  [["0", "mg", "2", "250", "mcg"], null],
  [["5", "mg", "0", "250", "mcg"], null],
]

describe("computeRecon — pinned to the pre-rebuild outputs", () => {
  for (const [input, expected] of BASELINE) {
    const label = `${input[0]}${input[1]} in ${input[2]}mL, dose ${input[3] || "(none)"}${input[4]}`
    it(label, () => {
      expect(run(input)).toEqual(expected)
    })
  }
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
    expect(r?.concentration).toBe(2.5)
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
