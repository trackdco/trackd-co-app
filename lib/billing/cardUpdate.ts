import "server-only";

import type Stripe from "stripe";

import { BILLABLE_STATUSES } from "./cancel";
import { listAllSubscriptions } from "./subscriptionList";
import type { HandlerOutcome } from "./sync";

/**
 * ⚠️ UPDATING A CARD RETRIES THE OPEN INVOICE (Group B).
 *
 * ## The measurement this exists for
 *
 * The lifetime clock run drove it and the answer was a flat no: card updated,
 * `attempt_count` 1 -> 1, no new charge, invoice still `open`, **over 240 seconds
 * of real time with the clock held still**. Stripe waits for its own next dunning
 * attempt, which the same run measured at **simulated day +2**.
 *
 * So a customer whose card fails, who fixes it within a minute, is locked out for
 * two more days — while `DeclinedCard` tells them "access comes back as soon as a
 * payment goes through". True in letter, misleading in effect. With the past-due
 * grace at zero it was worse; with three days it still matters, because the grace
 * runs out while they wait.
 *
 * ## ⚠️ IT IS TRIGGERED BY AN EVENT, NEVER BY THE BUTTON
 *
 * The card is typed into **Stripe's own hosted form** — the billing portal — and
 * this app never sees it, never gets a callback, and has no moment of its own to
 * hang the retry on. `StripeHandoff` opens the portal and the user may never come
 * back to the tab. The only reliable signal is the webhook, so
 * `payment_method.attached` and `customer.updated` both route here. Nothing in
 * the repo handled either before this.
 *
 * ## ⚠️ IT MUST REACH THE SUBSCRIPTION, NOT ONLY THE CUSTOMER
 *
 * A subscription's own `default_payment_method` BEATS the customer's
 * `invoice_settings.default_payment_method`, and `startTrial` creates
 * subscriptions with `save_default_payment_method: "on_subscription"` — so every
 * paying customer's subscription carries its own default, pointing at the card
 * that just died. Setting only the customer level leaves the renewal failing;
 * the harness README records the same fact from the other direction, where it
 * made a driver report "no failure" while looking correct.
 *
 * ## ⚠️ THE POINTER MOVES ON EVERY ATTACH. ONLY THE *PAY* STEP NEEDS AN INVOICE.
 *
 * The first version of this module did nothing at all without an open invoice,
 * and that was too literal a reading of its own brief (founder, 20 Aug 2026):
 *
 * > Somebody who replaces a card before it expires still has the subscription
 * > pointing at the dead one, so their next renewal fails for a problem they
 * > already fixed. Setting the pointer charges nobody.
 *
 * That customer is the COMMON case — the one who acts before anything breaks —
 * and the old shape helped only the ones who had already been locked out. So the
 * two steps are separated:
 *
 *   POINT   every subscription that could still take money, on every attach.
 *           Writes no money and raises no invoice.
 *   PAY     only an OPEN invoice, and only on a subscription in dunning.
 *
 * ⚠️ THE SET IS {@link BILLABLE_STATUSES} AND NOT A LITERAL. Its question — "what
 * could still take their money?" — is exactly this one: a subscription that can
 * still charge should charge the card the customer has just handed us. A literal
 * status list here would go stale the next time that set moves, which is the
 * class of defect `/billing`'s mirror filter and the courtesy read both paid for.
 *
 * ## ⚠️ IT GRANTS NOTHING. `invoice.paid` STILL DOES THAT AND ONLY IT.
 *
 * Nothing here writes `entitlements`. Paying the invoice makes Stripe fire
 * `invoice.paid`, which reaches `extendFromInvoice` with `amount_paid > 0`, and
 * THAT restores access. Restoring it optimistically on the card update would
 * grant access for a charge that has not settled — the same mistake
 * `extendFromInvoice`'s own zero-amount guard exists to prevent.
 *
 * ## ⚠️ TWO GUARDS, COVERING TWO DIFFERENT WINDOWS
 *
 * The same shape `grantExtraTime` uses, and for the same reason: one guard cannot
 * cover both.
 *
 *   **The invoice marker** covers the SEQUENTIAL case. One card update in Stripe's
 *   portal fires more than one event — `payment_method.attached` and
 *   `customer.updated` at minimum — and every one of them arrives here. The marker
 *   records the payment method last attempted on this invoice, so the second,
 *   third and tenth event for the same card do nothing at all.
 *
 *   **A Stripe idempotency key** covers the CONCURRENT one, which the marker
 *   cannot: two events in the same tick both read "no marker" before either
 *   writes. Both compute an identical key from the invoice and the payment method,
 *   so Stripe applies the payment once and replays it to the loser.
 *
 * ⚠️ AND THE MARKER IS WRITTEN **BEFORE** THE ATTEMPT, WHICH IS THE OPPOSITE
 * ORDER TO `grantExtraTime`, DELIBERATELY. There the failure mode of stamping
 * first is somebody promised a week who never gets it; here the failure mode of
 * stamping last is a SECOND CHARGE ATTEMPT on a customer's card. Marking first
 * fails towards a retry that did not happen, and Stripe's own dunning still runs.
 *
 * ## What a genuinely NEW card does, and why that is not a hole
 *
 * A different payment method is a different marker value, so it gets its own
 * attempt. That is the behaviour a customer whose first replacement ALSO declined
 * actually needs — otherwise the fix stops one level short of the problem it was
 * built for. It cannot become a double charge: the moment an attempt succeeds the
 * invoice stops being `open` and the state guard below refuses every later event.
 */

