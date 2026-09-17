/**
 * The calculator's words, shared by the in-app calculator and the free public
 * one at `/reconstitution-calculator` (spec 3-03), so the two can never say
 * different things about the same arithmetic. Pure strings, no React.
 */
import { MIN_READABLE_UNITS, type MisuseKind } from "./syringe"
import { trim } from "./recon"

/**
 * PERMANENT disclaimer. LEGAL COPY: do not reword without asking Adrian first
 * (spec 07, Out of Scope; quoted in `12-Legal-Direction-Spec.md`). Shown on
 * every visit, on both calculators, and NOT replaced by the first-run modal.
 * `copy.test.ts` pins it against the legal spec's quote.
 */
export const CALCULATOR_DISCLAIMER =
  "This is a calculator, not a dosing instruction. It does only arithmetic on " +
  "the numbers you enter and may be wrong. Re-check every figure and confirm it " +
  "against your physical product before drawing or injecting anything. Do not " +
  "rely on this output alone."

/**
 * Both conditions say the same thing: re-check the figures. Neither blocks, and
 * neither judges the dose; they judge whether the number can be drawn off the
 * barrel that is selected.
 */
export function misuseCopy(
  kind: Exclude<MisuseKind, null>,
  units: number | null,
  sizeLabel: string,
  sizeId: string,
): string {
  if (kind === "under") {
    return `That is under ${MIN_READABLE_UNITS} units, too little to read off a syringe accurately. Check the figures you entered.`
  }
  const drawn = units != null ? `${trim(units, 1)} units` : "That"
  const larger = sizeId === "1" ? "" : ", or pick a larger syringe"
  return `${drawn} will not fit a ${sizeLabel} syringe. Check the figures you entered${larger}.`
}
