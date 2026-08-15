"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type Stripe from "stripe";

import { getCurrentUser } from "@/lib/auth";
import { applyCancelFlag, liveSubscriptionsForUser } from "@/lib/billing/cancel";
import {
  CANCELLABLE_STATUSES,
  CANCEL_FAILED,
  RESUME_FAILED,
  formatAccessDate,
  type SaveOfferKind,
} from "@/lib/billing/manage";
import { originFromHost } from "@/lib/billing/originAllowlist";
import {
  EXTRA_TRIAL_DAYS,
  addOffer,
  offerNounFor,
  grantExtraTime,
  markOfferShown,
  readSaveOffer,
} from "@/lib/billing/saveOffer";
import { stripe } from "@/lib/billing/stripe";
import { syncSubscription } from "@/lib/billing/sync";
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

/**
 * Everything the offer dialog needs to state its own terms.
 *
 * `chargeOn` is the day billing resumes if they take it, computed from the same
 * subscription and the same two functions the grant itself uses. The dialog is
 * REQUIRED to show it: since 2026-08-14 taking the offer lifts the cancellation,
 * so somebody who reads "free" and nothing else is a chargeback.
 */
export interface SaveOffer {
  kind: SaveOfferKind;
  /**
   * ISO instant the offer was recorded as shown, from the SERVER.
   *
   * The countdown reads this rather than the moment the dialog painted, so the
   * clock on screen and the ten-minute window the server enforces are the same
   * ten minutes. A client-side start would drift by the round trip and, worse,
   * would reset every time the dialog was reopened.
   */
  shownAt: string;
  /** "week" or "month". Drives both the length and the noun in the copy. */
  noun: "week" | "month";
  /**
   * ⚠️ THE DAY MONEY MOVES, ALREADY FORMATTED IN THE USER'S STORED TIMEZONE.
   *
   * An ISO instant, formatted in the BROWSER's zone by the dialog. A cold review
   * measured what that cost with the profile in Pacific/Kiritimati and the phone
   * in America/Los_Angeles: the cancel dialog said 24 Aug (server), this said
   * 30 Aug (browser), and the thank-you one tap later said 31 Aug (server) — for
   * one charge, on the screen the spec calls the highest-risk in the app. The
   * two instants were always identical; only the clock formatting them differed.
   *
   * So it is formatted HERE, by the same `formatAccessDate` every other date on
   * this flow goes through, exactly as `claimExtraTime` already does for
   * `endsOn`. Nothing about the sentence it sits in changed.
   */
  chargeOn: string;
  /** Kept for the trial copy, which still counts in days. */
  days: number;
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
  offer?: SaveOffer;
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
    /**
     * ⚠️ `CANCELLABLE_STATUSES`, NOT `BILLABLE_STATUSES`.
     *
     * This read the wider billable set, and a cold review drove what that cost:
     * Stripe HARD-REFUSES `cancel_at_period_end` on a `paused` subscription
     * ("Resume the subscription first"), so one paused subscription on the
     * customer made the loop below throw and the user could not cancel at all.
     * Measured twice: with the paused one newer, nothing was ever cancelled and
     * every retry failed identically while the live trial converted; with it
     * older, the cancellation went through at Stripe while the screen said it
     * had failed and then offered only the button that undoes it.
     *
     * The wider set is still exactly right for the DELETION path, which uses
     * `subscriptions.cancel()` and which Stripe accepts on a paused
     * subscription. Two questions, two lists. See `manage.ts`.
     */
    ids = await liveSubscriptionsForUser(user.id, CANCELLABLE_STATUSES);
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

