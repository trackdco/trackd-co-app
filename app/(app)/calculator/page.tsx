import type { Metadata } from "next";

import { PageScrollTitle } from "@/components/layout/PageScrollTitle";
import { ReconCalculator } from "@/components/calculator/ReconCalculator";
import {
  CalculatorBlocks,
  RouteHandoff,
  RouteTitle,
} from "@/components/feel/RouteSkeletons";

export const metadata: Metadata = { title: "Calculator · Trackd Co" };

/**
 * The reconstitution calculator's own screen — the centre bottom-nav slot's
 * destination (Spec 20). One of the four core differentiators, so it holds
 * permanent nav real estate rather than living only behind a quick action.
 *
 * Uses the shared `PageScrollTitle` like every other tab root: the large heading
 * scrolls away with the content and a slim "Calculator" bar fades in once it
 * leaves the top. Adrian, 2026-07-30 — the compact bar is wanted; the SYRINGE
 * following you down the page is not, so nothing inside the calculator is
 * sticky. No subtitle: the screen explains itself.
 *
 * The (app) layout already enforced auth + the 18+/ToS gate. Reads nothing — the
 * calculator is pure arithmetic on what the user types, so this stays a static
 * server shell around the one client component.
 */
export default function CalculatorPage() {
  return (
    <div
      data-screen="calculator"
      className="relative mx-auto w-full max-w-md space-y-5 px-5 pt-4 pb-5"
    >
      <RouteTitle id="calculator">
        <PageScrollTitle title="Calculator" />
      </RouteTitle>
      <RouteHandoff id="calculator">
        <CalculatorBlocks />
      </RouteHandoff>

      {/* No wrapper animation: the calculator staggers its own sections in with
          `animate-home-up`, the way Home and Protocol stagger their cards. */}
      <ReconCalculator />
    </div>
  );
}
