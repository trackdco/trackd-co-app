"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getCurrentUser } from "@/lib/auth";
import { applyCancelFlag, CANCELLABLE_STATUSES } from "@/lib/billing/cancel";
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

/** One list, in `lib/billing/cancel.ts`, so the guard here and the one the
 *  deletion path uses cannot drift apart. */
const CANCELLABLE = new Set<string>(CANCELLABLE_STATUSES);

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
    .in("status", [...CANCELLABLE_STATUSES])
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

/** Stop the next charge. Access continues to the end of what is already paid for. */
export async function cancelSubscription(): Promise<BillingActionResult> {
  const found = await ownSubscription();
  if ("error" in found) return { ok: false, error: found.error };

  try {
    await applyCancelFlag(found.id, true);
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

/**
 * A Stripe Customer Portal session, for the jobs we deliberately do NOT rebuild.
 *
 * ## What this is for, and what it is not for
 *
 * Updating a failing card, and reading invoices and receipts. Nothing else.
 *
 * Cancelling stays in the app (`cancelSubscription` above) because Adrian chose
 * it there: it never leaves the PWA and the words at that moment are ours. But
 * updating a card is the opposite case — it means handling card details, which
 * is precisely the thing to hand to Stripe and never touch — and a `past_due`
 * user currently has NO way to fix a declining card from inside the app at all.
 * That gap outlives any copy preference.
 *
 * ⚠️ The account's DEFAULT portal configuration also has `subscription_cancel`
 * enabled, so a user who goes looking will find a second cancel button wearing
 * Stripe's wording. It is harmless — Stripe fires
 * `customer.subscription.updated` and the webhook syncs the mirror, so both
 * routes end in the same state — but if the two paths should be one, the fix is
 * to disable that feature on the portal configuration in the Stripe dashboard
 * rather than to change anything here. Carried in `next-tasks.md`.
 *
 * ## Returns a URL rather than redirecting
 *
 * A `redirect()` inside a server action throws a control-flow signal that a
 * caller's `try/catch` will swallow, and the failure mode is a button that
 * silently does nothing. The client navigates instead, which also keeps this
 * testable without a browser.
 */
export async function openBillingPortal(): Promise<
  BillingActionResult & { url?: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You need to be signed in." };

  const supabase = await createClient();
  // The caller's OWN customer row, through RLS. Same reasoning as
  // `ownSubscription`: a portal session is a signed, time-limited key to
  // somebody's billing history, and handing one out for the wrong customer would
  // be the most serious leak in this codebase.
  const { data, error } = await supabase
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[billing] could not read the caller's customer:", error.message);
    return { ok: false, error: "We couldn't reach your billing details just now." };
  }
  const customer = data?.stripe_customer_id as string | undefined;
  if (!customer) return { ok: false, error: "There's nothing to manage on this account yet." };

  try {
    const session = await stripe().billingPortal.sessions.create({
      customer,
      return_url: `${await siteOrigin()}/billing`,
    });
    return { ok: true, url: session.url, savedAt: Date.now() };
  } catch (err) {
    // The commonest cause is no portal CONFIGURATION on the Stripe account,
    // which is a dashboard setting and not something the code can fix. Named in
    // the log so it is not mistaken for a bug here.
    console.error(
      "[billing] portal session failed (is a Customer Portal configuration saved in Stripe?):",
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, error: "We couldn't open billing just now. Please try again." };
  }
}

/**
 * Where Stripe sends the user back to.
 *
 * Read from the request rather than hardcoded, so a LAN dev server and a preview
 * deploy return to themselves instead of bouncing the tester to production. The
 * value is only ever used as a `return_url`, and Stripe requires it to be
 * absolute.
 */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "https://trackdco.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Undo a scheduled cancellation, any time before the date. */
export async function resumeSubscription(): Promise<BillingActionResult> {
  const found = await ownSubscription();
  if ("error" in found) return { ok: false, error: found.error };

  try {
    await applyCancelFlag(found.id, false);
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
