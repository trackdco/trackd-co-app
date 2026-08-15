import "server-only";

import { serviceClient } from "./service";
import { stripe } from "./stripe";

/**
 * STOPPING A SUBSCRIPTION — the one place that talks to Stripe about it.
 *
 * Two callers, and they need different things:
 *
 *   - `app/(app)/billing/actions.ts` — a signed-in user pressing Cancel. Access
 *     is preserved to the end of what they already have, and it is undoable.
 *   - account deletion — the person is leaving and their rows are about to be
 *     erased. There is nothing to preserve, so it ends NOW.
 *
 * Splitting these is not a convenience. See {@link cancelNowForUser}: getting
 * the ORDER wrong around a deletion bills somebody who no longer has an account,
 * with nothing left in the database to connect the charge to them.
 */

export { CANCELLABLE_STATUSES } from "./manage";

/**
 * ⚠️ EVERY SUBSCRIPTION THAT CAN STILL TAKE MONEY, ACCORDING TO STRIPE.
 *
 * ## The bug this exists for, measured end to end
 *
 * A cold review drove two concurrent `startTrial` calls for DIFFERENT plans from
 * one signed-in user. The duplicate guard keys on `trial:${user}:${plan}`, so two
 * plans are two keys, and both reads passed before either write: **one user, two
 * live trials.**
 *
 * Everything downstream took `limit(1)` off the mirror. So:
 *
 *   1. `/billing` showed the wrong plan ($11.99/mo for a user on the $69.99/yr);
 *   2. Cancel cancelled the wrong subscription and returned `{ok: true}`;
 *   3. the mirror write bumped `updated_at` on the row it had just cancelled,
 *      which PINNED `limit(1)` to that dead row, so the screen swapped to
 *      "Restart my trial" and the cancel control was gone;
 *   4. the test clock rolled to day 8 and took **$69.99**.
 *
 * The user pressed Cancel, was told in writing they would not be charged, was
 * charged, and had no control left to try again.
 *
 * ## So: ask Stripe, and take ALL of them
 *
 * Two changes, both load-bearing. **Stripe rather than the mirror**, because the
 * mirror is written by a webhook that can be in flight, can have been left
 * `unattributed`, or can have 500'd — the same reason every handler in
 * `sync.ts` re-reads the live object. And **all of them, not one**: somebody
 * pressing Cancel means "stop billing me", not "stop billing me for whichever
 * row sorted first".
 *
 * The mirror is still what the SCREEN reads. It is display, and it does not
 * decide anything. This is the decision.
 */
export async function liveSubscriptionsForUser(
  userId: string,
  /**
   * ⚠️ WHICH QUESTION IS BEING ASKED. THE TWO CALLERS ASK DIFFERENT ONES.
   *
   * The default is "what could still take this person's money?", which is what
   * the deletion path needs: it calls `subscriptions.cancel()`, which Stripe
   * accepts on every one of these.
   *
   * The USER-FACING cancel path passes {@link CANCELLABLE_STATUSES} instead,
   * because it calls `subscriptions.update({cancel_at_period_end})` and Stripe
   * HARD-REFUSES that on a `paused` subscription. Sharing one set meant one
   * paused subscription on the customer made cancelling throw, every time,
   * with no way out of it from inside the app. See `manage.ts`.
   */
  statuses: ReadonlySet<string> = BILLABLE_STATUSES,
): Promise<string[]> {
  const { data, error } = await serviceClient()
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`billing_customers read failed for ${userId}: ${error.message}`);
  const customer = data?.stripe_customer_id;
  if (!customer) return [];

  // `status: "all"` then filtered here, rather than one request per status:
  // Stripe's list endpoint takes a single status, and asking for each of them
  // separately is three round-trips that can disagree with each other.
  const list = await stripe().subscriptions.list({
    customer,
    status: "all",
    limit: 100,
  });

  return list.data
    .filter((s) => statuses.has(s.status))
    .map((s) => s.id);
}

/**
 * Statuses that can still result in a charge.
 *
 * WIDER than {@link CANCELLABLE_STATUSES}, deliberately. That list is about what
 * a user may press a button on; this is about what could still take their money,
 * and `paused` and `unpaid` both can once Stripe resumes or retries them. A
 * cancel-before-delete that leaves either behind is the exact failure the
 * deletion path exists to prevent.
 *
 * ⚠️ EXPORTED, and `startTrial` reads the same set. The two questions are the
 * same question from opposite ends — "what would I have to stop?" and "what
 * stops me selling another one?" — and a status in one list but not the other
 * is, precisely, a subscription that can be created on top of an existing one
 * and then bills alongside it. `startTrial` used to check a narrower three, so a
 * `paused` or `unpaid` subscription did not block a second trial.
 */
