"use server"

/**
 * Data access for `inventory_items` + the read-only `v_inventory_math` view
 * (Protocol Cutover, Step 5 — the Stock view / "stock left" runway). RLS-scoped;
 * identity from the verified session, never the service role (house pattern).
 *
 * INVARIANT: all derived figures — remaining, doses-remaining, projected-empty,
 * mL-per-dose — come ONLY from `v_inventory_math` (read here, never recomputed in
 * TS). Writes store raw inputs only. Refill = a NEW row (never mutate a vial);
 * archive = `is_active = false` (never hard-delete).
 *
 * ONE ACTIVE VIAL PER COMPOUND: adding/refilling stock archives the compound's
 * prior active vial(s) so only the newest is active. This keeps the Stock view to
 * one card per compound (no duplicates from repeated refills or form changes) while
 * preserving history — old vials become archived rows; their logged doses survive.
 */
import { createClient } from "@/lib/supabase/server"
import type { DoseUnit, InventoryType } from "@/lib/db/types"

async function sessionCtx() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, userId: user.id }
}

/** A stock item = the raw `inventory_items` row + its joined compound name and the
 *  DERIVED figures from `v_inventory_math`. The maths fields are read-only. */
export interface StockItem {
  id: string
  protocolCompoundId: string
  compoundName: string
  category: string
  inventoryType: InventoryType
  baseUnit: string
  acquiredOn: string | null
  reconstitutedOn: string | null
  // raw inputs — for pre-filling the edit form (NOT used for any maths):
  totalAmount: number | null
  totalAmountUnit: string | null
  bacWaterMl: number | null
  concentrationMgPerMl: number | null
  strengthPerUnitMg: number | null
  /** Base-unit amount already used when the vial was added part-used (NULL = full).
   *  A raw INPUT folded into remaining by v_inventory_math — never a stored balance. */
  priorUsedBase: number | null
  // derived (v_inventory_math) — never recomputed in TS:
  remainingDisplay: number | null
  dosesRemaining: number | null
  estEmptyDate: string | null
  mlPerDose: number | null
  unitsPerDoseOral: number | null
  concentrationPerMl: number | null
  /** Remaining + total in the base unit — for the fullness bar (remaining/total). */
  remainingBase: number | null
  totalBase: number | null
}

/** Raw inputs for a new inventory item. `user_id` is injected server-side; the
 *  type-specific discriminators are CHECK-enforced by the schema. */
export interface StockInsert {
  id: string
  protocol_compound_id: string
  inventory_type: InventoryType
  base_unit: DoseUnit
  total_amount: number
  total_amount_unit: DoseUnit
  bac_water_ml?: number | null
  concentration_mg_per_ml?: number | null
  strength_per_unit_mg?: number | null
  reconstituted_on?: string | null
  /** Base-unit amount already gone when added part-used (NULL/0 = a full vial). */
  prior_used_base?: number | null
}

/**
 * Active stock for the user, each item joined to its compound name + category and
 * its `v_inventory_math` figures (stitched by id — no maths recomputed). Empty
 * array (never throws) when signed out / on error.
 */
export async function listStock(): Promise<StockItem[]> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return []
    const [itemsRes, mathRes] = await Promise.all([
      ctx.supabase
        .from("inventory_items")
        // `protocol_compounds!inner` + the is_active filter below makes Stock a
        // strict subset of the user's ACTIVE compounds: archiving or removing a
        // compound on Home (which sets/clears its protocol_compounds row) drops its
        // vial from Stock too, so Stock can never show a compound Home doesn't.
        // custom_name/custom_category cover a CUSTOM compound (compound_id NULL,
        // so the nested `compounds` join is null) — coalesced below.
        .select(
          "id, protocol_compound_id, inventory_type, base_unit, acquired_on, reconstituted_on, total_amount, total_amount_unit, bac_water_ml, concentration_mg_per_ml, strength_per_unit_mg, prior_used_base, protocol_compounds!inner(is_active, custom_name, custom_category, compounds(name, category))"
        )
        .eq("user_id", ctx.userId)
        .eq("is_active", true)
        .eq("protocol_compounds.is_active", true)
        .order("created_at", { ascending: false }),
      ctx.supabase
        .from("v_inventory_math")
        .select(
          "inventory_item_id, remaining_display, doses_remaining, est_empty_date, ml_per_dose, units_per_dose_oral, concentration_per_ml, remaining_base, total_base"
        ),
    ])
    if (itemsRes.error) {
      console.error("listStock items failed", itemsRes.error)
      return []
    }
    if (mathRes.error) {
      // A failed math read would otherwise show items with null runway as if valid.
      console.error("listStock math failed", mathRes.error)
      return []
    }
    const math = new Map<string, Record<string, unknown>>()
    for (const m of mathRes.data ?? []) {
      math.set(m.inventory_item_id as string, m as Record<string, unknown>)
    }
    const num = (v: unknown): number | null => (v == null ? null : Number(v))

    return (itemsRes.data ?? []).map((row) => {
      const r = row as Record<string, unknown>
      const pc = r.protocol_compounds as {
        custom_name?: string | null
        custom_category?: string | null
        compounds?: { name?: string; category?: string } | null
      } | null
      const cat = pc?.compounds
      const m = math.get(r.id as string) ?? {}
      return {
        id: r.id as string,
        protocolCompoundId: r.protocol_compound_id as string,
        // Catalogue name/category, else the custom row's own — a custom vial shows
        // the user's compound name in Stock, not a "Compound" placeholder.
        compoundName: cat?.name ?? pc?.custom_name ?? "Compound",
        category: cat?.category ?? pc?.custom_category ?? "anabolic",
        inventoryType: r.inventory_type as InventoryType,
        baseUnit: r.base_unit as string,
        acquiredOn: (r.acquired_on as string | null) ?? null,
        reconstitutedOn: (r.reconstituted_on as string | null) ?? null,
        totalAmount: num(r.total_amount),
        totalAmountUnit: (r.total_amount_unit as string | null) ?? null,
        bacWaterMl: num(r.bac_water_ml),
        concentrationMgPerMl: num(r.concentration_mg_per_ml),
        strengthPerUnitMg: num(r.strength_per_unit_mg),
        priorUsedBase: num(r.prior_used_base),
        remainingDisplay: num(m.remaining_display),
        dosesRemaining: num(m.doses_remaining),
        estEmptyDate: (m.est_empty_date as string | null) ?? null,
        mlPerDose: num(m.ml_per_dose),
        unitsPerDoseOral: num(m.units_per_dose_oral),
        concentrationPerMl: num(m.concentration_per_ml),
        remainingBase: num(m.remaining_base),
        totalBase: num(m.total_base),
      }
    })
  } catch (e) {
    console.error("listStock failed", e)
    return []
  }
}

