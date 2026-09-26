/**
 * The "Mix a vial" sheet's arithmetic (build-brief-final §3.12): what the vial
 * looks like as you type, and the one line under it, "Draw N units for X mg".
 *
 * The line REPORTS the arithmetic of the user's own planned dose against the
 * powder and water they typed. It never suggests a dose (brief §0, Apple 1.4.2).
 *
 * The maths is the calculator's (`lib/calculator/recon.ts`), in the same order:
 * concentration = powder / water, mL = dose / concentration, U-100 insulin
 * units = mL x 100. Nothing is rounded until display, and the display rounding
 * is the calculator's too (one decimal, trailing zero dropped).
 *
 * Pure helpers; no React, no side effects (code-standards.md).
 */
import { trim } from "@/lib/calculator/recon"
import { formatDoseAmount } from "@/lib/format/dose"

/** Which of the two amounts the line is still waiting for. */
export type MixMissing = "both" | "powder" | "water"

/**
 * What the line says until both amounts are in (Adrian's ruling 4, 26 Sep
 * 2026). It names only what is MISSING, as an amount to type. Never an
 * instruction to add water: he turned down "Add the water to see the draw",
 * which reads as "go and add water", when the vial may already hold it.
 */
export const MIX_PROMPTS: Record<MixMissing, string> = {
  both: "Enter both amounts to see the units to draw",
  powder: "Enter the powder amount to see the units to draw",
  water: "Enter the water amount to see the units to draw",
}

/** The prompt with neither amount in. Kept for callers that name one line. */
export const MIX_PROMPT = MIX_PROMPTS.both

/** Which amount is missing, or null when both are in. */
export function mixMissing(powder: number | null, waterMl: number | null): MixMissing | null {
  const hasPowder = powder != null && powder > 0
  const hasWater = waterMl != null && waterMl > 0
  if (hasPowder && hasWater) return null
  if (!hasPowder && !hasWater) return "both"
  return hasPowder ? "water" : "powder"
}

/** Mass units, as multiples of a milligram. A vial's powder is `mg` or `iu`
 *  (the `inv_type_fields` CHECK); a dose may be in any of these. */
const MG_PER: Record<string, number> = { mg: 1, mcg: 0.001, g: 1000 }

