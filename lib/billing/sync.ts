import "server-only";

import type Stripe from "stripe";

import { COURTESY_KEY } from "./saveOffer";
import { serviceClient } from "./service";
import type { SubscriptionStatus } from "./schema";

/**
 * Does this error mean the column simply is not there yet?
 *
 * Both codes, because the two layers report it differently and which one you get
 * depends on whether PostgREST's schema cache or Postgres itself rejects first.
 * `runner.ts` handles both for the same reason.
 */
function isMissingColumn(error: { code?: string | null; message?: string }): boolean {
  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    /courtesy_until/i.test(error.message ?? "")
  );
}

/**
 * What a handler did, so the route knows whether to mark the event processed.
 *
 * `unattributed` is the one that matters: an event we could not tie to a user is
 * a paying customer with no entitlement and nobody being told. Stamping it
 * `processed_at` made `webhook_events_unprocessed_idx` — the only monitoring
 * signal this system has — permanently empty, and the failure invisible.
 */
export type HandlerOutcome = "handled" | "unattributed";

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

/**
 * The statuses that MOVE the entitlement's clock forward.
 *
 * `past_due` is deliberately NOT one of them, and that distinction was found by
 * driving a declining card on a test clock rather than by reading this list.
 *
 * When a renewal fails, Stripe still advances the subscription into the new
 * period and sends `customer.subscription.updated` with `past_due`. Treating
 * that as entitling extended `active_until` to the end of a month **nobody
 * paid for** — a free month per failed payment, repeatable. Measured: 14 Aug
 * became 14 Sept on a card that declined.
 *
 * The spec asks for a GRACE WINDOW, not a free month: "do NOT revoke the
 * entitlement immediately; the entitlement stands until `active_until` passes
 * naturally". Standing still is exactly that. So a `past_due` subscription
 * updates the MIRROR and leaves the entitlement's date alone — the user keeps
 * what they already paid for, to the day, and loses access when that runs out
 * rather than a month later.
 *
 * `is_active` is never touched here either. A decline is not a decision to
 * leave, and cards decline for boring reasons.
 */
const ENTITLING: ReadonlySet<string> = new Set(["trialing", "active"]);

/** Statuses that keep existing access without extending it. See `ENTITLING`. */
const GRACE: ReadonlySet<string> = new Set(["past_due"]);

/**
 * HAS A CARD ACTUALLY BEEN VALIDATED ON THIS SUBSCRIPTION?
 *
 * A cold review turned this into the worst defect in the spec: **seven days of
 * Pro with no working card, repeatable forever on one account.**
 *
 * `startTrial` creates the subscription BEFORE the client confirms the
 * SetupIntent — it has to, because the confirm needs the secret the creation
 * returns. Stripe sets a `default_incomplete` + `trial_period_days` subscription
 * to `trialing` **at creation**, so `customer.subscription.created` arrives with
 * an entitling status while the SetupIntent is still `requires_payment_method`.
 * Measured live: the entitlement was granted with `cardsAttached: 0`, four
 * seconds before `payment_method.attached` in a run that DID complete.
 *
 * A user only had to type a Luhn-valid number — `elements.submit()` checks
 * format, not the bank — tap the CTA, and close the tab.
 *
 * So a trial entitles only once Stripe says a payment method is attached. Both
 * signals are checked because either alone has a gap: `pending_setup_intent`
 * goes null the moment the intent succeeds, and `default_payment_method` is what
 * `save_default_payment_method: "on_subscription"` eventually sets.
 *
 * An `active` subscription is exempt — money has actually moved by then, and a
 * subscription can legitimately be paid by invoice with no stored method.
 */
function cardIsValidated(sub: Stripe.Subscription): boolean {
  if (sub.status !== "trialing") return true;
  // A method is attached — settled, whatever else the object says.
  if (sub.default_payment_method || sub.default_source) return true;
  /**
   * Otherwise: is Stripe still WAITING for one?
   *
   * `payment_behavior: "default_incomplete"` puts a `pending_setup_intent` on
   * the subscription at creation and clears it the moment the intent succeeds,
   * so its absence is the signal that the card step is done.
   *
   * Both are checked because neither is sufficient alone.
   * `save_default_payment_method: "on_subscription"` sets the default when an
   * INVOICE is paid, and a trial pays no invoice — so during the trial the
   * default can legitimately still be null on a subscription whose card was
   * confirmed. Requiring it would have withheld the entitlement from every
   * genuine trial. Conversely `pending_setup_intent` is null on a subscription
   * created without `default_incomplete` at all (from the dashboard, say),
   * where there was never a card step to wait for.
   */
  return !sub.pending_setup_intent;
}

