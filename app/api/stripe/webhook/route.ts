import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { serviceClient } from "@/lib/billing/service";
import { stripe } from "@/lib/billing/stripe";
import {
  endSubscription,
  extendFromInvoice,
  markPastDue,
  syncSubscription,
} from "@/lib/billing/sync";

/**
 * THE STRIPE WEBHOOK — the only thing in this codebase that grants access.
 *
 * The client's success callback proves a card was accepted. It proves NOTHING
 * about entitlement, because anyone with dev tools can trigger a client success
 * state. Access is granted here and nowhere else.
 *
 * ## Node runtime, and the raw body
 *
 * Signature verification needs the bytes exactly as Stripe sent them, so the
 * body is read with `req.text()` before anything parses it. `proxy.ts` does not
 * touch bodies (it only refreshes the session cookie), so no exclusion is
 * needed — but it is worth knowing that any future body-reading middleware would
 * silently break every signature here.
 */
export const runtime = "nodejs";
// A webhook is never cacheable and never prerendered.
export const dynamic = "force-dynamic";

/**
 * The events this route acts on. Anything else is recorded and acknowledged —
 * Stripe sends a great deal we do not care about, and 400-ing on it would just
 * fill the dashboard with red.
 */
type Handled =
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted"
  | "customer.subscription.trial_will_end"
  | "invoice.paid"
  | "invoice.payment_failed";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    // Rejected BEFORE any parsing, which is the spec's requirement.
    return new NextResponse("missing signature", { status: 400 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // A misconfigured deploy must not silently accept unverified events. 500,
    // not 400: the fault is ours and Stripe should retry once it is fixed.
    console.error("[stripe] STRIPE_WEBHOOK_SECRET is not set");
    return new NextResponse("webhook not configured", { status: 500 });
  }

  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    // Anything that fails verification is discarded unparsed. This is also what
    // makes a replayed body from an attacker useless: the timestamp is inside
    // the signature.
    console.error(
      "[stripe] signature verification failed:",
      err instanceof Error ? err.message : String(err),
    );
    return new NextResponse("invalid signature", { status: 400 });
  }

  /**
   * IDEMPOTENCY, AND IT IS THE INSERT THAT PROVIDES IT.
   *
   * Stripe retries on failure and delivers out of order, so the same event WILL
   * arrive more than once — that is normal operation. Inserting first, with
   * `stripe_event_id` as the primary key, means a duplicate is rejected by the
   * database and this route returns before any handler runs. No handler has to
   * be written carefully to survive being run twice, which is exactly the kind
   * of care that gets forgotten in the sixth one.
   */
  const db = serviceClient();
  const { error: insertError } = await db.from("webhook_events").insert({
    stripe_event_id: event.id,
    type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      // Already seen. A clean no-op, and a 200 so Stripe stops retrying.
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[stripe] webhook_events insert failed:", insertError.message);
    // 500 so Stripe retries: we have not processed this and must not pretend to.
    return new NextResponse("could not record event", { status: 500 });
  }

  try {
    await handle(event);
  } catch (err) {
    /**
     * A HANDLER THAT THREW MUST NOT LEAVE A "PROCESSED" ROW.
     *
     * `processed_at` stays NULL, which is the only signal that something arrived
     * and did not finish. The row itself STAYS — deleting it to allow a retry
     * would give up idempotency exactly when things are going wrong, which is
     * when it matters most. Recovery is replaying the event from the Stripe CLI
     * or dashboard, which mints a new event id.
     */
    console.error(
      `[stripe] handler failed for ${event.type} (${event.id}):`,
      err instanceof Error ? err.message : String(err),
    );
    return new NextResponse("handler failed", { status: 500 });
  }

  await db
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("stripe_event_id", event.id);

  return NextResponse.json({ received: true });
}

async function handle(event: Stripe.Event): Promise<void> {
  switch (event.type as Handled) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await syncSubscription(event.data.object as Stripe.Subscription);
      return;

    case "customer.subscription.deleted":
      await endSubscription(event.data.object as Stripe.Subscription);
      return;

    case "invoice.paid":
      await extendFromInvoice(event.data.object as Stripe.Invoice, (id) =>
        stripe().subscriptions.retrieve(id),
      );
      return;

    case "invoice.payment_failed":
      await markPastDue(event.data.object as Stripe.Invoice);
      return;

    /**
     * RECORDED, NOT ACTED ON — and that is the whole requirement.
     *
     * Stripe fires this three days before a trial ends. The notification itself
     * is out of scope; the spec asks only that the hook exists and is logged so
     * it can be wired later. The `webhook_events` row above IS that log, with
     * the full payload, so whoever builds the reminder has the real event to
     * work from rather than a reconstruction.
     *
     * Worth knowing when it is wired: on a 7-day trial this fires on DAY 4,
     * while the paywall promises a reminder on day 5 (`REMINDER_DAY`). Honour
     * the day the SCREEN promised, not the day the webhook happens to arrive.
     */
    case "customer.subscription.trial_will_end":
      return;

    default:
      // Everything else is recorded and acknowledged.
      return;
  }
}
