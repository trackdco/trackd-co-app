import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingFlow } from "@/components/onboarding/flow";
import { getSessionContext } from "@/lib/auth";
import { loadPricesSafe } from "@/lib/billing/prices";
import { trialEligibility } from "./billing-actions";
import { resolveStepId, stepMeta, type StepId } from "@/lib/onboarding/steps";
import { onboardingDates } from "@/lib/onboarding/flowEntryDates";

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
   * Fetched here because ANONYMOUS screens need them — the cost comparison,
   * well before the paywall — so they cannot wait for a session. (The payoff
   * screen's weekly anchor was the other caller; that screen was deleted on
   * 2026-08-27.) Memoised for five minutes in
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
    redirect("/plans");
  }

  /**
   * ⚠️ AN ESTABLISHED ACCOUNT NEVER SEES THE ONBOARDING PLAN OR CARD STEP
   * (Adrian, 2026-08-25).
   *
   * `/plans` and `/checkout` exist so somebody who signed up in June is not
   * shown a sign-up progress bar reading "73%". Nothing automatic points at
   * `?step=plans` any more — but a bookmark, an old link or a typed URL still
   * could, and there they would get exactly the chrome those routes were built
   * to remove.
   *
   * So the old address redirects rather than being left to rot. One canonical
   * screen per audience: the flow for people still signing up, `/plans` and
   * `/checkout` for people who already have an account.
   */
  if (passedGate && (requested === "plans" || requested === "start")) {
    redirect(requested === "plans" ? "/plans" : "/checkout");
  }

  /**
   * ⚠️ ELIGIBILITY IS RESOLVED HERE, NOT IN AN EFFECT (spec 02b §3.6).
   *
   * The checkout screen used to mount with the generous default — eligible,
   * seven days — and correct itself when a client-side call returned. While the
   * sheet was setup-only that was a brief cosmetic flicker. With `02a` shipped
   * it is a PAYMENT SCREEN that can say "7 days free" and then "First charge
   * today" a moment later, while somebody is reading it, and the Elements mode
   * is derived from the same answer.
   *
   * Resolving it at page render removes the flicker outright and means the copy
   * and the mode are decided from one answer at one moment.
   *
   * ## The cost, named rather than hidden
   *
   * It adds a Stripe round trip to first paint FOR A USER WHO HAS A BILLING
   * CUSTOMER. A user with none never touches Stripe, which is most first-timers,
   * and `trialEligibility` short-circuits on Postgres before it. Correctness on
   * the screen that takes money is worth the milliseconds; the alternative is a
   * promise that mutates while somebody reads it.
   *
   * The generous fallback is unchanged and lives inside `trialEligibility`, so a
   * failure here still errs towards promising a trial — and `02a`'s mismatch
   * guard is what catches the case where that generous answer and the server's
   * later one disagree, by cancelling rather than charging.
   */
  const eligibility = await trialEligibility();

  /**
   * ⚠️ THE FIRST-CHARGE DATE IS RESOLVED HERE, NOT IN THE BROWSER (§3.5).
   *
   * It was `billingDate(new Date())`, computed on mount in the DEVICE's
   * timezone — while every screen on `/billing` formats the same kind of date
   * server-side in the user's STORED timezone. The two disagreed for anyone
   * travelling, and the paywall computed its own on its own mount, so the two
   * onboarding screens could disagree with each other across midnight.
   *
   * One value, from one function, feeding both screens, through the same
   * `formatAccessDate` `/billing` uses — so a date cannot differ depending on
   * which screen printed it.
   *
   * ## It is still a PROJECTION, and saying so is the honest part
   *
   * The subscription does not exist yet — nothing is created until the button is
   * pressed — so before purchase this is necessarily a prediction. What this
   * removes is the device-timezone divergence and the two-screens problem. What
   * it cannot remove is somebody reading at 23:58 and pressing at 00:02. That
   * residual is accepted and is exactly why every date shown AFTER the
   * subscription exists comes from Stripe rather than from here.
   *
   * The MID-GRACE variant is exempt: its date is a stored `active_until`, not a
   * projection, and it is formatted through this same function below.
   */
  const { firstChargeOn, graceEndsOn } = await onboardingDates(
    signedIn,
    eligibility.graceEndsAt,
  );

  return (
    <OnboardingFlow
      signedIn={signedIn}
      passedGate={passedGate}
      prices={prices}
      eligibility={eligibility}
      firstChargeOn={firstChargeOn}
      graceEndsOn={graceEndsOn}
    />
  );
}

/**
 * THE UNTRUSTED `?step=`, RESOLVED THE SAME WAY THE CLIENT RESOLVES IT.
 *
 * A repeated query parameter arrives as a `string[]`, and this was typed and
 * treated as `string`. `isStepId(["plans","plans"])` is false — it tests
 * `typeof value === "string"` — so `requested` fell to `null` and EVERY guard
 * below short-circuited on it. Meanwhile the client reads
 * `new URLSearchParams(location.search).get("step")`, which returns the FIRST
 * value. So:
 *
 *     GET /onboarding?step=plans            -> 307 /onboarding
 *     GET /onboarding?step=plans&step=plans -> 200, the price list renders
 *
 * with no cookies at all. One duplicated parameter walked past the whole of
 * §Route protection, and it is the assumption spec w2b-15 mounts a payment
 * element on.
 *
 * Taking `[0]` is not a guess: it is precisely what `URLSearchParams.get`
 * returns, so the server and the client now resolve the same step from the same
 * URL. Agreeing with the client is the requirement — a guard that reads a
 * different value than the thing it is guarding is not a guard.
 *
 * `resolveStepId`, not `isStepId`, so the retired `paywall` / `checkout` ids
 * still resolve. The CLIENT resolves them the same way — see `resolveStep` in
 * `flow.tsx` — which keeps the two agreeing about what a URL means, and that
 * agreement is the whole guarantee this function exists for.
 */
function requestedStep(step: string | string[] | undefined): StepId | null {
  const first = Array.isArray(step) ? step[0] : step;
  return resolveStepId(first);
}

/**
 * THE TWO DATES THE ONBOARDING FLOW PRINTS, both formatted in the user's stored
 * timezone through the same `formatAccessDate` that `/billing` uses (§3.5).
 *
 * ⚠️ NOT A COMPONENT, and the clock is read HERE rather than in the page body,
 * because `react-hooks/purity` forbids an impure call during render — and it is
 * right to: a value re-read on a re-render is a date that can move under
 * somebody mid-read.
 *
 * `firstChargeOn` is a PROJECTION and `graceEndsOn` is not. The first predicts
 * where a trial that does not exist yet will end; the second formats a stored
 * `active_until` that `01` has already committed to. That difference is why a
 * mid-grace user's date can never be earlier than what they were promised.
 *
 * Anonymous callers skip the query entirely: most of this flow has no session,
 * and the dates only matter from the paywall onward.
 */