/**
 * Add a new inventory item. Used for both first stock AND refill (a new row — never
 * mutate an existing vial; consumption history is the moat). Enforces ONE active
 * vial per compound: the new row goes in first, then the compound's OTHER active
 * vials are archived (`is_active = false`). Insert-first ordering means a failed
 * archive never leaves the compound with zero active stock. Returns ok.
 */
export async function addStockItem(row: StockInsert): Promise<{ ok: boolean }> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    const { error } = await ctx.supabase
      .from("inventory_items")
      .insert({ ...row, user_id: ctx.userId })
    if (error) {
      console.error("addStockItem failed", error)
      return { ok: false }
    }
    // Archive the compound's prior active vials so only this new one stays active
    // (one card per compound). Best-effort: the new vial is already in, so a failure
    // here only risks a transient duplicate that the next add/refill cleans up.
    const { error: archiveError } = await ctx.supabase
      .from("inventory_items")
      .update({ is_active: false })
      .eq("user_id", ctx.userId)
      .eq("protocol_compound_id", row.protocol_compound_id)
      .eq("is_active", true)
      .neq("id", row.id)
    if (archiveError) console.error("addStockItem archive-prior failed", archiveError)
    return { ok: true }
  } catch (e) {
    console.error("addStockItem failed", e)
    return { ok: false }
  }
}

/**
 * Correct an existing inventory item's amounts in place (the "edit stock" path —
 * for fixing a mis-typed quantity, not refilling). Distinct from refill (which
 * adds a NEW row): a typo fix should change the SAME row, so the doses already
 * logged against this vial keep their link and `v_inventory_math` just recomputes
 * the remaining from the corrected total. ALL type-discriminator columns are set
 * (nulling the ones the chosen type doesn't use) so even a type change can't leave
 * stale columns that violate the per-type CHECK constraints. RLS-scoped to the
 * owner; `protocol_compound_id` is intentionally NOT editable (that would orphan
 * the linked doses).
 */
export async function updateStockItem(
  id: string,
  row: Omit<StockInsert, "id" | "protocol_compound_id">
): Promise<{ ok: boolean }> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    const { error } = await ctx.supabase
      .from("inventory_items")
      .update({
        inventory_type: row.inventory_type,
        base_unit: row.base_unit,
        total_amount: row.total_amount,
        total_amount_unit: row.total_amount_unit,
        bac_water_ml: row.bac_water_ml ?? null,
        concentration_mg_per_ml: row.concentration_mg_per_ml ?? null,
        strength_per_unit_mg: row.strength_per_unit_mg ?? null,
        reconstituted_on: row.reconstituted_on ?? null,
        prior_used_base: row.prior_used_base ?? null,
      })
      .eq("id", id)
      .eq("user_id", ctx.userId)
    if (error) {
      console.error("updateStockItem failed", error)
      return { ok: false }
    }
    return { ok: true }
  } catch (e) {
    console.error("updateStockItem failed", e)
    return { ok: false }
  }
}

/** Archive (empty/discarded) or restore an inventory item — never hard-delete. */
export async function setStockArchived(
  id: string,
  archived: boolean
): Promise<{ ok: boolean }> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    const { error } = await ctx.supabase
      .from("inventory_items")
      .update({ is_active: !archived })
      .eq("id", id)
      .eq("user_id", ctx.userId)
    return { ok: !error }
  } catch (e) {
    console.error("setStockArchived failed", e)
    return { ok: false }
  }
}

/**
 * Delete a stock item outright (the user just wants the leftover stock gone; they
 * can re-add it anytime). Safe re: history: `dose_logs.inventory_item_id` is
 * `ON DELETE SET NULL`, so logged doses survive — only the vial record + its runway
 * disappear. (Distinct from the compound, which is never hard-deleted here.)
 */
export async function deleteStockItem(id: string): Promise<{ ok: boolean }> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    const { error } = await ctx.supabase
      .from("inventory_items")
      .delete()
      .eq("id", id)
      .eq("user_id", ctx.userId)
    return { ok: !error }
  } catch (e) {
    console.error("deleteStockItem failed", e)
    return { ok: false }
  }
}
