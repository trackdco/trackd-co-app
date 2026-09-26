/**
 * What the database can hold for stock, and so what the app may OFFER
 * (sweep, ruling 10: "never offer a choice that cannot save there").
 *
 * Migrations `025` (the dropper and the drop) and `026` (spares, the dropper's
 * shapes, `v_compound_stock`) go together: `026` needs `025`'s enum values. A
 * database without them refuses a powder vial held UNMIXED (a spare, a box of
 * several) and every dropper. Until they are applied:
 *   - a powder vial is added the one way it holds, one vial mixed now;
 *   - the dropper is not offered anywhere (Add stock's forms, the custom
 *     compound's "Inventory type").
 *
 * The answer comes from one probe of `v_compound_stock`, which `026` creates
 * (`stockSparesSupported` in `lib/db/inventory.ts`): `true` once it exists,
 * `false` while it does not, `null` when the probe could not say (signed out,
 * offline, any other error). Pure: no React, no I/O.
 */
import type { InventoryType } from "@/lib/db/types"

/**
 * The probe's answer from its error. A missing relation is `42P01` from
 * Postgres and `PGRST205` from PostgREST's schema cache: `026` is not applied.
 * No error: it is. Anything else says nothing about the schema.
 */
export function stockSchemaFromProbe(error: { code?: string } | null | undefined): boolean | null {
  if (!error) return true
  if (error.code === "42P01" || error.code === "PGRST205") return false
  return null
}

/**
 * Whether the dropper may be offered. Only when the database is KNOWN to hold
 * it: an unknown answer hides it, because a dropper refused at Save costs the
 * whole form, while a hidden one costs nothing (the other forms still save).
 */
export function dropperOffered(schema: boolean | null): boolean {
  return schema === true
}

/**
 * The forms to offer, the dropper taken out unless it is offerable. `keep`:
 * the form a container or compound already HAS (an edit), which is never taken
 * away from under it.
 */
export function offerableForms(
  forms: readonly InventoryType[],
  dropperOk: boolean,
  keep?: InventoryType | string | null,
): InventoryType[] {
  return forms.filter((f) => f !== "dropper" || dropperOk || keep === "dropper")
}
