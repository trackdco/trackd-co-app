import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { getSessionContext } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Log in — Trackd Co",
};

/**
 * Sign-in screen. The single entry point to an account: "Continue with Google"
 * starts the OAuth flow, the /auth/callback route completes it, and the (app)
 * guard routes the user to the 18+/ToS gate or the dashboard.
 *
 * Already-signed-in visitors are bounced straight on (to the gate if they
 * haven't passed it, otherwise the dashboard) so /login never shows to a live
 * session. ?error=auth surfaces a failed code exchange handed back by the
 * callback route.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { user, passedGate } = await getSessionContext();
  if (user) {
    redirect(passedGate ? "/dashboard" : "/welcome");
  }

  const { error } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <Link
        href="/"
        className="font-display text-lg font-medium tracking-[-0.01em] text-foreground"
      >
        trackd<span className="text-text-muted"> co</span>
      </Link>

      <h1 className="mt-12 text-balance font-display text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] text-foreground">
        Welcome back
      </h1>
      <p className="mt-3 max-w-[17rem] text-pretty text-[0.95rem] leading-relaxed text-text-muted">
        Sign in to pick up where you left off.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-6 max-w-[19rem] text-sm text-[var(--state-error)]"
        >
          Something went wrong signing you in. Please try again.
        </p>
      ) : null}

      <div className="mt-10 w-full max-w-[20rem]">
        <GoogleSignInButton />
        <p className="mt-4 text-[0.7rem] leading-relaxed text-text-subtle">
          18+ only. By continuing you agree to our{" "}
          <Link href="/terms" className="text-text-muted hover:text-foreground">
            Terms
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="text-text-muted hover:text-foreground"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </div>

      <Link
        href="/"
        className="mt-12 text-sm text-text-muted transition-colors hover:text-foreground"
      >
        Back to home
      </Link>
    </div>
  );
}
