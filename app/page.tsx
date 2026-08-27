import { redirect } from "next/navigation";

import { getSessionContext } from "@/lib/auth";

/**
 * ⚠️ NO `metadata` HERE ANY MORE. It moved to `app/onboarding/page.tsx`, which
 * is where a crawler following this redirect actually ends up. Metadata on a
 * route that only ever redirects is never rendered and would rot unnoticed.
 */

/**
 * The front door. It renders nothing — it decides where you belong.
 *
 * ## The onboarding flow IS the landing page now (Adrian, 2026-08-27)
 *
 * This used to render `FirstRun`, a swipeable carousel that existed to move a
 * visitor from curiosity to an account. It has been deleted, and the flow at
 * `/onboarding` does that job instead — the same job, done by the thing the
 * visitor is about to walk through anyway, rather than by a separate screen
 * that had to be kept in step with it by hand.
 *
 * ⚠️ THIS IS A PRODUCTION-FACING ROUTING CHANGE and it is deliberately sitting
 * on the billing branch rather than going to `main` on its own. Adrian's
 * intent: the new front door arrives at the same moment billing does, so the
 * site changes once rather than twice. Merging this branch is what makes it
 * live; nothing here takes effect before that.
 *
 * A redirect rather than rendering the flow here: `/onboarding` owns real
 * server work — the Stripe price load, trial eligibility, the `?step=` guard
 * and the age-gate clamp — and duplicating that at `/` would be two places to
 * get the protection right instead of one. The cost is a visible `/onboarding`
 * in the address bar, which is honest about where you are.
 */
export default async function Home() {
  // A live session never sees the flow — send them into the app (or the
  // 18+/ToS gate if they haven't passed it yet).
  const { user, passedGate } = await getSessionContext();
  if (user) {
    redirect(passedGate ? "/dashboard" : "/welcome");
  }

  redirect("/onboarding");
}
