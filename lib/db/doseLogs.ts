"use server"

/**
 * Data access for `dose_logs` — a dose taken, or a due dose explicitly skipped
 * (Protocol Cutover, Step 1). RLS-scoped; identity from the verified session only
 * (see `lib/db/cycles.ts` for the house pattern).
 *
 * `inventory_item_id` is left null in Steps 1–4 — the dose↔inventory draw link
 * (so runway decrements) is wired in Step 5. Derived inventory maths never live
 * here; they belong to `v_inventory_math` (architecture invariant 1).
 */
import { createClient } from "@/lib/supabase/server"
import type { DoseLog, DoseLogInsert } from "@/lib/db/types"

async function sessionCtx() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, userId: user.id }
}

/** All dose logs for the user, most-recently-taken first. Optionally scoped to a
 *  single protocol compound. Empty array (never throws) when signed out / on error. */
export async function listDoseLogs(
  protocolCompoundId?: string
): Promise<DoseLog[]> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return []
    let query = ctx.supabase
      .from("dose_logs")
      .select("*")
      .eq("user_id", ctx.userId)
    if (protocolCompoundId)
      query = query.eq("protocol_compound_id", protocolCompoundId)
    const { data, error } = await query.order("taken_at", { ascending: false })
    if (error) {
      console.error("listDoseLogs failed", error)
      return []
    }
    return (data ?? []) as DoseLog[]
  } catch (e) {
    console.error("listDoseLogs failed", e)
    return []
  }
}

/**
 * Insert or update a dose log by its (client-generated) id. `user_id` is injected
 * from the session. Upserting on the primary key makes re-flushing the offline
 * outbox idempotent and lets an edit overwrite in place. Returns the stored row,
 * or null on failure.
 */
export async function upsertDoseLog(row: DoseLogInsert): Promise<DoseLog | null> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return null
    const { data, error } = await ctx.supabase
      .from("dose_logs")
      .upsert({ ...row, user_id: ctx.userId }, { onConflict: "id" })
      .select("*")
      .single()
    if (error) {
      console.error("upsertDoseLog failed", error)
      return null
    }
    return data as DoseLog
  } catch (e) {
    console.error("upsertDoseLog failed", e)
    return null
  }
}

/** Max rows per upsert statement — see `protocolCompounds.ts`. */
const UPSERT_CHUNK = 200

/**
 * Bulk upsert dose logs in chunked multi-row statements (one INSERT per chunk,
 * not one per row). `user_id` is injected per row; `onConflict: "id"` keeps it
 * idempotent. Returns the written count + whether every chunk succeeded; a
 * partial write is safe (deterministic ids make a retry overwrite in place).
 * Used by the one-time device→Postgres migration backfill.
 */
export async function upsertDoseLogs(
  rows: DoseLogInsert[]
): Promise<{ ok: boolean; count: number }> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false, count: 0 }
    if (rows.length === 0) return { ok: true, count: 0 }
    let count = 0
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK).map((r) => ({ ...r, user_id: ctx.userId }))
      const { error } = await ctx.supabase
        .from("dose_logs")
        .upsert(chunk, { onConflict: "id" })
      if (error) {
        console.error("upsertDoseLogs failed", error)
        return { ok: false, count }
      }
      count += chunk.length
    }
    return { ok: true, count }
  } catch (e) {
    console.error("upsertDoseLogs failed", e)
    return { ok: false, count: 0 }
  }
}

/** Remove a dose log (the untick / undo path). Returns ok. */
export async function deleteDoseLog(id: string): Promise<{ ok: boolean }> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    const { error } = await ctx.supabase
      .from("dose_logs")
      .delete()
      .eq("id", id)
      .eq("user_id", ctx.userId)
    if (error) console.error("deleteDoseLog: cloud write failed", error)
    return { ok: !error }
  } catch (e) {
    console.error("deleteDoseLog failed", e)
    return { ok: false }
  }
}
