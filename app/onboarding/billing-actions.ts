"use server";

import { getSessionContext } from "@/lib/auth";
import { hasProAccess } from "@/lib/billing/entitlements";
import { serviceClient } from "@/lib/billing/service";
import type Stripe from "stripe";

import { priceIdFor, stripe, type PlanKey } from "@/lib/billing/stripe";
import { TRIAL_DAYS } from "@/lib/onboarding/pricing";

/**
 * START THE TRIAL (Spec w2b-15, step 6).
 *
 * Finds or creates the Stripe customer, creates a subscription with a
 * {@link TRIAL_DAYS}-day trial, and hands back the client secret the Payment
 * Element needs.
 *
 * ## Why a SetupIntent and not a PaymentIntent
 *
 * The amount due today is zero, so Stripe has nothing to charge and returns a
 * `pending_setup_intent` instead. The client confirms THAT. Which is better than
 * a workaround: confirming a SetupIntent runs 3D Secure bank verification while
 * the user is present and paying attention, so the day-7 charge is far more
 * likely to succeed than one attempted overnight against a card the bank has
 * never been asked about.
 *
 * ## This grants nothing
 *
 * It creates billing objects. Access comes from the webhook writing
 * `entitlements`, and from nowhere else — the client's success callback proves a
 * card was accepted and proves nothing about entitlement.
 */

export type StartTrialResult =
  | { status: "ok"; clientSecret: string; subscriptionId: string }
  /** Already entitled. The caller should move them into the app, not charge them. */
  | { status: "already-subscribed" }
  | { status: "error"; message: string };

export async function startTrial(plan: PlanKey): Promise<StartTrialResult> {
  const { user, passedGate } = await getSessionContext();
  if (!user) return { status: "error", message: "Please sign in again." };

  /**
   * THE AGE GATE, ON THE PAYMENT PATH.
   *
   * Carried in from spec w2b-14 and NOT optional. Rendering the paywall does not
   * re-check the age — a signed-in account can reach that screen — so this
   * endpoint is where §3.2's "the age gate precedes all payment" is actually
   * enforced. A server action is a public endpoint: the screen's own guard is
   * not a guard.
   */
  if (!passedGate) {
    return {
      status: "error",
      message: "Please confirm your details before starting a trial.",
    };
  }

  try {
    const customerId = await findOrCreateCustomer(user.id, user.email);
    const client = stripe();
    const wantedPrice = priceIdFor(plan);

    /**
     * WHAT IS ALREADY ON THIS CUSTOMER — asked of STRIPE, not of the mirror.
     *
     * The guard used to count `subscriptions` rows with status `trialing`, and a
     * cold review turned that into the worst bug in the flow. The mirror row is
     * written for a subscription whose card was NEVER validated (only the
     * entitlement is withheld), so:
     *
     *   1. Someone starts a trial, the bank opens a 3D Secure challenge, they
     *      close the tab. A `trialing` mirror row now exists with an
     *      unconfirmed SetupIntent and no payment method.
     *   2. They come back and pick a DIFFERENT plan.
     *   3. The guard sees `trialing`, answers "already subscribed", and the UI
     *      walks them to "You're in!" — **in 746ms, having taken no card**, on
     *      the plan they did not choose, at a price they were not shown.
     *   4. On day 7 `missing_payment_method: cancel` silently cancels them,
     *      against a screen that promised a charge on that date.
     *
     * Stripe is the only place that knows whether a subscription is real, so it
     * is asked. `incomplete` is deliberately included in the list retrieved:
     * those are exactly the abandoned attempts that have to be found.
     */
    const { data: existing } = await client.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 20,
      expand: ["data.pending_setup_intent"],
    });

    const live = existing.filter((sub) =>
      ["trialing", "active", "past_due"].includes(sub.status),
    );

    // A subscription with a card behind it. Nothing more to sell them.
    if (live.some(hasValidatedCard)) return { status: "already-subscribed" };

    /**
     * An ABANDONED attempt — trialing, but the card step never completed.
     *
     * If it is for the plan they are asking for again, hand back its existing
     * SetupIntent so they simply finish what they started. If it is for a
     * different plan, cancel it: they have chosen something else, and leaving it
     * would both block them and quietly bill the wrong thing at the trial end.
     */
    for (const abandoned of live) {
      const samePlan = abandoned.items.data[0]?.price?.id === wantedPrice;
      const secret =
        abandoned.pending_setup_intent &&
        typeof abandoned.pending_setup_intent !== "string"
          ? abandoned.pending_setup_intent.client_secret
          : null;

      if (samePlan && secret) {
        return {
          status: "ok",
          clientSecret: secret,
          subscriptionId: abandoned.id,
        };
      }
      await client.subscriptions.cancel(abandoned.id).catch((err) => {
        console.error(
          `[billing] could not cancel abandoned ${abandoned.id}:`,
          err instanceof Error ? err.message : String(err),
        );
      });
    }

    const subscription = await client.subscriptions.create(
      {
        customer: customerId,
        items: [{ price: wantedPrice }],
        trial_period_days: TRIAL_DAYS,
        // Nothing is owed today, so Stripe leaves the subscription incomplete
        // until the SetupIntent is confirmed. Without this it would activate
        // with no payment method attached and simply fail on day 7.
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
        // No card confirmed by the end of the trial ⇒ cancel rather than bill a
        // method that was never verified.
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
        // The webhook resolves the user from `billing_customers`; this is the
        // fallback for an event that outruns that row, which does happen because
        // Stripe fires webhooks concurrently with the call that creates it.
        metadata: { user_id: user.id },
        expand: ["pending_setup_intent"],
      },
      {
        /**
         * ONE SUBSCRIPTION PER USER PER PLAN, enforced by Stripe.
         *
         * A cold review fired five concurrent calls on one session and got FIVE
         * trialing subscriptions, because the duplicate guard is a read followed
         * by a write and the mirror it read is only written by the webhook
         * seconds later. An idempotency key closes the double-tap — by far the
         * common case — without a lock: Stripe returns the FIRST subscription
         * for a repeat of the same key.
         */
        idempotencyKey: `trial:${user.id}:${plan}`,
      },
    );

    const setupIntent = subscription.pending_setup_intent;
    const clientSecret =
      setupIntent && typeof setupIntent !== "string"
        ? setupIntent.client_secret
        : null;

    if (!clientSecret) {
      // Would mean Stripe created something other than a trialing subscription
      // — a paid trial, or a price with an amount due today. Surfaced rather
      // than papered over: the user must not be shown a payment form that
      // cannot complete.
      console.error(
        `[billing] no pending_setup_intent on ${subscription.id} (status ${subscription.status})`,
      );
      return { status: "error", message: "Couldn't start your trial just now." };
    }

    return { status: "ok", clientSecret, subscriptionId: subscription.id };
  } catch (err) {
    console.error(
      "[billing] startTrial failed:",
      err instanceof Error ? err.message : String(err),
    );
    // Deliberately generic. A Stripe error string can name the account, the
    // customer or the price, and none of that belongs on a paywall.
    return { status: "error", message: "Couldn't start your trial just now." };
  }
}

