import "server-only";

import { assertModeMatches, priceIdFor, stripe, type PlanKey } from "./stripe";

/**
 * THE PRICES, READ FROM STRIPE (Spec w2b-15).
 *
 * *"There must be no dollar amount hardcoded anywhere in the codebase — the
 * price shown on the paywall is read from Stripe, so a dashboard change takes
 * effect without a deploy."*
 *
 * `lib/onboarding/pricing.ts` keeps the labels, the order, the trial length and
 * every derived figure (per-month equivalent, the saving badge, the billing
 * date). It no longer keeps the amounts. That split is the point: none of those
 * is a price, and all of them must follow whatever the price turns out to be.
 */

export interface PlanPrice {
  plan: PlanKey;
  /** The Stripe price id, which the subscription endpoint needs. */
  priceId: string;
  /** Charged amount in whole currency units — 69.99, not 6999. */
  amount: number;
  /** ISO 4217, lowercase, as Stripe returns it. "aud". */
  currency: string;
  /** "year" | "month" | "week" — what the amount buys. */
  interval: string;
  /**
   * How many of those intervals one charge covers.
   *
   * Stripe expresses "every 3 months" as `interval: "month"` with
   * `interval_count: 3`, so a normaliser that reads only `interval` prices a
   * quarterly plan as if it were charged monthly — overstating MRR threefold.
   * Every price configured today is `1`, which is exactly why the bug would
   * have gone unnoticed until the day someone added a quarterly plan in the
   * Stripe dashboard and revenue silently tripled.
   */
  intervalCount: number;
}

/**
 * CACHED IN MEMORY, briefly.
 *
 * The amounts are needed by three ANONYMOUS screens as well as the paywall (the
 * payoff screen's weekly anchor, the cost comparison), so this is on the path of
 * every `/onboarding` load including the very first screen. A Stripe round-trip
 * there would be three network calls in front of a page that is otherwise
 * static.
 *
 * Five minutes, not five hours: the whole reason the amounts live in Stripe is
 * that a dashboard change takes effect without a deploy, and a long cache would
 * quietly take that back. Per-instance on serverless, which is fine — the worst
 * case is one instance showing an old price for a few minutes, and the CHARGE is
 * always made against the price id, never against this number.
 */
const TTL_MS = 5 * 60 * 1000;
let cache: { at: number; prices: PlanPrice[] } | null = null;

const PLANS: readonly PlanKey[] = ["yearly", "monthly", "weekly"];

export async function loadPrices(): Promise<PlanPrice[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.prices;

  const client = stripe();
  const prices = await Promise.all(
    PLANS.map(async (plan) => {
      const price = await client.prices.retrieve(priceIdFor(plan));
      // A test key against a live price (or the reverse) is the failure that
      // ends with a real customer charged from a preview. Checked against the
      // price object rather than inferred from a variable name.
      assertModeMatches(price);

      if (price.unit_amount === null) {
        throw new Error(
          `Stripe price ${price.id} has no unit_amount — tiered or metered pricing is not supported here.`,
        );
      }
      const interval = price.recurring?.interval;
      if (!interval) {
        throw new Error(`Stripe price ${price.id} is not recurring.`);
      }
      // Stripe defaults this to 1 and it is always present on a recurring
      // price; the fallback is here so a malformed object degrades to "monthly"
      // rather than to NaN.
      const intervalCount = price.recurring?.interval_count ?? 1;

      return {
        plan,
        priceId: price.id,
        // Stripe stores minor units. AUD has 2, and so does every currency this
        // will ever be sold in — but zero-decimal currencies (JPY, KRW) exist,
        // and dividing those by 100 would show a hundredth of the real price.
        amount: ZERO_DECIMAL.has(price.currency)
          ? price.unit_amount
          : price.unit_amount / 100,
        currency: price.currency,
        interval,
        intervalCount,
      } satisfies PlanPrice;
    }),
  );

  cache = { at: Date.now(), prices };
  return prices;
}

/**
 * Currencies Stripe stores WITHOUT minor units. Dividing one of these by 100
 * would render ¥500 as ¥5. Not reachable while everything is AUD; here because
 * the bug is silent and the list is short.
 * https://docs.stripe.com/currencies#zero-decimal
 */
const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
  "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

/** Clears the memo. Tests and a dashboard change during development. */
export function forgetPrices(): void {
  cache = null;
}

/**
 * `loadPrices`, but never throws.
 *
 * The onboarding flow is ANONYMOUS and free for its first eleven screens, and
 * the payoff and cost screens sit inside that stretch. Stripe being
 * unconfigured, rate-limited or down must cost a price line, never the flow —
 * so this returns an empty list and every consumer is written to render nothing
 * rather than a blank number.
 *
 * The PAYWALL is the one place that must not silently show nothing, so it says
 * so out loud instead. See `PriceContext` in the flow.
 */
export async function loadPricesSafe(): Promise<PlanPrice[]> {
  try {
    return await loadPrices();
  } catch (err) {
    console.error(
      "[billing] price load failed:",
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}
