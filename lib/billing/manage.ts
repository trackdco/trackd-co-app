/**
 * WHAT THE BILLING SCREEN MAY OFFER — pure, so it can be tested without a
 * database, a session or a network. `lib/billing/access.ts` decides whether
 * somebody has access; this decides what they can DO about it.
 *
 * ## Why this is a function and not four `if`s in a component
 *
 * The answer depends on where the entitlement came from, and getting that wrong
 * is not a cosmetic bug. Offering "Cancel" to somebody whose subscription is an
 * App Store purchase would call Stripe about a subscription Stripe has never
 * heard of; offering it to a founder on a `comp` would offer to cancel nothing.
 * Both are one missing branch away, and neither would be caught by a type.
 *
 * ## The rule that outranks the rest of this file
 *
 * **A cancellation never revokes access.** It sets `cancel_at_period_end`, so
 * the user keeps what they already have — the rest of a paid month, or the rest
 * of a free trial — and simply is not charged again. `entitlements` is not
 * written by the cancel path at all: `active_until` already holds the right
 * date, and `isEntitlementActive` lets the clock do the work. That is the same
 * shape `endSubscription` documents in `sync.ts`, and it is why cancelling is
 * safe to make one tap.
 */

import type { EntitlementSource } from "./access";

/** The mirror row, as much as the screen needs. Never an access decision. */
export interface ManageableSubscription {
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * What control the Billing screen renders.
 *
 * `none` and `unavailable` are different on purpose. `none` is a founder on a
 * comp, where there is genuinely nothing to manage and saying so is correct.
 * `unavailable` is a subscription we can see but cannot act on, which is a
 * support case rather than a silent blank.
 */
export type ManageAction =
  | { kind: "cancel"; endsOn: string; isTrial: boolean }
  | { kind: "resume"; endsOn: string; isTrial: boolean }
  | { kind: "store"; store: "apple" | "google" }
  | { kind: "none"; reason: "comp" | "no-subscription" }
  | { kind: "unavailable"; reason: string };

/**
 * The statuses a cancellation can still act on.
 *
 * `past_due` is included deliberately. Somebody whose card is failing is one of
 * the people most likely to want out, and refusing them the button because a
 * charge did not go through would be the app arguing with them about whether
 * they may leave. Stripe accepts `cancel_at_period_end` on a `past_due`
 * subscription and stops the dunning retries, which is exactly the intent.
 */
const CANCELLABLE = new Set(["trialing", "active", "past_due"]);

/**
 * Which control to show, given where access came from and what Stripe mirrors.
 *
 * `source` comes from `entitlements`, never from the subscription. That ordering
 * matters: a user could hold a `comp` AND a lapsed Stripe row, and the thing
 * their access actually rests on is what the screen should describe.
 */
export function manageActionFor(
  source: EntitlementSource | null,
  subscription: ManageableSubscription | null,
): ManageAction {
  // A founder, a cofounder, a beta tester. Nothing to cancel, and offering a
  // cancel button would offer to end access that no subscription is paying for.
  if (source === "comp") return { kind: "none", reason: "comp" };

  // RevenueCat will write these rows when TRACKD reaches the App Store, and the
  // subscription belongs to Apple or Google. We cannot cancel it and must not
  // pretend to: the only honest control is a pointer at the right place.
  if (source === "apple") return { kind: "store", store: "apple" };
  if (source === "google") return { kind: "store", store: "google" };

  if (!subscription) return { kind: "none", reason: "no-subscription" };

  if (!CANCELLABLE.has(subscription.status)) {
    return { kind: "unavailable", reason: subscription.status };
  }

  const isTrial = subscription.status === "trialing";
  /**
   * WHEN ACCESS ACTUALLY RUNS OUT.
   *
   * The trial end while trialing, the period end once paying — the same choice
   * `entitledUntil` makes in `sync.ts`, for the same reason. Reading
   * `currentPeriodEnd` on a trialing subscription would name the date of the
   * first renewal rather than the date they stop being charged nothing.
   */
  const endsOn = (isTrial ? subscription.trialEndsAt : subscription.currentPeriodEnd)
    ?? subscription.currentPeriodEnd
    ?? subscription.trialEndsAt;

  if (!endsOn) {
    // Every branch below states a date out loud. A cancel confirmation that
    // cannot say when access ends is worse than no button.
    return { kind: "unavailable", reason: "no-period-end" };
  }

  return subscription.cancelAtPeriodEnd
    ? { kind: "resume", endsOn, isTrial }
    : { kind: "cancel", endsOn, isTrial };
}

/**
 * WHAT THE USER IS ON, IN ONE WORD OR TWO. The label Profile's pill and the
 * Billing screen both show.
 *
 * ## It reads `entitlements`, and no longer `profiles.tier`
 *
 * Profile hardcoded `"Beta · Pro"` from `profiles.tier` while `/billing` read
 * the entitlement, so one user could be told two different things on two
 * screens. `tier` is historical: `grants/003` locked it to the service role and
 * `architecture.md` makes `entitlements` the only table that decides access.
 * One function, both screens, one answer.
 *
 * ## The source is what matters, not the subscription's status
 *
 * A founder who also subscribes is on a `comp`, and describing them by the
 * subscription would be wrong. `strongestEntitlement` has already picked which
 * row their access actually rests on before this is called.
 */
export function planLabelFor(
  source: EntitlementSource | null,
  subscription: Pick<ManageableSubscription, "status"> | null,
): string {
  if (source === "comp") return "Complimentary";
  // A running trial says so whether or not the entitlement row has caught up.
  // The webhook writes that row moments after the subscription exists, and in
  // the gap the screen used to read "Pro" beside its own "Trial ends 19 Aug".
  if (subscription?.status === "trialing") return "Free trial";
  if (source) return "Pro";
  return NO_ENTITLEMENT_LABEL;
}

/**
 * ⚠️ WHAT SOMEBODY WITH NO ENTITLEMENT IS TOLD, AND WHY IT IS "Pro".
 *
 * It said "Beta · Pro". Adrian removed the beta (2026-08-12): "we won't be in
 * beta by then."
 *
 * "Pro" is the TRUE answer today and that is the only reason it is here.
 * **Nothing in the app reads `entitlements`** — `app/(app)/layout.tsx` gates on
 * session and age only — so all 106 accounts genuinely have the whole product,
 * entitlement row or not. Saying "Free" would be the app lying about what it is
 * currently giving away.
 *
 * **It stops being true the moment a gate is added.** Whoever wires
 * `hasProAccess` into the layout must change this in the same commit, or every
 * locked-out user will be looking at a screen that says they are on Pro. There
 * is no way to make this constant correct for both worlds, which is why it is a
 * named constant with this comment rather than a string inline.
 *
 * See `next-tasks.md` → "what current beta users see when we go public": the
 * real answer is probably a `comp` entitlement per existing account, at which
 * point every one of them has a source and this constant stops being reachable.
 */
const NO_ENTITLEMENT_LABEL = "Pro";

/**
 * A date for a human, in the user's own timezone.
 *
 * Takes the zone explicitly rather than reading the runtime's, because this is
 * rendered on a SERVER in whatever region Vercel chose and the date it prints is
 * the date somebody is deciding whether to be charged on.
 */
export function formatAccessDate(iso: string, tz: string): string {
  const when = new Date(Date.parse(iso));
  if (Number.isNaN(when.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(when);
}

/**
 * The same date with the YEAR DROPPED, for a control label.
 *
 * "Keep Trackd after 19 Aug" is a button, and a button is read at a glance. The
 * year is noise there: the date being named is inside the next twelve months by
 * construction (it is a trial end or a billing period end), so "2026" carries no
 * information and costs the label a third of its width on a 390px phone.
 *
 * Every place the date is the SUBJECT rather than a label — the confirm dialog,
 * the plan card, the sentence under the control — still uses the full form,
 * because that is where somebody is checking a date rather than reading a
 * button.
 *
 * Same timezone contract as `formatAccessDate`, and both are fed the same ISO
 * string, so the two forms cannot name different days.
 */
export function formatAccessDateShort(iso: string, tz: string): string {
  const when = new Date(Date.parse(iso));
  if (Number.isNaN(when.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    day: "numeric",
    month: "short",
  }).format(when);
}
