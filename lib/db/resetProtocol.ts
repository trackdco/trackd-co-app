"use server"

/**
 * "Start fresh" — wipe the signed-in user's entire compound stack from the cloud:
 * the canonical Postgres rows (`protocol_compounds`, which cascades its
 * `inventory_items` + `dose_logs`) AND the three device-state mirror tables
 * (`user_stack_compounds`, `user_dose_logs`, `user_custom_compounds`). The
 * migrated flag is (re)stamped so the one-time device→Postgres migration can never
 * re-seed from a stale mirror afterwards.
 *
 * This is the cloud half of the reset; the caller (`StartFreshSection`) ALSO clears
 * the device-local localStorage caches, because those are a write-back cache that
 * would otherwise re-push the old stack to the cloud on the next focus/online.
 *
 * Leaves the active cycle in place (an empty container) — the UI never hard-deletes
 * a cycle (architecture invariant 8); the next add reuses it. Identity is always the
 * verified session; RLS the backstop. Returns ok.
 */
import { createClient } from "@/lib/supabase/server"

export async function wipeMyProtocol(): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false }
    const uid = user.id

    // Deleting protocol_compounds cascades inventory_items + dose_logs (FKs are
    // ON DELETE CASCADE), so this one delete clears the whole canonical tree.
    const results = await Promise.all([
      supabase.from("protocol_compounds").delete().eq("user_id", uid),
      supabase.from("user_stack_compounds").delete().eq("profile_id", uid),
      supabase.from("user_dose_logs").delete().eq("profile_id", uid),
      supabase.from("user_custom_compounds").delete().eq("profile_id", uid),
    ])
    const failed = results.find((r) => r.error)
    if (failed?.error) {
      console.error("wipeMyProtocol delete failed", failed.error)
      return { ok: false }
    }

    // Stamp the migrated flag so a later reinstall doesn't re-run the migration and
    // re-seed from any mirror rows that reappear.
    await supabase
      .from("profiles")
      .update({ protocol_migrated_at: new Date().toISOString() })
      .eq("id", uid)

    return { ok: true }
  } catch (e) {
    console.error("wipeMyProtocol failed", e)
    return { ok: false }
  }
}
