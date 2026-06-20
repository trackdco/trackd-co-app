"use server"

/**
 * Marks the founder-welcome popup as seen for the current user, so it never shows
 * again (cross-device). Identity is the verified session — RLS scopes the write
 * to the caller's own profile row. Best-effort: a failed write just means the
 * popup may reappear next session, never an error the user sees.
 */
import { createClient } from "@/lib/supabase/server"

export async function markWelcomeSeen(): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false }
    const { error } = await supabase
      .from("profiles")
      .update({ welcome_seen_at: new Date().toISOString() })
      .eq("id", user.id)
    if (error) {
      console.error("markWelcomeSeen failed", error)
      return { ok: false }
    }
    return { ok: true }
  } catch (e) {
    console.error("markWelcomeSeen failed", e)
    return { ok: false }
  }
}
