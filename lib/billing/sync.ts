import "server-only";

import type Stripe from "stripe";

import { COURTESY_KEY } from "./saveOffer";
import { serviceClient } from "./service";
import { stripe } from "./stripe";
import type { SubscriptionStatus } from "./schema";
import { listAllSubscriptions } from "./subscriptionList";

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
    /courtesy_until|revoked_reason/i.test(error.message ?? "")
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
 * ⚠️ HOW FAR THIS CUSTOMER'S *OTHER* LIVE SUBSCRIPTIONS ENTITLE THEM.
 *
 * ## The defect this exists for, measured twice, by two independent reviews
 *
 * `entitlements` is unique on `(user_id, product, source)`, so ONE row serves
 * every Stripe subscription a customer has. Both handlers that SHORTEN that row
 * computed their date from the single subscription their event named:
 *
 *   - **`endSubscription`.** A paid yearly (entitled to 2027-08-15) beside a
 *     stray 3-day trial. The user presses Cancel; both are flagged; the trial
 *     reaches its end and Stripe DELETES it — a deletion that only happens
 *     because the cancel scheduled it. `active_until` went to **2026-08-18**.
 *     **362 days of paid access removed by pressing Cancel**, with the yearly
 *     still `active` and still paid through 2027.
 *
 *   - **`markPastDue`.** Wider still, and no test clock needed: one declined
 *     charge on an unrelated second subscription clawed the same yearly row from
 *     2027-08-15 back to a three-day grace.
 *
 * Both are the mirror image of the $69.99 defect: not a charge nobody agreed to,
 * but a year of access taken off somebody who paid for it.
 *
 * ## So a shortening handler may not go below what else still entitles them
 *
 * This returns the furthest date any OTHER live subscription reaches, and the
 * two callers floor their result at it. Neither may pull the shared row below
 * what a subscription nobody cancelled has independently paid for.
 *
 * ⚠️ IT ASKS STRIPE, AND IT THROWS RATHER THAN GUESSING. The mirror can be in
 * flight, `unattributed`, or 500'd, and a floor read from a stale mirror is a
 * floor that is too low — which is exactly the failure being fixed. On a Stripe
 * read failure this throws so the webhook RETRIES, the same choice
 * `revokeForCustomer` makes and for the same reason: the alternative is
 * silently locking a paying customer out of the year they bought.
 */
async function otherLiveEntitlementFloor(
  customerId: string,
  excludeSubscriptionId: string,
): Promise<number | null> {
  /**
   * ⚠️ PAGED. A SHORT LIST HERE IS A LOW FLOOR, which is the exact failure this
   * function exists to prevent.
   *
   * One unpaged page of 100 hides the OLDEST subscriptions, and the oldest is
   * where a long-lived yearly plan lives — so the subscription whose paid period
   * most needs protecting is the one truncation drops. The floor would then be
   * computed without it and the entitlement clawed back inside a year somebody
   * has already paid for. See `listAllSubscriptions`.
   */
  const all = await listAllSubscriptions(stripe(), customerId);

  let furthest: number | null = null;
  for (const other of all) {
    if (other.id === excludeSubscriptionId) continue;
    if (!ENTITLING.has(other.status)) continue;
    /**
     * ⚠️ AND IT HAS TO ACTUALLY ENTITLE THEM. `ENTITLING` IS NOT ENOUGH.
     *
     * `syncSubscription` grants nothing to a `trialing` subscription with no
     * validated card — that is the whole point of `cardIsValidated`, and it is
     * the difference between a trial and seven free days for anyone who can type
     * sixteen digits. The floor tested only the status, so a subscription that
     * had granted NOTHING still raised it.
     *
     * A cold review drove the cost, with the trial created exactly as
     * `startTrial` creates one: a card-less trial 60 days out stretched
     * `markPastDue`'s grace from three days to **29**, and one 120 days out
     * stopped the clawback happening at all — the unpaid month stood in full,
     * which is precisely what that handler exists to prevent.
     */
    if (!cardIsValidated(other)) continue;
    const until = entitledUntil(other);
    if (!until) continue;
    const at = Date.parse(until);
    if (Number.isFinite(at) && (furthest === null || at > furthest)) furthest = at;
  }
  return furthest;
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
  /**
   * ⚠️ SET ONLY BY `invoice.paid`. It is what allows an entitlement revoked
   * after a dispute or a refund to come back, and nothing else may claim it.
   * A subscription changing shape is not a payment.
   */
  { paymentConfirmed = false }: { paymentConfirmed?: boolean } = {},
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

  await upsertEntitlement(userId, entitledUntil(sub), true, { paymentConfirmed });
  return "handled";
}

