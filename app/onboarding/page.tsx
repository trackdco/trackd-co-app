import type { Metadata } from "next";

import { OnboardingFlow } from "@/components/onboarding/flow";

export const metadata: Metadata = {
  title: "Get started · Trackd Co",
  description:
    "See how Trackd tracks a protocol before you make an account. No sign-up needed.",
};

/**
 * `/onboarding` — the first-run flow (Spec 3-01).
 *
 * PUBLIC and ANONYMOUS by design. It sits OUTSIDE the `app/(app)/` route group
 * on purpose: that group's layout is the auth + 18+/ToS guard, and this flow
 * has to be reachable with no session at all. The whole pre-paywall half runs
 * with no account, which is the point.
 *
 * Nothing here writes to Postgres. The anonymous session lives on the device
 * (`lib/onboarding/session.ts`) until the paywall produces an account to merge
 * it onto.
 *
 * The existing `/login` screen is untouched and is still the front door. This
 * route is additive until Adrian decides to point new visitors at it.
 */
export default function OnboardingPage() {
  return <OnboardingFlow />;
}
