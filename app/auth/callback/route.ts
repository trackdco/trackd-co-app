import { NextResponse } from "next/server";

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
