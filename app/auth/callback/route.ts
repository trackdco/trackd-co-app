import { NextResponse } from "next/server";

import { ensureCompEntitlement } from "@/lib/billing/betaGrace";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth callback. Google -> Supabase Auth -> here with a one-time `code` in the
 * query. We exchange it for a session (PKCE: the code verifier set by
 * signInWithOAuth lives in a cookie this server handler can read), which writes
 * the auth cookies onto the redirect response. The (app) guard then routes the
 * user to the 18+/ToS gate or the dashboard.
 *
 * On any failure we send the user back to /login with an error flag rather than
 * leaving them on a blank callback URL.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Default landing is the dashboard; the (app) guard bounces to /welcome if the
  // gate isn't passed yet. Only honour internal, single-slash paths (no open
  // redirects via ?next=//evil.example or ?next=https://…).
  const requestedNext = searchParams.get("next");
  const next =
    requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      /**
       * ⚠️ D71 — the comp list's members get their row here, once.
       *
       * A comp-list member who signs up AFTER the hand-run backfill holds no
       * entitlement, and nothing else would ever grant them one — so the gate
       * would hold them read-only on launch morning. This is the only writer
       * besides the backfill. Idempotent, service-role, and a no-op string
       * comparison for everybody not on the list. It never throws.
       */
      const { data: { user: signedIn } } = await supabase.auth.getUser();
      if (signedIn) await ensureCompEntitlement(signedIn.id, signedIn.email);

      // Behind Vercel's proxy `origin` can be the internal host, so prefer the
      // forwarded host in production (Supabase Next.js SSR pattern).
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      const dest =
        isLocalEnv || !forwardedHost
          ? `${origin}${next}`
          : `https://${forwardedHost}${next}`;
      const response = NextResponse.redirect(dest);
      // Mark this as a fresh PHYSICAL sign-in / sign-up so the dashboard shows the
      // "Add to Home Screen" popup once for this login (the popup clears it on show,
      // so it won't nag on later navigations; it returns on the next sign-in). A
      // returning user reopening the app with a live session never hits this route,
      // so they only see it when they actually sign in. Short TTL is just a fallback
      // if the clear never runs.
      response.cookies.set("trackd-install-hint", "1", {
        path: "/",
        maxAge: 600,
        httpOnly: true,
        sameSite: "lax",
        secure: !isLocalEnv,
      });
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
