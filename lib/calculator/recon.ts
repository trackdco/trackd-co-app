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
 * The maths match `v_inventory_math`'s reconstituted case: concentration =
 * powder / BAC water, mL per dose = dose / concentration, both rounded to 3dp
 * the way the view rounds. Insulin units are a U-100 draw aid (1 mL = 100 U).
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

export interface ReconInput {
  powder: string
  powderUnit: MgUnit
  bac: string
  dose: string
  doseUnit: MgUnit
}

export interface ReconResult {
  /** mg per mL, rounded to 3dp. */
  concentration: number
  /** Volume to draw, 3dp. `null` until a usable dose is entered. */
  mlPerDose: number | null
  /** U-100 insulin units for that volume, 1dp. `null` alongside `mlPerDose`. */
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
  // concentration: round(powder / bac, 3) — matches the view's reconstituted case.
  const concentration = Math.round((powderMg / bacMl) * 1000) / 1000
  let mlPerDose: number | null = null
  let unitsPerDose: number | null = null
  if (Number.isFinite(doseMg) && doseMg > 0 && concentration > 0) {
    mlPerDose = Math.round((doseMg / concentration) * 1000) / 1000
    unitsPerDose = Math.round(mlPerDose * 100 * 10) / 10
  }
  return {
    concentration,
    mlPerDose,
    unitsPerDose,
    powderMg,
    doseMg: Number.isFinite(doseMg) && doseMg > 0 ? doseMg : null,
  }
}
