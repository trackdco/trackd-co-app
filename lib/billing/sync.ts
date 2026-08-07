import "server-only";

import type Stripe from "stripe";

import { serviceClient } from "./service";
import type { SubscriptionStatus } from "./schema";

/**
 * WHAT A STRIPE EVENT DOES TO OUR TABLES (Spec w2b-15).
 *
 * Separated from the route so the mapping can be reasoned about — and later
 * tested — without a signature, a raw body or a network. The route verifies and
 * dispatches; this decides.
 *
 * ## The two-table split is the whole architecture
 *
 * `subscriptions` MIRRORS Stripe so the app can say "renews on the 14th" without
 * a network call. **Nothing gates on it.** `entitlements` is what the app reads
 * to decide access. Writing both from one handler is fine; conflating them is
 * not, because that would make Stripe authoritative again and Apple could never
 * be added beside it.
 */

/** Stripe's epoch seconds → an ISO string, or null. */
function ts(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}

/**
 * Which TRACKD user a Stripe customer belongs to.
 *
 * `billing_customers` is the mapping, and it is authoritative. The subscription
 * metadata carries `user_id` too and is used as a fallback — an event can arrive
 * before the row we wrote, since Stripe fires webhooks concurrently with the API
 * call that created the object.
 */
async function resolveUserId(
  customerId: string,
  metadataUserId: string | undefined,
): Promise<string | null> {
  const { data } = await serviceClient()
    .from("billing_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (data?.user_id) return data.user_id as string;
  return metadataUserId ?? null;
}

/**
 * The period a subscription is currently entitled to, as an ISO string.
 *
 * `trial_end` while trialing, `current_period_end` once paying. Read off the
 * subscription's first item rather than the subscription: Stripe moved
 * `current_period_end` onto items, and the top-level field is absent on newer
 * API versions — reading it there returns undefined and would silently produce a
 * NULL `active_until`, which `isEntitlementActive` treats as "never expires".
 * A billing bug that grants FOREVER is the expensive direction to get wrong.
 */
function entitledUntil(sub: Stripe.Subscription): string | null {
  if (sub.status === "trialing" && sub.trial_end) return ts(sub.trial_end);
  const item = sub.items?.data?.[0];
  return ts(item?.current_period_end);
}

/**
 * Narrow Stripe's status to one our `subscription_status` enum can store.
 *
 * Stripe types this as a union PLUS an "unknown future value" escape hatch, and
 * that is not paranoia on their part — they do add statuses. Writing one the
 * enum has never heard of gives a `22P02` from Postgres, mid-payment.
 *
 * ## What happens on an unknown one, and why
 *
 * Nothing. The caller logs loudly and writes NEITHER table.
 *
 * The alternatives are both worse. Guessing a "closest" status records a fact
 * that is not true and lets an unknown state silently decide access. Throwing
 * makes Stripe retry for three days and leaves a paying customer locked out
 * while it does — and `entitlements` is the table that decides access, so
 * touching nothing means the existing entitlement STANDS until `active_until`
 * passes naturally. That is the same grace the spec requires for `past_due`,
 * applied to our own ignorance rather than to a declined card, and it fails in
 * the direction that does not punish someone for a change at Stripe.
 *
 * The `webhook_events` row keeps the full payload either way, so adding the new
 * value later is a migration and a replay.
 */
const STORABLE_STATUSES = new Set<string>([
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
]);

function toStatus(status: string): SubscriptionStatus | null {
  return STORABLE_STATUSES.has(status) ? (status as SubscriptionStatus) : null;
}

/** The statuses that mean "this person may use the app". */
const ENTITLING: ReadonlySet<string> = new Set([
  "trialing",
  "active",
  // `past_due` KEEPS access. A decline is not a decision to leave, and the
  // entitlement stands until `active_until` passes naturally — the spec's grace
  // window. Cards decline for boring reasons.
  "past_due",
]);

/**
 * Upsert the subscription mirror and, if the status entitles, the entitlement.
 *
 * Handles `customer.subscription.created` and `.updated`, which Stripe sends for
 * the same states — so they are one function rather than two that must agree.
 */
export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId = await resolveUserId(customerId, sub.metadata?.user_id);
  if (!userId) {
    // Loud, and NOT a thrown error: throwing makes Stripe retry forever on an
    // event that can never resolve. A subscription we cannot attribute is a
    // support problem, not a transient one.
    console.error(
      `[billing] no user for stripe customer ${customerId} (subscription ${sub.id})`,
    );
    return;
  }

  const status = toStatus(sub.status);
  if (!status) {
    // See `toStatus`. Write nothing, say so loudly, and leave any existing
    // entitlement to expire on its own clock rather than on our confusion.
    console.error(
      `[billing] unknown Stripe subscription status "${sub.status}" on ${sub.id} — no tables written`,
    );
    return;
  }

  const priceId = sub.items.data[0]?.price?.id ?? null;
  if (!priceId) {
    console.error(`[billing] subscription ${sub.id} has no price — no tables written`);
    return;
  }

  const db = serviceClient();

  const { error: subError } = await db.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
      status,
      trial_ends_at: ts(sub.trial_end),
      current_period_end: entitledUntil(sub),
      cancel_at_period_end: sub.cancel_at_period_end,
    },
    { onConflict: "stripe_subscription_id" },
  );
  if (subError) throw new Error(`subscriptions upsert: ${subError.message}`);

  // The mirror is written even for a status that does not entitle — a `canceled`
  // subscription is still a fact the Billing row should be able to state.
  if (!ENTITLING.has(sub.status)) return;

  await upsertEntitlement(userId, entitledUntil(sub), true);
}

