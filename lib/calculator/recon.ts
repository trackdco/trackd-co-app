/**
 * Reconstitution arithmetic — pure maths, no React (see `code-standards.md`).
 *
 * Lifted VERBATIM out of `ReconCalculator` for spec 07's presentation rebuild.
 * The spec's first rule is that the calculator must produce identical results
 * before and after, so the arithmetic moved without a single operator changing:
 * same `parseFloat`, same rounding, same order of operations, same null gates.
 * `recon.test.ts` pins the outputs captured from the pre-rebuild component, so a
 * later "tidy-up" of this file that shifts a figure fails the suite.
 *
 * The maths: concentration = powder / BAC water, mL per dose = dose /
 * concentration, insulin units = mL x 100 (a U-100 draw aid).
 *
 * NOTHING IS ROUNDED UNTIL DISPLAY (Adrian, 2026-07-30: "make sure you fix the
 * calculations, but make sure that they're accurate"). The original rounded the
 * concentration to 3dp and then DIVIDED BY THE ROUNDED VALUE, which compounds
 * badly wherever the concentration is small: 5 mcg in 2 mL for a 250 mcg dose
 * displayed 83.333 mL when the answer is 100 mL, a 20% error. That was carried
 * verbatim through spec 07's rebuild because the spec said not to change any
 * calculation; Adrian has since overridden that, because a calculator being
 * right matters more than a calculator being unchanged.
 *
 * This is a DELIBERATE divergence from `v_inventory_math`, which still rounds.
 * Nothing here feeds the view or is written anywhere — the calculator is a
 * standalone arithmetic surface — so the two cannot disagree about stored data.
 *
 * `recon.test.ts` pins the DISPLAYED figures, which is what a user reads and
 * what must not drift.
 */

/** The two mass units the amount fields accept. Everything computes in mg. */
export type MgUnit = "mg" | "mcg"

/** Digits + a single decimal point, ≤6 whole digits + ≤3 decimals. */
export function sanitizeAmount(raw: string): string {
  let v = raw.replace(/[^0-9.]/g, "")
  const dot = v.indexOf(".")
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "")
  const [int = "", dec] = v.split(".")
  const clampedInt = int.slice(0, 6)
  return v.includes(".") ? `${clampedInt}.${(dec ?? "").slice(0, 3)}` : clampedInt
}

export const toMg = (value: number, unit: MgUnit) =>
  unit === "mcg" ? value / 1000 : value

/** Trim trailing zeros after fixing to `dp` places. */
export function trim(n: number, dp: number): string {
  return String(Number(n.toFixed(dp)))
}

/**
 * Concentration, with enough decimals to stay meaningful.
 *
 * Three decimals is right for the ordinary case (2.5, 200, 1.667) and wrong for
 * a weak solution: 0.0025 mg/mL would display "0.003", and the working panel
 * would then show a division that does not check out by hand — which defeats the
 * entire point of showing the working. Three significant figures, floored at
 * 3dp and capped at 6, keeps both readable and true.
 */
export function formatConcentration(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0"
  const magnitude = Math.floor(Math.log10(n))
  return trim(n, Math.min(6, Math.max(3, 2 - magnitude)))
}

/**
 * The same figure in the OTHER mass unit, for the live line under an amount
 * field. Returns `null` when there is no usable number to convert.
 *
 * This exists because of a specific, documented hazard: vials are labelled in mg
 * (5 mg, 10 mg, 2 mg semaglutide) while doses are written in mcg (250 mcg, 500
 * mcg), and the 1000x slip between them is the most common error in this space.
 * A sensible default cannot catch it, because the slip is a wrong TAP, not a
 * wrong default. Showing "250 mcg" as "0.25 mg" underneath makes it visible at
 * the moment it is made, in whichever direction it was made.
 */
export function equivalentAmount(value: string, unit: MgUnit): string | null {
  const n = parseFloat(value)
  if (!Number.isFinite(n) || n <= 0) return null
  const mg = toMg(n, unit)
  // 6dp on the mg side, not 4. The field accepts 3 decimals, so 0.001 mcg is
  // enterable and is 0.000001 mg: at 4dp that and everything below 0.05 mcg
  // rendered "= 0 mg", which is both wrong and the one output a conversion line
  // must never produce, since it reads as "this is nothing".
  return unit === "mcg" ? `${trim(mg, 6)} mg` : `${trim(mg * 1000, 1)} mcg`
}

export interface ReconInput {
  powder: string
  powderUnit: MgUnit
  bac: string
  dose: string
  doseUnit: MgUnit
}

export interface ReconResult {
  /** mg per mL, EXACT. Rounded only at the point of display. */
  concentration: number
  /** Volume to draw, exact. `null` until a usable dose is entered. */
  mlPerDose: number | null
  /** U-100 insulin units for that volume, exact. `null` alongside `mlPerDose`. */
  unitsPerDose: number | null
  /** Echoed back in mg for the step-by-step working. */
  powderMg: number
  doseMg: number | null
}

/**
 * The whole calculation. Returns `null` when the two figures concentration needs
 * (powder and BAC water) are not both present and positive — there is nothing to
 * show, not a zero to show.
 */
export function computeRecon(input: ReconInput): ReconResult | null {
  const powderMg = toMg(parseFloat(input.powder), input.powderUnit)
  const bacMl = parseFloat(input.bac)
  const doseMg = toMg(parseFloat(input.dose), input.doseUnit)
  if (!Number.isFinite(powderMg) || powderMg <= 0) return null
  if (!Number.isFinite(bacMl) || bacMl <= 0) return null
  const concentration = powderMg / bacMl
  let mlPerDose: number | null = null
  let unitsPerDose: number | null = null
  if (Number.isFinite(doseMg) && doseMg > 0 && concentration > 0) {
    mlPerDose = doseMg / concentration
    unitsPerDose = mlPerDose * 100
  }
  return {
    concentration,
    mlPerDose,
    unitsPerDose,
    powderMg,
    doseMg: Number.isFinite(doseMg) && doseMg > 0 ? doseMg : null,
  }
}
