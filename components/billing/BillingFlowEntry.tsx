import { redirect } from "next/navigation";

import { OnboardingFlow } from "@/components/onboarding/flow";
import { getSessionContext } from "@/lib/auth";
import { loadPricesSafe } from "@/lib/billing/prices";
import { onboardingDates } from "@/lib/onboarding/flowEntryDates";
import { trialEligibility } from "@/app/onboarding/billing-actions";
import type { StepId } from "@/lib/onboarding/steps";

/**
 * THE BILLING-SIDE ENTRY INTO THE PLAN AND CARD SCREENS.
 *
 * Mounted by `/plans` and `/checkout` — the routes a person with an ACCOUNT
 * reaches from `/billing`, as opposed to `/onboarding?step=`, which is for
 * somebody still signing up.
 *
 * ## ⚠️ IT MOUNTS THE SAME FLOW, DELIBERATELY
 *
 * Everything below is the same server work `app/onboarding/page.tsx` does, from
 * the same functions: the same `trialEligibility`, the same `loadPricesSafe`,
 * the same `onboardingDates`. The ONLY difference handed to the flow is
 * `chrome="billing"`, which drops the progress rail and stops the URL being
 * rewritten to `?step=`.
 *
 * A second implementation of the screen that takes money is how two surfaces
 * end up quoting two prices, or promising two different first-charge dates. The
 * date function was extracted rather than copied for exactly that reason — see
 * `lib/onboarding/flowEntryDates.ts`.
 *
 * ## ⚠️ SIGNED IN IS REQUIRED HERE, UNLIKE `/onboarding`
 *
 * `/onboarding` is reachable by a stranger; that is its job. These routes are
 * not. They are the billing section's own screens, they sit behind the same
 * session every other `(app)` route does, and somebody arriving without one is
 * sent to `/login` rather than dropped into a sign-up flow they did not ask for.
 */
export async function BillingFlowEntry({ startAt }: { startAt: StepId }) {
  const { user, passedGate } = await getSessionContext();
  if (!user) redirect("/login");

  const prices = await loadPricesSafe();
  const eligibility = await trialEligibility();
  const { firstChargeOn, graceEndsOn } = await onboardingDates(
    true,
    eligibility.graceEndsAt,
  );

  return (
    <OnboardingFlow
      signedIn
      passedGate={passedGate}
      prices={prices}
      eligibility={eligibility}
      firstChargeOn={firstChargeOn}
      graceEndsOn={graceEndsOn}
      chrome="billing"
      startAt={startAt}
    />
  );
}
