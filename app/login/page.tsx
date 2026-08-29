import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmailPasswordForm } from "@/components/auth/email-password-form";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { SafariMark } from "@/components/onboarding/browser-marks";
import { getSessionContext } from "@/lib/auth";
import { DEFAULT_NEXT, safeNextPath } from "@/lib/auth/nextPath";

export const metadata: Metadata = {
  title: "Log in · Trackd Co",
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
 *
 * ## ⚠️ `?next=` — THE DESTINATION SOMEBODY WAS ACTUALLY ASKING FOR
 *
 * `app/(app)/layout.tsx` sends an unauthenticated visitor here with the path
 * they were opening. This screen's only job with it is to hand it to the three
 * controls that can complete a sign-in, so all three land in the same place:
 *
 *   Google       -> `/auth/callback?next=`   (a 302)
 *   sign-in      -> the action returns it and the client loads it
 *   sign-up      -> into the confirmation email, back via `/auth/confirm?next=`
 *
 * ⚠️ **THIS IS THE FIRST THING IN THE CODEBASE THAT READS A `next` OFF A URL**,
 * and `app/login/actions.ts` named that moment as the one where the parser stops
 * being belt-and-braces. So it is validated HERE, before it reaches any of the
 * three, and again inside each of them — see `lib/auth/nextPath.ts`, which is
 * now the single parser all four doorways share.
 */
export default async function LoginPage({
  searchParams,
}: {
  /**
   * ⚠️ `string | string[]`, and the array case is NOT theoretical. A repeated
   * query parameter arrives as an array, and typing it as `string` is exactly
   * how `app/onboarding/page.tsx`'s `?step=` guard was walked past — `?next=a&
   * next=b` would have fallen straight through to the default while the address
   * bar said otherwise. Resolved with `[0]`, which is what
   * `URLSearchParams.get` returns, so this agrees with any client reading the
   * same URL.
   */
  searchParams: Promise<{ error?: string; next?: string | string[] }>;
}) {
  const { error, next: rawNext } = await searchParams;
  const requested = Array.isArray(rawNext) ? rawNext[0] : rawNext;
  // `""` rather than the usual fallback: this screen needs to know whether a
  // destination was asked for at all, not merely what it resolves to.
  const validated = safeNextPath(requested, "");
  const next = validated && validated !== DEFAULT_NEXT ? validated : undefined;

  /**
   * ⚠️ ARRIVING FROM THE CHROME HANDOFF, WHICH NEEDS ITS OWN WORDS.
   *
   * Chrome on iPhone cannot add to the home screen, so the install step sends
   * people to Safari through Chrome's own share sheet. Safari keeps a SEPARATE
   * cookie jar, so they land here signed out — and "Welcome back" to somebody
   * who signed in ninety seconds ago in another app reads as the app having
   * lost them, or worse, as a phishing page. Adrian, watching it happen:
   * "I don't know what's going on, to be honest. This is too hard."
   *
   * Nothing new is threaded through the URL to detect it. The destination the
   * guard already attaches IS the signal, so there is no second parameter to
   * keep in sync with the first.
   */
  const fromInstall =
    next !== undefined &&
    next.startsWith("/onboarding") &&
    next.includes("step=install") &&
    // ⚠️ AND ONLY FROM CHROME. Without this the copy also greets somebody who
    // was in Safari the whole time and simply arrived signed out, explaining a
    // browser hop they never made. The marker is stamped by the install screen
    // itself, which is the only place that knows.
    next.includes("from=chrome");

  const { user, passedGate } = await getSessionContext();
  if (user) {
    // A live session never sees this screen. It still honours the destination —
    // arriving here signed in is what happens on a second tab, or a back button
    // after the redirect, and dropping the deep link there would be the same
    // bug one door along.
    if (passedGate) redirect(next ?? DEFAULT_NEXT);
    redirect(next ? `/welcome?next=${encodeURIComponent(next)}` : "/welcome");
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <Link href="/" aria-label="trackd co">
        <Image
          src="/trackd-wordmark.png"
          alt="trackd co"
          width={1049}
          height={200}
          priority
          className="h-4 w-auto"
        />
      </Link>

      {fromInstall ? (
        <>
          <span className="mt-12 flex size-14 items-center justify-center rounded-2xl border border-border-default bg-bg-surface">
            <SafariMark className="size-7" />
          </span>
          <h1 className="mt-6 text-balance text-[2rem] font-light leading-[1.05] tracking-[-0.02em] text-foreground">
            One more sign-in
          </h1>
          <p className="mt-3 max-w-[19rem] text-pretty text-[0.95rem] leading-relaxed text-text-muted">
            Safari keeps its own login, separate from Chrome. Sign in here and
            we&rsquo;ll take you straight back to adding Trackd.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-12 text-balance text-[2rem] font-light leading-[1.05] tracking-[-0.02em] text-foreground">
            Welcome back
          </h1>
          <p className="mt-3 max-w-[17rem] text-pretty text-[0.95rem] leading-relaxed text-text-muted">
            Sign in, or create an account to get started.
          </p>
        </>
      )}

      {error ? (
        <p
          role="alert"
          className="mt-6 max-w-[19rem] text-sm text-[var(--state-error)]"
        >
          Something went wrong signing you in. Please try again.
        </p>
      ) : null}

      <div className="mt-10 w-full max-w-[20rem]">
        <GoogleSignInButton next={next} />

        <div className="my-5 flex items-center gap-3" aria-hidden>
          <span className="h-[0.5px] flex-1 bg-border-default" />
          <span className="text-xs text-text-subtle">or</span>
          <span className="h-[0.5px] flex-1 bg-border-default" />
        </div>

        <EmailPasswordForm next={next} />

        <p className="mt-5 text-[0.7rem] leading-relaxed text-text-subtle">
          18+ only. By continuing you agree to our{" "}
          <Link href="/terms" className="text-text-muted hover:text-foreground">
            Terms
          </Link>
          ,{" "}
          <Link
            href="/privacy"
            className="text-text-muted hover:text-foreground"
          >
            Privacy Policy
          </Link>
          , and{" "}
          <Link
            href="/medical-disclaimer"
            className="text-text-muted hover:text-foreground"
          >
            Medical Disclaimer
          </Link>
          .
        </p>

        {/* The fourth document (v2.0). Named in full — see the note on the
            homepage link in `first-run.tsx` for why the wording is fixed. */}
        <p className="mt-1.5 text-[0.7rem] leading-relaxed text-text-subtle">
          <Link
            href="/consumer-health-data"
            className="text-text-muted hover:text-foreground"
          >
            Consumer Health Data Privacy Policy
          </Link>
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