export const BILLABLE_STATUSES: ReadonlySet<string> = new Set<string>([
  "trialing",
  "active",
  "past_due",
  "paused",
  "unpaid",
  /**
   * ⚠️ `incomplete` IS BILLABLE, and leaving it out was a real hole.
   *
   * It reads like "an attempt that did not happen", and it is not: Stripe keeps
   * an `incomplete` subscription's FIRST INVOICE PAYABLE for about 23 hours.
   * Anything that pays it — the customer finishing a 3DS challenge in another
   * tab, a retry, a dashboard action — turns it `active` immediately.
   *
   * A cold review drove it: seed an `incomplete` subscription (from the Stripe
   * dashboard, a webhook replay, an import — exactly the cases the reconcile
   * exists for), then `startTrial`. Neither the duplicate guard nor the
   * reconcile could SEE it, so a second subscription was created; paying the
   * first invoice then left **two live billable subscriptions on one user**,
   * which is the precise state that produced the $69.99 defect.
   *
   * It is worse on the deletion path. `cancelNowForUser` sweeps this same set
   * before an account is erased, and `billing_customers` cascades away with it —
   * so an `incomplete` subscription left behind bills a person whose only
   * mapping back to a Stripe customer has just been deleted.
   *
   * `incomplete_expired` is deliberately NOT here: Stripe has finished with
   * those and they can never charge.
   */
  "incomplete",
]);


/**
 * Set (or clear) `cancel_at_period_end` on a subscription, and mirror it.
 *
 * Takes an id that the CALLER has already proved belongs to whoever is asking.
 * It deliberately does not do that check itself: the user path resolves through
 * the session and RLS, the deletion path resolves through the service role, and
 * a function that accepted a user id from either would blur which check had
 * actually run.
 *
 * `entitlements` is not written. `active_until` already holds the date access
 * ends and `isEntitlementActive` lets the clock do the work, which is what makes
 * cancelling safe to offer in one tap.
 */
export async function applyCancelFlag(
  stripeSubscriptionId: string,
  cancelAtPeriodEnd: boolean,
): Promise<void> {
  const updated = await stripe().subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: cancelAtPeriodEnd,
  });

  const { error } = await serviceClient()
    .from("subscriptions")
    .update({ cancel_at_period_end: updated.cancel_at_period_end })
    .eq("stripe_subscription_id", stripeSubscriptionId);

  // Logged, not thrown. Stripe has accepted the change and it is real; failing
  // here would tell the user their cancellation did not go through when it did,
  // which is the worst available lie. The webhook reconciles a moment later.
  if (error) {
    console.error("[billing] mirror not updated after a cancel toggle:", error.message);
  }
}

/**
 * ⚠️ END EVERY SUBSCRIPTION THIS USER HAS, IMMEDIATELY. FOR ACCOUNT DELETION.
 *
 * ## Why this exists, and why the ORDER is not negotiable
 *
 * `billing_customers`, `subscriptions` and `entitlements` all declare
 * `on delete cascade` from `profiles (id)`. So deleting an account, on its own,
 * does all of this at once:
 *
 *   1. erases `billing_customers` — **the only mapping from a Stripe customer
 *      back to a TRACKD user**;
 *   2. leaves the Stripe subscription LIVE and still billing;
 *   3. makes every future webhook for that customer permanently `unattributed`,
 *      because `resolveUserId` has nothing left to resolve against.
 *
 * The result is somebody who deleted their account and keeps being charged, with
 * no row anywhere connecting the charge to them, and no way to find it except by
 * reading Stripe by hand. That is a chargeback with extra steps, and dispute rate
 * is the number that closes payment processor accounts.
 *
 * **Call this BEFORE deleting the user. Not after, and not instead.**
 *
 * ## Immediate, not at period end
 *
 * Everywhere else in this codebase a cancellation preserves what was paid for,
 * because the person keeps using the app. Here they do not: the account and its
 * data are going. There is no access to preserve, and leaving a subscription to
 * run out quietly after the account is gone is precisely the state described
 * above. Stripe does not refund the remainder and this does not ask it to; that
 * is a support decision, made by a person, with the invoice in front of them.
 *
 * ## Idempotent
 *
 * A subscription Stripe has already ended returns its `canceled` object rather
 * than erroring, and an account with no subscription returns an empty list. Safe
 * to run again if a deletion is retried.
 */
export async function cancelNowForUser(userId: string): Promise<{
  cancelled: string[];
  failed: string[];
}> {
  /**
   * ASKS STRIPE, NOT THE MIRROR.
   *
   * This read `subscriptions` and a cold review measured what that costs: with
   * one subscription mirrored and one not — the state that exists whenever a
   * webhook is in flight, was left `unattributed`, or 500'd — it returned
   * `{cancelled: [one], failed: []}`. A clean success, with a live subscription
   * still billing and the deletion flow cleared to proceed and cascade away the
   * only row connecting it to a person. Exactly the outcome this function's own
   * warning describes.
   *
   * Thrown rather than returned on failure: a deletion must be able to STOP.
   */
  const live = await liveSubscriptionsForUser(userId);

  const cancelled: string[] = [];
  const failed: string[] = [];
  for (const id of live) {
    try {
      await stripe().subscriptions.cancel(id);
      cancelled.push(id);
    } catch (err) {
      console.error(
        `[billing] could not cancel ${id} before deleting ${userId}:`,
        err instanceof Error ? err.message : String(err),
      );
      failed.push(id);
    }
  }

  if (failed.length > 0) {
    // Same reasoning as the read error. The caller must be able to STOP.
    throw new Error(
      `${failed.length} subscription(s) could not be cancelled for ${userId}: ${failed.join(", ")}. The account must NOT be deleted until these are ended, or they will bill with no way to attribute the charge.`,
    );
  }

  if (cancelled.length > 0) {
    console.warn(`[billing] cancelled ${cancelled.join(", ")} ahead of deleting ${userId}`);
  }
  return { cancelled, failed };
}
