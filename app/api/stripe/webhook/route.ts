import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { serviceClient } from "@/lib/billing/service";
import { stripe } from "@/lib/billing/stripe";
import {
  endSubscription,
  extendFromInvoice,
  markPastDue,
  revokeForCustomer,
  syncSubscription,
  type HandlerOutcome,
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
 * needed — but any future body-reading middleware would silently break every
 * signature here.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * How long a claim is assumed dead.
 *
 * See `claimEvent`. Stripe's retries are minutes apart, so 60s comfortably
 * separates "the previous attempt crashed" from "two deliveries are in flight
 * right now", without leaving a failed event stuck until someone notices.
 */
const STALE_CLAIM_MS = 60_000;

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
    // Anything failing verification is discarded unparsed. This is also what
    // makes a replayed body useless to an attacker: the timestamp is inside the
    // signature and the tolerance rejects it.
    console.error(
      "[stripe] signature verification failed:",
      err instanceof Error ? err.message : String(err),
    );
    return new NextResponse("invalid signature", { status: 400 });
  }

  const claim = await claimEvent(event);
  if (claim === "duplicate") {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (claim === "error") {
    // 500 so Stripe retries: we have not processed this and must not pretend to.
    return new NextResponse("could not record event", { status: 500 });
  }

  let outcome: HandlerOutcome;
  try {
    outcome = await handle(event);
  } catch (err) {
    /**
     * A HANDLER THAT THREW LEAVES `processed_at` NULL, AND A RETRY WILL RE-RUN.
     *
     * That second half was not true and a cold review proved it: the row was
     * inserted first and every later delivery of the same id short-circuited on
     * the primary key, so a single failure was PERMANENT. The comment here used
     * to claim "recovery is replaying the event, which mints a new event id" —
     * it does not. `stripe events resend` delivers the SAME id, so Stripe's
     * automatic retries, the dashboard resend and the CLI resend were all
     * guaranteed no-ops, and the only recovery was deleting the row by hand.
     * One Supabase blip on an `invoice.paid` meant a paying customer silently
     * lost access at period end.
     *
     * `claimEvent` now distinguishes "already done" from "started and did not
     * finish". See it.
     */
    console.error(
      `[stripe] handler failed for ${event.type} (${event.id}):`,
      err instanceof Error ? err.message : String(err),
    );
    return new NextResponse("handler failed", { status: 500 });
  }

  /**
   * `processed_at` MEANS "we are satisfied with what happened to this event".
   *
   * An event we could not attribute to a user is deliberately NOT stamped: it is
   * a paying customer with no entitlement and nobody being told, and the
   * `webhook_events_unprocessed_idx` partial index is the only monitoring signal
   * this system has. Stamping it made that index permanently empty and the
   * failure invisible. Stripe still gets a 200 — retrying will not conjure the
   * mapping — so it surfaces as a row to look at rather than a delivery storm.
   */
  if (outcome === "unattributed") {
    console.error(
      `[stripe] ${event.type} (${event.id}) could not be attributed to a user; left unprocessed for review`,
    );
    return NextResponse.json({ received: true, attributed: false });
  }

  const { error } = await serviceClient()
    .from("webhook_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("stripe_event_id", event.id);
  // Checked, unlike before: an unstamped row looks exactly like a failed handler
  // to whoever reads that index, and a silent 200 here made the two
  // indistinguishable.
  if (error) {
    console.error(`[stripe] could not stamp ${event.id}:`, error.message);
  }

  return NextResponse.json({ received: true });
}

/**
 * RECORD THE EVENT AND DECIDE WHETHER WE OWN THE WORK.
 *
 * Three answers:
 *   "fresh"      — never seen; the row is ours and the handler should run.
 *   "duplicate"  — already finished, or another delivery is working on it now.
 *   "error"      — the database would not answer; Stripe should retry.
 *
 * The insert is still what provides idempotency, and the primary key on
 * `stripe_event_id` is still what makes every handler safe to run twice. What
 * changed is what a CONFLICT means: it used to mean "done", and it actually
 * means "seen". An event that was seen and never finished has to be retryable,
 * or a single transient failure is permanent.
 *
 * The window between the two is resolved by time rather than a lock, because a
 * lock needs a column and this needs no migration: Stripe's retries are minutes
 * apart, so a row sitting unprocessed for more than {@link STALE_CLAIM_MS} is a
 * crashed attempt rather than a live one. Concurrent duplicates inside that
 * window are still rejected — measured at 12 simultaneous deliveries producing
 * exactly one handler run.
 */
async function claimEvent(
  event: Stripe.Event,
): Promise<"fresh" | "duplicate" | "error"> {
  const db = serviceClient();

  const { error } = await db.from("webhook_events").insert({
    stripe_event_id: event.id,
    type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });

  if (!error) return "fresh";

  if (error.code !== "23505") {
    console.error("[stripe] webhook_events insert failed:", error.message);
    return "error";
  }

  const { data, error: readError } = await db
    .from("webhook_events")
    .select("processed_at, received_at")
    .eq("stripe_event_id", event.id)
    .maybeSingle();

  if (readError || !data) {
    console.error(
      "[stripe] could not read the existing event row:",
      readError?.message ?? "no row",
    );
    return "error";
  }

  if (data.processed_at) return "duplicate";

  const age = Date.now() - Date.parse(data.received_at);
  if (age < STALE_CLAIM_MS) return "duplicate"; // Another delivery has it.

  console.warn(
    `[stripe] retrying ${event.type} (${event.id}); the previous attempt left it unprocessed`,
  );
  return "fresh";
}

async function handle(event: Stripe.Event): Promise<HandlerOutcome> {
  const client = stripe();

  /**
   * THE EVENT SAYS WHAT CHANGED. STRIPE SAYS WHAT IS TRUE.
   *
   * Every subscription handler re-reads the subscription rather than trusting
   * the payload, and that is not belt-and-braces — a cold review measured three
   * separate wrong outcomes from reordering alone, all of them normal operation
   * because Stripe guarantees no ordering and delivers concurrently:
   *
   *   payment_failed then a stale updated→active  -> the unpaid month came back
   *   a newer updated then an older one           -> a paying customer lost a month
   *   deleted then a stale updated→active         -> access to a dead subscription
   *
   * Acting on the live object makes arrival order irrelevant: whatever sequence
   * the events land in, every one of them computes the same correct answer from
   * the same current truth. It costs one API call per subscription event, and it
   * is what Stripe's own guidance says to do.
   */
  const fresh = async (sub: Stripe.Subscription) => {
    try {
      return await client.subscriptions.retrieve(sub.id);
    } catch (err) {
      // A subscription Stripe will not return (deleted long ago, or an outage).
      // The payload is the best available truth rather than no truth at all.
      console.warn(
        `[stripe] could not re-read ${sub.id}, using the event payload:`,
        err instanceof Error ? err.message : String(err),
      );
      return sub;
    }
  };

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      return syncSubscription(await fresh(event.data.object as Stripe.Subscription));

    case "customer.subscription.deleted":
      return endSubscription(await fresh(event.data.object as Stripe.Subscription));

    case "invoice.paid":
      return extendFromInvoice(event.data.object as Stripe.Invoice, (id) =>
        client.subscriptions.retrieve(id),
      );

    case "invoice.payment_failed":
      return markPastDue(event.data.object as Stripe.Invoice);

    /**
     * MONEY TAKEN BACK ⇒ ACCESS TAKEN BACK.
     *
     * Nothing in this codebase wrote `is_active = false` before these two, so
     * the "kill switch" the schema describes at length was wired to nothing and
     * a chargeback left full paid access standing with manual SQL as the only
     * lever. A dispute is the strongest possible signal that the money is not
     * ours; a refund is us saying so ourselves.
     */
    /**
     * ⚠️ THE DISPUTE ITSELF IS PASSED, NOT JUST ITS CHARGE.
     *
     * This event fires for INQUIRIES too, where the bank is asking a question
     * and no funds have been withdrawn. Without the dispute object there is no
     * way to tell the two apart, and a cold review measured the cost: an inquiry
     * on a paid $69.99 year revoked 365 days of access with no money having
     * moved. See `DISPUTE_INQUIRY_STATUSES`.
     */
    /**
     * ⚠️ AND THE LATER ONES, BECAUSE AN INQUIRY THAT ESCALATES NEVER FIRES
     * `created` AGAIN.
     *
     * Skipping inquiries at `created` is right — no funds have moved. But Stripe
     * does not mint a second `charge.dispute.created` when one escalates: the
     * same dispute object changes status and fires `updated`, then `closed`.
     * With only `created` handled, a cold review drove a dispute all the way to
     * `status: lost` with $69.99 withdrawn and `is_active` still true — the kill
     * switch silently never firing, which is worse than the over-firing it
     * replaced.
     *
     * `revokeForCustomer` does the inquiry test itself, so all three events go
     * to the same place and only a real one revokes.
     */
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed":
    case "charge.dispute.funds_withdrawn": {
      const dispute = event.data.object as Stripe.Dispute;
      return revokeForCustomer(dispute.charge, "dispute", client, dispute);
    }

    case "charge.refunded":
      return revokeForCustomer(
        (event.data.object as Stripe.Charge).id,
        "refund",
        client,
      );

    /**
     * A SIGNAL THAT A TRIAL IS ENDING. NOT THE SCHEDULE FOR SAYING SO.
     *
     * Stripe fires this THREE DAYS before the trial ends, which on a 7-day
     * trial is DAY 4. Both screens promise day 5 (`REMINDER_DAY`) — the paywall
     * timeline and the checkout disclosure. Sending the push from here would be
     * a day early every time, and at whatever hour of the user's night Stripe
     * happened to fire.
     *
     * So this does the one thing it is actually good for: it refreshes the
     * subscription mirror, which is where `trial_ends_at` lives. The reminder
     * itself is decided by `lib/notifications/trialReminder.ts` and sent by the
     * existing reminder cron, off that stored date, on the promised day, in the
     * user's own timezone and outside their quiet hours.
     *
     * `syncSubscription` rather than a targeted write, for the reason every
     * other handler here uses it: it re-reads the live object, so this event
     * cannot record a stale trial end just because it arrived out of order. It
     * is the same call `customer.subscription.updated` makes and is idempotent
     * with it.
     */
    case "customer.subscription.trial_will_end":
      return syncSubscription(await fresh(event.data.object as Stripe.Subscription));

    default:
      // Everything else is recorded and acknowledged.
      return "handled";
  }
}