/**
 * Upsert the subscription mirror and, if the status entitles, the entitlement.
 *
 * Handles `customer.subscription.created` and `.updated`, which Stripe sends for
 * the same states — so they are one function rather than two that must agree.
 */
export async function syncSubscription(
  sub: Stripe.Subscription,
): Promise<HandlerOutcome> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId = await resolveUserId(customerId, sub.metadata?.user_id);
  if (!userId) {
    // Loud, and NOT a thrown error: throwing makes Stripe retry forever on an
    // event that can never resolve. A subscription we cannot attribute is a
    // support problem, not a transient one.
    console.error(
      `[billing] no user for stripe customer ${customerId} (subscription ${sub.id})`,
    );
    return "unattributed";
  }

  const status = toStatus(sub.status);
  if (!status) {
    // See `toStatus`. Write nothing, say so loudly, and leave any existing
    // entitlement to expire on its own clock rather than on our confusion.
    console.error(
      `[billing] unknown Stripe subscription status "${sub.status}" on ${sub.id} — no tables written`,
    );
    return "unattributed";
  }

  const priceId = sub.items.data[0]?.price?.id ?? null;
  if (!priceId) {
    console.error(`[billing] subscription ${sub.id} has no price — no tables written`);
    return "unattributed";
  }

  const db = serviceClient();

  const mirror = {
    user_id: userId,
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId,
    status,
    trial_ends_at: ts(sub.trial_end),
    current_period_end: entitledUntil(sub),
    cancel_at_period_end: sub.cancel_at_period_end,
  };
  /**
   * The save offer's courtesy period, mirrored so the plan label can tell it
   * apart from a first trial. See `supabase/billing/003_courtesy_until.sql`.
   */
  const courtesyUntil = sub.metadata?.[COURTESY_KEY] ?? null;

  let { error: subError } = await db
    .from("subscriptions")
    .upsert({ ...mirror, courtesy_until: courtesyUntil }, {
      onConflict: "stripe_subscription_id",
    });

  /**
   * ⚠️ `PGRST204`, NOT `42703`, IS WHAT AN UNAPPLIED MIGRATION LOOKS LIKE HERE.
   *
   * PostgREST validates the request body against its own schema cache and
   * rejects before Postgres ever sees the statement, so the Postgres
   * "undefined column" code never arrives. This branch already paid for that
   * lesson once: `trialLease.ts` caught `42703`, the real answer was `PGRST204`,
   * and an unapplied migration turned into "no trial can be started at all" on
   * a payment path.
   *
   * Retried WITHOUT the column rather than failing, because the mirror is what
   * `/billing` renders and a missing courtesy flag is a cosmetic label while a
   * missing mirror row is a screen that cannot say what somebody is paying.
   */
  if (subError && isMissingColumn(subError)) {
    ({ error: subError } = await db
      .from("subscriptions")
      .upsert(mirror, { onConflict: "stripe_subscription_id" }));
  }
  if (subError) throw new Error(`subscriptions upsert: ${subError.message}`);

  // The mirror is written even for a status that does not entitle — a `canceled`
  // subscription is still a fact the Billing row should be able to state.
  //
  // `past_due` stops here too: the mirror now says so, and the entitlement is
  // left exactly as it was so the paid-for period runs out on its own date. See
  // `ENTITLING`.
  if (!ENTITLING.has(sub.status)) {
    if (GRACE.has(sub.status)) {
      console.info(
        `[billing] ${sub.id} is ${sub.status}; entitlement left standing until its own active_until`,
      );
    }
    return "handled";
  }

  // NO CARD, NO TRIAL. See `cardIsValidated` — this is the difference between a
  // trial and seven free days for anyone who can type sixteen digits.
  if (!cardIsValidated(sub)) {
    console.info(
      `[billing] ${sub.id} is trialing with no validated payment method; no entitlement granted`,
    );
    return "handled";
  }

  await upsertEntitlement(userId, entitledUntil(sub), true);
  return "handled";
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
): Promise<HandlerOutcome> {
  const subId = subscriptionIdOf(invoice);
  // A one-off invoice. Nothing subscribes, nothing extends — and it is handled,
  // not unattributed: there was never a subscription to attribute.
  if (!subId) return "handled";
  return syncSubscription(await fetchSubscription(subId));
}

