import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CostVariantPicker } from "@/components/onboarding/cost-picker";

export const metadata: Metadata = {
  title: "Cost screen options · Trackd Co",
  robots: { index: false, follow: false },
};

/**
 * A REVIEW HARNESS, not a shipping screen (Adrian, 2026-07-31).
 *
 * Four candidates for the cost screen, side by side at full size, so the choice
 * is made by looking rather than by reading a description. Whichever wins moves
 * into the flow and the other three are deleted along with this route.
 *
 * It sits under `/onboarding` so it inherits the desktop-gate exemption and can
 * be opened on a laptop as well as a phone.
 *
 * ## NOT REACHABLE IN PRODUCTION, and that is a compliance requirement
 *
 * A cold review found these three harnesses were public, un-age-gated and
 * crawlable (2026-08-05). They render substance-adjacent marketing copy —
 * compound spend tiers, "what dose were you on when bloods came back best" —
 * and they do NOT mount `OnboardingFlow`, so `clampStep` cannot reach them.
 * That is exactly the bypass class `lib/onboarding/steps.ts` documents at
 * length and closed for `?step=`; these reopened it at a different address.
 *
 * Gated on `VERCEL_ENV` rather than `NODE_ENV`, matching
 * `app/preview/containers/page.tsx`: a Vercel preview deploy IS a production
 * build, so a `NODE_ENV` gate would 404 the exact link these exist to be
 * reviewed through. `robots: noindex` on top, because a route that 404s in
 * production should never have been indexed from a preview either.
 */
export default function CostOptionsPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  return <CostVariantPicker />;
}
