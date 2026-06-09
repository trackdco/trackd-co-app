import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSessionContext } from "@/lib/auth";
import { FirstRun } from "./_components/first-run";

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
 * Public entry screen — "First Run": an app-style swipeable onboarding (mobile),
 * built to move a visitor from curiosity → account.
 *
 * Mobile-only by intent: phones get the carousel; anything desktop-width gets a
 * minimal "open on your phone" gate (Trackd is a mobile PWA, and the founder
 * doesn't want the desktop experience).
 *
 * NOTE (auth unit): /login is a placeholder; the real Google sign-in + 18+/ToS
 * gate replaces it, and once auth exists this screen redirects a logged-in user
 * to /dashboard.
 */
export default async function Home() {
  // A live session never sees the landing — send them into the app (or the
  // 18+/ToS gate if they haven't passed it yet).
  const { user, passedGate } = await getSessionContext();
  if (user) {
    redirect(passedGate ? "/dashboard" : "/welcome");
  }

  return (
    <>
      {/* Mobile: the app */}
      <div className="md:hidden">
        <FirstRun />
      </div>

      {/* Desktop: this is a phone app — go to your phone */}
      <div className="hidden min-h-dvh flex-col items-center justify-center px-6 text-center md:flex">
        <span className="font-display text-3xl tracking-tight text-foreground">trackd<span className="text-accent-amber"> co</span></span>
        <h1 className="mt-10 font-display text-3xl text-foreground">Trackd is built for your phone</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-text-muted">
          Open <span className="text-foreground">trackdco.app</span> on your phone to get started.
        </p>
      </div>
    </>
  );
}
