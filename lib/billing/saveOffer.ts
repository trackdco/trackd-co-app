import "server-only";

import type Stripe from "stripe";

import type { SaveOfferKind } from "./manage";
import { stripe } from "./stripe";

/**
 * THE SAVE OFFER — one week more, once ever, offered AFTER the cancellation has
 * already gone through.
 *
 * ## The order is the whole compliance story
 *
 * The cancel completes first, unconditionally. `cancelSubscription` sets
 * `cancel_at_period_end` and returns; only then does the screen ask whether they
 * would like extra time. So a user who closes the dialog, loses signal, kills
 * the tab, or taps "No thanks" is CANCELLED — there is no path where declining
 * an offer leaves them subscribed.
 *
 * That ordering is not a nicety. The FTC's click-to-cancel rule and the
 * equivalent Australian consumer expectations both turn on the cancellation
 * being as easy as the sign-up, and a save offer that gates the cancel is the
 * exact pattern they exist to stop. This one cannot gate it, structurally,
 * because by the time it is on screen the cancellation is already recorded at
 * Stripe.
 *
 * One extra step, and exactly one (Adrian, 2026-08-13). "Yes, cancel" is always
 * present on the confirm and is never disguised.
 *
 * ## Why Stripe customer metadata and not a column
 *
 * Adrian's call, and it is the right one: no migration, and the flag lives
 * beside the thing it is about. It also survives a database restore
 * independently, which for a "once ever" grant is the direction you want — the
 * failure mode of losing it is giving somebody a second free week.
 *
 * ## Two keys, and they mean different things
 *
 * `SHOWN_KEY` is written when the offer is PRESENTED. `CLAIMED_KEY` is written
 * when it is taken. Availability is decided by `SHOWN_KEY` alone, so **a second
 * cancellation goes straight through with no offer** even if the first one was
 * declined (Adrian, 2026-08-13).
 *
 * That is deliberately the conservative reading of "once ever". Re-offering on
 * every cancellation is precisely the friction the click-to-cancel rules
 * describe, and somebody who declined once and changed their mind is a support
 * email rather than a reason to interrupt every future cancellation.
 *
 * `CLAIMED_KEY` is kept anyway, because "did this account ever actually get the
 * week?" is a question support will be asked and a shown-but-declined flag
 * cannot answer.
 */

/** How much extra time. Seven days, matching the trial's own length. */
export const EXTRA_TRIAL_DAYS = 7;

/** Written when the offer is put on screen. Decides availability. */
const SHOWN_KEY = "trackd_save_offer_shown_at";
/** Written when it is taken. For support, not for the decision. */
const CLAIMED_KEY = "trackd_save_offer_claimed_at";

/**
 * What the offer looks like for this subscription.
 *
 * `trial` and `paid` are genuinely different offers, not one offer with two
 * labels, and the difference has to reach the copy:
 *
 *   - On a TRIAL, seven more free days and the cancellation STANDS. Nothing is
 *     re-committed; they simply get another week before the same ending.
 *   - On a PAID subscription there is no equivalent, because the thing they
 *     cancelled is the renewal. The offer is the NEXT PERIOD FREE, and taking it
 *     necessarily un-cancels: there has to be a next period for it to be free.
 *     That is a material change and the dialog says so out loud.
 */
export interface SaveOfferState {
  /** May this account be offered it at all? */
  available: boolean;
  kind: SaveOfferKind | null;
}

/**
 * Has this customer already been offered it?
 *
 * Errs towards NOT offering. A Stripe read that fails returns `available:
 * false`, because the cost of being wrong in that direction is one person not
 * seeing an offer, and the cost in the other direction is handing out a second
 * free week to somebody who already had one.
 */
export async function readSaveOffer(
  customerId: string,
  kind: SaveOfferKind,
): Promise<SaveOfferState> {
  try {
    const customer = await stripe().customers.retrieve(customerId);
    if (customer.deleted) return { available: false, kind: null };
    const shown = customer.metadata?.[SHOWN_KEY];
    return { available: !shown, kind: shown ? null : kind };
  } catch (err) {
    console.error(
      `[billing] could not read the save-offer flag on ${customerId}:`,
      err instanceof Error ? err.message : String(err),
    );
    return { available: false, kind: null };
  }
}

