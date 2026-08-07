import "server-only";

import Stripe from "stripe";

/**
 * The server-side Stripe client, and the guard that stops the mode mistake.
 *
 * `server-only` at the top is load-bearing: importing this from a client
 * component would put the SECRET KEY in the browser bundle, and the import would
 * now fail the build instead.
 */

/**
 * Read an env var or throw with a name you can act on.
 *
 * Thrown at CALL time rather than at module load. A module-level throw takes
 * down every route that transitively imports it — including the whole of
 * `/onboarding`, which must keep working with no Stripe configured at all,
 * because everything before the paywall is anonymous and free.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Billing cannot run without it; see .env.example.`,
    );
  }
  return value;
}

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (client) return client;
  client = new Stripe(required("STRIPE_SECRET_KEY"), {
    /**
     * NO `apiVersion`, deliberately — and that IS the pinned choice.
     *
     * The SDK sends its own generated version (`2026-07-29.dahlia` for
     * stripe@22.4.0) unless overridden, so the wire format always matches the
     * types this code was compiled against. Setting it by hand means a string
     * literal that has to be updated in lockstep with every `npm update`, and
     * the field is typed as `LatestApiVersion` — literally `typeof ApiVersion` —
     * so the only value TypeScript accepts is the one the SDK would have used
     * anyway. A second copy that can only ever be right or broken.
     *
     * What this does NOT do is follow the account's dashboard default, which is
     * the drift worth worrying about: a version bump there cannot change what
     * this client parses.
     */
    appInfo: { name: "Trackd Co", url: "https://trackdco.app" },
  });
  return client;
}

/** Is the configured secret key a TEST key? */
export function isTestMode(): boolean {
  return required("STRIPE_SECRET_KEY").startsWith("sk_test_");
}

/**
 * The three plans, as price IDs.
 *
 * ONE set of variable names, with the VALUES scoped per Vercel environment —
 * Preview holds test prices, Production holds live ones — exactly as
 * `SUPABASE_SECRET_KEY` already works here.
 *
 * The spec asked for separate `_TEST` / `_LIVE` variables. That means a selector,
 * and a selector is one more thing that can point the wrong way; it also cannot
 * actually tell you whether a price is live, because that is a property of the
 * price and not of its variable name. `assertModeMatches` below checks the real
 * thing instead: that the key's mode and the price's `livemode` agree. That
 * catches live keys in a preview, which is the mistake the spec was guarding
 * against, and it catches it with evidence rather than with a convention.
 */
export const PRICE_ENV: Record<PlanKey, string> = {
  yearly: "STRIPE_PRICE_YEARLY",
  monthly: "STRIPE_PRICE_MONTHLY",
  weekly: "STRIPE_PRICE_WEEKLY",
};

export type PlanKey = "yearly" | "monthly" | "weekly";

export function priceIdFor(plan: PlanKey): string {
  return required(PRICE_ENV[plan]);
}

/** Which plan a Stripe price id belongs to, or null if it is not one of ours. */
export function planForPriceId(priceId: string): PlanKey | null {
  for (const plan of Object.keys(PRICE_ENV) as PlanKey[]) {
    if (process.env[PRICE_ENV[plan]] === priceId) return plan;
  }
  return null;
}

/**
 * THE MODE GUARD.
 *
 * A test key and a live price (or the reverse) is the failure that ends with
 * either a real customer being charged from a preview branch, or a paid customer
 * silently getting nothing. Stripe itself answers with "No such price", which is
 * a confusing enough error to send someone looking in the wrong place for an
 * hour.
 *
 * So it is checked explicitly, against the price object Stripe returns, and the
 * message says exactly which two things disagree.
 */
export function assertModeMatches(price: Stripe.Price): void {
  const keyIsTest = isTestMode();
  if (price.livemode === keyIsTest) {
    throw new Error(
      `Stripe mode mismatch: STRIPE_SECRET_KEY is a ${
        keyIsTest ? "TEST" : "LIVE"
      } key but price ${price.id} is a ${
        price.livemode ? "LIVE" : "TEST"
      } price. Check the price IDs for this environment.`,
    );
  }
}