/**
 * Write the `pro` entitlement for a user from Stripe.
 *
 * Keyed on `(user_id, product, source)`, so a user's Stripe entitlement is one
 * row that moves forward rather than a pile of rows to reconcile — and their
 * `comp`, if they have one, is a DIFFERENT row that this can never overwrite.
 *
 * ## ⚠️ A SYNC MAY ONLY EVER MAKE THIS ROW BETTER, NEVER WORSE
 *
 * Two cold reviews found two different ways this wrote the wrong answer, and
 * both had the same shape: **one row, several subscriptions, last writer wins.**
 *
 * **It shortened access that had already been paid for.** With two live
 * subscriptions (an active yearly paid through 2027, plus a stray trial — the
 * duplicate state `liveSubscriptionsForUser` exists to handle), pressing Cancel
 * fired one `customer.subscription.updated` each, and this wrote `active_until`
 * unconditionally. Measured: `2027-08-15` became `2026-08-22`. **358 days of
 * paid access taken off somebody for pressing Cancel** — the mirror image of the
 * $69.99 defect, and a coin-flip on subscription age rather than a rare
 * interleaving. `endSubscription` and `markPastDue` both already guard their
 * writes with `Math.min` for exactly this reason; this one had no guard at all.
 *
 * **It resurrected a revoked entitlement.** `revokeForCustomer` writes
 * `is_active: false` after a dispute or a refund, and it is the only writer of
 * `false`. This wrote `true` unconditionally, so the next subscription event of
 * any kind undid it — and `applyCancelFlag` fires one every time. Measured: a
 * revoked user pressed Cancel and `is_active` went back to `true` about five
 * seconds later, restoring a month of access through the one control a revoked
 * user is guaranteed to reach.
 *
 * So: **the date can only move later, and `is_active` can only go false -> true
 * when money has actually arrived.** Shortening and revoking stay the business
 * of the handlers written to do them, which is where the reasoning for each
 * lives.
 *
 * The read-then-write is not atomic, and cannot be without a migration. It is
 * far narrower than what it replaces: two racing syncs now both read the same
 * stored value and both compute the same maximum, so the loser writes the
 * winner's answer rather than its own.
 */
