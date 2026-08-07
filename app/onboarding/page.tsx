import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingFlow } from "@/components/onboarding/flow";
import { getCurrentUser } from "@/lib/auth";
import { isStepId, stepMeta } from "@/lib/onboarding/steps";

export const metadata: Metadata = {
  title: "Get started · Trackd Co",
  description:
    "See how Trackd tracks a protocol before you make an account. No sign-up needed.",
};

/**
 * `/onboarding` — the first-run flow (Spec 3-01, amended by Spec w2b-14).
 *
 * PUBLIC AND ANONYMOUS FOR MOST OF ITS LENGTH, by design. It sits OUTSIDE the
 * `app/(app)/` route group on purpose: that group's layout is the auth +
 * 18+/ToS guard, and the whole pre-account half of this flow has to be reachable
 * with no session at all.
 *
 * ## What this server component now decides, and why it has to be this one
 *
 * The flow is ONE client tree and advances with `history.pushState`, so no
 * ordinary navigation inside it touches a server. The only requests that reach
 * here are the ones that matter for protection: a typed URL, a bookmark, a
 * shared link, a reload, and the 302 that ends every auth round-trip. Two rules
 * are applied to those, and both are enforced HERE rather than in the client,
 * because a client-side redirect is not protection:
 *
 *   1. **An `authed` step with no session goes back to the start of the flow** —
 *      not to the account screen. Arriving at a bare account screen with no
 *      answers to save makes no sense, and the paywall in particular must never
 *      render for an anonymous visitor: spec w2b-15 mounts a real payment
 *      element on it.
 *   2. **A signed-in user on the account screen goes straight to the paywall.**
 *      There is nothing left to ask them, and showing a sign-in form to someone
 *      already signed in is the specific thing spec §Back navigation calls out.
 *
 * `signedIn` is then handed to the flow so its clamps can tell a verified
 * session from an empty `localStorage` — see `clampStep`, which cannot make that
 * distinction on its own and would otherwise lock a paying customer out of the
 * screen they just paid on.
 *
 * ## The session is resolved on EVERY load, including the anonymous ones
 *
 * It would be cheaper to look only when the requested step needs an answer. It
 * would also be wrong: `signedIn` changes what the client clamps do and what
 * `goNext` skips, so a page that renders the flow without it renders a flow that
 * believes nobody is signed in. `getCurrentUser` is request-`cache()`d, so this
 * is one `getUser()` per request and it is shared with anything else that asks.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { step } = await searchParams;
  const requested = isStepId(step) ? step : null;

  const user = await getCurrentUser();
  const signedIn = Boolean(user);

  if (!signedIn && requested && stepMeta(requested)?.phase === "authed") {
    redirect("/onboarding");
  }
  if (signedIn && requested === "account") {
    redirect("/onboarding?step=paywall");
  }

  return <OnboardingFlow signedIn={signedIn} />;
}
