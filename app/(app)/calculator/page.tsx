import type { Metadata } from "next";

import { ReconCalculator } from "@/components/home/ReconCalculator";

export const metadata: Metadata = { title: "Calculator — Trackd Co" };

/**
 * The reconstitution calculator's own screen — the centre bottom-nav slot's
 * destination (Spec 20). One of the four core differentiators, so it holds
 * permanent nav real estate rather than living only behind a quick action.
 *
 * A static screen with a large tab-scale heading (same size as Protocol /
 * Progress) — but a plain h1, NOT the scroll-away PageScrollTitle bar. The (app)
 * layout already enforced auth + the 18+/ToS gate. Reads nothing — the calculator
 * is pure arithmetic on what the user types, so this stays a static server shell
 * around the one client component.
 */
export default function CalculatorPage() {
  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5">
      <header className="animate-home-up px-1" style={{ animationDelay: "0ms" }}>
        <h1 className="font-sans text-4xl font-light tracking-tight text-foreground">
          Calculator
        </h1>
      </header>

      <div className="animate-home-up" style={{ animationDelay: "60ms" }}>
        <ReconCalculator />
      </div>
    </div>
  );
}
