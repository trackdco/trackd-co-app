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
 * (`supabase/protocol/016`, mirrored by `unitFamilyOk` in `lib/db/doseUnits.ts`)
 * pairs `iu` with `iu` and nothing else. A 5 mg peptide vial saved as `iu`
 * therefore never links to a dose in mg or mcg: every dose logs fine, reports no
 * error, and the vial stays permanently full. Removing the pill removes that
 * whole failure mode for new stock rather than merely tidying the row.
 *
 * The unit is read from the COMPOUND'S OWN DOSE UNIT, falling back to the
 * catalogue's `defaultUnit` when a caller has none to hand. Not the other way
 * round: the dose unit is what the database pairs `base_unit` against, and the
 * catalogue cannot speak for a compound it has never seen — "Make your own"
 * offers `iu` and `Reconstituted` as free choices, so a user's own HGH is
 * off-catalogue and genuinely dosed in iu. No new column and no migration; a
 * compound retyped in `compounds.csv` still corrects itself here.
 *
 * Pure helpers; no React, no side effects (code-standards.md).
 */
import { COMPOUNDS } from "@/lib/compounds-catalogue"
import { unitFamilyOk } from "@/lib/db/doseUnits"

/** The units the powder field can offer, in the order they are shown. */
export type PowderUnit = "mg" | "iu"

/** Everything a reconstituted vial's `base_unit` is allowed to be — the
 *  `inv_type_fields` CHECK in `supabase/protocol/016` permits these two and
 *  nothing else. Which of them applies is asked of {@link unitFamilyOk}. */
const POWDER_UNITS: readonly PowderUnit[] = ["mg", "iu"]

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
  // ASKED, not re-encoded. A reconstituted row's `base_unit` is `mg` or `iu` and
  // nothing else (the `inv_type_fields` CHECK, `supabase/protocol/016`), so the
  // question is simply which of those two can supply this dose — and
  // `unitFamilyOk` is the shared mirror of the constraint that decides it.
  //
  // Hand-rolling `dose === "iu" ? "iu" : "mg"` here was a THIRD copy of that
  // knowledge, and it was lossy: it answered `mg` for a `g`-dosed compound,
  // which the dose-unit dropdown genuinely allows, and an mg vial can no more
  // supply a gram dose than an iu one can. Same class of silent never-links bug,
  // one path over. (Second cold review, 2026-08-12.)
  //
  // One answer, normally: an iu-dosed compound gets `iu` ALONE, not a choice —
  // offering `mg` beside it offers the broken pairing outright. So there is no
  // toggle here at all; the field states its unit and moves on.
  const usable = POWDER_UNITS.filter((base) => unitFamilyOk(base, dose ?? ""))
  // Nothing can serve this dose unit from a vial (a `g`- or `tab`-dosed compound
  // stocked as reconstituted — already broken, and not this function's to fix).
  // `mg` is the least surprising thing to show rather than an empty row.
  const derived: PowderUnit = usable[0] ?? "mg"
  const other: PowderUnit = derived === "iu" ? "mg" : "iu"
  return storedUnit === other ? [derived, other] : [derived]
}

/**
 * International units per milligram of somatropin — the WHO standard, and the
 * figure every HGH product is labelled against.
 *
 * A constant rather than an input: it is a property of the substance, not of the
 * user's vial. Anyone whose product states something else can type the iu figure
 * directly, which is why the choice exists at all.
 */
export const SOMATROPIN_IU_PER_MG = 3

/**
 * Compounds whose vial is commonly LABELLED in milligrams while the compound is
 * dosed in international units.
 *
 * Somatropin is the only one. Its brands — Norditropin, Genotropin, Jintropin,
 * all aliases on the catalogue entry — are sold as "5 mg", "10 mg", "12 mg"
 * pens, but growth hormone is dosed in iu everywhere including here, and the
 * dose unit is not selectable (`unitOptionsFor("iu")` is `["iu"]`, iu being its
 * own family). So the one number the user is asked for is in a unit their box
 * does not print.
 */
export function isMgLabelledIuCompound(name: string | null | undefined): boolean {
  return catalogueDoseUnit(name) === "iu" && /somatropin|hgh/i.test(name ?? "")
}

/**
 * Units the user may TYPE the powder amount in — which is not always the unit it
 * is STORED in.
 *
 * **The distinction is the whole point** (Adrian, 2026-08-12: "just have the IU
 * milligram slider, people can choose that"). `base_unit` is constrained: an
 * iu-dosed compound must store `iu`, because `unit_family_compatible` pairs `iu`
 * with `iu` alone and a vial saved as `mg` would never link to a single dose. So
 * the choice cannot be a choice of `base_unit` — offering that would just move
 * the failure to the save.
 *
 * It can be a choice of ENTRY unit. Someone holding a 10 mg Norditropin pen
 * types 10, picks mg, and {@link powderAmountInBase} converts it to the 30 iu
 * that gets stored. The alternative — asking for a number their box does not
 * print — is what made this worth fixing: typing the mg figure into an iu field
 * is a silent 3× error running through the fill gauge, the doses-remaining
 * estimate and the low-stock reminder.
 *
 * Everything else offers exactly what it stores, so entry and base coincide.
 */
