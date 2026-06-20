"use server"

/**
 * The durable, cross-device guard for the one-time device→Postgres state migration
 * (`lib/migration/migrateDeviceState.ts`). Lives on the user's own profile row
 * (`profiles.protocol_migrated_at`, migration `profile_protocol_migrated_at`) so it
 * survives a PWA delete/reinstall — unlike the old localStorage marker, which the
 * reinstall wiped, causing the migration to re-run and resurrect deleted compounds
 * from the stale jsonb mirror.
 *
 * Identity is always the verified session; RLS the backstop (own-row profiles
 * SELECT/UPDATE). Best-effort — never throws.
 */
import { createClient } from "@/lib/supabase/server"

async function sessionCtx() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, userId: user.id }
}

/** True once this user has ever completed the device→Postgres migration. */
export async function hasMigratedInCloud(): Promise<boolean> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return false
    const { data } = await ctx.supabase
      .from("profiles")
      .select("protocol_migrated_at")
      .eq("id", ctx.userId)
      .maybeSingle()
    return Boolean(data?.protocol_migrated_at)
  } catch (e) {
    console.error("hasMigratedInCloud failed", e)
    return false
  }
}

/** Stamp the migration as done (idempotent — only sets it once). */
export async function markMigratedInCloud(): Promise<{ ok: boolean }> {
  try {
    const ctx = await sessionCtx()
    if (!ctx) return { ok: false }
    const { error } = await ctx.supabase
      .from("profiles")
      .update({ protocol_migrated_at: new Date().toISOString() })
      .eq("id", ctx.userId)
      .is("protocol_migrated_at", null)
    return { ok: !error }
  } catch (e) {
    console.error("markMigratedInCloud failed", e)
    return { ok: false }
  }
}
