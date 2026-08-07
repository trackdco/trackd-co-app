"use server";

import { getSessionContext } from "@/lib/auth";
import { serviceClient } from "@/lib/billing/service";
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

  // Guard against paying twice. Cheap, and the alternative is a second live
  // subscription on one account and a refund conversation.
  const existing = await activeStripeSubscription(user.id);
  if (existing) return { status: "already-subscribed" };

  try {
    const customerId = await findOrCreateCustomer(user.id, user.email);
    const client = stripe();

    const subscription = await client.subscriptions.create({
      customer: customerId,
      items: [{ price: priceIdFor(plan) }],
      trial_period_days: TRIAL_DAYS,
      // Nothing is owed today, so Stripe leaves the subscription incomplete
      // until the SetupIntent is confirmed. Without this it would activate with
      // no payment method attached and simply fail on day 7.
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      // No card confirmed by the end of the trial ⇒ cancel rather than bill a
      // method that was never verified.
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      // The webhook resolves the user from `billing_customers`; this is the
      // fallback for an event that outruns that row, which does happen because
      // Stripe fires webhooks concurrently with the call that creates the object.
      metadata: { user_id: user.id },
      expand: ["pending_setup_intent"],
    });

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
 * Does this user already have a Stripe subscription worth honouring?
 *
 * Reads the MIRROR, not `entitlements`, and that is deliberate: the question
 * here is "would starting another subscription double-charge them", which is a
 * question about Stripe. Access is a different question with a different table,
 * and conflating the two is exactly what this spec forbids.
 */
async function activeStripeSubscription(userId: string): Promise<boolean> {
  const { data } = await serviceClient()
    .from("subscriptions")
    .select("status")
    .eq("user_id", userId)
    .in("status", ["trialing", "active", "past_due"]);
  return (data?.length ?? 0) > 0;
}
