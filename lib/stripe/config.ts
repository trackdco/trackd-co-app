/**
 * Billing config — the single source of truth for plan shape. Kept tiny and
 * dependency-free so it can be imported from server actions, the webhook, and
 * the billing page without pulling in the SDK.
 */

/** The two cadences the app offers. */
export type Cadence = "monthly" | "annual";

/**
 * Server-only Stripe Price IDs. No NEXT_PUBLIC_ prefix — the client never sees a
 * price id; it sends a cadence and the server maps it here.
 */
export const PRICE_ID: Record<Cadence, string | undefined> = {
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  annual: process.env.STRIPE_PRICE_ANNUAL,
};

/** Free-trial length in days — applies to BOTH monthly and annual. */
export const TRIAL_DAYS = 5;

/** Extended trial (days) unlocked by a valid beta access code — two weeks. */
export const BETA_TRIAL_DAYS = 14;

/**
 * Subscription statuses that grant the 'paid' entitlement. `past_due` keeps
 * access through Stripe's dunning/grace window; the webhook downgrades to 'free'
 * only once Stripe gives up (status becomes canceled/unpaid).
 */
const PAID_STATUSES = new Set(["trialing", "active", "past_due"]);

/** Map a Stripe subscription status to our profiles.tier value. */
export function tierForStatus(status: string): "paid" | "free" {
  return PAID_STATUSES.has(status) ? "paid" : "free";
}

/** Map a Stripe price recurring interval to our cadence label. */
export function cadenceForInterval(
  interval: string | undefined,
): Cadence | null {
  if (interval === "year") return "annual";
  if (interval === "month") return "monthly";
  return null;
}
