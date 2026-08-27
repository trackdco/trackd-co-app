import "server-only";

import type Stripe from "stripe";

import { BILLABLE_STATUSES } from "./cancel";
import { stripe } from "./stripe";
import { serviceClient } from "./service";

/**
 * THE CARD ON FILE, FOR THE MANAGE ROW — brand and last four, or nothing.
 *
 * Adrian, 2026-08-25: the row should read "Visa •••• 4242" the way every other
 * app shows it, rather than a bare "Card ›" that makes you leave to find out
 * what is even stored.
 *
 * ## ⚠️ IT READ ONE FIELD, AND IT WAS THE ONE FIELD A TRIAL NEVER SETS
 *
 * Reported by Adrian on 2026-08-27, against his own live `trialing`
 * subscription: the row said **"None on file"** while a card was genuinely
 * stored, and the only remedy on offer was to go to Stripe and look.
 *
 * This function used to read `customer.invoice_settings.default_payment_method`
 * and nothing else. `startTrial` creates subscriptions with
 * `payment_settings.save_default_payment_method: "on_subscription"`
 * (`billing-actions.ts:839`), which sets a default **when an invoice is paid**,
 * and a trial pays none — `billing-actions.ts:1826` already says exactly that:
 * *"a confirmed TRIAL can legitimately have a null default"*. So the field this
 * read was null for every trial subscriber, permanently, by design.
 *
 * ⚠️ **THE OBVIOUS FIX IS ALSO WRONG, AND IT WAS MEASURED BEFORE BEING
 * DISCARDED.** `cardUpdate.ts:36` says a subscription's own
 * `default_payment_method` beats the customer's, which reads like the answer.
 * It is not. `startTrial`'s exact `subscriptions.create` was replayed against
 * real Stripe, its `pending_setup_intent` confirmed with a card the way the
 * browser's `confirmSetup` does, and then every candidate field read back:
 *
 *     customer.invoice_settings.default_payment_method  null   <- read before
 *     subscription.default_payment_method               null   <- the obvious fix
 *     subscription.status                               trialing
 *     customer's attached card payment methods          visa ****4242
 *
 * **A confirmed trial's card is attached to the CUSTOMER and pointed at by
 * nothing.** Any fix that reads only a `default_*` pointer swaps one wrong
 * field for another and still says "None on file" to the person who just paid.
 *
 * ## So it resolves the same way a charge would, in order
 *
 *   1. a BILLABLE subscription's own `default_payment_method` — set once an
 *      invoice is paid, and what `cardUpdate` writes. Strongest claim.
 *   2. `customer.invoice_settings.default_payment_method` — what Stripe's own
 *      portal writes when somebody changes their card there.
 *   3. the card ATTACHED TO THE CUSTOMER, which is where a confirmed trial's
 *      card lives and the only step that answers Adrian's case.
 *
 * ## ⚠️ STEP 3 REFUSES TO GUESS BETWEEN TWO CARDS
 *
 * With no pointer set anywhere and more than one card attached, **Stripe itself
 * does not know which one it would charge**, so neither can this. It returns
 * null and logs, rather than printing one card's last four beside the word
 * "Card" and inventing a fact about somebody's money. One attached card is
 * unambiguous and is shown.
 *
 * ## ⚠️ THIS COSTS A STRIPE ROUND TRIP ON A SCREEN THAT HAD NONE, and now two
 *
 * Named rather than hidden, because it is the whole cost of the feature.
 * `/billing/manage` previously rendered entirely from our own tables. Steps 1
 * and 2 share ONE `customers.retrieve` — the subscriptions come back on the same
 * call via `expand`, verified against real Stripe rather than assumed. Step 3 is
 * a second call and only happens when the first found no pointer at all, which
 * today is exactly the trial cohort.
 *
 * ## ⚠️ AND IT MUST NEVER TAKE THE SCREEN DOWN WITH IT
 *
 * Every failure returns `null`, which renders as "None on file" — the same thing
 * an account with genuinely no card sees. The alternatives were both worse: a
 * thrown error takes out a screen whose OTHER rows are fine, and a "could not
 * load" state is a sentence about our infrastructure on a screen the user opened
 * to answer a question about their money.
 *
 * ⚠️ THE TWO CASES IT CANNOT TELL APART, stated plainly: "no card on file" and
 * "Stripe did not answer" both render as "None on file". That is a deliberate
 * collapse of standing rule 0's third state, and it is safe ONLY because nothing
 * downstream branches on it — the row is a readout, the Card handoff still opens
 * the portal either way, and no decision anywhere reads this value. If anything
 * ever gates on it, this must be widened to a three-state return first.
 */
