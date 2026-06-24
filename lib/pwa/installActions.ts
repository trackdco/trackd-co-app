"use server"

/**
 * State for the "Add to Home Screen" popup. The popup shows once per PHYSICAL
 * sign-in / sign-up (a `trackd-install-hint` cookie set at the auth callback), and
 * this action clears that cookie the moment the popup shows so it appears once per
 * login and returns on the next sign-in. Best-effort — a failure never blocks the UI.
 */
import { cookies } from "next/headers"

/** The fresh-sign-in cookie set by app/auth/callback/route.ts. */
const INSTALL_HINT_COOKIE = "trackd-install-hint"

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
