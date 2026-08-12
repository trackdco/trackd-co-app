"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type Stripe from "stripe";

import { getCurrentUser } from "@/lib/auth";
import { applyCancelFlag, liveSubscriptionsForUser } from "@/lib/billing/cancel";
import { formatAccessDate, type SaveOfferKind } from "@/lib/billing/manage";
import {
  EXTRA_TRIAL_DAYS,
  grantExtraTime,
  markOfferShown,
  readSaveOffer,
} from "@/lib/billing/saveOffer";
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

export interface CancelResult extends BillingActionResult {
  /**
   * Whether to follow the cancellation with the save offer, and which one.
   *
   * ⚠️ ONLY MEANINGFUL WHEN `ok` IS TRUE, and only after the cancellation has
   * actually been written to Stripe. That ordering is the point: the offer is
   * something that happens to a cancelled user, never something standing between
   * a user and cancelling. See `lib/billing/saveOffer.ts`.
   */
  offer?: { kind: SaveOfferKind; days: number };
}

/**
 * Resolve the caller's own live subscriptions, or say why not.
 *
 * ## It returns ALL of them, and it asks STRIPE
 *
 * It used to take `limit(1)` off the mirror ordered by `updated_at`, and a cold
 * review turned that into the worst defect on this branch: two concurrent
 * `startTrial` calls for different plans produce two live trials (the duplicate
 * guard keys on user+plan), Cancel then cancelled the wrong one and returned
 * success, the mirror write bumped `updated_at` on the dead row so the screen
 * swapped to "Restart my trial", and the test clock took $69.99 from somebody
 * who had pressed Cancel and been told in writing they would not be charged.
 *
 * So: every billable subscription, from Stripe, which is the only thing that
 * knows what is real. `liveSubscriptionsForUser` is shared with the deletion
 * path so the two cannot drift.
 *
 * ## Identity still comes from the session, through RLS
 *
 * The ownership check is unchanged and is still the important part: the caller's
 * OWN `billing_customers` row is what resolves the Stripe customer, read with
 * the session client so Postgres refuses a stranger's row independently of the
 * scoping. Nothing about which subscription to act on comes from the client.
 */
async function ownSubscriptions(): Promise<
  { ids: string[]; userId: string; customerId: string } | { error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to be signed in." };

  const supabase = await createClient();
  // Through RLS: proves the caller owns the customer before anything is
  // resolved against it.
  const { data, error } = await supabase
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[billing] could not read the caller's customer:", error.message);
    return { error: "We couldn't reach your billing details just now." };
  }
  if (!data?.stripe_customer_id) {
    return { error: "There's no active subscription on this account." };
  }

  let ids: string[];
  try {
    ids = await liveSubscriptionsForUser(user.id);
  } catch (err) {
    console.error(
      `[billing] could not list subscriptions for ${user.id}:`,
      err instanceof Error ? err.message : String(err),
    );
    return { error: "We couldn't reach your billing details just now." };
  }

  if (ids.length === 0) return { error: "There's no active subscription on this account." };
  return { ids, userId: user.id, customerId: data.stripe_customer_id as string };
}

/**
 * Stop the next charge. Access continues to the end of what is already paid for.
 *
 * ## The cancellation is FINISHED before the offer is even looked up
 *
 * `applyCancelFlag` has returned for every subscription by the time anything
 * below happens, and the offer lookup is in its own `try` that can only affect
 * what this returns in the `offer` field. There is no arrangement of failures
 * where the user ends this call still subscribed: if the offer check throws, the
 * result is `{ok: true}` with no offer, and they are cancelled.
 *
 * That is the property the click-to-cancel rules actually care about, and it is
 * worth stating because it is easy to break later by moving one line up.
 */