async function upsertEntitlement(
  userId: string,
  activeUntil: string | null,
  isActive: boolean,
  /**
   * Has money actually arrived? Only `invoice.paid` may say yes, and it is the
   * single call site that does. A subscription changing shape is not a payment:
   * toggling `cancel_at_period_end` is not evidence that a dispute was resolved.
   */
  {
    paymentConfirmed = false,
    deliberateShorten = false,
  }: {
    paymentConfirmed?: boolean;
    /**
     * Is this caller one whose whole job is to shorten? `endSubscription` is,
     * and it has already applied its own `Math.min` before calling. Without
     * this, the guard below would defeat the very handler that exists to pull
     * access back to the end of the paid period.
     */
    deliberateShorten?: boolean;
  } = {},
): Promise<void> {
  const db = serviceClient();
  /** An UPDATE already narrowed to this user's one Stripe entitlement row. */
  const scoped = (patch: { active_until?: string; is_active?: boolean }) =>
    db
      .from("entitlements")
      .update(patch)
      .eq("user_id", userId)
      .eq("product", "pro")
      .eq("source", "stripe");

  /**
   * ⚠️ NEVER WRITE A NULL DATE OVER A REAL ONE. `isEntitlementActive` reads a
   * null `active_until` as NEVER EXPIRES, so a subscription arriving with no
   * period would hand out permanent free access. `endSubscription` refuses this
   * explicitly; this used to have no equivalent and could reach it.
   */
  if (activeUntil === null) {
    console.error(
      `[billing] refusing to write a null active_until for ${userId}; entitlement left as it is`,
    );
    return;
  }

  // The row has to exist before a filtered update can match it. `DO NOTHING` on
  // conflict, so this can never clobber a row somebody else is mid-way through.
  const { error: insertError } = await db.from("entitlements").upsert(
    {
      user_id: userId,
      product: "pro",
      source: "stripe",
      active_until: activeUntil,
      is_active: isActive,
    },
    { onConflict: "user_id,product,source", ignoreDuplicates: true },
  );
  if (insertError) throw new Error(`entitlements insert: ${insertError.message}`);

  if (!isActive) {
    const { error } = await scoped({ is_active: false });
    if (error) throw new Error(`entitlements deactivate: ${error.message}`);
    return;
  }

  /**
   * ⚠️ MONEY ARRIVING RESETS A REVOKED ROW TO WHAT WAS JUST BOUGHT.
   *
   * `revokeForCustomer` deliberately leaves `active_until` alone as the record
   * of what was purchased. That stale date then acted as a FLOOR for the
   * extend-only guard below, and a cold review drove the result: a customer
   * whose refunded yearly still carried `2027-08-15` bought the **$3.99 weekly**
   * and was handed 364 days back. They paid for seven.
   *
   * So a confirmed payment on a revoked row writes the new date outright rather
   * than extending from the old one. Filtered on `is_active = false`, so it is a
   * single atomic statement that cannot touch a healthy row.
   */
  if (paymentConfirmed) {
    const { error } = await scoped({ active_until: activeUntil, is_active: true }).eq(
      "is_active",
      false,
    );
    if (error) throw new Error(`entitlements reinstate: ${error.message}`);
  }

  /**
   * ⚠️ THE DATE MOVES BY COMPARE-AND-SWAP, NOT BY READ-THEN-WRITE.
   *
   * This read the row, computed a maximum in JavaScript, and wrote it back. The
   * previous comment claimed two racing syncs would agree because both read the
   * same stored value — true only when both carry the SAME date, which is not
   * the case this guard exists for. A cold review delivered two genuinely
   * concurrent webhooks (one per subscription, which is exactly what pressing
   * Cancel produces) to the real route: **2 of 8 rounds left the row at the
   * stray trial's date, destroying 358 days.** `stripe listen` forwards
   * serially, so no local drive can see it; real Stripe does not.
   *
   * Two filtered statements instead, each atomic in Postgres. `.is()` and
   * `.lt()` rather than a single `.or()`, because an ISO timestamp carries a `+`
   * that PostgREST's or-filter grammar would have to be escaped through.
   */
  const { error: fillError } = await scoped({ active_until: activeUntil }).is(
    "active_until",
    null,
  );
  if (fillError) throw new Error(`entitlements fill: ${fillError.message}`);

  const { error: moveError } = await (deliberateShorten
    ? scoped({ active_until: activeUntil }).gt("active_until", activeUntil)
    : scoped({ active_until: activeUntil }).lt("active_until", activeUntil));
  if (moveError) throw new Error(`entitlements move: ${moveError.message}`);
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
  /**
   * ⚠️ THE ONE CALL SITE THAT MAY RESURRECT A REVOKED ENTITLEMENT — AND ONLY
   * WHEN MONEY ACTUALLY MOVED.
   *
   * `invoice.paid` alone is NOT evidence of payment. A cold review counted this
   * project's own webhook log: **27 of the last 40 `invoice.paid` events carried
   * `amount_paid: 0`** — every trial start raises a zero invoice and marks it
   * paid. Passing the flag on all of them meant a revoked account could start
   * any new subscription and have its entitlement restored for nothing, which is
   * precisely the hole this flag was added to close.
   *
   * So the amount decides, not the event name. A refund or dispute revocation
   * now survives every zero invoice, and is undone only by a real payment.
   */
  const paid = (invoice.amount_paid ?? 0) > 0;
  return syncSubscription(await fetchSubscription(subId), { paymentConfirmed: paid });
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
 * ⚠️ THE `stripe` ENTITLEMENT'S END DATE, WITH THE THIRD STATE THE CALLERS NEED.
 *
 * Both shortening paths — {@link markPastDue} and {@link endSubscription} — used
 * `const { data } = await db...` and then `if (!current) return "handled"`. The
 * error was discarded, so **a read that FAILED was indistinguishable from a row
 * that does not exist**, and both answered "nothing to shorten". That is standing
 * rule 0 in the money path, twice, and permissive in both:
 *
 *   markPastDue        the rolled-forward UNPAID period is left standing, which is
 *                      the family the measured +58 unpaid days came from
 *   endSubscription    access SURVIVES a cancellation
 *
 * So the return widens to three states and the callers answer them differently.
 * The shape is `compEntitlement`'s (`app/onboarding/billing-actions.ts:1730`) —
 * a discriminated union with an explicit `unknown` — rather than a new one.
 *
 * ⚠️ AND `present` WITH A NULL DATE IS NOT `absent`. A row that exists with no
 * `active_until` is a real row with no end date, and the pre-existing behaviour
 * for it is "nothing to shorten". Collapsing the two here would change a second
 * thing while fixing the first.
 */
/**
 * ⚠️ AND `isActive` RIDES ALONG, BECAUSE ONE CALLER NOW *GRANTS* (Group A).
 *
 * `markPastDue` can lengthen the date as well as shorten it, and lengthening a
 * row `revokeForCustomer` turned off would move the record of what was purchased
 * on somebody whose money we gave back. A refund deliberately does NOT cancel the
 * subscription (`stopDisputedBilling` returns early for `refund`), so a revoked
 * customer whose next renewal declines is a reachable state and not a hypothetical.
 *
 * The kill switch is not re-derived from the date: `revokeForCustomer` leaves
 * `active_until` alone on purpose, so the two dates are EQUAL on a real
 * revocation and any date comparison answers no. `is_active` is the only field
 * that carries it.
 */
type StripeEntitlementRead =
  | { kind: "present"; activeUntil: string | null; isActive: boolean }
  | { kind: "absent" }
  | { kind: "unknown"; message: string };

export async function readStripeEntitlement(
  db: ReturnType<typeof serviceClient>,
  userId: string,
): Promise<StripeEntitlementRead> {
  const { data, error } = await db
    .from("entitlements")
    .select("active_until, is_active")
    .eq("user_id", userId)
    .eq("product", "pro")
    .eq("source", "stripe");
  if (error) return { kind: "unknown", message: error.message };
  const row = data?.[0];
  if (!row) return { kind: "absent" };
  return {
    kind: "present",
    activeUntil: (row.active_until as string | null) ?? null,
    /**
     * ⚠️ A MISSING `is_active` READS AS TRUE, matching the column's own default
     * and the shape every other reader assumes. It is NOT "unknown": the select
     * above either returned the row or produced an error, and the error path is
     * already the `unknown` branch above.
     */
    isActive: (row.is_active as boolean | null) ?? true,
  };
}

/**
 * `invoice.payment_failed` — record `past_due`, and CLAW BACK the free month.
 *
 * ## ⚠️ A RENEWAL FAILURE ONLY. A FIRST-INVOICE FAILURE IS NOT ONE.
 *
 * Everything below reasons about a subscription that HAS been paying: "the period
 * just completed", "the last period they actually paid for", a grace window for
 * somebody who had access and is about to lose it. None of that is true of a
 * FIRST invoice.
 *
 * Stripe fires `invoice.payment_failed` for both. On a `default_incomplete`
 * subscription — an abandoned 3D Secure attempt — the first invoice fails, this
 * handler ran, and it wrote `status: "past_due"` over a subscription **Stripe
 * holds as `incomplete`**. The mirror then recorded a status the subscription
 * does not have, and which value survived was decided by webhook arrival order:
 * `syncSubscription` writes `incomplete`, this writes `past_due`, last write
 * wins. Measured 3-in-4 `incomplete`.
 *
 * So it is guarded on `billing_reason`. `subscription_create` is the first
 * invoice and returns early; every renewal reason falls through to the logic
 * below unchanged.
 *
 * ⚠️ WHAT THE GUARD DOES AND DOES NOT DO. It stops the mirror recording a status
 * Stripe does not hold, and it makes the resulting screen state DETERMINISTIC
 * rather than intermittent — `incomplete` four times in four instead of three.
 * **It does not give that cohort a control.** Per D83 they get the existing
 * support line, which is what already renders, and no cancel control either way.
 *
 * The early return is deliberately placed BEFORE the status write and before the
 * entitlement read, so a first-invoice failure touches neither table.
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
 * entitlement immediately". So this sets the date to the end of the last period
 * they actually paid for, plus {@link PAST_DUE_GRACE_DAYS}.
 *
 * ## ⚠️ "IT CAN ONLY EVER SHORTEN" WAS TRUE, AND IT MADE THE GRACE ZERO
 *
 * That heading stood here, with `Math.min` against whatever was already stored
 * and an early return when the minimum was not shorter. The reasoning was sound
 * — a failed payment must not hand out more access than was paid for — and the
 * consequence was that **the grace could never be granted at all**, only clawed
 * back from a date that was too long.
 *
 * The lifetime clock run measured it: paid through `2026-08-17T01:39:48`, access
 * to `2026-08-17T01:39:48`, **0.00 days**. On an ordinary renewal failure the
 * entitlement already ends exactly at the unpaid period's start, so the minimum
 * IS the stored value and nothing was ever written.
 *
 * The date now moves in whichever direction the answer falls, and the bound the
 * old heading was reaching for is kept explicitly and more precisely:
 * {@link pastDueGraceEnd} may never exceed what a SUCCESSFUL renewal would have
 * given. Every bound is named there.
 */
export async function markPastDue(
  invoice: Stripe.Invoice,
): Promise<HandlerOutcome> {
  const subId = subscriptionIdOf(invoice);
  if (!subId) return "handled";

  /**
   * ⚠️ THE FIRST INVOICE IS NOT A RENEWAL. See the header.
   *
   * `subscription_create` is Stripe's reason for the invoice raised when a
   * subscription is created, which is the one an abandoned 3D Secure attempt
   * leaves `open` on an `incomplete` subscription. There is no paid period behind
   * it, so there is no status to record as `past_due` and nothing to claw back.
   *
   * Handled rather than ignored: the event is real and correctly processed, it
   * simply has no work here. Returning "handled" stamps it processed so it does
   * not sit in `webhook_events_unprocessed_idx` looking like a fault.
   */
  if (invoice.billing_reason === "subscription_create") {
    console.info(
      `[billing] first-invoice failure on ${subId} (billing_reason=subscription_create); not a renewal, so no past_due write and no clawback`,
    );
    return "handled";
  }

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
  /**
   * ⚠️ WHAT A SUCCESSFUL RENEWAL WOULD HAVE GIVEN — the grace's upper bound.
   *
   * The SAME line the paid-through date is read off, the other end of it. If the
   * card had worked, access would run to here; a grace that outran it would make
   * declining more generous than paying. Read from the line rather than from the
   * invoice for the reason the paragraph above gives at length: on a
   * `subscription_cycle` invoice the top-level period covers the cycle just
   * COMPLETED, and the line carries the one that just failed.
   *
   * Null when the invoice does not carry it, and null means "no bound from here"
   * rather than a guess. See {@link pastDueGraceEnd}.
   */
  const lineEndIso = ts(invoice.lines?.data?.[0]?.period?.end);
  const renewalWouldGive = lineEndIso === null ? null : Date.parse(lineEndIso);

  const read = await readStripeEntitlement(db, userId);
  /**
   * ⚠️ A FAILED READ IS NOT "NOTHING TO SHORTEN". THROWING IS THE REFUSAL.
   *
   * A throw leaves `processed_at` NULL and Stripe retries the event
   * (`app/api/stripe/webhook/route.ts:87`), which is this system's documented way
   * of saying "we could not do the work". Returning "handled" would tell Stripe
   * the shortening was applied and leave the unpaid period standing forever.
   */
  if (read.kind === "unknown") {
    throw new Error(
      `[billing] could not read the stripe entitlement for ${userId} while marking past due ` +
        `(${read.message}); refusing to report this event handled`,
    );
  }
  const current = read.kind === "present" ? read.activeUntil : null;
  /**
   * ⚠️ NO ROW, OR A ROW WITH NO END DATE, IS STILL "NOTHING TO DO" — INCLUDING
   * NOW THAT THIS HANDLER CAN GRANT.
   *
   * `absent` means this account holds no Stripe entitlement at all, and writing
   * one here would hand three days of access to somebody a failed payment is the
   * only evidence about. `present` with a null date is a row that never expires;
   * dating it would SHORTEN an unlimited entitlement, which is a second change
   * dressed as this one. Both keep the behaviour they have always had.
   */
  if (!current) return "handled";

  /**
   * ⚠️ THE CLAWBACK IS ABOUT *THIS* SUBSCRIPTION, AND THE ROW IS SHARED.
   *
   * A cold review drove it with no test clock at all: a paid yearly plus a
   * second subscription whose card declined. The failing invoice's line period
   * governed the whole row, so `2027-08-15` became a three-day grace while the
   * yearly was still `active` and fully paid. Wider reach than the deletion
   * case, because it needs no duplicate LIVE subscription — only a failed
   * attempt on a customer who already holds an entitlement, which the
   * paid-today path produces on any declined card.
   */
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  const floor = customerId
    ? await otherLiveEntitlementFloor(customerId, subId)
    : null;

  const currentMs = Date.parse(current);
  const target = pastDueGraceEnd({ graceEnds, renewalWouldGive, currentMs, floor });

  /**
   * ⚠️ EQUAL IS THE IDEMPOTENT NO-OP, AND IT IS WHAT MAKES REDELIVERY FREE.
   *
   * {@link pastDueGraceEnd} is computed from the INVOICE and from nothing that
   * moves — not `now`, not a delta against what is stored — so the second, third
   * and tenth delivery of the same `invoice.payment_failed` all resolve to the
   * same instant. The first writes it; the rest land here. That is the whole
   * idempotency argument, and it is a property of the arithmetic rather than of a
   * marker somebody has to remember to check.
   */
  if (target === currentMs) return "handled";

  /**
   * ⚠️ A GRANT MAY NOT REACH A ROW SOMEBODY TURNED OFF. A CLAWBACK STILL MAY.
   *
   * `revokeForCustomer` writes `is_active: false` and deliberately leaves
   * `active_until` standing as the record of what was purchased. Lengthening that
   * date would move the record on a customer whose money we have given back — and
   * a REFUND does not cancel the subscription (`stopDisputedBilling` returns early
   * for it), so the next renewal declining on a revoked account is a reachable
   * state rather than a hypothetical.
   *
   * Shortening is untouched in that state: pulling a dead row's date back can only
   * ever make it agree with reality sooner.
   */
  if (target > currentMs && read.kind === "present" && !read.isActive) {
    console.info(
      `[billing] ${userId} is past due and the grace would LENGTHEN a revoked entitlement; ` +
        `leaving ${current} exactly as revokeForCustomer left it`,
    );
    return "handled";
  }

  const { error: entError } = await db
    .from("entitlements")
    .update({ active_until: new Date(target).toISOString() })
    .eq("user_id", userId)
    .eq("product", "pro")
    .eq("source", "stripe");
  if (entError) throw new Error(`entitlements grace: ${entError.message}`);
  console.info(
    `[billing] past-due grace for ${userId}: ${current} -> ${new Date(target).toISOString()} ` +
      `(${target > currentMs ? "granted" : "clawed back"} from the paid-through date ${unpaidFrom})`,
  );
  return "handled";
}

/**
 * ⚠️ WHERE ACCESS ENDS AFTER A RENEWAL HAS FAILED. THE WHOLE OF GROUP A.
 *
 * ## The grace was three days and measured ZERO
 *
 * The lifetime clock run put the numbers side by side: paid through
 * `2026-08-17T01:39:48`, access to `2026-08-17T01:39:48`. **0.00 days.**
 *
 * The old arithmetic was `max(min(current, graceEnds), floor)` followed by an
 * early return when that was not SHORTER than what was stored. On an ordinary
 * renewal failure the entitlement already ends exactly at the unpaid period's
 * start — that is what a healthy paid-through date IS — so `min(current,
 * current + 3d)` is `current`, nothing was ever written, and the handler answered
 * "handled". **The function could only claw a longer-dated entitlement back. It
 * could never grant the grace, and no second mechanism existed.**
 *
 * So the target is computed OUTRIGHT and written in whichever direction it falls.
 * The property is not "shorten by up to three days"; it is:
 *
 * > after a renewal payment fails, the entitlement ends exactly
 * > {@link PAST_DUE_GRACE_DAYS} after the PAID-THROUGH date.
 *
 * ## ⚠️ IT GRANTS ACCESS, SO EVERY BOUND IS NAMED HERE
 *
 * This is the family that once produced **+58 unpaid days**. Four bounds, and
 * each one is a different failure it would otherwise reopen:
 *
 *   1. **A RENEWAL, never a past_due state we happen to observe.** The caller
 *      returns early on `billing_reason: "subscription_create"` and reaches this
 *      only from `invoice.payment_failed`. Nothing derives a grace from a status.
 *   2. **Measured from the PAID-THROUGH date, never from `now`.** `graceEnds` is
 *      the failing line's period start plus the constant. Anchoring to `now`
 *      would restart the window on every redelivery and every retry, which is the
 *      free-month shape wearing a three-day mask.
 *   3. **Never past what a SUCCESSFUL renewal would have given.** `renewalWouldGive`
 *      is the failing line's period END — the exact access the customer would hold
 *      if the card had worked. A grace that outran it would make declining more
 *      generous than paying. It binds on any interval shorter than the constant,
 *      and is the reason a one-day plan could never be turned into three.
 *   4. **Never below what ANOTHER live subscription independently entitles them
 *      to.** `floor` is {@link otherLiveEntitlementFloor}, and it applies in the
 *      SHORTENING direction only: it exists to stop one declined charge clawing
 *      back a yearly somebody else already paid for. It is not a grant of its own,
 *      so it can never push the answer past what is already stored — that would be
 *      this handler quietly extending an entitlement off the back of a subscription
 *      it was told nothing about.
 *
 * Pure, and exported for the unit tests: every bound above is a line in
 * `pastDueGrace.test.ts` that can be driven without Stripe, a clock, or a network.
 */
export function pastDueGraceEnd({
  graceEnds,
  renewalWouldGive,
  currentMs,
  floor,
}: {
  /** The paid-through instant plus {@link PAST_DUE_GRACE_DAYS}, in ms. */
  graceEnds: number;
  /** The failing period's END, in ms, or null when the invoice does not say. */
  renewalWouldGive: number | null;
  /** What `entitlements.active_until` holds right now, in ms. */
  currentMs: number;
  /** {@link otherLiveEntitlementFloor}'s answer, in ms, or null. */
  floor: number | null;
}): number {
  /** Bound 3. A grace may not outrun the period the payment would have bought. */
  let target =
    renewalWouldGive !== null && Number.isFinite(renewalWouldGive)
      ? Math.min(graceEnds, renewalWouldGive)
      : graceEnds;

  /**
   * Bound 4, and the direction is the point. The floor protects a longer date
   * from a clawback; it never lifts one. `Math.min(currentMs, ...)` is what keeps
   * it a floor rather than turning it into a second grant.
   */
  if (target < currentMs && floor !== null && Number.isFinite(floor)) {
    target = Math.min(currentMs, Math.max(target, floor));
  }

  return target;
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

  const read = await readStripeEntitlement(db, userId);
  /**
   * ⚠️ AND HERE THE PERMISSIVE FAILURE IS WORSE: access SURVIVES A CANCELLATION.
   *
   * Same refusal, same reason. Stripe retries; nothing is reported handled on a
   * read we could not perform.
   */
  if (read.kind === "unknown") {
    throw new Error(
      `[billing] could not read the stripe entitlement for ${userId} while ending the subscription ` +
        `(${read.message}); refusing to report this event handled`,
    );
  }
  const current = read.kind === "present" ? read.activeUntil : null;
  // No row yet, or one that already ends sooner — nothing a cancellation should
  // do. Cancelling is not a way to buy time.
  if (!current) return "handled";

  /**
   * ⚠️ AND NOT BELOW WHAT THE CUSTOMER'S OTHER LIVE SUBSCRIPTIONS ENTITLE.
   *
   * The entitlement row is shared across every subscription this customer has.
   * Without this floor, one dying trial dragged a paid yearly's access back by
   * 362 days. See {@link otherLiveEntitlementFloor}.
   */
  const floor = await otherLiveEntitlementFloor(customerId, sub.id);
  const shortened = Math.max(
    Math.min(Date.parse(current), Date.parse(until)),
    floor ?? Number.NEGATIVE_INFINITY,
  );
  if (shortened >= Date.parse(current)) return "handled";

  // `deliberateShorten`: this handler's entire job is to pull the date back, and
  // it has already taken the `Math.min` above. It still may not resurrect a
  // revoked entitlement — only money does that.
  await upsertEntitlement(userId, new Date(shortened).toISOString(), true, {
    deliberateShorten: true,
  });
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
/**
 * ⚠️ DISPUTE STATUSES WHERE NO MONEY HAS MOVED.
 *
 * `charge.dispute.created` fires for INQUIRIES and retrieval requests as well as
 * for real chargebacks. On an inquiry the bank is asking a question; the funds
 * are still ours. A cold review drove `pm_card_createDisputeInquiry` against a
 * paid $69.99 year:
 *
 *     dispute status = warning_needs_response, amount_refunded = 0
 *     entitlement    -> is_active = false
 *
 * 365 days of paid access destroyed by a question. And because the revocation is
 * now deliberately sticky, winning the inquiry did not give it back.
 */
const DISPUTE_INQUIRY_STATUSES: ReadonlySet<string> = new Set([
  "warning_needs_response",
  "warning_under_review",
  "warning_closed",
]);

export async function revokeForCustomer(
  chargeId: string | Stripe.Charge | null,
  reason: "dispute" | "refund",
  client: Stripe,
  /** The dispute itself, when there is one, so an inquiry can be told apart. */
  dispute?: Stripe.Dispute,
): Promise<HandlerOutcome> {
  if (reason === "dispute" && dispute && DISPUTE_INQUIRY_STATUSES.has(dispute.status)) {
    console.warn(
      `[billing] dispute ${dispute.id} is ${dispute.status} (an inquiry, no funds withdrawn); entitlement left standing`,
    );
    return "handled";
  }

  const id = typeof chargeId === "string" ? chargeId : chargeId?.id;
  if (!id) return "handled";

  let customerId: string | null = null;
  let refundedSubscriptionId: string | null = null;
  try {
    const charge = await client.charges.retrieve(id);
    /**
     * ⚠️ A PARTIAL REFUND IS NOT A REVOCATION.
     *
     * `charge.refunded` fires on partial refunds too, and this compared nothing:
     * any refund event flipped the whole entitlement off. A cold review drove
     * it — **$1.00 refunded off a $69.99 yearly destroyed 364 days of paid
     * access.** A goodwill gesture became a lockout.
     *
     * It got worse when the resurrection guard landed: before it, the next
     * subscription event of any kind quietly un-revoked them; now only a real
     * payment can, which on a yearly plan is up to 364 days away. Making the
     * revocation stick is right, and it makes being wrong about WHEN to revoke
     * much more expensive.
     *
     * So: only a refund of the whole charge revokes. A partial one is logged and
     * left alone, because the period was still bought.
     */
    if (reason === "refund") {
      const refunded = charge.amount_refunded ?? 0;
      /**
       * Nothing came back, or only part of it. Both are "the period was still
       * bought", so both leave the entitlement standing — including
       * `refunded === 0`, which is what a refund that FAILED looks like when the
       * charge is re-read.
       */
      if (refunded < charge.amount) {
        console.warn(
          `[billing] refund on ${id} is ${refunded} of ${charge.amount}; entitlement left standing`,
        );
        return "handled";
      }
    }
    customerId =
      typeof charge.customer === "string" ? charge.customer : (charge.customer?.id ?? null);
    if (customerId) refundedSubscriptionId = await subscriptionBehind(charge, client, customerId);
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
  /**
   * ⚠️ THE READ ERROR IS INSPECTED, AND AN UNREADABLE MAPPING THROWS (2.2).
   *
   * Six lines above, an unreadable Stripe charge throws so Stripe retries, under
   * this file's own stated principle: "a revocation we failed to apply must be
   * retried, and must not be stamped as processed." This read dropped its error,
   * answered `unattributed`, and Stripe got a 200 — so the redelivery never
   * came and a chargeback was silently never applied.
   *
   * ⚠️ AND "UNMAPPED" AND "UNREADABLE" STAY DIFFERENT FACTS. Only one is helped
   * by a retry:
   *
   *   read failed          we do not know whose this is. THROW, so Stripe
   *                        redelivers and the next attempt can find out.
   *   read worked, no row  there genuinely is no account behind this customer —
   *                        a Stripe-side object, or a deleted account. Retrying
   *                        forever would never produce a row. `unattributed`,
   *                        which is what that outcome is for.
   *
   * Collapsing them was the defect; collapsing them the other way would turn
   * every genuinely unmapped customer into an infinite redelivery.
   */
  const { data, error: mapError } = await db
    .from("billing_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (mapError) {
    console.error(
      `[billing] could not read the account behind ${customerId} for a ${reason}:`,
      mapError.message,
    );
    throw new Error(`billing_customers lookup failed for ${reason}`);
  }

  const userId = data?.user_id;
  if (!userId) {
    console.error(`[billing] ${reason} on unmapped customer ${customerId}`);
    return "unattributed";
  }

  /**
   * ⚠️ THE MONEY THAT CAME BACK BOUGHT ONE SUBSCRIPTION. THE ROW SERVES THEM ALL.
   *
   * This wrote `is_active: false` scoped to `user_id` alone, so a refund on one
   * charge killed access another, unrefunded charge had paid for. A cold review
   * drove it: one customer holding a paid $69.99 yearly and a $3.99 weekly, the
   * WEEKLY refunded in full —
   *
   *     the year's charge: amount_refunded = 0 of 6999
   *     entitlement:       is_active = false
   *
   * 365 days of paid, unrefunded access destroyed by a $3.99 refund — and
   * refunding a duplicate charge in full is the correct support action for the
   * duplicate-subscription state this file documents at length.
   *
   * Same shape as the deletion and dunning defects: a per-user row written from
   * a per-charge event. So the refunded subscription is EXCLUDED and the
   * question is asked of the rest: is anything else still paying for this
   * person's access? If so the row is shortened to what those cover rather than
   * switched off. Only when nothing else pays is the entitlement revoked, which
   * is the ordinary chargeback and the case the kill switch exists for.
   */
  /**
   * ⚠️ IF THE CHARGE COULD NOT BE RESOLVED, REVOKE. DO NOT MEASURE IT AGAINST
   * ITSELF.
   *
   * `""` excludes nothing, so an unresolved charge left the refunded
   * subscription raising its own floor — it is still `active`, a refund does not
   * cancel it — and a full refund revoked nothing at all. A cold review drove it
   * by pushing the paid invoice off the first page of 100: `subscriptionBehind`
   * returned null and $69.99 came back with `is_active` still true. A weekly
   * subscriber passes 100 invoices in under two years.
   *
   * So an unresolved charge falls back to the blunt behaviour rather than the
   * generous one. The kill switch existing and being wrong occasionally is the
   * lesser failure; the kill switch quietly not firing is the one it was written
   * to prevent.
   */
  const floor = refundedSubscriptionId
    ? await otherLiveEntitlementFloor(customerId, refundedSubscriptionId)
    : null;
  if (floor !== null) {
    const stillPaid = new Date(floor).toISOString();
    console.warn(
      `[billing] ${reason} for ${userId}, but another live subscription still entitles them to ${stillPaid}; shortening rather than revoking`,
    );
    const { error: shortenError } = await db
      .from("entitlements")
      .update({ active_until: stillPaid })
      .eq("user_id", userId)
      .eq("product", "pro")
      .eq("source", "stripe")
      .gt("active_until", stillPaid);
    if (shortenError) throw new Error(`entitlements shorten: ${shortenError.message}`);
    await stopDisputedBilling(reason, refundedSubscriptionId, client, userId);
    return "handled";
  }

  /**
   * ⚠️ WHY, NOT ONLY THAT (D101, answering Q106).
   *
   * `entitlements` recorded THAT a row was revoked and never WHY, so a full
   * refund and a chargeback left byte-identical rows and both of `08`'s dispute
   * sentences selected for a refunded account — telling somebody the founder
   * refunded as goodwill that their bank disputed a payment. This function
   * already KNEW: `reason` is a parameter and was simply not persisted.
   *
   * ⚠️ TOLERANT OF `005` BEING UNAPPLIED, and the retry is not optional. A deploy
   * and a migration do not land in the same instant, and a revocation that fails
   * because of a missing display column would be a chargeback we did not apply —
   * far worse than a screen that says less. PostgREST answers `PGRST204` here
   * (it validates the body against its own schema cache before Postgres sees the
   * statement), which is the lesson `trialLease.ts` paid for by catching `42703`.
   */
  let { error } = await db
    .from("entitlements")
    .update({ is_active: false, revoked_reason: reason })
    .eq("user_id", userId)
    .eq("product", "pro")
    .eq("source", "stripe");

  if (error && isMissingColumn(error)) {
    console.info(
      `[billing] revoked_reason is not present (005 unapplied); revoking ${userId} without it`,
    );
    ({ error } = await db
      .from("entitlements")
      .update({ is_active: false })
      .eq("user_id", userId)
      .eq("product", "pro")
      .eq("source", "stripe"));
  }
  if (error) throw new Error(`entitlements revoke: ${error.message}`);

  console.warn(`[billing] revoked pro for ${userId} after a ${reason}`);
  await stopDisputedBilling(reason, refundedSubscriptionId, client, userId);
  return "handled";
}

/**
 * ⚠️ A DISPUTE CANCELS THE STRIPE SUBSCRIPTION (2.1). FOUNDER RULING.
 *
 * Until now a dispute took access away and left Stripe billing. Two costs, and
 * the second is the expensive one:
 *
 *   · we go on charging somebody whose money we no longer have;
 *   · the next invoice is raised on schedule, they dispute that one too, and the
 *     DISPUTE FEE stacks — a fee we pay per dispute, on a charge we were never
 *     going to keep.
 *
 * ## ⚠️ ACCESS FIRST, BILLING SECOND, AND THE ORDER IS NOT NEGOTIABLE
 *
 * Called after the entitlement write, never before. If this throws, the
 * revocation has already landed and Stripe redelivers — and the revoke is
 * idempotent, so the retry is free. Cancelling first and then failing to revoke
 * would leave somebody with access they disputed and no subscription to explain
 * it.
 *
 * ## ⚠️ ONLY THE SUBSCRIPTION THE DISPUTED CHARGE PAID FOR
 *
 * `subscriptionBehind` resolves it from the charge's payment intent. A customer
 * can hold two subscriptions, and cancelling a healthy second one because the
 * first was disputed would be this file's own `$3.99 refund destroys a $69.99
 * year` defect wearing different clothes.
 *
 * When it cannot be resolved, NOTHING is cancelled and the state is logged
 * loudly. Erring towards leaving billing running is the direction that never
 * cancels the wrong subscription, and it does not go unnoticed: `11`'s new
 * `revoked-entitlement-beside-live-subscription` rule reports exactly this
 * shape, which is what makes the conservative choice safe rather than silent.
 *
 * ## ⚠️ REFUNDS ARE DELIBERATELY NOT INCLUDED
 *
 * The ruling names disputes. A refund is a support action the founder performs
 * by hand, often as goodwill, and there is no fee stacking behind it — the
 * subscription is frequently one they mean to keep. Only a FULL refund reaches
 * here at all, and even then cancelling would be deciding something nobody
 * decided.
 */
async function stopDisputedBilling(
  reason: "dispute" | "refund",
  subscriptionId: string | null,
  client: Stripe,
  userId: string,
): Promise<void> {
  if (reason !== "dispute") return;

  if (!subscriptionId) {
    console.error(
      `[billing] a dispute revoked access for ${userId} but the subscription behind the ` +
        `charge could not be resolved; NOTHING was cancelled and Stripe may bill again — ` +
        `reconciliation reports this as revoked-entitlement-beside-live-subscription`,
    );
    return;
  }

  try {
    const cancelled = await client.subscriptions.cancel(subscriptionId);
    console.warn(
      `[billing] cancelled ${subscriptionId} for ${userId} after a dispute (now ${cancelled.status})`,
    );
  } catch (err) {
    /**
     * ⚠️ ALREADY GONE IS THE GOAL REACHED, NOT A FAILURE. A redelivered dispute
     * event finds the subscription already cancelled, and throwing there would
     * make Stripe retry forever on a state that is already correct.
     */
    const code = (err as { code?: string })?.code;
    const message = err instanceof Error ? err.message : String(err);
    if (code === "resource_missing" || /No such subscription/i.test(message)) {
      console.info(`[billing] ${subscriptionId} was already gone; nothing to cancel`);
      return;
    }
    console.error(`[billing] could not cancel ${subscriptionId} after a dispute:`, message);
    // Thrown for the same reason the charge read is: billing we failed to stop
    // must be retried, and must not be stamped as processed. The revocation
    // above has already landed and re-applying it is idempotent.
    throw new Error(`dispute cancel failed for ${subscriptionId}`);
  }
}

/**
 * Which subscription a charge paid for, or null.
 *
 * Needed so a refund is not measured against the very subscription whose money
 * just came back — otherwise it vouches for itself and nothing is ever revoked.
 *
 * ⚠️ `charge.invoice` DOES NOT EXIST in this API version (the same removal
 * family as `invoice.payment_intent`), so the link is walked the other way: the
 * charge's payment intent, matched against each invoice's `payments`. Verified
 * against real test-mode objects —
 *
 *     charge.payment_intent          pi_3U4mQ8...
 *     invoice.payments[].payment     {"payment_intent":"pi_3U4mQ8...","type":"payment_intent"}
 *     invoice.parent.subscription_details.subscription  sub_1U4mQ7...
 *
 * Null on failure, which errs towards KEEPING access: an unresolved charge means
 * the subscription is not excluded, so it vouches for itself and the revoke is
 * skipped rather than applied to somebody who may have paid.
 */
async function subscriptionBehind(
  charge: Stripe.Charge,
  client: Stripe,
  customerId: string,
): Promise<string | null> {
  const intentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? null);
  if (!intentId) return null;
  try {
    const invoices = await client.invoices.list({
      customer: customerId,
      limit: 100,
      expand: ["data.payments"],
    });
    for (const invoice of invoices.data) {
      const paid = invoice.payments?.data ?? [];
      if (paid.some((p) => p.payment?.payment_intent === intentId)) {
        return subscriptionIdOf(invoice);
      }
    }
    return null;
  } catch (err) {
    console.warn(
      `[billing] could not resolve the subscription behind ${charge.id}:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