/**
 * Where the last attempt on an invoice is recorded. The payment method's id, so
 * "the same card again" and "a different card" are distinguishable.
 */
export const CARD_RETRY_KEY = "trackd_card_update_retry_pm";

/**
 * ⚠️ THE STATES A RENEWAL FAILURE LEAVES, AND NOTHING ELSE.
 *
 * `incomplete` is deliberately absent. It is a FIRST invoice on a subscription
 * whose checkout was never completed — an abandoned 3D Secure attempt, which
 * `startTrial` produces and `markPastDue` already refuses to treat as a renewal
 * for the same reason. Paying it on a card update would take money for a
 * subscription the customer walked away from, on a signal that says nothing about
 * their having decided to go through with it.
 *
 * `past_due` and `unpaid` are the dunning states: money was owed on a period that
 * had already been agreed, and the only thing that failed was the card.
 */
const DUNNING_STATUSES: ReadonlySet<string> = new Set(["past_due", "unpaid"]);

/**
 * Invoice states where money is genuinely owed and has not arrived.
 *
 * `draft` is absent for the reason `saveOffer.ts` gives about the same set: a
 * draft is the NEXT period being assembled and is not due yet.
 */
const PAYABLE_INVOICE_STATUSES: ReadonlySet<string> = new Set(["open"]);

/** What one invoice's retry did, for the log and for the caller's summary. */
type Attempt =
  | "paid"
  | "declined"
  | "skipped-same-card"
  | "skipped-not-dunning"
  | "skipped-no-subscription"
  | "error";

/**
 * ⚠️ MAY THIS INVOICE BE ATTEMPTED? PURE, SO EVERY BOUND IS A UNIT TEST.
 *
 * The three refusals below are the whole safety story of this module, and each
 * one is a different way of charging somebody who did not ask to be charged.
 * Deciding them inside an `async` function full of Stripe round trips means the
 * only way to check them is a real card on a real clock — so they are decided
 * here, from four values, and `cardUpdate.test.ts` drives all of them in
 * milliseconds.
 *
 * The Stripe calls stay in {@link retryOne}; this says only whether they may
 * happen.
 */
export type RetryVerdict =
  | { attempt: true }
  | { attempt: false; because: "same-card" | "not-a-subscription" | "not-dunning" };