/**
 * Write the `pro` entitlement for a user from Stripe.
 *
 * Keyed on `(user_id, product, source)`, so a user's Stripe entitlement is one
 * row that moves forward rather than a pile of rows to reconcile — and their
 * `comp`, if they have one, is a DIFFERENT row that this can never overwrite.
 */
async function upsertEntitlement(
  userId: string,
  activeUntil: string | null,
  isActive: boolean,
): Promise<void> {
  const { error } = await serviceClient().from("entitlements").upsert(
    {
      user_id: userId,
      product: "pro",
      source: "stripe",
      active_until: activeUntil,
      is_active: isActive,
    },
    { onConflict: "user_id,product,source" },
  );
  if (error) throw new Error(`entitlements upsert: ${error.message}`);
}

/**
 * `invoice.paid` — extend access to the new period end.
 *
 * Reads the SUBSCRIPTION rather than trusting the invoice's own period, because
 * an invoice line's period can differ from the subscription's after a proration,
 * and the thing access should follow is the subscription.
 */
export async function extendFromInvoice(
  invoice: Stripe.Invoice,
  fetchSubscription: (id: string) => Promise<Stripe.Subscription>,
): Promise<void> {
  const subId = subscriptionIdOf(invoice);
  if (!subId) return; // A one-off invoice. Nothing subscribes, nothing extends.
  await syncSubscription(await fetchSubscription(subId));
}

/**
 * `invoice.payment_failed` — record `past_due`, and DO NOT revoke.
 *
 * The spec is explicit: leave a grace window, the entitlement stands until
 * `active_until` passes naturally. So this touches the mirror only. That is not
 * an oversight to be tidied later — a card declining is not a decision to
 * cancel, and locking someone out mid-protocol over an expired card is the worst
 * possible moment to do it.
 */
export async function markPastDue(invoice: Stripe.Invoice): Promise<void> {
  const subId = subscriptionIdOf(invoice);
  if (!subId) return;
  const { error } = await serviceClient()
    .from("subscriptions")
    .update({ status: "past_due" })
    .eq("stripe_subscription_id", subId);
  if (error) throw new Error(`subscriptions past_due: ${error.message}`);
}

/**
 * `customer.subscription.deleted` — end access AT THE PERIOD END, not now.
 *
 * Someone who cancels on day 3 of a paid month keeps the month they paid for. So
 * the entitlement keeps `is_active = true` with `active_until` at the period
 * end, and `isEntitlementActive` lets the clock do the work.
 *
 * The one case that ends access immediately is a subscription that is deleted
 * with no period to serve out — a trial abandoned before it converted. There
 * `active_until` is already in the past, so no special handling is needed and
 * none is added.
 */
export async function endSubscription(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId = await resolveUserId(customerId, sub.metadata?.user_id);
  if (!userId) {
    console.error(`[billing] no user for deleted subscription ${sub.id}`);
    return;
  }

  const db = serviceClient();
  const status = toStatus(sub.status);
  const { error } = await db
    .from("subscriptions")
    .update({
      ...(status ? { status } : {}),
      cancel_at_period_end: sub.cancel_at_period_end,
    })
    .eq("stripe_subscription_id", sub.id);
  if (error) throw new Error(`subscriptions delete-sync: ${error.message}`);

  await upsertEntitlement(userId, entitledUntil(sub), true);
}

/**
 * The subscription id on an invoice.
 *
 * Stripe moved this from `invoice.subscription` to
 * `invoice.parent.subscription_details.subscription`. Both shapes are read so
 * the handler survives whichever the account is on, and so an SDK bump cannot
 * turn "extend the entitlement" into a silent no-op that only shows up as a
 * customer losing access on renewal day.
 */
function subscriptionIdOf(invoice: Stripe.Invoice): string | null {
  const parent = (invoice as { parent?: { subscription_details?: { subscription?: string | { id: string } } } }).parent;
  const viaParent = parent?.subscription_details?.subscription;
  if (typeof viaParent === "string") return viaParent;
  if (viaParent && typeof viaParent === "object") return viaParent.id;

  const legacy = (invoice as { subscription?: string | { id: string } }).subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object") return legacy.id;

  return null;
}
