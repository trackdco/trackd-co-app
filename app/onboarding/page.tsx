import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingFlow } from "@/components/onboarding/flow";
import { getSessionContext } from "@/lib/auth";
import { loadPricesSafe } from "@/lib/billing/prices";
import { isStepId, stepMeta, type StepId } from "@/lib/onboarding/steps";

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
  /**
   * `string | string[]`, and the array case is not theoretical — see
   * `requestedStep`. Typing it as `string` is what let the guard be walked past.
   */
  searchParams: Promise<{ step?: string | string[] }>;
}) {
  const { step } = await searchParams;
  const requested = requestedStep(step);

  const { user, passedGate } = await getSessionContext();
  const signedIn = Boolean(user);

  /**
   * THE PRICES COME FROM STRIPE, NOT FROM THE CODEBASE (spec w2b-15).
   *
   * Fetched here because three ANONYMOUS screens need them — the payoff
   * screen's weekly anchor and the cost comparison, both well before the
   * paywall — so they cannot wait for a session. Memoised for five minutes in
   * `lib/billing/prices.ts`, and `loadPricesSafe` swallows a Stripe outage:
   * this flow is free until the paywall and must not go down with a billing
   * provider.
   */
  const prices = await loadPricesSafe();

  /**
   * AN `authed` STEP NEEDS A PROVEN AGE, NOT MERELY A SESSION.
   *
   * This used to test `signedIn` alone, and a cold review showed that made the
   * 18+ gate satisfiable by MAKING AN ACCOUNT: sign up at `/login`, never touch
   * `/welcome`, and `?step=paywall` rendered. Spec §3.2 ("the age gate precedes
   * all substance-adjacent content and all payment") and §17 ("no payment path
   * bypasses the age gate") were both false, and it was a regression — on
   * `main` the paywall was an anonymous step and clamped to `name`.
   *
   * `passedGate` is `profiles.is_18_plus AND tos_accepted_at`, read server-side
   * by `getSessionContext`. It is the same predicate the whole `(app)` group
   * sits behind, so the paywall is now no more reachable than the dashboard.
   *
   * **A signed-in user who has not passed it goes to the ACCOUNT step, not to
   * the start.** That step is where the claim runs, and the claim is what writes
   * the gate from the answers they already gave — so this redirect is the
   * mechanism by which a legitimate new account becomes gated, not a rejection.
   * Someone with nothing to claim is sent on to `/welcome` by the account screen
   * itself.
   */
  if (requested && stepMeta(requested)?.phase === "authed" && !passedGate) {
    redirect(signedIn ? "/onboarding?step=account" : "/onboarding");
  }

  // A gated user has nothing left to do on the account screen, and showing a
  // sign-in form to someone already signed in is what §Back navigation calls out.
  if (passedGate && requested === "account") {
    redirect("/onboarding?step=paywall");
  }

  return (
    <OnboardingFlow
      signedIn={signedIn}
      passedGate={passedGate}
      prices={prices}
    />
  );
}

/**
 * THE UNTRUSTED `?step=`, RESOLVED THE SAME WAY THE CLIENT RESOLVES IT.
 *
 * A repeated query parameter arrives as a `string[]`, and this was typed and
 * treated as `string`. `isStepId(["paywall","paywall"])` is false — it tests
 * `typeof value === "string"` — so `requested` fell to `null` and EVERY guard
 * below short-circuited on it. Meanwhile the client reads
 * `new URLSearchParams(location.search).get("step")`, which returns the FIRST
 * value. So:
 *
 *     GET /onboarding?step=paywall              -> 307 /onboarding
 *     GET /onboarding?step=paywall&step=paywall -> 200, paywall renders
 *
 * with no cookies at all. One duplicated parameter walked past the whole of
 * §Route protection, and it is the assumption spec w2b-15 mounts a payment
 * element on.
 *
 * Taking `[0]` is not a guess: it is precisely what `URLSearchParams.get`
 * returns, so the server and the client now resolve the same step from the same
 * URL. Agreeing with the client is the requirement — a guard that reads a
 * different value than the thing it is guarding is not a guard.
 */
function requestedStep(step: string | string[] | undefined): StepId | null {
  const first = Array.isArray(step) ? step[0] : step;
  return isStepId(first) ? first : null;
}