  /**
   * EVERY one of them. "Cancel my subscription" means stop billing me, not stop
   * billing me for whichever row happened to sort first.
   *
   * ⚠️ ONE FAILURE MUST NOT ABANDON THE REST. This was a single `try` around a
   * sequential loop, so the first throw left every later subscription untouched
   * and still billing — and which subscription that was depended only on
   * Stripe's `created desc` ordering. Each is attempted on its own now, and the
   * result is judged afterwards.
   *
   * **A partial failure is reported as a failure**, because the user is still
   * billable through whatever did not cancel, and telling them otherwise is the
   * one lie this flow exists to avoid. Retrying is safe: Stripe accepts the flag
   * again on a subscription that already carries it.
   */
  const outcomes = await Promise.allSettled(
    found.ids.map((id) => applyCancelFlag(id, true)),
  );
  const failed = found.ids.filter((_, i) => outcomes[i].status === "rejected");
  if (failed.length > 0) {
    for (const [i, outcome] of outcomes.entries()) {
      if (outcome.status !== "rejected") continue;
      // Stripe's own message can name internal ids and price objects, so it is
      // logged and not returned.
      console.error(
        `[billing] cancel failed for ${found.ids[i]}:`,
        outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      );
    }
    if (failed.length < found.ids.length) {
      console.error(
        `[billing] ⚠️ ${found.userId} is PARTIALLY cancelled: ${found.ids.length - failed.length} stopped, ${failed.join(", ")} still billing`,
      );
    }
    return { ok: false, error: CANCEL_FAILED };
  }

  console.info(`[billing] ${found.userId} cancelled ${found.ids.length} subscription(s) at period end`);
  revalidatePath("/billing");
  revalidatePath("/profile");

