import "server-only";

import type Stripe from "stripe";

import { CANCELLABLE_STATUSES, formatAccessDate, type SaveOfferKind } from "./manage";
import { stripe } from "./stripe";
import { listAllSubscriptions } from "./subscriptionList";

/**
 * THE SAVE OFFER — extra time, once ever, offered AFTER the cancellation has
 * already gone through, and claimable for ten minutes.
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
 * `OFFER_SHOWN_KEY` is written when the offer is PRESENTED. `OFFER_CLAIMED_KEY` is written
 * when it is taken. Availability is decided by `OFFER_SHOWN_KEY` alone, so **a second
 * cancellation goes straight through with no offer** even if the first one was
 * declined (Adrian, 2026-08-13).
 *
 * That is deliberately the conservative reading of "once ever". Re-offering on
 * every cancellation is precisely the friction the click-to-cancel rules
 * describe, and somebody who declined once and changed their mind is a support
 * email rather than a reason to interrupt every future cancellation.
 *
 * `OFFER_CLAIMED_KEY` is kept anyway, because "did this account ever actually get the
 * week?" is a question support will be asked and a shown-but-declined flag
 * cannot answer.
 */

/** How much extra time a TRIAL gets. Seven days, matching the trial's own length. */
export const EXTRA_TRIAL_DAYS = 7;

/**
 * HOW LONG THE OFFER STAYS CLAIMABLE, in minutes.
 *
 * Adrian's call, 2026-08-14: the dialog shows a countdown. The clock is REAL and
 * this is what makes it real. A countdown to nothing would be invented urgency
 * on a cancel screen, which is the same family of pattern as a guilt-worded
 * decline button, and the one place regulators actually look.
 *
 * So the claim is refused after this window, on the SERVER, computed from the
 * moment the offer was recorded as shown. A browser holding the dialog open, or
 * a replayed request an hour later, both get nothing.
 */
export const OFFER_WINDOW_MINUTES = 10;

/**
 * Written when the offer is put on screen. Decides availability AND starts the clock.
 *
 * ⚠️ EXPORTED FOR THE RESTORE PATH (`openOffer.ts`), which has to read the same
 * two keys this module writes. A second copy of either string is a marker nobody
 * can find and an offer nobody can burn.
 */
export const OFFER_SHOWN_KEY = "trackd_save_offer_shown_at";
/** Written when it is taken. For support, not for the decision. */
export const OFFER_CLAIMED_KEY = "trackd_save_offer_claimed_at";
/**
 * Written on the SUBSCRIPTION when a courtesy extension is granted.
 *
 * Both grants now work by pushing `trial_end`, which puts an ACTIVE subscription
 * into Stripe's `trialing` status for the free period. Without this marker
 * `planLabelFor` would read that status and tell a paying customer of two years
 * that they are on a free trial. See `lib/billing/manage.ts`.
 */
export const COURTESY_KEY = "trackd_courtesy_until";

/**
 * What the offer looks like for this subscription.
 *
 * `trial` and `paid` now do the SAME THING to a plan (see {@link grantExtraTime}):
 * the end of access moves out, and the cancellation is lifted. The kind survives
 * because the copy still differs in one word, the length differs, and support
 * needs to be able to tell them apart:
 *
 *   - TRIAL: another {@link EXTRA_TRIAL_DAYS} days on a trial that had not been
 *     paid for yet.
 *   - PAID: one more period, capped at a month, on a subscription that has.
 *
 * ⚠️ Both re-enable billing. Neither dialog may say "your cancellation stands"
 * any more; both must name the charge and the date.
 */
export interface SaveOfferState {
  /** May this account be offered it at all? */
  available: boolean;
  kind: SaveOfferKind | null;
}

/**
 * ⚠️ AN UNPAID PERIOD IS NEVER OFFERED FREE TIME. (Adrian, 2026-08-16.)
 *
 * ## The defect this closes, measured
 *
 * The offer computes its free period from `items[0].current_period_end`, and on
 * a `past_due` subscription that is the end of the period **the card declined
 * on**. A cold review drove it on a test clock:
 *
 *     trial ends, card declines        entitlement 2026-08-17
 *     markPastDue claws back to grace              2026-08-20
 *     user cancels, takes "another month, free"    2026-10-17
 *
 * **+58 unpaid days**, the $11.99 invoice still open, and the subscription
 * flipped to `trialing` so the next sync extended straight past the clawback
 * that `markPastDue` exists to perform. The dialog meanwhile said "You'll be
 * charged on 18 Oct" to somebody whose card had already failed once.
 *
 * ## The ruling: no variant ships for this cohort
 *
 * Not anchored to `now`, not anchored to the last paid period, not shortened.
 * **No offer at all.** `04` §3.3's premise is that "anything else has been paid
 * for", and for this cohort that is simply false, so the offer has no honest
 * shape. They land on the ordinary post-cancel acknowledgement, already
 * cancelled, exactly as somebody whose offer was already spent does.
 *
 * ## And it does NOT burn their once-ever offer
 *
 * `markOfferShown` is never reached for them. Somebody refused for non-payment
 * has not spent anything: availability is decided by the shown-marker alone, so
 * leaving it unwritten means that if they pay and later cancel in good standing,
 * the offer is still theirs. Nothing is exploitable in that direction — staying
 * unpaid buys no second offer, it buys no offer at all.
 *
 * Checked HERE, on the server, against the live Stripe object. The client is
 * never asked and never told.
 */