/**
 * How long access survives a failed renewal.
 *
 * Three days: long enough that a card expiring over a weekend does not lock
 * someone out mid-protocol, short enough that it is a grace window rather than a
 * free month. It also lands inside Stripe's own first dunning retry, so the
 * common case — a card that works on the second attempt — is never noticed by
 * the user at all.
 */
const PAST_DUE_GRACE_DAYS = 3;

/**
 * `invoice.payment_failed` — record `past_due`, and CLAW BACK the free month.
 *
 * ## The sequence this exists for, measured on a test clock
 *
 * A renewal that is going to fail does not look like a failure straight away:
 *
 *   1. `customer.subscription.updated` -> **active**, period rolled forward
 *   2. `invoice.payment_failed`
 *   3. `customer.subscription.updated` -> `past_due`
 *
 * Step 1 is indistinguishable from a successful renewal, so `syncSubscription`
 * correctly extends `active_until` into the new period. Then the charge fails.
 * Leaving it there gave a full unpaid month of access, repeatable on every
 * failed payment — measured: 14 Aug became 14 Sept on a card that declined.
 *
 * The spec wants a GRACE WINDOW, not a free month: "do NOT revoke the
 * entitlement immediately". So this pulls the date back to the end of the last
 * period they actually paid for, plus {@link PAST_DUE_GRACE_DAYS}.
 *
 * ## It can only ever SHORTEN
 *
 * `Math.min` against whatever is already stored. A failed payment must never be
 * able to hand out MORE access than the user already had — which is exactly the
 * bug being fixed, and it would be embarrassing to reintroduce from the other
 * direction.
 */
