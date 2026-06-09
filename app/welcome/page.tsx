import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSessionContext } from "@/lib/auth";
import { GateForm } from "./gate-form";

export const metadata: Metadata = {
  title: "Welcome — Trackd Co",
};

/**
 * One-time 18+/ToS interstitial shown after first sign-in. Google gives us a
 * name and email but not age or consent, so we collect those here before any app
 * access. Guards:
 *  - no session -> /login
 *  - already passed the gate -> /dashboard (this screen is one-time only)
 */
export default async function WelcomePage() {
  const { user, passedGate } = await getSessionContext();
  if (!user) redirect("/login");
  if (passedGate) redirect("/dashboard");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <span className="font-display text-lg font-medium tracking-[-0.01em] text-foreground">
        trackd<span className="text-accent-amber"> co</span>
      </span>

      <h1 className="mt-12 text-balance font-display text-[2rem] font-medium leading-[1.05] tracking-[-0.02em] text-foreground">
        One quick thing
      </h1>
      <p className="mt-3 max-w-[18rem] text-pretty text-[0.95rem] leading-relaxed text-text-muted">
        Confirm your age and agree to the basics, then you&apos;re in.
      </p>

      <GateForm />
    </div>
  );
}
