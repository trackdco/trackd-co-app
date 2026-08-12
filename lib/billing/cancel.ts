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

/**
 * The statuses a cancellation can act on.
 *
 * `past_due` is here on purpose. Somebody whose card is failing is among the
 * most likely to want out, and refusing them because a charge did not land would
 * be the app arguing about whether they may leave. Stripe accepts the change and
 * stops the dunning retries, which is the intent.
 */
export const CANCELLABLE_STATUSES = ["trialing", "active", "past_due"] as const;

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
  const db = serviceClient();
  const { data, error } = await db
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", userId);

  if (error) {
    // Thrown, unlike the mirror write above. A deletion must NOT proceed on the
    // assumption that there was nothing to cancel when the database would not
    // say. Failing loudly here leaves the account intact and billable, which is
    // recoverable; the alternative is not.
    throw new Error(`could not read subscriptions for ${userId}: ${error.message}`);
  }

  const live = (data ?? []).filter((r) =>
    (CANCELLABLE_STATUSES as readonly string[]).includes(r.status as string),
  );

  const cancelled: string[] = [];
  const failed: string[] = [];
  for (const row of live) {
    const id = row.stripe_subscription_id as string;
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