export function powderEntryUnits(
  name: string | null | undefined,
  ctx: PowderUnitContext = {},
): readonly PowderUnit[] {
  const base = powderUnitsFor(name, ctx)
  // Only where the substance is genuinely sold in the other unit. The stored
  // unit stays FIRST, so it remains the default.
  if (base.length === 1 && base[0] === "iu" && isMgLabelledIuCompound(name)) {
    return ["iu", "mg"]
  }
  return base
}

/**
 * The typed amount, converted into the unit the row is stored in.
 *
 * Identity in every case but one — mg typed against an iu base, which is
 * somatropin and nothing else. It must be applied to the amount BEFORE it
 * reaches `vialBasis` as well as before it is saved: the fill maths sizes a
 * reconstituted vial by its powder mass, so converting only on save would write
 * `prior_used_base` three times too small.
 */
export function powderAmountInBase(
  amount: number,
  entryUnit: PowderUnit,
  baseUnit: PowderUnit,
): number {
  if (entryUnit === baseUnit) return amount
  if (entryUnit === "mg" && baseUnit === "iu") return amount * SOMATROPIN_IU_PER_MG
  if (entryUnit === "iu" && baseUnit === "mg") return amount / SOMATROPIN_IU_PER_MG
  return amount
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

/* ------------------------------------------------------------------- orals */

/** What an `oral_solid` row's `base_unit` may be. */
export type OralBaseUnit = PowderUnit | "tab" | "capsule"

export interface OralStockRule {
  /**
   * The `base_unit` this row MUST be written with, or null when no oral row can
   * satisfy this compound's dose unit at all (a gram-dosed compound — that is a
   * tub, not a bottle).
   */
  baseUnit: OralBaseUnit | null
  /** Must a per-unit strength be stated? */
  strengthRequired: boolean
  /** Units to offer for the strength, empty when no strength applies. */
  strengthUnits: readonly PowderUnit[]
  /** When the tab/capsule choice is FORCED, which it must be. Null ⇒ the user
   *  picks, because it only names the count and nothing depends on it. */
  countUnit: "tab" | "capsule" | null
}

/**
 * The one shape an oral stock row may take for a given compound — derived from
 * the database's own two rules rather than guessed at, because every wrong
 * combination is either a save that cannot succeed or a bottle that silently
 * never depletes.
 *
 * `inv_type_fields` (`supabase/protocol/016`) allows exactly two oral shapes:
 *
 *  - **strength STATED** ⇒ `base_unit IN ('mg','iu')`, and `strength_per_unit`
 *    non-null and `> 0` (`strength_positive`).
 *  - **strength NOT stated** ⇒ `base_unit IN ('tab','capsule')` and
 *    `total_amount_unit = base_unit` — the tablet itself is the unit.
 *
 * `check_inventory_unit_family` then requires `base_unit` to pair with the
 * compound's `dose_unit`. Together those pin the answer completely:
 *
 * | dosed in | base_unit | strength |
 * |---|---|---|
 * | `mg` / `mcg` | `mg` | REQUIRED |
 * | `iu` | `iu` | REQUIRED |
 * | `tab` / `capsule` | the same | must be ABSENT, and the count unit is forced |
 * | `g` | — | no oral row is possible |
 *
 * Two live bugs came from not having this written down. A compound dosed in
 * `capsule` got the tab/cap pill's default `tab`, and `unit_family_compatible`
 * treats those as different families **by design** (016 §3), so the bottle never
 * linked to a dose and never went down — silently, permanently, with Home then
 * offering "add stock" for a compound that had stock. And a strength left blank
 * on an mg- or iu-dosed compound wrote `strength_per_unit: 0`, which
 * `strength_positive` rejects, surfacing as a save that could never succeed.
 */
export function oralStockRule(
  name: string | null | undefined,
  { doseUnit, storedUnit }: PowderUnitContext = {},
): OralStockRule {
  const dose = doseUnit ?? catalogueDoseUnit(name)

  // The tablet IS the unit. No strength may be stored, and the count unit is not
  // a preference — `total_amount_unit` must equal `base_unit`.
  if (dose === "tab" || dose === "capsule") {
    return { baseUnit: dose, strengthRequired: false, strengthUnits: [], countUnit: dose }
  }

  const strengthUnits = powderUnitsFor(name, { doseUnit, storedUnit })
  // Nothing an oral row can hold pairs with this dose (grams). Refuse rather
  // than write a row the trigger will reject.
  if (!POWDER_UNITS.some((u) => unitFamilyOk(u, dose ?? ""))) {
    return { baseUnit: null, strengthRequired: true, strengthUnits, countUnit: null }
  }
  return {
    baseUnit: strengthUnits[0] ?? "mg",
    strengthRequired: true,
    strengthUnits,
    countUnit: null,
  }
}