export interface CardOnFile {
  /** "Visa", "Mastercard", "Amex" — Stripe's own brand, capitalised for display. */
  brand: string;
  /** The last four digits, as Stripe reports them. */
  last4: string;
}

/** Stripe's brand slugs are lower-case; these are the display forms. */
const BRAND_LABEL: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  discover: "Discover",
  diners: "Diners",
  jcb: "JCB",
  unionpay: "UnionPay",
};

/**
 * A payment method reference to brand + last four, or null.
 *
 * A bare STRING means the field was not expanded. Treated as absent rather than
 * followed with another call on a page-load path — every caller below expands,
 * so a string here is a bug in the request, not a card we should chase.
 */
function cardFrom(
  pm: string | Stripe.PaymentMethod | null | undefined,
): CardOnFile | null {
  if (!pm || typeof pm === "string") return null;
  if (pm.type !== "card" || !pm.card) return null;
  return { brand: BRAND_LABEL[pm.card.brand] ?? "Card", last4: pm.card.last4 };
}

/**
 * STEPS 1 AND 2, PURE — the card something POINTS AT.
 *
 * Exported and separated from the I/O for the reason `access.ts` gives: a rule
 * buried inside a query is a rule nobody can check. The order is the whole
 * behaviour, so the order is what the tests pin.
 */
export function pointedCard(
  subscriptions: readonly Pick<
    Stripe.Subscription,
    "status" | "default_payment_method"
  >[],
  customerDefault: string | Stripe.PaymentMethod | null | undefined,
): CardOnFile | null {
  /**
   * 1. The card a subscription that could still charge actually points at.
   *
   * ⚠️ `BILLABLE_STATUSES`, THE NAMED SET, NOT A LITERAL — the same set
   * `cardUpdate` re-points and `cancel` stops. Its question is "what could still
   * take their money", which is precisely the card worth naming here. A
   * cancelled subscription's stale pointer must not be shown as the card on file.
   */
  for (const sub of subscriptions) {
    if (!BILLABLE_STATUSES.has(sub.status)) continue;
    const card = cardFrom(sub.default_payment_method);
    if (card) return card;
  }
  // 2. The customer default, which Stripe's portal owns and writes.
  return cardFrom(customerDefault);
}

/**
 * STEP 3, PURE — the card merely ATTACHED, with the refusal to guess.
 *
 * ⚠️ MORE THAN ONE ATTACHED CARD AND NO POINTER ANYWHERE MEANS **STRIPE ITSELF
 * DOES NOT KNOW** which it would charge, so neither can this. Null, rather than
 * one card's last four printed beside the word "Card" as though it were a fact
 * about somebody's money.
 */
export function attachedCard(
  attached: readonly Stripe.PaymentMethod[],
): CardOnFile | null {
  if (attached.length > 1) return null;
  return cardFrom(attached[0]);
}

export async function cardOnFile(userId: string): Promise<CardOnFile | null> {
  try {
    const { data: row } = await serviceClient()
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();
    const customerId = row?.stripe_customer_id as string | undefined;
    if (!customerId) return null;

    const client = stripe();
    const customer = await client.customers.retrieve(customerId, {
      expand: [
        "invoice_settings.default_payment_method",
        "subscriptions.data.default_payment_method",
      ],
    });
    if (customer.deleted) return null;

    const pointed = pointedCard(
      customer.subscriptions?.data ?? [],
      customer.invoice_settings?.default_payment_method,
    );
    if (pointed) return pointed;

    /**
     * Nothing points anywhere — the confirmed-trial shape. The card is attached
     * to the customer and that is the whole record of it.
     *
     * `limit: 2` because the only question left is "exactly one, or more than
     * one". Fetching the rest would cost more to learn nothing: at two we
     * already know we must not guess.
     */
    const attached = await client.paymentMethods.list({
      customer: customerId,
      type: "card",
      limit: 2,
    });
    if (attached.data.length > 1) {
      console.info(
        `[billing] ${customerId} has ${attached.data.length}+ cards attached and no default anywhere; refusing to guess which is on file`,
      );
    }
    return attachedCard(attached.data);
  } catch (e) {
    console.error("[billing] could not read the card on file:", (e as Error).message);
    return null;
  }
}
