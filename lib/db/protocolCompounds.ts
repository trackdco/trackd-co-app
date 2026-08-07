"use server"

/**
 * Data access for `protocol_compounds` — the compounds a user is running, with
 * their dose + schedule, inside a cycle (Protocol Cutover, Step 1). RLS-scoped;
 * identity from the verified session only (see `lib/db/cycles.ts` for the house
 * pattern). `inventory_item_id` is a `dose_logs` concern wired in Step 5 — nothing
 * here touches inventory.
 */
import { createClient } from "@/lib/supabase/server"
import { CYCLE_COLUMNS } from "@/lib/db/types"
import type { ProtocolCompound, ProtocolCompoundInsert } from "@/lib/db/types"

/**
 * "That column doesn't exist" — the 006 cycle columns before the migration runs.
 *
 * TWO codes, and the distinction matters: PostgREST validates a WRITE payload
 * against its own schema cache and returns `PGRST204` before the statement ever
 * reaches Postgres, so a write never sees `42703`. Reads (select lists, filters)
 * do reach Postgres and return `42703`. Checking only one of them means the
 * fallback silently never fires on the path that needs it most.
 */
function isUndefinedColumn(error: { code?: string } | null): boolean {
  return error?.code === "42703" || error?.code === "PGRST204"
}

/**
 * The same row without any column a pending migration may not have added yet —
 * the seven cycle columns (006), `inventory_form` (023) and `slot_doses` (021).
 *
 * ONE strip for all of them, deliberately. `isUndefinedColumn` cannot tell us
 * WHICH column PostgREST objected to, so a retry that dropped only the cycle
 * columns would fail again in exactly the same way on a database missing 013,
 * and the write would be lost. Dropping every optional column at once costs a
 * cycle rule that the device store still holds and re-pushes; keeping them
 * separate would cost the whole row.
 */
function stripPendingColumns<T extends ProtocolCompoundInsert>(row: T): T {
  const out: T = { ...row }
  for (const key of CYCLE_COLUMNS) delete out[key]
  delete out.inventory_form
  delete out.slot_doses
  return out
}

/**
 * The LIGHTER strip: only the newest columns (013's `inventory_form`, 021's
 * `slot_doses`), keeping the cycle.
 *
 * Tried FIRST, because the cycle columns have been applied since 006 and the
 * other two may not be — so the common failure is one of the new ones, and
 * dropping the cycle to fix it threw away a rule the user had set. Only if this
 * still fails does the full strip run.
 */
function stripNewestColumns<T extends ProtocolCompoundInsert>(row: T): T {
  const out: T = { ...row }
  delete out.inventory_form
  delete out.slot_doses
  return out
}

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
      // The 006 cycle columns or 023's inventory_form may not exist yet. Retry
      // without them rather than losing the whole write — the device store keeps
      // both meanwhile, so no intent is lost, and they start persisting once the
      // migration is applied.
      if (isUndefinedColumn(error)) {
        // TIER 2: drop only the newest columns, keeping the cycle.
        const lighter = await ctx.supabase
          .from("protocol_compounds")
          .upsert(
            { ...stripNewestColumns(row), user_id: ctx.userId },
            { onConflict: "id" }
          )
          .select("*")
          .single()
        if (!lighter.error) return lighter.data as ProtocolCompound
        if (!isUndefinedColumn(lighter.error)) {
          console.error("upsertProtocolCompound failed", lighter.error)
          return null
        }
        // TIER 3: a database without 006 either. Now the cycle goes too.
        const { data: retry, error: retryError } = await ctx.supabase
          .from("protocol_compounds")
          .upsert(
            { ...stripPendingColumns(row), user_id: ctx.userId },
            { onConflict: "id" }
          )
          .select("*")
          .single()
        if (retryError) {
          console.error("upsertProtocolCompound failed", retryError)
          return null
        }
        return retry as ProtocolCompound
      }
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
      let { error } = await ctx.supabase
        .from("protocol_compounds")
        .upsert(chunk, { onConflict: "id" })
      // Same pending-column retry as the single upsert. Without it the one-time
      // device→Postgres backfill fails on every login until the migration lands,
      // and `migrateDeviceState` never marks itself complete.
      if (error && isUndefinedColumn(error)) {
        ;({ error } = await ctx.supabase
          .from("protocol_compounds")
          .upsert(chunk.map((r) => stripPendingColumns(r)), { onConflict: "id" }))
      }
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
 * Flip `is_active` — the archive-never-delete invariant. `false` is the app's
 * Delete (stop dosing, keep history); `true` is reached by re-adding a deleted
 * compound. Returns the updated row, or null on failure.
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

// No hard delete of a protocol compound exists (Spec 02 + Invariant 8): deleting a
// compound is {@link setProtocolCompoundActive} with `false` — future doses stop,
// every logged dose survives. Erasing a user's rows outright is account deletion's
// job, which runs through the DB cascade, not through the app.
