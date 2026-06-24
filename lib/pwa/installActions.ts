"use server"

/**
 * State for the "Add to Home Screen" popup. The popup shows once per PHYSICAL
 * sign-in / sign-up (a `trackd-install-hint` cookie set at the auth callback), and
 * we record when the app has been installed so we stop nagging people who've added
 * it. Identity is always the verified session; RLS is the backstop; never the
 * service role (house pattern). Best-effort — a failure never blocks the UI.
 */
import { cookies } from "next/headers"

import { createClient } from "@/lib/supabase/server"

/** The fresh-sign-in cookie set by app/auth/callback/route.ts. */
const INSTALL_HINT_COOKIE = "trackd-install-hint"

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

/**
 * Clear the one-shot fresh-sign-in hint cookie. Called by the popup the moment it
 * shows, so it appears once per sign-in (not on every dashboard navigation in the
 * same session) and returns on the next physical sign-in.
 */
export async function clearInstallHint(): Promise<void> {
  try {
    const store = await cookies()
    store.delete(INSTALL_HINT_COOKIE)
  } catch (e) {
    console.error("clearInstallHint failed", e)
  }
}
