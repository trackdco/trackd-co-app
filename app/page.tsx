import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Trackd Co — Track the whole protocol",
  description:
    "Log your whole stack in one place: anabolics, peptides, supplements and ancillaries. A private, founder-led app built by people who run real protocols.",
  openGraph: {
    title: "Trackd Co — Track the whole protocol",
    description:
      "Log your whole stack in one place: anabolics, peptides, supplements and ancillaries.",
    type: "website",
    url: "https://trackdco.app",
    siteName: "Trackd Co",
  },
};

/**
 * Public entry screen — "Cold Open": an app-style splash, not a marketing page.
 * One full screen on the near-black canvas: brand at the top, the promise in
 * the middle, a single bottom-anchored sign-in. On desktop it sits in a
 * phone-width column centred on the canvas.
 *
 * NOTE (auth unit): /login is a placeholder; the real Google sign-in + 18+/ToS
 * gate replaces it, and once auth exists this screen redirects a logged-in user
 * to /dashboard.
 */
export default function Home() {
  return (
    <div className="flex min-h-dvh justify-center bg-background">
      <main
        className="flex min-h-dvh w-full max-w-sm flex-col justify-between px-6 pt-20"
        style={{ paddingBottom: "max(2rem, calc(1rem + env(safe-area-inset-bottom)))" }}
      >
        {/* Brand */}
        <div className="text-center">
          <span className="font-display text-2xl tracking-tight text-foreground">trackd co</span>
        </div>

        {/* The promise */}
        <div className="text-center">
          <h1 className="font-display text-4xl leading-[1.05] text-foreground sm:text-5xl">
            Track the whole protocol
          </h1>
          <p className="mt-5 text-base leading-relaxed text-text-muted">
            Log your whole stack in one place: anabolics, peptides, supplements and ancillaries.
          </p>
          <p className="mt-7 inline-flex items-center gap-2 text-sm text-text-muted">
            <span className="size-1.5 rounded-full bg-accent-amber" aria-hidden="true" />
            Injection-site rotation tracker
          </p>
        </div>

        {/* Sign in */}
        <div className="text-center">
          <p className="mb-5 text-sm leading-relaxed text-text-muted">
            A private, founder-led app, built by people who run real protocols.
          </p>
          <Button asChild size="lg" className="w-full">
            <Link href="/login">
              <GoogleMark />
              Continue with Google
            </Link>
          </Button>
          <p className="mt-4 text-xs text-text-subtle">
            Free during the beta · 18+ ·{" "}
            <Link href="/terms" className="transition-colors hover:text-text-muted">
              Terms
            </Link>
            {" · "}
            <Link href="/privacy" className="transition-colors hover:text-text-muted">
              Privacy
            </Link>
          </p>
          <p className="mt-5 text-sm text-text-muted">
            Already have an account?{" "}
            <Link href="/login" className="text-foreground transition-colors hover:text-text-muted">
              Log in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

/**
 * Official Google "G" mark. The four brand colours are mandated by Google's
 * branding guidelines and cannot be tokenised — this is the one allowed
 * exception to the no-hardcoded-colour rule (a third-party logo, not theming).
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
