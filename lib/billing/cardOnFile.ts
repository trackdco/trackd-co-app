import "server-only";

import { stripe } from "./stripe";
import { serviceClient } from "./service";

/**
 * THE CARD ON FILE, FOR THE MANAGE ROW — brand and last four, or nothing.
 *
 * Adrian, 2026-08-25: the row should read "Visa •••• 4242" the way every other
 * app shows it, rather than a bare "Card ›" that makes you leave to find out
 * what is even stored.
 *
 * ## ⚠️ THIS COSTS A STRIPE ROUND TRIP ON A SCREEN THAT HAD NONE
 *
 * Named rather than hidden, because it is the whole cost of the feature.
 * `/billing/manage` previously rendered entirely from our own tables. It now
 * asks Stripe one question, and that call is on the critical path of the page.
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

export async function cardOnFile(userId: string): Promise<CardOnFile | null> {
  try {
    const { data: row } = await serviceClient()
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();
    const customerId = row?.stripe_customer_id as string | undefined;
    if (!customerId) return null;

    /**
     * The customer's DEFAULT invoice payment method, which is the card Stripe
     * will actually charge — not merely the most recently attached one. A user
     * who added a second card and made it default would otherwise read the old
     * one here while being billed on the new.
     */
    const customer = await stripe().customers.retrieve(customerId, {
      expand: ["invoice_settings.default_payment_method"],
    });
    if (customer.deleted) return null;

    const pm = customer.invoice_settings?.default_payment_method;
    // A string means it was not expanded, which should not happen; treated as
    // absent rather than followed with a second call on a page-load path.
    if (!pm || typeof pm === "string" || pm.type !== "card" || !pm.card) return null;

    const brand = BRAND_LABEL[pm.card.brand] ?? "Card";
    return { brand, last4: pm.card.last4 };
  } catch (e) {
    console.error("[billing] could not read the card on file:", (e as Error).message);
    return null;
  }
}