export function cardRetryVerdict({
  markerPaymentMethod,
  paymentMethodId,
  subscriptionId,
  subscriptionStatus,
}: {
  /** `invoice.metadata[CARD_RETRY_KEY]` — the card this invoice was last tried with. */
  markerPaymentMethod: string | null | undefined;
  /** The card in hand. */
  paymentMethodId: string;
  /** The subscription behind the invoice, or null for a one-off. */
  subscriptionId: string | null;
  /** That subscription's live Stripe status, or null when there is no subscription. */
  subscriptionStatus: string | null;
}): RetryVerdict {
  /**
   * GUARD 1 — the SEQUENTIAL one. One card update in Stripe's portal fires more
   * than one event, and every one of them arrives here. A different card is a
   * different marker and gets its own attempt, which is what a customer whose
   * first replacement also declined actually needs.
   */
  if (markerPaymentMethod === paymentMethodId) {
    return { attempt: false, because: "same-card" };
  }
  /**
   * A one-off invoice has no renewal behind it and no lockout to undo. Charging
   * one because a card arrived would be taking money on a signal that says
   * nothing about the customer having agreed to it.
   */
  if (!subscriptionId) return { attempt: false, because: "not-a-subscription" };
  /**
   * ⚠️ AND THE SUBSCRIPTION HAS TO BE IN DUNNING. `incomplete` is excluded by
   * {@link DUNNING_STATUSES} for the reason `markPastDue` excludes
   * `subscription_create`: a first invoice on an abandoned checkout is not a
   * renewal, and paying it would buy a subscription somebody walked away from.
   */
  if (!subscriptionStatus || !DUNNING_STATUSES.has(subscriptionStatus)) {
    return { attempt: false, because: "not-dunning" };
  }
  return { attempt: true };
}

/**
 * A card arrived on this customer. If a renewal is sitting unpaid, try it.
 *
 * Returns `handled` in every case, including a decline: a declined retry is a
 * correctly processed event, and throwing would make Stripe redeliver forever on
 * a card that is simply not going to work. `unattributed` is not reachable — this
 * writes no app table and needs no user id, so there is nothing to fail to
 * attribute.
 */
export async function retryOpenInvoicesForCustomer(
  customerId: string,
  /**
   * The payment method the event carried, or null to fall back to the customer's
   * own default. `payment_method.attached` names one; `customer.updated` does not,
   * and the value that changed is read off the customer instead.
   */
  paymentMethodId: string | null,
  client: Stripe,
): Promise<HandlerOutcome> {
  const pmId = paymentMethodId ?? (await defaultPaymentMethodOf(customerId, client));
  if (!pmId) {
    console.info(
      `[billing] ${customerId} changed with no resolvable payment method; nothing to retry with`,
    );
    return "handled";
  }

  /**
   * ⚠️ STEP ONE — POINT EVERYTHING THAT COULD STILL CHARGE AT THE NEW CARD.
   *
   * Before any invoice is looked at, because this is the step that helps the
   * customer who acted BEFORE anything broke. It charges nobody.
   */
  const pointed = await pointSubscriptionsAt(customerId, pmId, client);

  /**
   * ⚠️ THE OPEN INVOICES ARE ASKED FOR BY NAME, not derived from the subscription.
   *
   * `subscription.latest_invoice` is the newest one, which on a customer whose
   * card has failed twice is not necessarily the one that is open. Asking Stripe
   * for `status: "open"` is the question actually being asked, and it is one round
   * trip either way.
   */
  let open: Stripe.Invoice[];
  try {
    const list = await client.invoices.list({
      customer: customerId,
      status: "open",
      limit: 100,
    });
    open = list.data.filter((i) => PAYABLE_INVOICE_STATUSES.has(i.status ?? ""));
  } catch (err) {
    console.error(
      `[billing] could not list open invoices for ${customerId}:`,
      err instanceof Error ? err.message : String(err),
    );
    return "handled";
  }

  /**
   * ⚠️ NOTHING OPEN, NOTHING **CHARGED**. The pointer has already moved, and that
   * is the whole point of the split: a healthy customer replacing an expiring card
   * gets their next renewal fixed and is not charged a penny today.
   */
  if (open.length === 0) {
    console.info(
      `[billing] ${customerId} updated a card with no open invoice; ${pointed} subscription(s) ` +
        `re-pointed and nothing charged`,
    );
    return "handled";
  }

  const results: Attempt[] = [];
  for (const invoice of open) {
    results.push(await retryOne(invoice, pmId, customerId, client));
  }
  console.info(
    `[billing] card-update for ${customerId}: ${pointed} subscription(s) re-pointed, ` +
      `${results.length} open invoice(s) — ${results.join(", ")}`,
  );
  return "handled";
}

