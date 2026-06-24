"use server"

/**
 * Data access for `cycles` — the container every `protocol_compound` hangs off
 * (Protocol Cutover, Step 1). Source of truth is Postgres; access is RLS-scoped.
 *
 * House pattern (mirrors `lib/home/syncActions.ts` + `app/(app)/weight/actions.ts`):
 * identity is ALWAYS derived from the verified session (`auth.getUser()`), never
 * trusted from the client; RLS is the backstop. The cookie-bound server client
 * uses the publishable key — the service role is NEVER used on this path.
 */
import { createClient } from "@/lib/supabase/server"
import type { Cycle, CycleInsert } from "@/lib/db/types"

/** The verified session + user id, or null when signed out. Not exported, so it
 *  is exempt from "use server" serialisation and may return a client. */
async function sessionCtx() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, userId: user.id }
}

/** The user's active cycle, oldest-first, or null. */
async function readActiveCycle(
  ctx: { supabase: Awaited<ReturnType<typeof createClient>>; userId: string }
): Promise<Cycle | null> {
  const { data, error } = await ctx.supabase
    .from("cycles")
    .select("*")
    .eq("user_id", ctx.userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error("ensureActiveCycle read failed", error)
    return null
  }
  return (data as Cycle | null) ?? null
}

/**
 * The user's active cycle, creating a default `"Current"` one if none exists.
 * Idempotent and RACE-SAFE: the `one_active_cycle_per_user` partial unique index
 * means two concurrent callers can't both create a cycle — the loser's INSERT
 * trips the unique violation and we re-read the winner. (The inline "Got a vial?"
 * path fires this twice at once; without the re-read it used to spawn two
 * "Current" cycles.) Returns null only when signed out or on an unrecoverable
 * error.
 */
export async function ensureActiveCycle(): Promise<Cycle | null> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return null

    const existing = await readActiveCycle(ctx)
    if (existing) return existing

    const { data: created, error: insErr } = await ctx.supabase
      .from("cycles")
      .insert({ user_id: ctx.userId, name: "Current", is_active: true })
      .select("*")
      .single()
    if (!insErr) return created as Cycle

    // 23505 = unique_violation: another concurrent call won the race to create
    // the single active cycle. Re-read and return that winner rather than failing.
    if ((insErr as { code?: string }).code === "23505") {
      const raced = await readActiveCycle(ctx)
      if (raced) return raced
    }
    console.error("ensureActiveCycle insert failed", insErr)
    return null
  } catch (e) {
    console.error("ensureActiveCycle failed", e)
    return null
  }
}

/** The user's active cycle if one exists (no create). Null when none / signed out. */
export async function getActiveCycle(): Promise<Cycle | null> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return null
    const { data, error } = await ctx.supabase
      .from("cycles")
      .select("*")
      .eq("user_id", ctx.userId)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error) {
      console.error("getActiveCycle failed", error)
      return null
    }
    return (data as Cycle | null) ?? null
  } catch (e) {
    console.error("getActiveCycle failed", e)
    return null
  }
}

/**
 * Patch the user's own cycle (name / dates / notes / active flag). `user_id` is
 * never accepted from the client; RLS scopes the update to the owner. Returns the
 * updated row, or null on failure.
 */
export async function updateCycle(
  id: string,
  patch: Partial<Omit<CycleInsert, "id">>
): Promise<Cycle | null> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return null
    const { data, error } = await ctx.supabase
      .from("cycles")
      .update(patch)
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .select("*")
      .single()
    if (error) {
      console.error("updateCycle failed", error)
      return null
    }
    return data as Cycle
  } catch (e) {
    console.error("updateCycle failed", e)
    return null
  }
}
