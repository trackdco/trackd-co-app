import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

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

  // Only honour internal, single-slash paths (no open redirects).
  const requestedNext = searchParams.get("next");
  const next =
    requestedNext &&
    requestedNext.startsWith("/") &&
    !requestedNext.startsWith("//")
      ? requestedNext
      : "/dashboard";

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