/**
 * ⚠️ POINT EVERY SUBSCRIPTION THAT COULD STILL CHARGE AT THE CARD IN HAND.
 *
 * Returns how many were actually written, which is what the caller logs.
 *
 * ## It charges nobody, and that is the property that makes it unconditional
 *
 * `subscriptions.update({ default_payment_method })` sets a pointer. It raises no
 * invoice, attempts no payment and changes no date. The PAY step is separate and
 * still needs an open invoice on a subscription in dunning.
 *
 * ## ⚠️ IDEMPOTENT BY COMPARISON, WHICH IS WHAT KEEPS IT QUIET
 *
 * A subscription already pointing at this card is skipped without a write. One
 * card update in Stripe's portal fires more than one event that reaches this
 * handler, and every redelivery reaches it again; without the comparison each one
 * would be a Stripe write and a `customer.subscription.updated` back at us.
 *
 * ⚠️ AND THERE IS NO LOOP. `subscriptions.update` fires
 * `customer.subscription.updated`, which the route sends to `syncSubscription` —
 * not here. Checked at the route rather than assumed, because a handler that can
 * re-trigger itself on a payments path is the expensive kind of mistake.
 *
 * ## What it deliberately does NOT do
 *
 * It does not touch `customer.invoice_settings`. Stripe's own portal owns that and
 * has usually just written it; a second writer would be this app arguing with the
 * screen the customer is looking at.
 */
