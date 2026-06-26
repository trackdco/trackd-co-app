import type Stripe from "stripe";

import { cadenceForInterval, tierForStatus } from "@/lib/stripe/config";
import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * Reconcile our DB with a Stripe Subscription (the source of truth). Called from
 * the webhook only, under the service role (RLS-bypassing) because it must write
 * another user's billing row and flip profiles.tier — neither of which the
 * user's own session is allowed to do.
 *
 * Idempotent: upserts on user_id, so created/updated/deleted events and Stripe
 * retries all converge to the same state. We never delete the row — a canceled
 * sub is stored as status 'canceled' (Invariant 8: archive, never hard-delete).
 *
 * Period end (API 2026-06-24.dahlia): read from the subscription ITEM, not the
 * subscription — Stripe moved `current_period_end` onto items.
 */
export async function syncSubscriptionToDb(
  sub: Stripe.Subscription,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  // Resolve the owning user: prefer the metadata we stamp at checkout, then fall
  // back to the customer->user mapping stored on the first event we saw.
  let userId = sub.metadata?.user_id ?? null;
  if (!userId) {
    const { data } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    userId = data?.user_id ?? null;
  }
  if (!userId) {
    console.error(
      "[stripe] could not resolve user for subscription",
      sub.id,
      "customer",
      customerId,
    );
    return;
  }

  const item = sub.items.data[0];
  const periodEndUnix = item?.current_period_end ?? null;

  const { error: subErr } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      stripe_price_id: item?.price.id ?? null,
      status: sub.status,
      cadence: cadenceForInterval(item?.price.recurring?.interval),
      current_period_end: periodEndUnix
        ? new Date(periodEndUnix * 1000).toISOString()
        : null,
      cancel_at_period_end: sub.cancel_at_period_end,
    },
    { onConflict: "user_id" },
  );
  if (subErr) {
    console.error("[stripe] subscriptions upsert failed:", subErr.message);
    throw new Error(subErr.message);
  }

  const { error: tierErr } = await supabase
    .from("profiles")
    .update({ tier: tierForStatus(sub.status) })
    .eq("id", userId);
  if (tierErr) {
    console.error("[stripe] profiles.tier update failed:", tierErr.message);
    throw new Error(tierErr.message);
  }
}
