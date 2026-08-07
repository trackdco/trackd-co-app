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

/**
 * "That column doesn't exist" — `slot_index` before `supabase/protocol/017`.
 * `PGRST204` is what a WRITE gets (PostgREST rejects the payload against its
 * schema cache first); `42703` is what a READ gets from Postgres itself.
 */
function isUndefinedColumn(error: { code?: string } | null): boolean {
  return error?.code === "42703" || error?.code === "PGRST204"
}

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
      // Pre-017 there is no `slot_index`. Retry without it rather than lose the
      // dose: the row id already encodes the slot, so a second dose still lands
      // on its own row — the database simply cannot yet SAY which slot it is.
      if (isUndefinedColumn(error)) {
        const { slot_index: _dropped, ...rest } = row
        void _dropped
        const retry = await ctx.supabase
          .from("dose_logs")
          .upsert({ ...rest, user_id: ctx.userId }, { onConflict: "id" })
          .select("*")
          .single()
        if (retry.error) {
          console.error("upsertDoseLog failed", retry.error)
          return null
        }
        return retry.data as DoseLog
      }
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

/**
 * Remove a dose log (the untick / undo path).
 *
 * `matched` says whether a row was actually deleted, and it is the important
 * part. PostgREST calls a zero-row delete a success, so "I asked to delete a row
 * that does not exist" was indistinguishable from "I deleted it" — and the
 * caller clears its tombstone on that success, which is what turns any
 * id-resolution miss into a dose that comes back on the next pull. `count:
 * "exact"` makes the difference visible instead of silent.
 */
export async function deleteDoseLog(
  id: string
): Promise<{ ok: boolean; matched: boolean }> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false, matched: false }
    const { error, count } = await ctx.supabase
      .from("dose_logs")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("user_id", ctx.userId)
    if (error) console.error("deleteDoseLog: cloud write failed", error)
    return { ok: !error, matched: (count ?? 0) > 0 }
  } catch (e) {
    console.error("deleteDoseLog failed", e)
    return { ok: false, matched: false }
  }
}
