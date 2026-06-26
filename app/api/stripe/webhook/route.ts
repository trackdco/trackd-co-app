import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { stripe, stripeConfigured } from "@/lib/stripe/server";
import { syncSubscriptionToDb } from "@/lib/stripe/sync";

// Stripe needs Node crypto for signature verification; webhooks are never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook — the authoritative writer of subscription state + profiles.tier.
 *
 * Signature verification IS the auth here: we read the RAW body (`req.text()`,
 * never `req.json()` which would consume/normalise the stream) and verify it
 * against STRIPE_WEBHOOK_SECRET. A missing/invalid signature is a 400. Handlers
 * run under the service role (inside syncSubscriptionToDb) so they may write
 * across users.
 */
export async function POST(req: Request): Promise<Response> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeConfigured || !webhookSecret) {
    return NextResponse.json(
      { error: "stripe-not-configured" },
      { status: 500 },
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing-signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error(
      "[stripe] webhook signature verification failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "invalid-signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscriptionToDb(event.data.object as Stripe.Subscription);
        break;
      }
      case "checkout.session.completed": {
        // Capture the customer<->user mapping + initial state as early as
        // possible. subscription.created normally covers this, but handling it
        // here too closes the race where the session completes first.
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscriptionToDb(sub);
        }
        break;
      }
      default:
        // Unhandled types are acknowledged (200) so Stripe stops retrying them.
        break;
    }
  } catch (err) {
    // 500 => Stripe retries with backoff. Our writes are idempotent (upsert on
    // user_id), so retries are safe.
    console.error(
      "[stripe] webhook handler error for",
      event.type + ":",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "handler-failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
