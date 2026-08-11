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

/** The catalogue's dose unit for `name`, or null when it is off-catalogue. */
export function catalogueDoseUnit(name: string | null | undefined): string | null {
  if (!name) return null
  const lower = name.trim().toLowerCase()
  return COMPOUNDS.find((c) => c.name.toLowerCase() === lower)?.defaultUnit ?? null
}

export interface PowderUnitContext {
  /**
   * **The compound's OWN dose unit** — the authority here, and the reason this
   * is not merely a catalogue lookup.
   *
   * The constraint that actually matters is `unit_family_compatible`: a vial
   * links to a dose only when `base_unit` pairs with `dose_unit`, and
   * `baseUnitsForDose` pairs `iu` with `iu` ALONE. So the compound's dose unit
   * does not just hint at the right answer, it fully determines it — and reading
   * the catalogue instead of this was wrong twice over:
   *
   *  - A CUSTOM compound dosed in `iu` (the "Make your own" form offers `iu` and
   *    `Reconstituted` as free choices, so a user's own Norditropin is exactly
   *    this) is off-catalogue, got `mg`, and could never link to its own doses.
   *    That is the failure this module exists to prevent, reintroduced for the
   *    one case that cannot be fixed by editing `compounds.csv`.
   *  - It also let an `iu` compound be given an `mg` vial, which the old free
   *    toggle allowed and which is silently broken in exactly the same way.
   */
  doseUnit?: string | null
  /** The unit an EXISTING stock row was saved in, when there is one. */
  storedUnit?: string | null
}

/**
 * Units to offer for this compound's powder. One entry ⇒ the caller shows the
 * unit as plain text and no toggle at all, which is the normal case.
 *
 * Derived from {@link PowderUnitContext.doseUnit} so the only unit on offer is
 * one that can actually link — the wrong choice is made unrepresentable rather
 * than merely discouraged. The catalogue is the fallback for a caller that has
 * no dose unit to hand, not the primary source.
 *
 * `storedUnit` is kept even when it disagrees, and is appended rather than
 * replacing the derived answer. Dropping it would silently relabel someone's
 * real vial the next time they corrected an unrelated number on it — the same
 * class of harm as the wrong pick this function exists to prevent, just pointed
 * the other way.
 */
export function powderUnitsFor(
  name: string | null | undefined,
  { doseUnit, storedUnit }: PowderUnitContext = {},
): readonly PowderUnit[] {
  const dose = doseUnit ?? catalogueDoseUnit(name)
  // `iu` pairs only with `iu`; everything a vial can hold otherwise is `mg`
  // (a reconstituted row's `base_unit` is `mg` or `iu` — nothing else, per the
  // `inv_type_fields` CHECK in `supabase/protocol/016`).
  //
  // So an iu-dosed compound gets `iu` ALONE, not a choice. Offering `mg` beside
  // it would be offering the broken state outright: an mg vial on an iu dose is
  // exactly the pairing that never links and never depletes. There is normally
  // no toggle here at all — the field states its unit and moves on.
  const derived: PowderUnit = dose === "iu" ? "iu" : "mg"
  const other: PowderUnit = derived === "iu" ? "mg" : "iu"
  return storedUnit === other ? [derived, other] : [derived]
}

/**
 * The unit to actually SAVE, given what the user last had selected and what is
 * on offer now.
 *
 * Derived at save time rather than corrected by an effect: changing the selected
 * compound changes the offer, and a state reset racing a save is precisely how a
 * unit the user was never shown would end up written to `base_unit` anyway.
 *
 * Falls back to the FIRST offered unit, not to a hardcoded `mg`. The two are the
 * same today only because every offer that contains `mg` leads with it — but the
 * contract is "return something that is on offer", and an `iu`-only offer (an
 * `iu`-dosed compound, which is now the common case for HCG) must not resolve to
 * an `mg` the UI never displayed and the database can never link.
 */
export function resolvePowderUnit(
  selected: PowderUnit,
  offered: readonly PowderUnit[],
): PowderUnit {
  return offered.includes(selected) ? selected : (offered[0] ?? "mg")
}
