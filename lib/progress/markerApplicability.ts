/**
 * Which markers a user is OFFERED, by the sex on their profile (Spec 04).
 *
 * The same idea the injection-site body map already applies: a few markers only
 * apply to one sex, so offering all 36 to everyone is noise. Filtering is silent —
 * a marker that doesn't apply is simply absent, never greyed out and never listed
 * as unavailable (Adrian's call: there's no need to tell anyone which markers
 * belong to whom).
 *
 * **This governs the PICKER only. History is never filtered.** A logged reading
 * references its marker by id and renders from `marker_readings` → `user_markers`,
 * a different read entirely — so changing profile sex can never hide, alter or
 * delete an entry the user already recorded.
 *
 * Keyed by catalogue NAME because that is what the seed CSV, the DB row and this
 * file all agree on; `markers.id` is a generated uuid that differs per
 * environment. Everything not listed here is shared, so the catalogue can grow
 * without this file needing to know.
 *
 * Pure data + pure helpers; no React, no side effects (Context/code-standards.md).
 */

/** Who a marker applies to. Absent from {@link SEX_SPECIFIC_MARKERS} ⇒ shared. */
export type MarkerApplicability = "shared" | "male" | "female"

/**
 * The only markers that are NOT shared. Deliberately short — the judgement calls
 * (Hair Shedding, Facial / Body Hair, Hot Flushes) stay SHARED, because both sexes
 * track them for opposite reasons and restricting either would take a genuinely
 * useful marker away from half the users.
 *
 * "Cycle Changes" is the pre-rename name of "Menstrual Changes"
 * (`supabase/markers/001_rename_cycle_changes.sql`). Both are listed so the filter
 * is correct before and after that migration is applied — the rename lives in the
 * DB, and this file must not care which side of it we're on.
 */
const SEX_SPECIFIC_MARKERS: Record<string, Exclude<MarkerApplicability, "shared">> =
  {
    "erection quality": "male",
    "gyno symptoms": "male",
    "clitoral enlargement": "female",
    "voice deepening": "female",
    "menstrual changes": "female",
    "cycle changes": "female",
  }

/** Who this marker applies to. Unknown / custom markers are shared. */
export function markerApplicability(name: string): MarkerApplicability {
  return SEX_SPECIFIC_MARKERS[name.trim().toLowerCase()] ?? "shared"
}

/**
 * Whether a marker should be OFFERED to a profile with this `sex`.
 *
 * `sex` is `profiles.sex` verbatim — nullable, and a null must NOT be resolved to
 * male here. A profile with no sex set sees shared markers only (Spec 04); that is
 * why this doesn't reuse `bodySexFor`, whose male fallback is right for drawing a
 * body and wrong for deciding what to offer someone.
 */
export function markerAppliesTo(
  name: string,
  sex: string | null | undefined
): boolean {
  const applicability = markerApplicability(name)
  if (applicability === "shared") return true
  return sex === applicability
}
