/**
 * The `dose_unit` Postgres enum and its normaliser, in their own module.
 *
 * These live here rather than in `lib/db/types.ts` because `types.ts` imports
 * FROM `lib/home/stack.ts` (for `hasTime` / `isInjectable`), so anything in
 * `stack.ts` that needs the coercion would close a value-level import cycle.
 * `types.ts` re-exports both, so every existing `@/lib/db/types` import keeps
 * working and there is still exactly ONE list of valid units.
 *
 * Pure types + pure helpers; no React, no side effects (code-standards.md).
 */

/** Mirrors the `dose_unit` enum in `supabase/trackd_schema_v0_4_2.sql`. */
export type DoseUnit = "mg" | "mcg" | "iu" | "ml" | "tab" | "capsule" | "g"

export const DOSE_UNITS: readonly DoseUnit[] = [
  "mg",
  "mcg",
  "iu",
  "ml",
  "tab",
  "capsule",
  "g",
]

/** Coerce the live store's free-string `unit` to a valid `dose_unit` (fallback
 *  `mg`). The Add flow already locks the unit to the compound's catalogue value,
 *  so this is a defensive normaliser — but it must accept EVERY valid unit, or a
 *  tablet/capsule/mL/g compound silently writes its doses as `mg`. */
export function coerceDoseUnit(unit: string): DoseUnit {
  if ((DOSE_UNITS as readonly string[]).includes(unit)) return unit as DoseUnit
  // Say so in dev. This fallback is defensive, so it should never fire in
  // practice — and silently relabelling a dose's unit is exactly the class of bug
  // this PR already had to fix twice. A warning turns the next one into something
  // visible rather than something a user notices in their history.
  if (process.env.NODE_ENV !== "production") {
    console.warn(`coerceDoseUnit: unrecognised unit "${unit}", falling back to "mg"`)
  }
  return "mg"
}