/** A positive, finite amount typed on the pad, else null (empty, "0", "."). */
export function parseAmount(raw: string): number | null {
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * The dose in the powder's unit, or null when the two cannot be compared.
 *
 * mg, mcg and g convert between themselves. `iu` pairs with `iu` alone, as
 * `unitFamilyOk` pairs it: an IU is a measure of activity, not of mass, so an
 * IU dose against an mg vial has no answer, and guessing one is the dosing
 * error this line must never make.
 */
export function doseInPowderUnit(
  dose: number,
  doseUnit: string,
  powderUnit: string,
): number | null {
  if (!Number.isFinite(dose) || dose <= 0) return null
  if (doseUnit === "iu" || powderUnit === "iu") {
    return doseUnit === powderUnit ? dose : null
  }
  const from = MG_PER[doseUnit]
  const to = MG_PER[powderUnit]
  if (from == null || to == null) return null
  return (dose * from) / to
}

export interface MixDrawInput {
  /** Powder in the vial, in `powderUnit`. Null when not entered. */
  powder: number | null
  powderUnit: string
  /** Water added, in mL. Null when not entered. */
  waterMl: number | null
  /** The compound's planned dose, in `doseUnit`. */
  dose: number
  doseUnit: string
}

/**
 * U-100 insulin units to draw for the planned dose, EXACT (rounded only for
 * display). Null when the powder or the water is missing, the dose is not a
 * positive number, or the dose's unit cannot be read against the powder's.
 */
export function unitsToDraw({ powder, powderUnit, waterMl, dose, doseUnit }: MixDrawInput): number | null {
  if (powder == null || !(powder > 0) || waterMl == null || !(waterMl > 0)) return null
  const doseIn = doseInPowderUnit(dose, doseUnit, powderUnit)
  if (doseIn == null) return null
  const concentration = powder / waterMl
  const ml = doseIn / concentration
  const units = ml * 100
  return Number.isFinite(units) && units > 0 ? units : null
}

/**
 * Units as the calculator shows them: one decimal, a trailing zero dropped
 * (`trim(units, 1)`). A real draw below 0.05 units keeps its first significant
 * figure instead of reading "0", which would say "draw nothing".
 */
export function formatDrawUnits(units: number): string {
  const shown = trim(units, 1)
  if (Number(shown) > 0) return shown
  return String(Number(units.toPrecision(1)))
}

/** A unit as the sheet shows it: IU in capitals, as the box reads it. */
export function shownUnit(unit: string): string {
  return unit === "iu" ? "IU" : unit
}

/** What the line under the vial says. */
export type MixDrawLine =
  /** Powder or water not in yet: one of {@link MIX_PROMPTS}. */
  | { kind: "prompt"; missing: MixMissing }
  /**
   * "Draw {units} units for {dose}". `dose` is the whole phrase for the
   * plain text; `doseAmount` and `doseUnit` are its two parts, so the
   * sheet sets the figure in Mono and the unit in Sans with ONE ordinary space
   * between them. A space inside the Mono span is a full figure wide, which is
   * the double gap the review saw in "for 2  mg" (F14).
   */
  | { kind: "draw"; units: string; noun: "unit" | "units"; dose: string; doseAmount: string; doseUnit: string }
  /** Both are in but there is no honest figure (no planned dose, or a dose
   *  unit that cannot be read against the powder's). The line stays empty. */
  | { kind: "none" }

/**
 * The line under the vial. `powder` must already be in `powderUnit`, the unit
 * the vial STORES: a Somatropin box's "10 mg" is converted to its 30 IU before
 * it gets here (`powderAmountInBase`), or the draw comes out three times too
 * big (cold review B3).
 */
export function mixDrawLine(input: MixDrawInput): MixDrawLine {
  const missing = mixMissing(input.powder, input.waterMl)
  if (missing) return { kind: "prompt", missing }
  const units = unitsToDraw(input)
  if (units == null) return { kind: "none" }
  const shown = formatDrawUnits(units)
  const doseAmount = formatDoseAmount(input.dose)
  const doseUnit = shownUnit(input.doseUnit)
  return {
    kind: "draw",
    units: shown,
    noun: shown === "1" ? "unit" : "units",
    dose: `${doseAmount} ${doseUnit}`,
    doseAmount,
    doseUnit,
  }
}

/** The line as plain text (the accessible name, and the tests). */
export function mixDrawText(line: MixDrawLine): string {
  if (line.kind === "prompt") return MIX_PROMPTS[line.missing]
  if (line.kind === "none") return ""
  return `Draw ${line.units} ${line.noun} for ${line.dose}`
}

/**
 * How full the drawn vial looks, 0 to 1. Dry (0) until both powder and water
 * are in; then the water's level, the final-check mock's scale: 3.2 mL reaches
 * 82% of the glass, and more than that stops there, so a big mix never draws a
 * vial filled to the cap. The drawing has no real capacity (the catalogue holds
 * no vial size), so this is a picture of the mix, not a measurement.
 */
export function mixFillLevel(powder: number | null, waterMl: number | null): number {
  if (powder == null || !(powder > 0) || waterMl == null || !(waterMl > 0)) return 0
  return Math.min(1, waterMl / 3.2) * 0.82
}

/* ------------------------------------------------------------ the writes */

/** What a stock write answers, as `lib/db/inventory` returns it. */
export interface MixStepResult {
  ok: boolean
  /** Set by the read-only gate, and by nothing else. */
  refusal?: string
}

/**
 * MIX, SAFELY (cold review S6). A mix is two writes: the powder the user typed,
 * saved while the vial is still a spare, then the water and the start date.
 * They are not one transaction, so when the mix fails after the powder has
 * landed, the powder is put back to what the vial held, and the vial is left
 * exactly as it was before the sheet opened. Without that, a failed mix left a
 * dry vial holding a powder figure nobody confirmed.
 *
 * `stored` and `typed` are both in the vial's STORED unit. The powder is
 * written only when it differs; `restorePowder` is what the toast's Undo
 * puts back ({@link undoMixVial}).
 *
 * The steps are passed in, so this holds the order and nothing else.
 */
export async function mixVial({
  stored,
  typed,
  savePowder,
  mix,
}: {
  stored: number | null
  typed: number
  savePowder: (amount: number) => Promise<MixStepResult>
  mix: () => Promise<MixStepResult>
}): Promise<
  | { ok: true; restorePowder: number | null }
  | { ok: false; refusal?: string; restored: boolean }
> {
  const powderChanged = stored == null || Math.abs(stored - typed) > 1e-9
  if (powderChanged) {
    const saved = await savePowder(typed)
    if (!saved.ok) return { ok: false, refusal: saved.refusal, restored: true }
  }
  const mixed = await mix()
  if (!mixed.ok) {
    // Put the powder back. `stored` is the vial's own figure (never null on a
    // real row: `total_amount` is NOT NULL); with none to go back to, there
    // was nothing to restore either.
    let restored = true
    if (powderChanged && stored != null) restored = (await savePowder(stored)).ok
    return { ok: false, refusal: mixed.refusal, restored }
  }
  return { ok: true, restorePowder: powderChanged && stored != null ? stored : null }
}

/**
 * The toast's Undo: back to a dry spare, then the powder back to what it was
 * when a different amount was typed. Reported as failed when EITHER write
 * fails, so the toast never says it undid a powder it could not put back.
 */
export async function undoMixVial({
  restorePowder,
  unmix,
  savePowder,
}: {
  restorePowder: number | null
  unmix: () => Promise<MixStepResult>
  savePowder: (amount: number) => Promise<MixStepResult>
}): Promise<{ ok: boolean }> {
  const undone = await unmix()
  if (!undone.ok) return { ok: false }
  if (restorePowder == null) return { ok: true }
  return { ok: (await savePowder(restorePowder)).ok }
}
