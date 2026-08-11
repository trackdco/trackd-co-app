/**
 * Which units a RECONSTITUTED vial's powder may be entered in.
 *
 * **Almost nothing is sold in IU.** Both add-stock paths offered an `mg | iu`
 * toggle beside "Powder in vial" for every injectable, so a peptide whose label
 * says 5 mg was asked, every time, whether it might be international units
 * instead (Adrian, 2026-08-12: "I was adding a peptide, and it says mg and IU as
 * the options to choose from … I don't know what that is"). Exactly three
 * injectables in the catalogue are actually measured that way: HCG, hMG and
 * Somatropin (HGH). For the other 200-odd the second pill is noise sitting on
 * the one field that must be typed correctly.
 *
 * **It is not only noise — a wrong pick silently stops the stock decrementing.**
 * `base_unit` is written straight from this toggle, and `unit_family_compatible`
 * (`supabase/protocol/016`, mirrored by `unitFamilyOk` in `protocolSync.ts`)
 * pairs `iu` with `iu` and nothing else. A 5 mg peptide vial saved as `iu`
 * therefore never links to a dose in mg or mcg: every dose logs fine, reports no
 * error, and the vial stays permanently full. Removing the pill removes that
 * whole failure mode for new stock rather than merely tidying the row.
 *
 * The unit is read from the CATALOGUE's `defaultUnit`, which is a fact already
 * in `compounds.csv` — no new column, no migration, and a compound retyped there
 * corrects itself here. An off-catalogue "make your own" compound gets mg only:
 * there is no evidence for anything else, and mg is what its own dose is in.
 *
 * Pure helpers; no React, no side effects (code-standards.md).
 */
import { COMPOUNDS } from "@/lib/compounds-catalogue"

/** The units the powder field can offer, in the order they are shown. */
export type PowderUnit = "mg" | "iu"

const MG_ONLY: readonly PowderUnit[] = ["mg"]
const MG_OR_IU: readonly PowderUnit[] = ["mg", "iu"]

/** The catalogue's dose unit for `name`, or null when it is off-catalogue. */
export function catalogueDoseUnit(name: string | null | undefined): string | null {
  if (!name) return null
  const lower = name.trim().toLowerCase()
  return COMPOUNDS.find((c) => c.name.toLowerCase() === lower)?.defaultUnit ?? null
}

/**
 * Units to offer for this compound's powder. One entry ⇒ the caller shows the
 * unit as plain text and no toggle at all.
 *
 * `storedUnit` is the unit an EXISTING stock row was saved in, and it is always
 * kept even when the catalogue disagrees. Dropping it would silently relabel
 * someone's real vial the next time they corrected an unrelated number on it —
 * the same class of harm as the wrong pick this function exists to prevent, just
 * pointed the other way. It is why the narrowing is safe to apply to the edit
 * form and not only to fresh adds.
 */
export function powderUnitsFor(
  name: string | null | undefined,
  storedUnit?: string | null,
): readonly PowderUnit[] {
  if (storedUnit === "iu") return MG_OR_IU
  return catalogueDoseUnit(name) === "iu" ? MG_OR_IU : MG_ONLY
}

/**
 * The unit to actually SAVE, given what the user last had selected and what is
 * on offer now.
 *
 * Derived at save time rather than corrected by an effect: changing the selected
 * compound changes the offer, and a state reset racing a save is precisely how a
 * hidden `iu` would end up written to `base_unit` anyway.
 */
export function resolvePowderUnit(
  selected: PowderUnit,
  offered: readonly PowderUnit[],
): PowderUnit {
  return offered.includes(selected) ? selected : "mg"
}