/**
 * The user's Stripe customer id, created on first use.
 *
 * `billing_customers` is the mapping and `stripe_customer_id` is UNIQUE, so a
 * double-tap that races here cannot end with two customers for one user: the
 * second insert loses and re-reads the winner.
 */
async function findOrCreateCustomer(
  userId: string,
  email: string | undefined,
): Promise<string> {
  const db = serviceClient();

  const { data: existing } = await db
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  const customer = await stripe().customers.create({
    email,
    // So a human looking at the Stripe dashboard can tell who this is without
    // a second lookup. Stripe metadata is not user-visible.
    metadata: { user_id: userId },
  });

  const { error } = await db
    .from("billing_customers")
    .insert({ user_id: userId, stripe_customer_id: customer.id });

  if (error) {
    if (error.code === "23505") {
      // Another request won the race. Theirs is the customer of record; ours is
      // an orphan in Stripe, which is harmless (no subscription, no charge) and
      // far better than two customers both believing they are the mapping.
      const { data } = await db
        .from("billing_customers")
        .select("stripe_customer_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (data?.stripe_customer_id) return data.stripe_customer_id;
    }
    throw new Error(`billing_customers insert: ${error.message}`);
  }

  return customer.id;
}

/**
 * Does this Stripe subscription have a card behind it?
 *
 * The same rule as `cardIsValidated` in `lib/billing/sync.ts`, and it has to
 * agree with it: that one decides whether to GRANT access, this one decides
 * whether to refuse a second subscription. If they disagreed, a user could be
 * simultaneously "already subscribed" and unentitled — which is precisely the
 * state the abandoned-3DS bug left people in.
 *
 * Anything past `trialing` has had money move, so it counts regardless.
 */
function hasValidatedCard(sub: Stripe.Subscription): boolean {
  if (sub.status !== "trialing") return true;
  if (sub.default_payment_method || sub.default_source) return true;
  return !sub.pending_setup_intent;
}

/**
 * Has the webhook landed yet? (Spec w2b-15, step 9.)
 *
 * There is typically a one-to-three second gap between the card confirming and
 * the webhook arriving. The user must not be dropped into the app during that
 * window and shown the paywall they just paid to escape — so the client holds
 * and asks this until it turns true.
 *
 * Reads `entitlements` through the same function every gate uses. Deliberately
 * not a faster, looser check: if this said yes while the real gate said no, the
 * holding state would hand the user straight into a redirect back to the paywall,
 * which is the exact failure it exists to prevent.
 */
export async function hasEntitlement(): Promise<boolean> {
  return hasProAccess();
}
