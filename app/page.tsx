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
 * Mobile-only by intent: phones get the carousel. The desktop "go to your phone"
 * gate is handled app-wide at ≥1024px by the root layout (DesktopInterstitial),
 * so this screen just renders the onboarding.
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

  return <FirstRun />;
}