export async function markPastDue(
  invoice: Stripe.Invoice,
): Promise<HandlerOutcome> {
  const subId = subscriptionIdOf(invoice);
  if (!subId) return "handled";

  const db = serviceClient();
  const { data: rows, error: readError } = await db
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", subId);
  if (readError) throw new Error(`subscriptions read: ${readError.message}`);

  const { error } = await db
    .from("subscriptions")
    .update({ status: "past_due" })
    .eq("stripe_subscription_id", subId);
  if (error) throw new Error(`subscriptions past_due: ${error.message}`);

  const userId = rows?.[0]?.user_id;
  if (!userId) return "unattributed";

  /**
   * WHERE THE PAID PERIOD ENDED — which is where the unpaid one begins.
   *
   * This read `invoice.period_start` and a cold review measured it a whole
   * billing period out. On a `subscription_cycle` invoice, `period_start` /
   * `period_end` cover the cycle **just completed**; the period being billed for
   * is on `lines.data[0].period`. Captured payload:
   *
   *     period      = 14 Aug .. 14 Sep      <- already paid
   *     line.period = 14 Sep .. 14 Oct      <- the one that just failed
   *
   * So the grace was computed from 14 Aug and a customer paid through 14 Sep was
   * locked out INSTANTLY, 28 days in the past — the exact opposite of the fix,
   * and on a yearly plan it is ~362 days in the past.
   *
   * The line's period start is the correct anchor. `period_end` is the same
   * instant on a normal cycle invoice and is the fallback; `now` is the last
   * resort, which errs short rather than long.
   */
  const lineStart = invoice.lines?.data?.[0]?.period?.start;
  const unpaidFrom =
    ts(lineStart) ?? ts(invoice.period_end) ?? new Date().toISOString();
  const graceEnds =
    Date.parse(unpaidFrom) + PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;

  const { data: ents } = await db
    .from("entitlements")
    .select("active_until")
    .eq("user_id", userId)
    .eq("product", "pro")
    .eq("source", "stripe");

  const current = ents?.[0]?.active_until;
  if (!current) return "handled"; // Nothing to shorten.

  const shortened = Math.min(Date.parse(current), graceEnds);
  // Already at or inside the window.
  if (shortened >= Date.parse(current)) return "handled";

  const { error: entError } = await db
    .from("entitlements")
    .update({ active_until: new Date(shortened).toISOString() })
    .eq("user_id", userId)
    .eq("product", "pro")
    .eq("source", "stripe");
  if (entError) throw new Error(`entitlements grace: ${entError.message}`);
  return "handled";
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
export async function endSubscription(
  sub: Stripe.Subscription,
): Promise<HandlerOutcome> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId = await resolveUserId(customerId, sub.metadata?.user_id);
  if (!userId) {
    console.error(`[billing] no user for deleted subscription ${sub.id}`);
    return "unattributed";
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

  /**
   * A DELETION MAY ONLY EVER SHORTEN ACCESS. NEVER EXTEND IT.
   *
   * This used to upsert `entitledUntil(sub)` unconditionally, and a cold review
   * showed that hands back the free month `markPastDue` had just taken away —
   * because a cancelled subscription's `current_period_end` is the end of the
   * period that was never paid for, and Stripe cancelling at the end of dunning
   * is the DEFAULT end state of every failed renewal. Measured: clawed back to
   * 17 Aug, then the deletion restored 14 Oct.
   *
   * A NULL is refused for the same family of reason: `isEntitlementActive` reads
   * a null `active_until` as NEVER EXPIRES, so a subscription arriving with no
   * period would have granted permanent free access.
   */
  const until = entitledUntil(sub);
  if (!until) {
    console.error(
      `[billing] deleted subscription ${sub.id} has no period end; entitlement left untouched`,
    );
    return "handled";
  }

  const { data: existing } = await db
    .from("entitlements")
    .select("active_until")
    .eq("user_id", userId)
    .eq("product", "pro")
    .eq("source", "stripe");

  const current = existing?.[0]?.active_until;
  // No row yet, or one that already ends sooner — nothing a cancellation should
  // do. Cancelling is not a way to buy time.
  if (!current) return "handled";
  const shortened = Math.min(Date.parse(current), Date.parse(until));
  if (shortened >= Date.parse(current)) return "handled";

  await upsertEntitlement(userId, new Date(shortened).toISOString(), true);
  return "handled";
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

/**
 * MONEY TAKEN BACK ⇒ ACCESS TAKEN BACK.
 *
 * `entitlements.is_active` is described at length in the schema as a kill
 * switch, separate from the clock so a revocation does not have to rewrite
 * history. A cold review pointed out that nothing in the codebase ever wrote
 * `false` to it: a chargeback or a refund left full paid access standing, with
 * manual SQL as the only lever.
 *
 * A dispute is the strongest signal there is that the money is not ours; a
 * refund is us saying so ourselves. Both revoke immediately rather than at
 * period end — the grace this system gives elsewhere is for a card that failed,
 * which is an accident, and this is not one.
 *
 * The date is deliberately left alone. `is_active` is the switch, `active_until`
 * is the record of what was bought, and keeping the second readable is the whole
 * reason they are separate columns.
 */
export async function revokeForCustomer(
  chargeId: string | Stripe.Charge | null,
  reason: "dispute" | "refund",
  client: Stripe,
): Promise<HandlerOutcome> {
  const id = typeof chargeId === "string" ? chargeId : chargeId?.id;
  if (!id) return "handled";

  let customerId: string | null = null;
  try {
    const charge = await client.charges.retrieve(id);
    customerId =
      typeof charge.customer === "string" ? charge.customer : (charge.customer?.id ?? null);
  } catch (err) {
    console.error(
      `[billing] could not read charge ${id} for a ${reason}:`,
      err instanceof Error ? err.message : String(err),
    );
    // Thrown rather than swallowed: a revocation we failed to apply must be
    // retried, and must not be stamped as processed.
    throw new Error(`charge lookup failed for ${reason}`);
  }
  if (!customerId) return "unattributed";

  const db = serviceClient();
  const { data } = await db
    .from("billing_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  const userId = data?.user_id;
  if (!userId) {
    console.error(`[billing] ${reason} on unmapped customer ${customerId}`);
    return "unattributed";
  }

  const { error } = await db
    .from("entitlements")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("product", "pro")
    .eq("source", "stripe");
  if (error) throw new Error(`entitlements revoke: ${error.message}`);

  console.warn(`[billing] revoked pro for ${userId} after a ${reason}`);
  return "handled";
}