export async function cancelSubscription(): Promise<CancelResult> {
  const found = await ownSubscriptions();
  if ("error" in found) return { ok: false, error: found.error };

  try {
    // EVERY one of them. "Cancel my subscription" means stop billing me, not
    // stop billing me for whichever row happened to sort first.
    for (const id of found.ids) await applyCancelFlag(id, true);
  } catch (err) {
    // Stripe's own message can name internal ids and price objects, so it is
    // logged and not returned.
    console.error(
      `[billing] cancel failed for ${found.ids.join(", ")}:`,
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, error: "We couldn't cancel just now. Please try again." };
  }

  console.info(`[billing] ${found.userId} cancelled ${found.ids.length} subscription(s) at period end`);
  revalidatePath("/billing");
  revalidatePath("/profile");

  const offer = await offerAfterCancel(found.customerId);
  return { ok: true, savedAt: Date.now(), ...(offer ? { offer } : {}) };
}

/**
 * Is there an offer to make, and of which kind?
 *
 * Wrapped so that NOTHING in here can fail the cancellation. Every path returns
 * undefined rather than throwing; the user is already cancelled and an error
 * about a retention offer is not theirs to see.
 */
async function offerAfterCancel(
  customerId: string,
): Promise<{ kind: SaveOfferKind; days: number } | undefined> {
  try {
    const primary = await primarySubscription(customerId);
    if (!primary) return undefined;

    const kind: SaveOfferKind = primary.status === "trialing" ? "trial" : "paid";
    const state = await readSaveOffer(customerId, kind);
    if (!state.available || !state.kind) return undefined;

    // Recorded as SHOWN here rather than when the dialog opens: a separate
    // "I saw it" call is one anybody who wanted the offer twice could simply
    // not make. See `saveOffer.ts`.
    await markOfferShown(customerId);
    return { kind: state.kind, days: EXTRA_TRIAL_DAYS };
  } catch (err) {
    console.error(
      `[billing] the save-offer check failed for ${customerId} (the cancellation stands):`,
      err instanceof Error ? err.message : String(err),
    );
    return undefined;
  }
}

/**
 * The subscription the screen is about: the one ending SOONEST.
 *
 * Same ordering as `/billing` and the reminder runner, so all three describe the
 * same subscription. Since `startTrial`'s lease and reconcile there should only
 * ever be one, and more than one is logged as the anomaly it now is.
 */
async function primarySubscription(customerId: string) {
  const list = await stripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  const live = list.data.filter((s) =>
    ["trialing", "active", "past_due"].includes(s.status),
  );
  if (live.length > 1) {
    console.error(
      `[billing] ${customerId} still holds ${live.length} live subscriptions; the save offer will act on the soonest-ending one`,
    );
  }
  return (
    [...live].sort((a, b) => endSeconds(a) - endSeconds(b))[0] ?? null
  );
}

function endSeconds(sub: Stripe.Subscription): number {
  return (
    (sub.status === "trialing" ? sub.trial_end : null) ??
    sub.items.data[0]?.current_period_end ??
    sub.trial_end ??
    Number.MAX_SAFE_INTEGER
  );
}

/**
 * TAKE THE OFFER. Seven more free days on a trial, or the next period free.
 *
 * ## It takes no argument, for the same reason cancel does not
 *
 * A server action is a public HTTP endpoint. A `subscriptionId` parameter would
 * be an "extend anyone's subscription" endpoint with a reasonable-looking
 * signature. Identity comes from the session and the subscription from the
 * caller's own customer row, every time.
 *
 * ## It refuses if the offer was never made
 *
 * `grantExtraTime` requires the SHOWN flag, which only `cancelSubscription`
 * writes. Without that check this action would hand a free week to anybody who
 * POSTed to it, because "the dialog only appears when the offer is available" is
 * a fact about the screen and not about the endpoint.
 */
export async function claimExtraTime(): Promise<
  BillingActionResult & { endsOn?: string; kind?: SaveOfferKind }
