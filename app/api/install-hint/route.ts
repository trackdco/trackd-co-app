import { NextResponse } from "next/server";

/**
 * POST /api/install-hint — consume the one-shot `trackd-install-hint` cookie (set at
 * the auth callback on a fresh sign-in) when the "Add to Home Screen" popup is
 * dismissed, so it shows once per sign-in and returns on the next one.
 *
 * Deliberately a route handler, NOT a Server Action: a Server Action re-renders the
 * current route after it runs, and clearing the cookie mid-display would make the
 * dashboard re-read `freshSignIn=false` and yank the popup. A plain `fetch` to this
 * handler just deletes the cookie with no RSC refresh.
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("trackd-install-hint");
  return res;
}