const UNPAID_STATUSES: ReadonlySet<string> = new Set(["past_due", "unpaid", "incomplete"]);

/**
 * Invoice states that mean money is genuinely owed and has not arrived.
 *
 * `draft` is deliberately absent: a draft is the NEXT period being assembled and
 * is not due yet, so treating it as a debt would refuse the offer to healthy
 * subscribers during every renewal window.
 */
const UNPAID_INVOICE_STATUSES: ReadonlySet<string> = new Set(["open", "uncollectible"]);

export function periodIsUnpaid(subscription: Stripe.Subscription): boolean {
  if (UNPAID_STATUSES.has(subscription.status)) return true;

  const invoice = subscription.latest_invoice;
  // Unexpanded or absent: the status check above is all there is to go on, and
  // it has already passed. A trial's invoice is zero and paid.
  if (!invoice || typeof invoice === "string") return false;
  if ((invoice.amount_due ?? 0) <= 0) return false;
  return UNPAID_INVOICE_STATUSES.has(invoice.status ?? "");
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
    const shown = customer.metadata?.[OFFER_SHOWN_KEY];
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
export async function markOfferShown(customerId: string, shownAt: string): Promise<void> {
  try {
    /**
     * ⚠️ THE INSTANT IS PASSED IN, NOT TAKEN HERE. (§3.5.)
     *
     * The value written to Stripe and the value returned to the client used to
     * be two separate reads of the clock, in two modules, either side of a round
     * trip. At a ten-minute window the divergence is harmless in practice — but
     * the claim that "the clock on screen is the clock the server enforces" was
     * a description of intent rather than of the code, and a cold reviewer
     * reading the two had to work out whether it mattered. Now it is one value
     * and the sentence is simply true.
     */
    await stripe().customers.update(customerId, {
      metadata: { [OFFER_SHOWN_KEY]: shownAt },
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
  | {
      ok: false;
      reason: "already-claimed" | "not-offered" | "expired" | "not-cancelled" | "failed";
    };

/**
 * HOW MUCH TIME THIS SUBSCRIPTION'S OFFER IS WORTH — the FORWARD question only.
 *
 * ⚠️ RENAMED FROM `offerNounFor` (Adrian, 2026-08-17), AND THE NAME IS THE POINT.
 *
 * It answers "what should we GRANT this subscription?" and it must never be read
 * as "what WAS granted?" or "what is this period?". The `trialing` short-circuit
 * on the first line is correct for the first question and wrong for the other two,
 * and the old name invited exactly that misreading. **It has now come within one
 * step of a false reading twice:**
 *
 *   - `07` would have called a paying customer's courtesy MONTH a "free week",
 *     because Stripe reports `trialing` throughout a courtesy period (that is how
 *     the grant works at all). See the note at `runner.ts`'s `courtesyNounFor`.
 *   - `04` Step 11's yearly assertion would have passed on a TRIALING yearly
 *     subscription, which this function hands a week — so the test would never
 *     have exercised the yearly path it exists to pin, and the $69.99 giveaway
 *     would have been "proven" shut by a scenario that never looked at it.
 *
 * Two near-misses on one function is where the name gets fixed rather than
 * commented around. **To describe a period that already exists, read the period,
 * not this.**
 *
 * Adrian, 2026-08-14, replacing "the next period free". That version handed a
 * yearly subscriber TWELVE MONTHS for pressing cancel, which on the current
 * price is $69.99 given away to keep somebody who was already leaving.
 *
 * The rule is one period, CAPPED AT A MONTH:
 *
 *     weekly   -> one more week   (a month would be four times what they pay)
 *     monthly  -> one more month
 *     yearly   -> one more month  ($5.83, not $69.99)
 *
 * A TRIAL always gets {@link EXTRA_TRIAL_DAYS}, whatever plan it is attached to.
 * A trial is seven days long regardless of the plan behind it, so "another week"
 * is the offer that matches the thing being extended, and nobody who has paid
 * nothing yet is given a free month.
 *
 * ⚠️ Unknown or missing interval falls back to a WEEK, not a month. The failure
 * direction that costs money is the generous one.
 */
export function offerPeriodToGrant(subscription: Stripe.Subscription): "week" | "month" {
  if (subscription.status === "trialing") return "week";
  const interval = subscription.items.data[0]?.price?.recurring?.interval;
  if (interval === "month" || interval === "year") return "month";
  return "week";
}

/**
 * Add the offer to an instant, in CALENDAR terms rather than fixed seconds.
 *
 * "A month" is not 30 days: added to 31 January it has to mean 28 February, and
 * plain arithmetic in JavaScript rolls that over into March. The clamp below is
 * what stops a customer being told their next charge is on the 3rd when every
 * other date on their account falls on the 31st.
 */
export function addOffer(fromSeconds: number, noun: "week" | "month"): number {
  const from = new Date(fromSeconds * 1000);
  if (noun === "week") {
    return Math.floor(from.getTime() / 1000) + 7 * 24 * 60 * 60;
  }
  const day = from.getUTCDate();
  const target = new Date(from.getTime());
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + 1);
  // The last day of the month we have landed in, so 31 Jan cannot become 3 Mar.
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return Math.floor(target.getTime() / 1000);
}

/**
 * ⚠️ THE OFFER'S WINDOW AND ITS TWO DATES, COMPUTED ONCE.
 *
 * Both the cancellation that FIRST shows the offer and the reload that RESTORES
 * it (see `openOffer.ts`) need the same three values, and a second copy of this
 * arithmetic is a second answer waiting to disagree with the first on the highest
 * risk screen in the product. The measured cost of two clocks answering one
 * question is already on the record: with the profile in Pacific/Kiritimati and
 * the phone in America/Los_Angeles, three consecutive screens named three
 * different days for one charge.
 *
 * `from` is the CURRENT END OF ACCESS, never `now`: somebody who cancels on day 1
 * of a 7-day trial is given a fourteen-day trial rather than being sent back to
 * day 8, and computing from today would SHORTEN the access of anybody who
 * cancelled early — a punishment dressed as a gift. It is the same value
 * {@link addOffer} measures from inside `extendAccess`, which is what makes
 * `startsOn` free rather than a new computation.
 *
 * Null when either end cannot be formatted. §3.2's rule, now applied to BOTH ends
 * because F2's copy names a WINDOW: a line with a hole in it must not render, and
 * the caller refuses the offer entirely rather than showing one.
 */
export interface OfferWindow {
  noun: "week" | "month";
  /** The instant the free time starts, in Stripe's whole seconds. */
  fromSeconds: number;
  /** The day money moves, formatted in the user's stored timezone. */
  chargeOn: string;
  /** The day the free time starts, same formatter, same zone (F2). */
  startsOn: string;
}

export function offerWindowFor(
  subscription: Stripe.Subscription,
  tz: string,
): OfferWindow | null {
  const noun = offerPeriodToGrant(subscription);
  const fromSeconds =
    subscription.status === "trialing"
      ? (subscription.trial_end ?? nowSeconds())
      : (subscription.items.data[0]?.current_period_end ?? nowSeconds());

  const chargeOn = formatAccessDate(
    new Date(addOffer(fromSeconds, noun) * 1000).toISOString(),
    tz,
  );
  const startsOn = formatAccessDate(new Date(fromSeconds * 1000).toISOString(), tz);
  if (!chargeOn || !startsOn) return null;
  return { noun, fromSeconds, chargeOn, startsOn };
}

/**
 * ⚠️ THE SUBSCRIPTION THE OFFER IS ABOUT: the one ending SOONEST.
 *
 * Same ordering as `/billing` and the reminder runner, so all three describe the
 * same subscription. Since `startTrial`'s lease and the reconcile there should
 * only ever be one, and more than one is logged as the anomaly it now is.
 *
 * ⚠️ PAGED, AND THE SET IS NAMED. This decides which subscription the offer's
 * CHARGE DATE is anchored to on the highest-risk screen in the product: a
 * truncated list picks the wrong one, and a literal status list goes stale
 * silently the next time the set moves.
 *
 * Moved here from `app/(app)/billing/actions.ts` — unchanged, comment for comment
 * — because the restore path needs the identical row and a `"use server"` module
 * cannot export a non-async helper for it to share.
 */
export async function primaryOfferSubscription(
  customerId: string,
): Promise<Stripe.Subscription | null> {
  const all = await listAllSubscriptions(stripe(), customerId, {
    // `periodIsUnpaid` asks whether the CURRENT period's invoice was actually
    // paid, which the status alone cannot answer for an `active` subscription
    // sitting on an open invoice.
    expand: ["data.latest_invoice"],
  });
  const live = all.filter((s) => CANCELLABLE_STATUSES.has(s.status));
  if (live.length > 1) {
    console.error(
      `[billing] ${customerId} still holds ${live.length} live subscriptions; the save offer will act on the soonest-ending one`,
    );
  }
  return [...live].sort((a, b) => offerEndSeconds(a) - offerEndSeconds(b))[0] ?? null;
}

/** When a subscription's access runs out, for the ordering above. */
function offerEndSeconds(sub: Stripe.Subscription): number {
  return (
    (sub.status === "trialing" ? sub.trial_end : sub.items.data[0]?.current_period_end) ??
    sub.items.data[0]?.current_period_end ??
    Number.MAX_SAFE_INTEGER
  );
}

/**
 * Is the offer still inside its ten minutes?
 *
 * ⚠️ An UNPARSEABLE stamp is treated as still open, which is the opposite of
 * this file's usual "err towards not offering". The difference is which mistake
 * is ours: only our own server ever writes this value, so a value that will not
 * parse is a bug of ours, and refusing a week we have just promised on screen is
 * a worse outcome than granting one. `OFFER_CLAIMED_KEY` still makes it unrepeatable.
 */
export function offerStillOpen(shownAt: string | undefined, now: number = Date.now()): boolean {
  if (!shownAt) return false;
  const at = Date.parse(shownAt);
  if (Number.isNaN(at)) return true;
  return now - at <= OFFER_WINDOW_MINUTES * 60 * 1000;
}

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
 * identical body under the same key and Stripe applies it once.
 *
 * ⚠️ THE KEY IS `save-offer:<user>:<subscription>:<shownAt>`, NOT `save-offer:<user>`.
 * This paragraph described the old, user-scoped key for a while after §3.7's
 * narrowing had already landed at the call site — see `extendAccess`, which
 * carries the full reasoning. The distinction is not cosmetic: keys live 24
 * hours, so a user-scoped key meant a claim, un-cancel, cancel and claim inside
 * one day met a REPLAYED RESPONSE rather than a fresh evaluation.
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

  if (customer.metadata?.[OFFER_CLAIMED_KEY]) return { ok: false, reason: "already-claimed" };
  /**
   * The offer has to have been OFFERED. Without this, `claimExtraTime` is a
   * public endpoint that hands out a free week to anybody who calls it — a
   * server action is an HTTP endpoint, and "the dialog only appears when the
   * offer is available" is a statement about the screen, not about the action.
   */
  const shownAt = customer.metadata?.[OFFER_SHOWN_KEY];
  if (!shownAt) return { ok: false, reason: "not-offered" };

  /**
   * ⚠️ AND IT HAS TO STILL BE INSIDE THE TEN MINUTES.
   *
   * Checked here rather than in the browser, because the countdown on the dialog
   * is the promise and this is the thing that keeps it. A tab left open, a
   * request replayed from a log, or a hand-rolled call all arrive here and are
   * refused exactly when the clock said they would be.
   */
  if (!offerStillOpen(shownAt)) return { ok: false, reason: "expired" };

  /**
   * ⚠️ AND THEY HAVE TO STILL BE CANCELLED.
   *
   * A cold review found two ways round the flags alone, because `OFFER_SHOWN_KEY` is
   * customer-scoped and permanent while the subscription underneath it is not:
   *
   *   (a) cancel, take the un-cancel ("Keep Trackd after 19 Aug"), THEN claim.
   *       Result: a free week on a subscription nobody is leaving.
   *   (b) cancel, let it die, start a NEW subscription, claim on that one.
   *       Result: the same, on a subscription that was never cancelled at all.
   *
   * Both were driven: "trial moved by 7 days; cancel_at_period_end = false".
   *
   * Neither is a way to get TWO weeks — `OFFER_CLAIMED_KEY` still holds — so this is a
   * retention offer being spent by somebody who was not leaving rather than a
   * grant that repeats. It is still wrong: the offer exists to catch a person on
   * their way out, and the sentence on the dialog says "your trial is cancelled,
   * and that stands", which is false for both of them.
   *
   * The subscription is read fresh by the caller immediately before this, so
   * this is the state at grant time and not at offer time.
   */
  if (!subscription.cancel_at_period_end) {
    return { ok: false, reason: "not-cancelled" };
  }

  const kind: SaveOfferKind = subscription.status === "trialing" ? "trial" : "paid";

  try {
    const updated = await extendAccess(client, subscription, userId, shownAt);

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
      metadata: { [OFFER_CLAIMED_KEY]: new Date().toISOString() },
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
 * ONE GRANT, FOR BOTH KINDS: push the end of access out, and LIFT the cancellation.
 *
 * ## Adrian reversed this on 2026-08-14, and it matters
 *
 * The previous shape left `cancel_at_period_end` alone on a trial, so the copy
 * could say "your cancellation stands, you still won't be charged" and be
 * completely true. His call is that the offer exists to keep somebody, so taking
 * it puts the plan back on: they get the free time, and then they are billed
 * unless they cancel a second time.
 *
 * That is a legitimate retention offer and it is what the code now does. It also
 * makes this the highest-risk screen in the application, because the person
 * pressed cancel, read the word "free", and is now going to be charged. Two
 * things carry that weight and neither is decoration:
 *
 *   1. The dialog names THE CHARGE AND THE DATE, above the buttons, not in a
 *      footnote. See `CancelSubscription.tsx`.
 *   2. A reminder fires before the new date. "we'll remind you first" is on the
 *      dialog, so it is a promise, and `lib/notifications/trialReminder.ts` keeps
 *      it. If that reminder is ever removed, this sentence has to go with it.
 *
 * This project has already taken $69.99 from somebody who believed they had
 * cancelled. That was the worst defect ever found here and it is the reason the
 * two points above are not negotiable.
 *
 * ## Why one path instead of two
 *
 * The old code had `extendTrial` and `freeNextPeriod` doing genuinely different
 * things. They now do the same thing to a plan, so they are one function: two
 * sentences that must agree cannot drift if there is only one of them.
 *
 * ## Why `trial_end` and not a coupon
 *
 * A 100%-off coupon discounts a whole INVOICE, and on the yearly plan an invoice
 * is a year. There is no coupon that means "one month off a yearly plan" without
 * inventing an amount. Moving the end of access is exact, works identically on
 * every interval, and the date it produces is the date the screen showed.
 *
 * On an active subscription this puts Stripe's status into `trialing` for the
 * free stretch, which is why {@link COURTESY_KEY} is written: without it
 * `planLabelFor` would tell a two-year subscriber they are on a free trial.
 *
 * `proration_behavior: "none"` because nothing is owed in either direction and
 * the default would consider writing an invoice item for a period nobody pays.
 */
async function extendAccess(
  client: ReturnType<typeof stripe>,
  subscription: Stripe.Subscription,
  userId: string,
  /**
   * The offer's own server timestamp, read from Stripe's metadata. Part of the
   * idempotency key so it identifies the ATTEMPT rather than the user-day.
   */
  shownAt: string,
): Promise<Stripe.Subscription> {
  const noun = offerPeriodToGrant(subscription);
  /**
   * From the CURRENT end of access, never from today.
   *
   * Somebody who cancels on day 1 of a 7-day trial is being given a fourteen-day
   * trial rather than being sent back to day 8, and computing from `now` would
   * SHORTEN the access of anybody who cancelled early, which is a punishment
   * dressed as a gift.
   */
  const from =
    subscription.status === "trialing"
      ? (subscription.trial_end ?? nowSeconds())
      : (subscription.items.data[0]?.current_period_end ?? nowSeconds());

  const extended = addOffer(from, noun);

  return client.subscriptions.update(
    subscription.id,
    {
      trial_end: extended,
      cancel_at_period_end: false,
      proration_behavior: "none",
      metadata: {
        ...(subscription.metadata ?? {}),
        [COURTESY_KEY]: new Date(extended * 1000).toISOString(),
      },
    },
    /**
     * ⚠️ THE KEY IDENTIFIES THE ATTEMPT, NOT THE USER-DAY. (§3.7.)
     *
     * It was `save-offer:${userId}`, and Stripe keys live twenty-four hours —
     * broader than the thing being made idempotent. A user who claimed,
     * un-cancelled, cancelled again and claimed again inside a day met a
     * REPLAYED RESPONSE rather than a fresh grant. The outcome was still correct,
     * because the claimed-marker refuses them first — but the ordering was not
     * what made it correct, and a guard that is right by accident is one
     * refactor away from being wrong.
     *
     * The subscription and the offer's server timestamp are in it now. Two
     * concurrent claims on the SAME attempt still compute an identical key and
     * still dedupe, because both read the same `shownAt` from the same metadata.
     * A different attempt is a different key.
     */
    { idempotencyKey: `save-offer:${userId}:${subscription.id}:${shownAt}` },
  );
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