> {
  /**
   * ⚠️ `endsOn` COMES BACK ALREADY FORMATTED, IN THE USER'S OWN TIMEZONE.
   *
   * Handing the client an ISO string and letting it format would use the
   * BROWSER's zone, and every other date on this screen is rendered server-side
   * in `profiles.timezone`. A phone in a different zone from the profile would
   * then show two different days for one subscription on one page — and the
   * whole reason this screen states dates is that somebody is checking when
   * money moves.
   */
  const found = await ownSubscriptions();
  if ("error" in found) return { ok: false, error: found.error };

  let primary: Stripe.Subscription | null;
  try {
    primary = await primarySubscription(found.customerId);
  } catch (err) {
    console.error(
      `[billing] could not resolve a subscription to extend for ${found.userId}:`,
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, error: "We couldn't add the extra time just now." };
  }
  if (!primary) return { ok: false, error: "There's no active subscription on this account." };

  const result = await grantExtraTime(found.userId, found.customerId, primary);
  if (!result.ok) {
    console.warn(`[billing] extra time refused for ${found.userId}: ${result.reason}`);
    return {
      ok: false,
      error:
        result.reason === "already-claimed"
          ? "That's already been added to this account."
          : "We couldn't add the extra time just now.",
    };
  }

  console.info(
    `[billing] ${found.userId} took the save offer (${result.kind}); access now runs to ${result.endsOn}`,
  );
  revalidatePath("/billing");
  revalidatePath("/profile");
  return {
    ok: true,
    savedAt: Date.now(),
    endsOn: formatAccessDate(result.endsOn, await ownTimezone(found.userId)),
    kind: result.kind,
  };
}

/**
 * The user's own timezone, defaulted the same way `/billing` defaults it.
 *
 * Read with the SERVICE client rather than the session client: this runs after
 * a successful grant, and a profile read that fails RLS for some unrelated
 * reason must not turn a granted week into an error. Scoped by the id resolved
 * from the verified session, so it reads exactly one row and it is the caller's.
 */
async function ownTimezone(userId: string): Promise<string> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", userId)
      .maybeSingle();
    return (data?.timezone as string | null) || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** The same fallback `/billing` uses, so the two cannot print different days. */
const DEFAULT_TIMEZONE = "Australia/Sydney";

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
  if (!host) return PRODUCTION_ORIGIN;

  /**
   * ⚠️ THE HOST HEADER IS ATTACKER-CONTROLLED. IT IS CHECKED, NOT TRUSTED.
   *
   * This returned whatever the header said, and a cold review poisoned it:
   *
   *     X-Forwarded-Host: evil-attacker.example.com
   *       -> return_url: http://evil-attacker.example.com/billing
   *
   * Stripe performs no validation of its own — it accepted an arbitrary origin
   * outright — so the header was the only thing standing between a request and
   * Stripe bouncing a signed-in user onto somebody else's site straight after a
   * billing action. A browser cannot set that header cross-origin and Vercel's
   * edge normally overwrites it, so this was a trust-boundary defect rather than
   * a proven remote exploit. It is still not a header worth trusting.
   *
   * An allowlist, so an unrecognised host falls back to production rather than
   * being echoed. Preview deploys get their own hostname per build, hence the
   * `.vercel.app` suffix rule rather than a fixed list.
   */
  const hostname = host.split(":")[0].toLowerCase();
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || /^192\.168\./.test(hostname);
  const allowed =
    hostname === "trackdco.app" ||
    hostname === "www.trackdco.app" ||
    hostname.endsWith(".vercel.app") ||
    isLocal;

  if (!allowed) {
    console.error(`[billing] refusing a return_url for an unrecognised host: ${host}`);
    return PRODUCTION_ORIGIN;
  }
  return `${isLocal ? "http" : "https"}://${host}`;
}

const PRODUCTION_ORIGIN = "https://trackdco.app";

/** Undo a scheduled cancellation, any time before the date. */
export async function resumeSubscription(): Promise<BillingActionResult> {
  const found = await ownSubscriptions();
  if ("error" in found) return { ok: false, error: found.error };

  try {
    for (const id of found.ids) await applyCancelFlag(id, false);
  } catch (err) {
    console.error(
      `[billing] resume failed for ${found.ids.join(", ")}:`,
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, error: "We couldn't restart it just now. Please try again." };
  }

  console.info(`[billing] ${found.userId} resumed ${found.ids.length} subscription(s)`);
  revalidatePath("/billing");
  revalidatePath("/profile");
  return { ok: true, savedAt: Date.now() };
}
