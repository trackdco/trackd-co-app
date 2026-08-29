import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import { safeNextPath } from "@/lib/auth/nextPath";
import { ensureCompEntitlement } from "@/lib/billing/betaGrace";
import { createClient } from "@/lib/supabase/server";

/**
 * Email confirmation + password-recovery landing route. Signup confirmation
 * links (type=email) and password-reset links (type=recovery) both come here;
 * verifying writes the auth cookies onto the redirect, then we forward to `next`.
 *
 * We accept BOTH link shapes so it works whichever email template is live:
 *   • the recommended token-hash form — `?token_hash=…&type=…` → verifyOtp
 *     (stateless, works cross-device; set the templates to this), and
 *   • the default code form — `?code=…` (Supabase's built-in ConfirmationURL) →
 *     exchangeCodeForSession, same as /auth/callback.
 * So confirmation/reset work even before the templates are switched to token-hash.
 *
 * This is the sibling of /auth/callback (Google's OAuth code exchange). Kept
 * separate so each entry point stays simple.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  /**
   * ⚠️ THE SAME WEAK `startsWith` TEST THIS ROUTE SHIPPED WITH, REPLACED.
   *
   * See the note in `/auth/callback` — identical rule, identical bypasses
   * (`/\evil.com` and the C0-control variants both PASSED it), and this route
   * is the far end of the OTHER thread `/login` now starts: sign-up puts the
   * requested `next` into the confirmation email's `emailRedirectTo`, and it
   * comes back here when the link is clicked.
   *
   * ⚠️ An emailed link is the one of the four that sits in an inbox for days
   * and can be forwarded, which makes it the LEAST trustworthy carrier of the
   * four and the least excusable place to keep a check that is known to fail.
   *
   * One parser: `lib/auth/nextPath.ts`.
   */
  const next = safeNextPath(searchParams.get("next"));

  const supabase = await createClient();
  let verified = false;
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    verified = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    verified = !error;
  }

  if (verified) {
    /**
     * ⚠️ D71 — the comp list's members get their row here, once.
     *
     * The email half of the same seam as `/auth/callback`. A comp-list member
     * who confirms their address AFTER the hand-run backfill holds no
     * entitlement, and nothing else would ever grant them one — so the gate
     * would hold them read-only on launch morning. Idempotent, service-role,
     * and a no-op string comparison for everybody not on the list. Never throws.
     *
     * A recovery link reaches here too, and that is harmless: the address is
     * either on the list or it is not, and the write is `ignoreDuplicates`.
     */
    const {
      data: { user: signedIn },
    } = await supabase.auth.getUser();
    if (signedIn) await ensureCompEntitlement(signedIn.id, signedIn.email);

    // Behind Vercel's proxy `origin` can be the internal host; prefer the
    // forwarded host in production (same pattern as /auth/callback).
    const forwardedHost = request.headers.get("x-forwarded-host");
    const isLocalEnv = process.env.NODE_ENV === "development";
    const dest =
      isLocalEnv || !forwardedHost
        ? `${origin}${next}`
        : `https://${forwardedHost}${next}`;
    const response = NextResponse.redirect(dest);
    // A confirmed sign-up is a fresh physical sign-in → show the install popup
    // once (mirrors /auth/callback). A recovery link isn't a sign-in moment, so
    // skip it there (the code flow drops `type`, so also key off the reset path).
    const isRecovery = type === "recovery" || next.startsWith("/reset-password");
    if (!isRecovery) {
      response.cookies.set("trackd-install-hint", "1", {
        path: "/",
        maxAge: 600,
        httpOnly: true,
        sameSite: "lax",
        secure: !isLocalEnv,
      });
    }
    return response;
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