/**
 * Record that the offer has been put on screen.
 *
 * Written by the CANCEL, at the moment it decides to offer, rather than by the
 * dialog when it opens. A separate "I saw it" call would be a request anybody
 * who wanted the offer twice could simply not make.
 *
 * Best effort. A failure here means somebody might be offered it twice, which is
 * a far better outcome than a cancellation that errors because a marketing flag
 * would not write.
 */
export async function markOfferShown(customerId: string): Promise<void> {
  try {
    await stripe().customers.update(customerId, {
      metadata: { [SHOWN_KEY]: new Date().toISOString() },
    });
  } catch (err) {
    console.error(
      `[billing] could not mark the save offer shown on ${customerId}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

export type GrantResult =
  | { ok: true; endsOn: string; kind: SaveOfferKind }
  | { ok: false; reason: "already-claimed" | "not-offered" | "failed" };

/**
 * Give the week (or the free period), once.
 *
 * ## Two guards, covering two different windows
 *
 * **The metadata flag** covers the sequential case: coming back tomorrow, or
 * next month, and asking again.
 *
 * **A Stripe idempotency key** covers the concurrent one, which the flag cannot:
 * two taps in the same tick both read "not claimed" before either writes, and
 * Stripe metadata has no compare-and-swap to close that with. Both requests
 * compute the same new `trial_end` from the same current value, so both send an
 * identical body under the key `save-offer:<user>` and Stripe applies it once.
 *
 * Keys live 24 hours and the flag is forever, so between them there is no window
 * where a second week can be had.
 */
export async function grantExtraTime(
  userId: string,
  customerId: string,
  subscription: Stripe.Subscription,
): Promise<GrantResult> {
  const client = stripe();

  let customer: Stripe.Customer;
  try {
    const fetched = await client.customers.retrieve(customerId);
    if (fetched.deleted) return { ok: false, reason: "failed" };
    customer = fetched;
  } catch (err) {
    console.error(
      `[billing] could not read ${customerId} before granting extra time:`,
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, reason: "failed" };
  }

  if (customer.metadata?.[CLAIMED_KEY]) return { ok: false, reason: "already-claimed" };
  /**
   * The offer has to have been OFFERED. Without this, `claimExtraTime` is a
   * public endpoint that hands out a free week to anybody who calls it — a
   * server action is an HTTP endpoint, and "the dialog only appears when the
   * offer is available" is a statement about the screen, not about the action.
   */
  if (!customer.metadata?.[SHOWN_KEY]) return { ok: false, reason: "not-offered" };

  const kind: SaveOfferKind = subscription.status === "trialing" ? "trial" : "paid";

  try {
    const updated =
      kind === "trial"
        ? await extendTrial(client, subscription, userId)
        : await freeNextPeriod(client, subscription, userId);

    /**
     * Stamped AFTER the grant lands, not before.
     *
     * The other order looks safer and is worse: a stamp written first, followed
     * by a Stripe update that fails, leaves somebody who was promised a week,
     * did not get it, and can never ask again. This order's failure mode is a
     * granted week that is not recorded, which the idempotency key already makes
     * unrepeatable for a day and which a support query can see in the
     * subscription itself.
     */
    await client.customers.update(customerId, {
      metadata: { [CLAIMED_KEY]: new Date().toISOString() },
    });

    const endsOn = endOfAccess(updated);
    if (!endsOn) {
      console.error(`[billing] extra time granted on ${updated.id} but no end date to show`);
      return { ok: false, reason: "failed" };
    }
    return { ok: true, endsOn, kind };
  } catch (err) {
    console.error(
      `[billing] could not grant extra time on ${subscription.id}:`,
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, reason: "failed" };
  }
}

/**
 * A TRIAL: push `trial_end` out by a week, and leave the cancellation alone.
 *
 * `cancel_at_period_end` is deliberately NOT touched. They asked to cancel and
 * they are still cancelling; the ending simply moves. Clearing it here would be
 * the app quietly re-enabling billing on the back of an offer that said nothing
 * about billing, which is the whole thing this shape exists to avoid.
 *
 * Stripe cancels a trialing subscription at the end of its current period, and
 * the trial end IS that period's end, so moving one moves the other. Verified
 * against real Stripe rather than assumed.
 *
 * `proration_behavior: "none"` because nothing is owed either way and the
 * default would consider writing an invoice item for a period nobody is paying
 * for.
 */
async function extendTrial(
  client: ReturnType<typeof stripe>,
  subscription: Stripe.Subscription,
  userId: string,
): Promise<Stripe.Subscription> {
  const current = subscription.trial_end ?? nowSeconds();
  /**
   * From the CURRENT trial end, not from today. Somebody cancelling on day 1 of
   * a 7-day trial is being given a fourteen-day trial, not sent back to day 8 —
   * and computing it from `now` would SHORTEN the trial of anybody who cancelled
   * early, which is a punishment dressed as a gift.
   */
  const extended = current + EXTRA_TRIAL_DAYS * 24 * 60 * 60;

  return client.subscriptions.update(
    subscription.id,
    { trial_end: extended, proration_behavior: "none" },
    { idempotencyKey: `save-offer:${userId}` },
  );
}

/**
 * PAID: the next period is free, and the cancellation is lifted.
 *
 * There is no honest way to give a paying customer "extra free time" without
 * un-cancelling, because the thing they cancelled IS the next period. So this
 * one really does re-enable billing after the free period, and the dialog says
 * that in the sentence above the button rather than in a footnote.
 *
 * A 100%-off `duration: once` coupon rather than a moved billing anchor: the
 * invoice then literally reads $0.00 for that period, which is what the screen
 * promised, and the renewal date after it is unchanged. Moving `trial_end` on an
 * active subscription would achieve something similar while quietly shifting
 * every future billing date.
 */
async function freeNextPeriod(
  client: ReturnType<typeof stripe>,
  subscription: Stripe.Subscription,
  userId: string,
): Promise<Stripe.Subscription> {
  await ensureCoupon(client);

  return client.subscriptions.update(
    subscription.id,
    {
      discounts: [{ coupon: SAVE_OFFER_COUPON_ID }],
      cancel_at_period_end: false,
    },
    { idempotencyKey: `save-offer:${userId}` },
  );
}

/**
 * One coupon, with a fixed id, created on first use.
 *
 * A fixed id makes this idempotent without a lookup table: a second call
 * retrieves the one that already exists. Creating a fresh coupon per grant would
 * litter the Stripe account with thousands of single-use objects and make "how
 * many people took the save offer?" unanswerable.
 */
const SAVE_OFFER_COUPON_ID = "trackd_save_offer_one_period";

async function ensureCoupon(client: ReturnType<typeof stripe>): Promise<void> {
  try {
    await client.coupons.retrieve(SAVE_OFFER_COUPON_ID);
    return;
  } catch {
    // Not there yet. Fall through and make it.
  }
  try {
    await client.coupons.create({
      id: SAVE_OFFER_COUPON_ID,
      percent_off: 100,
      duration: "once",
      name: "Trackd save offer",
    });
  } catch (err) {
    /**
     * A concurrent create loses with "coupon already exists", which is the
     * outcome we wanted. Anything else is real and the caller's catch will see
     * it when the update fails.
     */
    const message = err instanceof Error ? err.message : String(err);
    if (!/already exists/i.test(message)) throw err;
  }
}

/**
 * When access now runs out — the same choice `manageActionFor` and `entitledUntil`
 * both make, so the three cannot name different days for one subscription.
 */
function endOfAccess(subscription: Stripe.Subscription): string | null {
  const seconds =
    subscription.status === "trialing"
      ? subscription.trial_end
      : (subscription.items.data[0]?.current_period_end ?? subscription.trial_end);
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString();
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
