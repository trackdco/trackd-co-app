"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { serviceClient } from "@/lib/billing/service";
import { stripe } from "@/lib/billing/stripe";
import { createClient } from "@/lib/supabase/server";

/**
 * CANCEL AND UN-CANCEL — the only two writes a user may make to their own
 * subscription, and the narrowest pair that keeps the promise three screens make.
 *
 * ## What these can and cannot do
 *
 * They set `cancel_at_period_end` and nothing else. They cannot switch a plan,
 * change a price, alter a trial, touch `entitlements`, or act on a subscription
 * that is not the caller's. That is deliberate: the surface area of a control
 * that reaches into a payment provider should be exactly the promise it keeps
 * and not one field wider.
 *
 * ## THE SUBSCRIPTION ID NEVER COMES FROM THE CLIENT
 *
 * Neither action takes an argument. The Stripe subscription is resolved from the
 * verified session, through the caller's own row, every time. A server action is
 * a public HTTP endpoint with a nice-looking call site: an id parameter here
 * would be an unauthenticated "cancel anyone's subscription" endpoint with a
 * TypeScript signature that looked completely reasonable.
 *
 * ## The read goes through RLS on purpose
 *
 * The row is fetched with the SESSION client, not the service client, so
 * Postgres itself refuses a row belonging to someone else even if the scoping
 * above were wrong. The service client appears only for the mirror WRITE, which
 * has no user-facing policy and cannot be done any other way. Two independent
 * layers, and the cheap one is the one that decides identity.
 *
 * ## Cancelling does not revoke
 *
 * `entitlements` is not written here at all. `active_until` already holds the
 * date access ends and `isEntitlementActive` lets the clock do the work, so a
 * user who cancels on day 3 of a paid month keeps that month, and a user who
 * cancels a trial keeps the rest of the trial. See `lib/billing/manage.ts`.
 */

export interface BillingActionResult {
  ok: boolean;
  /** A message safe to render. Never a Stripe error verbatim. */
  error?: string;
  /** Changes on every successful run, so a `useActionState` consumer can tell
   *  two identical successes apart. Same shape as `updatePhysical`'s token. */
  savedAt?: number;
}

/** The statuses a cancellation can act on. Mirrors `CANCELLABLE` in `manage.ts`. */
const CANCELLABLE = new Set(["trialing", "active", "past_due"]);

/**
 * Resolve the caller's own Stripe subscription, or say why not.
 *
 * Returns the id and status rather than the whole row: the id is all Stripe
 * needs and the status is all the guard needs, and handing back more would
 * invite a caller to make a decision from a mirror that nothing may gate on.
 */
async function ownSubscription(): Promise<
  { id: string; status: string; userId: string } | { error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    // Scoped explicitly AND covered by RLS. The house pattern is defence in
    // depth, and this is the one query in the app where the backstop failing
    // would mean cancelling a stranger's subscription.
    .eq("user_id", user.id)
    .in("status", ["trialing", "active", "past_due"])
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("[billing] could not read the caller's subscription:", error.message);
    return { error: "We couldn't reach your billing details just now." };
  }

  const row = data?.[0];
  if (!row) return { error: "There's no active subscription on this account." };
  if (!CANCELLABLE.has(row.status)) {
    return { error: "This subscription can't be changed from here." };
  }

  return {
    id: row.stripe_subscription_id as string,
    status: row.status as string,
    userId: user.id,
  };
}

/**
 * Write the mirror from what Stripe just handed back.
 *
 * The webhook will say the same thing a moment later and is still the
 * authority. This is written anyway so the screen is correct on the very next
 * render rather than whenever the delivery lands — a cancel button that appears
 * to do nothing for two seconds gets pressed twice.
 *
 * Only `cancel_at_period_end` is written. The status, the dates and the price
 * are the webhook's to move, and writing them from here would mean two writers
 * for the same fact.
 */
async function mirrorCancelFlag(
  stripeSubscriptionId: string,
  cancelAtPeriodEnd: boolean,
): Promise<void> {
  const { error } = await serviceClient()
    .from("subscriptions")
    .update({ cancel_at_period_end: cancelAtPeriodEnd })
    .eq("stripe_subscription_id", stripeSubscriptionId);
  // Logged, not thrown. Stripe has already accepted the change and it is real;
  // failing the action here would tell the user their cancellation did not go
  // through when it did, which is the worst available lie.
  if (error) {
    console.error("[billing] mirror not updated after a cancel toggle:", error.message);
  }
}

/** Stop the next charge. Access continues to the end of what is already paid for. */
export async function cancelSubscription(): Promise<BillingActionResult> {
  const found = await ownSubscription();
  if ("error" in found) return { ok: false, error: found.error };

  try {
    const updated = await stripe().subscriptions.update(found.id, {
      cancel_at_period_end: true,
    });
    await mirrorCancelFlag(found.id, updated.cancel_at_period_end);
  } catch (err) {
    // Stripe's own message can name internal ids and price objects, so it is
    // logged and not returned.
    console.error(
      `[billing] cancel failed for ${found.id}:`,
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, error: "We couldn't cancel just now. Please try again." };
  }

  console.info(`[billing] ${found.userId} cancelled at period end`);
  revalidatePath("/billing");
  revalidatePath("/profile");
  return { ok: true, savedAt: Date.now() };
}

/** Undo a scheduled cancellation, any time before the date. */
export async function resumeSubscription(): Promise<BillingActionResult> {
  const found = await ownSubscription();
  if ("error" in found) return { ok: false, error: found.error };

  try {
    const updated = await stripe().subscriptions.update(found.id, {
      cancel_at_period_end: false,
    });
    await mirrorCancelFlag(found.id, updated.cancel_at_period_end);
  } catch (err) {
    console.error(
      `[billing] resume failed for ${found.id}:`,
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, error: "We couldn't restart it just now. Please try again." };
  }

  console.info(`[billing] ${found.userId} resumed`);
  revalidatePath("/billing");
  revalidatePath("/profile");
  return { ok: true, savedAt: Date.now() };
}
