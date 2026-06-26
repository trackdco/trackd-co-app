import Stripe from "stripe";

/**
 * Server-side Stripe client. NEVER import this into a Client Component — it reads
 * the secret key. The API version is pinned to the version the installed SDK
 * (stripe@22) is generated against, so request/response shapes match the types.
 *
 * Note (API 2026-06-24.dahlia): the subscription-level `current_period_end` is
 * gone — the billing period now lives on each subscription item.
 */
const secretKey = process.env.STRIPE_SECRET_KEY;

export const stripe = new Stripe(secretKey ?? "", {
  apiVersion: "2026-06-24.dahlia",
  typescript: true,
  appInfo: { name: "Trackd Co", url: "https://trackdco.app" },
});

/** True only when the secret key is present — guard entrypoints with this. */
export const stripeConfigured = Boolean(secretKey);
