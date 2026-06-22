"use server"

/**
 * Data access for `protocol_compounds` — the compounds a user is running, with
 * their dose + schedule, inside a cycle (Protocol Cutover, Step 1). RLS-scoped;
 * identity from the verified session only (see `lib/db/cycles.ts` for the house
 * pattern). `inventory_item_id` is a `dose_logs` concern wired in Step 5 — nothing
 * here touches inventory.
 */
import { createClient } from "@/lib/supabase/server"
import type { ProtocolCompound, ProtocolCompoundInsert } from "@/lib/db/types"

async function sessionCtx() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, userId: user.id }
}

/** All protocol compounds for the user, newest first. Optionally scoped to one
 *  cycle. Empty array (never throws) when signed out or on error. */
export async function listProtocolCompounds(
  cycleId?: string
): Promise<ProtocolCompound[]> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return []
    let query = ctx.supabase
      .from("protocol_compounds")
      .select("*")
      .eq("user_id", ctx.userId)
    if (cycleId) query = query.eq("cycle_id", cycleId)
    const { data, error } = await query.order("created_at", { ascending: false })
    if (error) {
      console.error("listProtocolCompounds failed", error)
      return []
    }
    return (data ?? []) as ProtocolCompound[]
  } catch (e) {
    console.error("listProtocolCompounds failed", e)
    return []
  }
}

/**
 * Insert or update a protocol compound by its (client-generated) id. `user_id`
 * is injected from the session and ignored if sent by the client. Upserting on
 * the primary key makes re-flushing the offline outbox idempotent. Returns the
 * stored row, or null on failure.
 */
export async function upsertProtocolCompound(
  row: ProtocolCompoundInsert
): Promise<ProtocolCompound | null> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return null
    const { data, error } = await ctx.supabase
      .from("protocol_compounds")
      .upsert({ ...row, user_id: ctx.userId }, { onConflict: "id" })
      .select("*")
      .single()
    if (error) {
      console.error("upsertProtocolCompound failed", error)
      return null
    }
    return data as ProtocolCompound
  } catch (e) {
    console.error("upsertProtocolCompound failed", e)
    return null
  }
}

/** Max rows per upsert statement — keeps any single multi-row INSERT well clear of
 *  PostgREST/Postgres parameter limits and avoids long row locks on a big backfill. */
const UPSERT_CHUNK = 200

/**
 * Bulk upsert protocol compounds in chunked multi-row statements (one INSERT per
 * chunk, not one per row). `user_id` is injected from the session on every row;
 * `onConflict: "id"` keeps it idempotent so a re-run (e.g. the migration retrying)
 * is a no-op. Returns how many rows were written and whether every chunk
 * succeeded — a partial write is safe because the deterministic ids make a retry
 * overwrite in place. Used by the one-time device→Postgres migration backfill.
 */
export async function upsertProtocolCompounds(
  rows: ProtocolCompoundInsert[]
): Promise<{ ok: boolean; count: number }> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false, count: 0 }
    if (rows.length === 0) return { ok: true, count: 0 }
    let count = 0
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK).map((r) => ({ ...r, user_id: ctx.userId }))
      const { error } = await ctx.supabase
        .from("protocol_compounds")
        .upsert(chunk, { onConflict: "id" })
      if (error) {
        console.error("upsertProtocolCompounds failed", error)
        return { ok: false, count }
      }
      count += chunk.length
    }
    return { ok: true, count }
  } catch (e) {
    console.error("upsertProtocolCompounds failed", e)
    return { ok: false, count: 0 }
  }
}

/**
 * Archive (stop dosing, keep history) or reactivate a protocol compound — the
 * archive-never-delete invariant. Returns the updated row, or null on failure.
 */
export async function setProtocolCompoundActive(
  id: string,
  isActive: boolean
): Promise<ProtocolCompound | null> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return null
    const { data, error } = await ctx.supabase
      .from("protocol_compounds")
      .update({ is_active: isActive })
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .select("*")
      .single()
    if (error) {
      console.error("setProtocolCompoundActive failed", error)
      return null
    }
    return data as ProtocolCompound
  } catch (e) {
    console.error("setProtocolCompoundActive failed", e)
    return null
  }
}

/**
 * Hard-delete a protocol compound (cascades its dose logs). The everyday UX uses
 * {@link setProtocolCompoundActive}; this exists only for the deliberate
 * hard-delete path (architecture invariant 8). Returns ok.
 */
export async function deleteProtocolCompound(id: string): Promise<{ ok: boolean }> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    const { error } = await ctx.supabase
      .from("protocol_compounds")
      .delete()
      .eq("id", id)
      .eq("user_id", ctx.userId)
    return { ok: !error }
  } catch (e) {
    console.error("deleteProtocolCompound failed", e)
    return { ok: false }
  }
}