async function pointSubscriptionsAt(
  customerId: string,
  pmId: string,
  client: Stripe,
): Promise<number> {
  let subscriptions: Stripe.Subscription[];
  try {
    /**
     * ⚠️ PAGED. A truncated list silently leaves the OLDEST subscription — which is
     * where a long-lived yearly plan lives — still pointing at the dead card, and
     * the failure would surface a year later as a renewal nobody could explain.
     */
    subscriptions = await listAllSubscriptions(client, customerId);
  } catch (err) {
    console.error(
      `[billing] could not list subscriptions for ${customerId} to re-point them:`,
      err instanceof Error ? err.message : String(err),
    );
    return 0;
  }

  let written = 0;
  for (const sub of subscriptions) {
    if (!BILLABLE_STATUSES.has(sub.status)) continue;
    const current =
      typeof sub.default_payment_method === "string"
        ? sub.default_payment_method
        : (sub.default_payment_method?.id ?? null);
    if (current === pmId) continue; // already there; no write, no event
    try {
      await client.subscriptions.update(sub.id, { default_payment_method: pmId });
      written += 1;
      console.info(
        `[billing] ${sub.id} (${sub.status}) now pays with ${pmId} (was ${current ?? "the customer default"})`,
      );
    } catch (err) {
      /**
       * Logged, not thrown. A pointer that could not be moved is a renewal that may
       * fail later; throwing would make Stripe redeliver and, worse, would abandon
       * the PAY step for a customer who is locked out right now.
       */
      console.error(
        `[billing] could not point ${sub.id} at ${pmId}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return written;
}

async function retryOne(
  invoice: Stripe.Invoice,
  pmId: string,
  customerId: string,
  client: Stripe,
): Promise<Attempt> {
  const invoiceId = invoice.id;
  if (!invoiceId) return "error";

  const subscriptionId = subscriptionIdOf(invoice);

  /**
   * ⚠️ THE STATUS IS READ FROM STRIPE, NEVER FROM THE INVOICE'S OWN COPY.
   *
   * The event that brought us here says a card arrived; it says nothing about
   * what the subscription is doing now. Every other handler in this codebase
   * re-reads the live object for the same reason, and here the stale answer is
   * "charge somebody whose subscription has already been cancelled".
   */
  let subscriptionStatus: string | null = null;
  if (subscriptionId) {
    try {
      subscriptionStatus = (await client.subscriptions.retrieve(subscriptionId)).status;
    } catch (err) {
      console.error(
        `[billing] could not read ${subscriptionId} before retrying ${invoiceId}:`,
        err instanceof Error ? err.message : String(err),
      );
      return "error";
    }
  }

  const verdict = cardRetryVerdict({
    markerPaymentMethod: invoice.metadata?.[CARD_RETRY_KEY],
    paymentMethodId: pmId,
    subscriptionId,
    subscriptionStatus,
  });
  if (!verdict.attempt) {
    console.info(
      `[billing] not retrying ${invoiceId} with ${pmId}: ${verdict.because}` +
        (subscriptionStatus ? ` (subscription is ${subscriptionStatus})` : ""),
    );
    return verdict.because === "same-card"
      ? "skipped-same-card"
      : verdict.because === "not-a-subscription"
        ? "skipped-no-subscription"
        : "skipped-not-dunning";
  }

  /**
   * ⚠️ THE POINTER HAS ALREADY MOVED. {@link pointSubscriptionsAt} ran before any
   * invoice was looked at, so by here this subscription already pays with `pmId`
   * and the next renewal is fixed whatever happens to the invoice below. That
   * ordering is deliberate: the customer who is locked out RIGHT NOW must not lose
   * the fix for their NEXT renewal to a card that declines again today.
   */

  /**
   * ⚠️ MARKED BEFORE THE ATTEMPT. See the header: the failure mode of marking
   * last is a second charge attempt on somebody's card.
   */
  try {
    await client.invoices.update(invoiceId, {
      metadata: { ...(invoice.metadata ?? {}), [CARD_RETRY_KEY]: pmId },
    });
  } catch (err) {
    console.error(
      `[billing] could not mark ${invoiceId} before retrying it:`,
      err instanceof Error ? err.message : String(err),
    );
    return "error";
  }

  try {
    const paid = await client.invoices.pay(
      invoiceId,
      { payment_method: pmId },
      /** GUARD 2 — two events in one tick compute this same key. */
      { idempotencyKey: `card-retry:${invoiceId}:${pmId}` },
    );
    console.info(
      `[billing] retried ${invoiceId} for ${customerId} after a card update: ${paid.status}`,
    );
    /**
     * ⚠️ ACCESS IS NOT RESTORED HERE. Stripe fires `invoice.paid` for this
     * payment, `extendFromInvoice` sees `amount_paid > 0`, and THAT writes the
     * entitlement. This function never touches `entitlements`.
     */
    return paid.status === "paid" ? "paid" : "declined";
  } catch (err) {
    /**
     * A card that still does not work. Logged, not thrown: the event was
     * processed correctly and there is nothing a redelivery could do differently.
     * Stripe's own dunning schedule carries on regardless.
     */
    console.warn(
      `[billing] the card-update retry of ${invoiceId} did not go through:`,
      err instanceof Error ? err.message : String(err),
    );
    return "declined";
  }
}

/** The customer's own default payment method, or null. */
async function defaultPaymentMethodOf(
  customerId: string,
  client: Stripe,
): Promise<string | null> {
  try {
    const customer = await client.customers.retrieve(customerId);
    if (customer.deleted) return null;
    const pm = customer.invoice_settings?.default_payment_method;
    if (typeof pm === "string") return pm;
    return pm?.id ?? null;
  } catch (err) {
    console.error(
      `[billing] could not read ${customerId} while looking for a card to retry with:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Which subscription an invoice belongs to.
 *
 * ⚠️ A SECOND COPY OF `sync.ts`'s RESOLVER, AND IT IS NOT DRIFT. That one is
 * private to its module and this one is read-only on the same two shapes; the
 * alternative is exporting a helper from a 1,400-line module that already
 * imports this one's sibling. `invoice.subscription` was removed in this API
 * version (the same removal family as `invoice.payment_intent`), so both walks
 * are needed and both are pinned by `cardUpdate.test.ts`.
 */
function subscriptionIdOf(invoice: Stripe.Invoice): string | null {
  const parent = (
    invoice as { parent?: { subscription_details?: { subscription?: string | { id: string } } } }
  ).parent;
  const viaParent = parent?.subscription_details?.subscription;
  if (typeof viaParent === "string") return viaParent;
  if (viaParent && typeof viaParent === "object") return viaParent.id;

  const legacy = (invoice as { subscription?: string | { id: string } }).subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object") return legacy.id;

  return null;
}
