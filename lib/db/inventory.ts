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
        .select(
          "id, protocol_compound_id, inventory_type, base_unit, acquired_on, reconstituted_on, protocol_compounds(compounds(name, category))"
        )
        .eq("user_id", ctx.userId)
        .eq("is_active", true)
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
      const pc = r.protocol_compounds as { compounds?: { name?: string; category?: string } } | null
      const cat = pc?.compounds
      const m = math.get(r.id as string) ?? {}
      return {
        id: r.id as string,
        protocolCompoundId: r.protocol_compound_id as string,
        compoundName: cat?.name ?? "Compound",
        category: cat?.category ?? "anabolic",
        inventoryType: r.inventory_type as InventoryType,
        baseUnit: r.base_unit as string,
        acquiredOn: (r.acquired_on as string | null) ?? null,
        reconstitutedOn: (r.reconstituted_on as string | null) ?? null,
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
 * Add a new inventory item. Used for both first stock AND refill (refill is just a
 * new row — never mutate an existing vial; consumption history is the moat).
 * Returns ok.
 */
export async function addStockItem(row: StockInsert): Promise<{ ok: boolean }> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    const { error } = await ctx.supabase
      .from("inventory_items")
      .insert({ ...row, user_id: ctx.userId })
    if (error) console.error("addStockItem failed", error)
    return { ok: !error }
  } catch (e) {
    console.error("addStockItem failed", e)
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