  const offer = await offerAfterCancel(found.customerId, found.userId);
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
  userId: string,
): Promise<SaveOffer | undefined> {
  try {
    const primary = await primarySubscription(customerId);
    if (!primary) return undefined;

    const kind: SaveOfferKind = primary.status === "trialing" ? "trial" : "paid";
    const state = await readSaveOffer(customerId, kind);
    if (!state.available || !state.kind) return undefined;

    /**
     * ⚠️ THE DATE IS COMPUTED HERE AND SHOWN ON THE DIALOG.
     *
     * Since 2026-08-14 taking the offer LIFTS the cancellation, so the dialog
     * has to name the day money will move. It is derived from the same two
     * functions the grant itself uses, on the same subscription object, so the
     * date somebody reads before deciding is the date they are actually charged
     * rather than a second calculation that can drift from the first.
     */
    const noun = offerNounFor(primary);
    const from =
      primary.status === "trialing"
        ? (primary.trial_end ?? Math.floor(Date.now() / 1000))
        : (primary.items.data[0]?.current_period_end ?? Math.floor(Date.now() / 1000));
    // Formatted in the user's OWN stored zone, here on the server, so the date
    // they read before deciding is the same day every other surface names.
    const chargeOn = formatAccessDate(
      new Date(addOffer(from, noun) * 1000).toISOString(),
      await ownTimezone(userId),
    );

    // Recorded as SHOWN here rather than when the dialog opens: a separate
    // "I saw it" call is one anybody who wanted the offer twice could simply
    // not make. It also STARTS THE TEN MINUTE CLOCK. See `saveOffer.ts`.
    const shownAt = new Date().toISOString();
    await markOfferShown(customerId);
    return { kind: state.kind, noun, chargeOn, shownAt, days: EXTRA_TRIAL_DAYS };
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
          : result.reason === "not-cancelled"
            // They un-cancelled, or started a new subscription, between being
            // offered the week and claiming it. Nothing is wrong with their
            // account and nothing needs doing, so the message says that rather
            // than implying a failure.
            ? "Your subscription is already running, so there's nothing to add."
            : "We couldn't add the extra time just now.",
    };
  }

  /**
   * ⚠️ MIRROR THE GRANT IMMEDIATELY. DO NOT WAIT FOR THE WEBHOOK.
   *
   * A cold review measured the gap: `claimExtraTime` returned "22 Aug 2026" while
   * the screen behind the dialog still read "Trial ends 15 Aug 2026 / Keep
   * Trackd after 15 Aug", and `entitlements.active_until` was still 15 Aug.
   * Neither is written by this action; only the Stripe webhook writes them.
   *
   * Usually that lands a second later and nobody notices. When it does not —
   * lost, `unattributed`, or 500'd — the user goes READ-ONLY ON THE OLD DATE,
   * having been told in writing they had another week. That is the same shape
   * as the $69.99 defect: a promise on screen and a different truth in the
   * database.
   *
   * `applyCancelFlag` already mirrors its own change for exactly this reason.
   * This does the same, through `syncSubscription`, which is the one function
   * that writes both the mirror and the entitlement from a live Stripe object —
   * so the row the webhook eventually writes is byte-identical and the replay is
   * a no-op rather than a second opinion.
   *
   * Logged and not thrown on failure. Stripe has already granted the week and it
   * is real; failing here would tell the user their extra time did not happen
   * when it did, which is the worst available lie. The webhook still reconciles.
   */
  try {
    await syncSubscription(await stripe().subscriptions.retrieve(primary.id));
  } catch (err) {
    console.error(
      `[billing] extra time granted on ${primary.id} but the mirror was not updated:`,
      err instanceof Error ? err.message : String(err),
    );
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
 * The SESSION client, so RLS scopes the read independently of the `eq` — the
 * same two-layer arrangement `ownSubscriptions` uses, and the service role would
 * be elevation bought for a display string.
 *
 * Every failure returns the default rather than throwing. This runs AFTER a
 * successful grant, so a profile read that goes wrong for some unrelated reason
 * must not turn a week the user has already been given into an error message.
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
 *
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
 * billing action.
 *
 * The allowlist itself moved to `lib/billing/originAllowlist.ts`, PURE AND
 * TESTED, because a second cold review found two holes in the inline version
 * (a domain beginning "192.168." was treated as a LAN address and served over
 * plaintext, and `.endsWith(".vercel.app")` accepted anybody's deployment). A
 * rule that can be wrong in a way its own comment cannot notice belongs beside
 * tests. It cannot be exported from here: this is a `"use server"` module, so
 * every export is a dispatchable action and a non-async one fails the build.
 */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  return originFromHost(h.get("x-forwarded-host") ?? h.get("host"));
}

/** Undo a scheduled cancellation, any time before the date. */
export async function resumeSubscription(): Promise<BillingActionResult> {
  const found = await ownSubscriptions();
  if ("error" in found) return { ok: false, error: found.error };

  /**
   * ⚠️ THE OPPOSITE HONESTY RULE FROM THE CANCEL, AND DELIBERATELY SO.
   *
   * Same `allSettled` shape, for the same reason: one throw used to abandon
   * every later subscription. But a PARTIAL success is reported as a SUCCESS
   * here, where the cancel reports a failure, because the two directions have
   * opposite dangerous lies.
   *
   * A cold review drove this one: the loop threw halfway, the dialog said "We
   * couldn't restart it just now", no confirmation card appeared, and Stripe
   * showed `cancel_at_period_end: false`. The user reasonably concluded they
   * were still cancelled, and was going to be charged. That is the invariant
   * "nobody is ever charged after being told they would not be", broken by an
   * error message.
   *
   * So: if anything came back on, the charge is re-armed and the screen must say
   * so. Only a total failure is reported as one.
   */
  const outcomes = await Promise.allSettled(
    found.ids.map((id) => applyCancelFlag(id, false)),
  );
  const resumed = found.ids.filter((_, i) => outcomes[i].status === "fulfilled");
  for (const [i, outcome] of outcomes.entries()) {
    if (outcome.status !== "rejected") continue;
    console.error(
      `[billing] resume failed for ${found.ids[i]}:`,
      outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
    );
  }
  if (resumed.length === 0) {
    return { ok: false, error: RESUME_FAILED };
  }
  if (resumed.length < found.ids.length) {
    console.error(
      `[billing] ⚠️ ${found.userId} is PARTIALLY resumed: ${resumed.join(", ")} are billing again, the rest are still cancelling`,
    );
  }

  console.info(`[billing] ${found.userId} resumed ${found.ids.length} subscription(s)`);
  revalidatePath("/billing");
  revalidatePath("/profile");
  return { ok: true, savedAt: Date.now() };
}
