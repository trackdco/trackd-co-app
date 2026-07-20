"use server";

import { headers } from "next/headers";

import {
  BETA_TRIAL_DAYS,
  PRICE_ID,
  TRIAL_DAYS,
  type Cadence,
} from "@/lib/stripe/config";
import { stripe, stripeConfigured } from "@/lib/stripe/server";
import { createClient } from "@/lib/supabase/server";

export type CheckoutResult = { url?: string; error?: string };

/** Absolute origin for Stripe return URLs, derived from the incoming request. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

/**
 * Resolve an optional access code to a trial length. A valid beta code extends
 * the trial to two weeks; an unrecognised code is rejected so a typo can't
 * silently fall through to the standard trial. Empty / absent = standard trial.
 * Compared case-insensitively against a SERVER-ONLY env var (never NEXT_PUBLIC).
 */
function resolveTrial(
  code: string | undefined,
): { trialDays: number } | { error: string } {
  const entered = code?.trim().toUpperCase();
  if (!entered) return { trialDays: TRIAL_DAYS };
  const beta = process.env.BETA_ACCESS_CODE?.trim().toUpperCase();
  if (beta && entered === beta) return { trialDays: BETA_TRIAL_DAYS };
  return { error: "That code isn't valid." };
}

/**
 * Start a Stripe Checkout session for a subscription. Identity comes from the
 * verified session, never the client. Both cadences start a 5-day free trial (a
 * valid beta code extends it to two weeks); the card is collected and first
 * charged when the trial ends. Returns a hosted Checkout URL, or a friendly
 * error — never throws (action convention).
 */
export async function startCheckout(
  cadence: Cadence,
  code?: string,
): Promise<CheckoutResult> {
  try {
    if (!stripeConfigured) return { error: "Billing isn't set up yet." };
    if (cadence !== "monthly" && cadence !== "annual") {
      return { error: "Pick a valid plan." };
    }
    const priceId = PRICE_ID[cadence];
    if (!priceId) return { error: "That plan isn't available right now." };

    const trial = resolveTrial(code);
    if ("error" in trial) return { error: trial.error };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Please sign in first." };

    // Reuse an existing Stripe customer if we've already made one for this user
    // (RLS scopes this read to their own row). Otherwise Stripe creates one from
    // the email and the webhook records the id on the first event.
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const origin = await requestOrigin();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      ...(existing?.stripe_customer_id
        ? { customer: existing.stripe_customer_id }
        : { customer_email: user.email ?? undefined }),
      client_reference_id: user.id,
      // Stamp user_id on BOTH the session and the subscription so every later
      // subscription.* webhook can resolve the owner without a DB lookup.
      metadata: { user_id: user.id },
      subscription_data: {
        metadata: { user_id: user.id },
        trial_period_days: trial.trialDays,
      },
      allow_promotion_codes: true,
      success_url: `${origin}/billing?checkout=success`,
      cancel_url: `${origin}/billing?checkout=cancel`,
    });

    if (!session.url) return { error: "Couldn't start checkout. Try again." };
    return { url: session.url };
  } catch (err) {
    console.error("[stripe] startCheckout failed:", err);
    return { error: "Something went wrong starting checkout." };
  }
}

/**
 * Open the Stripe-hosted Customer Portal (manage plan, switch cadence, update
 * card, cancel). Requires an existing customer — i.e. the user has subscribed at
 * least once. Returns the portal URL or a friendly error.
 */
export async function openBillingPortal(): Promise<CheckoutResult> {
  try {
    if (!stripeConfigured) return { error: "Billing isn't set up yet." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Please sign in first." };

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!sub?.stripe_customer_id) {
      return { error: "No subscription to manage yet." };
    }

    const origin = await requestOrigin();
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/billing`,
    });
    return { url: portal.url };
  } catch (err) {
    console.error("[stripe] openBillingPortal failed:", err);
    return { error: "Couldn't open the billing portal." };
  }
}

/**
 * DEV-ONLY: start a Checkout session WITHOUT a signed-in user, so the billing UI
 * can be sampled end-to-end (real Stripe-hosted Checkout, test card, trial) from
 * the /preview page. No user is attached, so the webhook can't map it to an
 * account and nothing flips to 'paid' — it only exercises the Checkout flow.
 * Returns an error in production.
 */
export async function startSampleCheckout(
  cadence: Cadence,
  code?: string,
): Promise<CheckoutResult> {
  try {
    if (process.env.NODE_ENV === "production") {
      return { error: "Sample checkout is dev-only." };
    }
    if (!stripeConfigured) return { error: "Billing isn't set up yet." };
    const priceId = PRICE_ID[cadence];
    if (!priceId) return { error: "That plan isn't available right now." };

    const trial = resolveTrial(code);
    if ("error" in trial) return { error: trial.error };

    const origin = await requestOrigin();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: "sample@trackdco.test",
      subscription_data: {
        metadata: { sample: "true" },
        trial_period_days: trial.trialDays,
      },
      allow_promotion_codes: true,
      success_url: `${origin}/preview/billing?checkout=success`,
      cancel_url: `${origin}/preview/billing?checkout=cancel`,
    });
    if (!session.url) return { error: "Couldn't start checkout. Try again." };
    return { url: session.url };
  } catch (err) {
    console.error("[stripe] startSampleCheckout failed:", err);
    return { error: "Something went wrong starting checkout." };
  }
}
