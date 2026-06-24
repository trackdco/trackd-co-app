"use server"

/**
 * Per-account state for the "Add to Home Screen" popup (so it shows once, not every
 * login / once-per-device). Identity is always the verified session; RLS is the
 * backstop; never the service role (house pattern). Best-effort — a failure never
 * blocks the UI (the worst case is the popup shows once more).
 */
import { createClient } from "@/lib/supabase/server"

async function ctx() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return { supabase, userId: user.id }
}

/**
 * Record that the app has been launched as an installed standalone PWA — i.e. it's
 * on the user's Home Screen. Only stamps the first time (keeps the original
 * install date) and suppresses the install popup for good, on any device.
 */
export async function markPwaInstalled(): Promise<{ ok: boolean }> {
  try {
    const cx = await ctx()
    if (!cx) return { ok: false }
    const { error } = await cx.supabase
      .from("profiles")
      .update({ pwa_installed_at: new Date().toISOString() })
      .eq("id", cx.userId)
      .is("pwa_installed_at", null) // don't overwrite the original install timestamp
    return { ok: !error }
  } catch (e) {
    console.error("markPwaInstalled failed", e)
    return { ok: false }
  }
}

/** Record that the user dismissed the install popup, so it never shows again. */
export async function dismissInstallPrompt(): Promise<{ ok: boolean }> {
  try {
    const cx = await ctx()
    if (!cx) return { ok: false }
    const { error } = await cx.supabase
      .from("profiles")
      .update({ install_prompt_dismissed_at: new Date().toISOString() })
      .eq("id", cx.userId)
    return { ok: !error }
  } catch (e) {
    console.error("dismissInstallPrompt failed", e)
    return { ok: false }
  }
}
