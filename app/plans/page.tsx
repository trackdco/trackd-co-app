import type { Metadata } from "next";

import { BillingFlowEntry } from "@/components/billing/BillingFlowEntry";

export const metadata: Metadata = { title: "Choose a plan · Trackd Co" };

/**
 * `/plans` — THE PLAN SCREEN FOR SOMEBODY WHO ALREADY HAS AN ACCOUNT.
 *
 * ## Why this exists rather than another `?step=`
 *
 * Every route into the plan screen used to be `/onboarding?step=plans`, which
 * meant a paying customer tapping "Choose a plan" from `/billing` was sent into
 * the ONBOARDING FLOW — progress rail, percentage and all. The contact sheet
 * made it plain: a screen telling somebody they are "73%" through signing up,
 * shown to somebody who signed up in June.
 *
 * Adrian's ruling, 2026-08-23: *"if it's in the billing section then it's not
 * the same as the onboarding. It should do exactly the same thing, but it should
 * have its own kind of screen and also URL. We don't want the people who are on
 * the billing screen to try to change their billing and go back to the
 * onboarding one all the time, because I find there could be glitches there."*
 *
 * ## ⚠️ IT IS THE SAME SCREEN, NOT A COPY OF IT
 *
 * A second implementation of a screen that takes money is exactly how two
 * surfaces drift into quoting two prices, and this file would be the place it
 * happened. So the flow, the screens, the eligibility resolution and the Stripe
 * calls are the SAME ones `/onboarding` mounts — only the header differs, via
 * `chrome="billing"`. See `BillingFlowEntry`.
 */
export default function PlansPage() {
  return <BillingFlowEntry startAt="plans" />;
}
