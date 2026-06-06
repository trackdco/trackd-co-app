import type { Metadata } from "next";

import { LockedShell } from "./_components/locked-shell";

export const metadata: Metadata = {
  title: "Trackd Co — Track the whole protocol",
  description:
    "Everything you're running, in one place you'll actually open. A private, founder-led app built by people who run real protocols.",
  openGraph: {
    title: "Trackd Co — Track the whole protocol",
    description: "Everything you're running, in one place you'll actually open.",
    type: "website",
    url: "https://trackdco.app",
    siteName: "Trackd Co",
  },
};

/**
 * Public entry screen — "Locked Shell": opens onto a blurred, locked glimpse of
 * the real app behind a bottom sign-in sheet, so curiosity drives the signup.
 *
 * Mobile-only by intent: phones get the app; anything desktop-width gets a
 * minimal "open on your phone" gate (Trackd is a mobile PWA, and the founder
 * doesn't want the desktop experience).
 *
 * NOTE (auth unit): /login is a placeholder; the real Google sign-in + 18+/ToS
 * gate replaces it, and once auth exists this screen redirects a logged-in user
 * to /dashboard.
 */
export default function Home() {
  return (
    <>
      {/* Mobile: the app */}
      <div className="md:hidden">
        <LockedShell />
      </div>

      {/* Desktop: this is a phone app — go to your phone */}
      <div className="hidden min-h-dvh flex-col items-center justify-center px-6 text-center md:flex">
        <span className="font-display text-3xl tracking-tight text-foreground">trackd co</span>
        <h1 className="mt-10 font-display text-3xl text-foreground">Trackd is built for your phone</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-text-muted">
          Open <span className="text-foreground">trackdco.app</span> on your phone to get started.
        </p>
      </div>
    </>
  );
}
