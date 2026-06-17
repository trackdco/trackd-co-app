"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * "Continue with Google" — starts the OAuth (PKCE) flow from the browser client.
 *
 * @supabase/ssr defaults to PKCE and stores the code verifier in a cookie, so the
 * server-side /auth/callback route can complete the exchange. signInWithOAuth
 * redirects the browser itself on success; we only surface an error if the call
 * fails before the redirect. redirectTo points back at our callback on whatever
 * origin we're running on (localhost in dev, trackdco.app in prod) — both must be
 * allow-listed in the Supabase Auth redirect URLs.
 */
export function GoogleSignInButton({
  label = "Continue with Google",
  className,
  next,
}: {
  label?: string;
  className?: string;
  /** Internal path to land on after auth (threaded to /auth/callback?next=). */
  next?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback${
          next ? `?next=${encodeURIComponent(next)}` : ""
        }`,
      },
    });

    // No error => the browser is already navigating to Google; keep the spinner.
    if (error) {
      setError("Couldn't start sign-in. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <Button
        type="button"
        size="lg"
        onClick={signIn}
        disabled={loading}
        aria-busy={loading}
        className={
          className ??
          "h-12 w-full touch-manipulation select-none rounded-xl text-[0.95rem] transition-transform duration-100 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] motion-reduce:active:scale-100"
        }
      >
        {loading ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <GoogleMark />
        )}
        {loading ? "Connecting…" : label}
      </Button>
      {error ? (
        <p
          role="alert"
          className="mt-3 text-center text-sm text-[var(--state-error)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Official Google "G" mark — four brand colours mandated by Google, the one
 * allowed exception to the no-hardcoded-colour rule (third-party logo).
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
