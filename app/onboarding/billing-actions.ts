"use server";

import { getSessionContext } from "@/lib/auth";
import { BILLABLE_STATUSES } from "@/lib/billing/cancel";
import { survivorOf } from "@/lib/billing/duplicates";
import { hasProAccess } from "@/lib/billing/entitlements";
import { serviceClient } from "@/lib/billing/service";
import {
  acquireTrialLease,
  releaseTrialLease,
  type LeaseOutcome,
} from "@/lib/billing/trialLease";
import type Stripe from "stripe";

import { priceIdFor, stripe, type IntentKind, type PlanKey } from "@/lib/billing/stripe";
import { BETA_GRACE_DAYS, betaGrantFor } from "@/lib/billing/betaGrace";
import { resolveFreeTime } from "@/lib/billing/freeTime";
import { TRIAL_DAYS } from "@/lib/onboarding/pricing";

/**
 * START THE TRIAL (Spec w2b-15, step 6).
 *
 * Finds or creates the Stripe customer, creates a subscription with a
 * {@link TRIAL_DAYS}-day trial, and hands back the client secret the Payment
 * Element needs.
 *
 * ## Why a SetupIntent and not a PaymentIntent
 *
 * The amount due today is zero, so Stripe has nothing to charge and returns a
 * `pending_setup_intent` instead. The client confirms THAT. Which is better than
 * a workaround: confirming a SetupIntent runs 3D Secure bank verification while
 * the user is present and paying attention, so the day-7 charge is far more
 * likely to succeed than one attempted overnight against a card the bank has
 * never been asked about.
 *
 * ## This grants nothing
 *
 * It creates billing objects. Access comes from the webhook writing
 * `entitlements`, and from nowhere else — the client's success callback proves a
 * card was accepted and proves nothing about entitlement.
 */

/**
 * Whether this account still gets free days, and if not, which free run they
 * already had. The reason is copy, not logic: nothing gates on it.
 */
export type TrialEligibility = {
  eligible: boolean;
  /** `new` = gets a trial. `used` = had a 7-day trial. `beta` = had the fortnight. */
  reason: "new" | "used" | "beta";
  /**
   * How long their free run WAS. Not how long is left and not how much is
   * elapsed: a beta user on day 12 of 14 gets 14, because that is the only
   * reading the value is correct for.
   *
   * ⚠️ NOTHING MAY RENDER THIS AS A COUNTDOWN, a remaining balance or a
   * progress figure. The only string that uses it reads it in the past tense.
   */
  days: number;
  /**
   * The ISO instant a LIVE beta grace ends, or null.
   *
   * Non-null only when `reason` is `beta` AND the fortnight has not run out
   * yet, which is what separates a mid-grace user from a post-grace one. They
   * need different things said to them: the first is not charged until this
   * date, the second is charged today.
   *
   * ⚠️ Handed over as a RAW ISO INSTANT, straight from
   * `entitlements.active_until`, and never as a formatted date. The consuming
   * screen formats it in the timezone that screen already uses. This is what
   * stops a screen stating a date the server would contradict.
   */
  graceEndsAt: string | null;
};

export type StartTrialResult =
  | {
      status: "ok";
      clientSecret: string;
      /**
       * ⚠️ WHICH CONFIRM CALL TO MAKE, and it is NOT optional.
       *
       * A secret without its kind is what charges somebody who was promised
       * free days: the client would have to guess, and its only basis for a
       * guess is the generous default it already renders. Carried on the `ok`
       * variant so the type makes it impossible to hand back a secret without
       * saying what it is.
       *
       * No fourth `status` (§3.2): every existing caller branches on `status`
       * and must keep compiling untouched.
       */
      intentKind: IntentKind;
      subscriptionId: string;
    }
  /** Already entitled. The caller should move them into the app, not charge them. */
  | { status: "already-subscribed" }
  | {
      status: "error";
      message: string;
      /**
       * ⚠️ SET ONLY ON A MODE MISMATCH (§3.3), and it is what lets the sheet
       * re-render in the mode the SERVER decided.
       *
       * Elements takes its mode at mount, so a sheet mounted for a trial cannot
       * confirm a payment secret. When the client's mounted mode and the
       * server's answer disagree, nothing is confirmed, the subscription just
       * created is cancelled server-side, and this names what the sheet should
       * have been. Absent on every other error.
       *
       * No fourth `status` (§3.2): every existing caller branches on `status`.
       */
      serverMode?: IntentKind;
    };

/**
 * DOES THIS ACCOUNT STILL GET A FREE TRIAL?
 *
 * ⚠️ THIS EXISTS BECAUSE THE RULE AND THE COPY MUST SHIP TOGETHER.
 *
 * One trial per user means a returning customer is charged from day one. Every
 * screen in the flow says "7 days free", "Nothing to pay today" and "Start my
 * 7-day free trial", so without this they read all of that, tap the button, and
 * are charged immediately. That is the app breaking a promise it made two
 * screens earlier, in writing, on a payment screen. It is also the exact defect
 * class that produces chargebacks.
 *
 * Takes no argument and answers only about the caller. A server action is a
 * public HTTP endpoint, and this one leaks nothing beyond a boolean the user's
 * own next screen is about to show them anyway.
 *
 * ## It errs towards SAYING YES
 *
 * Any failure returns eligible. The same direction {@link startTrial} takes, and
 * for the same reason: the two must not disagree. A screen promising a trial the
 * server then grants is correct; a screen promising one the server refuses is
 * the broken promise this function exists to prevent.
 */
export async function trialEligibility(): Promise<TrialEligibility> {
  const fallback = {
    eligible: true as const,
    reason: "new" as const,
    days: TRIAL_DAYS,
    graceEndsAt: null,
  };
  try {
    const { user } = await getSessionContext();
    if (!user) return fallback;

    /**
     * ⚠️ WHY they are not eligible reaches the copy, because the two groups had
     * DIFFERENT free runs and telling a beta user they have "had their free
     * week" is simply false: they had a fortnight. Adrian caught that.
     *
     * ⚠️ ONE READ ANSWERS BOTH QUESTIONS — whether they had a grace, and when
     * it ends. A second read would be a second thing that can fail on its own
     * and disagree with the first, on the pair of facts a payment screen is
     * about to state out loud.
     */
    const comp = await compEntitlement(user.id);
    if (comp.kind === "grace") {
      return {
        eligible: false,
        reason: "beta",
        days: BETA_GRACE_DAYS,
        // Null once the fortnight has run out. An expired grace still refuses
        // the trial — they had their free run — but there is no longer a date
        // in the future to tell anybody about.
        graceEndsAt: isStillToCome(comp.endsAt) ? comp.endsAt : null,
      };
    }
    /**
     * A free-for-life comp reads as a brand-new user here, and that is left
     * alone deliberately. This function decides what a screen SAYS; `startTrial`
     * is what refuses to sell to them (§3.7), and `reason` gains no new value.
     */

    const { data } = await serviceClient()
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const customerId = data?.stripe_customer_id as string | undefined;
    // No Stripe customer means no history, so nothing can have been used.
    if (!customerId) return fallback;

    const { all } = await listSubscriptions(stripe(), customerId);
    return hasUsedTrial(all)
      ? { eligible: false, reason: "used", days: TRIAL_DAYS, graceEndsAt: null }
      : fallback;
  } catch (err) {
    console.error(
      "[billing] could not decide trial eligibility (showing the trial):",
      err instanceof Error ? err.message : String(err),
    );
    return fallback;
  }
}

export async function startTrial(
  plan: PlanKey,
  /**
   * ⚠️ WHICH MODE THE SHEET WAS MOUNTED IN, so the server can refuse to hand
   * back a secret the client cannot confirm (§3.3).
   *
   * This is NOT an identifier saying whose data to act on — §2 forbids those
   * and this is not one. It is a statement about the caller's own UI, which is
   * the single fact the server has no way to know and cannot verify. Eligibility
   * is still decided here, independently, and a client that lies about its mode
   * can only get its own attempt cancelled.
   *
   * Optional so the trial path's existing behaviour is untouched when it is
   * absent, and so no caller outside the checkout sheet has to change.
   */
  mountedMode?: IntentKind,
): Promise<StartTrialResult> {
  const { user, passedGate } = await getSessionContext();
  if (!user) return { status: "error", message: "Please sign in again." };

  /**
   * THE AGE GATE, ON THE PAYMENT PATH.
   *
   * Carried in from spec w2b-14 and NOT optional. Rendering the paywall does not
   * re-check the age — a signed-in account can reach that screen — so this
   * endpoint is where §3.2's "the age gate precedes all payment" is actually
   * enforced. A server action is a public endpoint: the screen's own guard is
   * not a guard.
   */
  if (!passedGate) {
    return {
      status: "error",
      message: "Please confirm your details before starting a trial.",
    };
  }

  /**
   * ⚠️ A COMP ACCOUNT MUST NEVER BE ABLE TO START A SUBSCRIPTION (§3.7), AND
   * THIS RUNS BEFORE ANY STRIPE OBJECT EXISTS.
   *
   * A free-for-life comp holds an entitlement with a NULL `active_until`, so the
   * grace check does not match it and they read as a brand-new user eligible for
   * seven free days. There is no route to this screen for them today — the comp
   * notice has a single "Thank you" button, and the read-only pop-up cannot fire
   * for an account that is permanently entitled — but "currently unreachable" is
   * a claim about today's call sites, and the outcome if it is ever reached is
   * charging somebody who was told in writing they never would be.
   *
   * `already-subscribed` is the existing answer for "you have this already", and
   * the checkout screen already handles it by walking the user into the app. No
   * new status, no new copy, no new screen.
   *
   * ## This is a decision, and `001_billing_tables.sql` says the opposite
   *
   * That file's comment on `entitlements_one_per_source` explicitly anticipates
   * "a founder who also subscribes" as a legitimate reason to hold both a `comp`
   * and a `stripe` entitlement. The schema still permits it; this forecloses it
   * at the application layer, because a comp being charged costs more than a
   * comp being unable to buy something they already have for nothing.
   *
   * ## The read is done ONCE, here, and carried down to the create
   *
   * It is the same row that answers whether they are mid-grace, so asking again
   * later would be a second query that can disagree with this one about whether
   * this person is charged today.
   */
  const comp = await compEntitlement(user.id);

  /**
   * ⚠️ THE BACKSTOP THAT CANNOT FAIL. A cold review found the refusal above
   * fails OPEN: `compEntitlement` is a network read, and a Postgres blip at the
   * wrong moment skips the check entirely, letting one of the five people who
   * were promised Trackd for life confirm a card and be charged on day 7.
   *
   * `betaGrantFor` is a pure in-memory membership test over `COMP_EMAILS`. It
   * has no failure mode, needs no query, and `betaGrace.ts` is already imported
   * here. Two independent authorities now have to agree that this person is
   * allowed to buy, and the cheap one is the one that cannot go down.
   *
   * The direction is deliberate and matches §3.7: a comp who cannot buy
   * something they already have for nothing loses nothing. A comp who gets
   * charged after being told in writing they never would be is the failure this
   * whole rule exists to prevent. That trade also covers the case where the
   * comp list has an entry the backfill has not granted yet — they are refused
   * rather than sold to, which is the safe half.
   */
  if (comp.kind === "forever" || betaGrantFor(user.email).kind === "comp") {
    return { status: "already-subscribed" };
  }

  /**
   * ⚠️ AN UNREADABLE ENTITLEMENT REFUSES ON THE MONEY PATH, and this is the one
   * place the generous default is the WRONG answer.
   *
   * §3.5 says a failed entitlements read grants the trial, and for a first-timer
   * that is right: seven free days beats zero. For the ~85 beta accounts it is
   * not generous at all. Their grace is FOURTEEN days, so falling back to a
   * seven-day trial charges them on day 7 — a week INSIDE a fortnight the app
   * promised them in writing — and because the grace branch was never taken,
   * no `trackd_grace_until` is written, so reconciliation cannot even see that
   * it happened.
   *
   * Seven is generous against nothing and mean against fourteen, and one
   * fallback cannot be both. So the money path takes §3.5's OTHER half, the
   * asymmetry it states explicitly: the screen over-promises and the server
   * refuses to charge. A bad minute, not a dispute.
   *
   * `trialEligibility` is untouched and still answers generously, which is what
   * keeps the pair correct rather than merely consistent.
   */
  if (comp.kind === "unknown") {
    return {
      status: "error",
      message: "We couldn't check your account just now. Please try again in a moment.",
    };
  }

  /**
   * THE CUSTOMER IS RESOLVED BEFORE THE LEASE, AND THAT ORDER IS REQUIRED.
   *
   * The lease lives on the `billing_customers` row, so there has to BE a row to
   * claim. `findOrCreateCustomer` is safe to race — `stripe_customer_id` is
   * unique, the loser re-reads the winner — so it needs no protection of its
   * own, and the worst a race costs is an orphan Stripe customer with no
   * subscription on it.
   */
  let customerId: string;
  try {
    customerId = await findOrCreateCustomer(user.id, user.email);
  } catch (err) {
    console.error(
      "[billing] could not resolve the Stripe customer:",
      err instanceof Error ? err.message : String(err),
    );
    return { status: "error", message: "Couldn't start your trial just now." };
  }

  const lease = await waitForTrialLease(user.id);
  if (lease === "busy") {
    /**
     * Somebody else is inside the check-and-create for this user RIGHT NOW, and
     * has been for longer than {@link WAIT_ATTEMPTS} allows.
     *
     * The honest answer is to ask them to try again rather than to guess. Doing
     * anything else here is the whole bug: proceeding means a second read that
     * cannot see the first request's not-yet-created subscription, which is
     * exactly how one user ended up with two live trials.
     */
    return {
      status: "error",
      message: "We're still setting your trial up. Give it a moment and try again.",
    };
  }

  try {
    const client = stripe();
    const wantedPrice = priceIdFor(plan);

    /**
     * WHAT IS ALREADY ON THIS CUSTOMER — asked of STRIPE, not of the mirror.
     *
     * The guard used to count `subscriptions` rows with status `trialing`, and a
     * cold review turned that into the worst bug in the flow. The mirror row is
     * written for a subscription whose card was NEVER validated (only the
     * entitlement is withheld), so:
     *
     *   1. Someone starts a trial, the bank opens a 3D Secure challenge, they
     *      close the tab. A `trialing` mirror row now exists with an
     *      unconfirmed SetupIntent and no payment method.
     *   2. They come back and pick a DIFFERENT plan.
     *   3. The guard sees `trialing`, answers "already subscribed", and the UI
     *      walks them to "You're in!" — **in 746ms, having taken no card**, on
     *      the plan they did not choose, at a price they were not shown.
     *   4. On day 7 `missing_payment_method: cancel` silently cancels them,
     *      against a screen that promised a charge on that date.
     *
     * Stripe is the only place that knows whether a subscription is real, so it
     * is asked.
     *
     * `incomplete` IS in the set (see `BILLABLE_STATUSES`), and this comment
     * used to say so while `listLiveSubscriptions` and `cancel.ts` both said the
     * opposite — the code followed those two, and a cold review turned the gap
     * into two live billable subscriptions on one customer. One set now, in one
     * place, with `hasValidatedCard` treating `incomplete` as "has not paid"
     * rather than "already subscribed".
     */
    const { all, live } = await listSubscriptions(client, customerId);

    // A subscription with a card behind it. Nothing more to sell them.
    if (live.some(hasValidatedCard)) return { status: "already-subscribed" };

    /**
     * ABANDONED ATTEMPTS — live, but the card step never completed.
     *
     * If one is for the plan they are asking for again, hand back its existing
     * SetupIntent so they simply finish what they started. Every OTHER one is
     * cancelled: they have chosen something else, and leaving it would both
     * block them and quietly bill the wrong thing at the trial end.
     *
     * ## The cancels happen FIRST, and that is a fix
     *
     * This was one loop that `return`ed on the first plan match, so a customer
     * holding an abandoned yearly AND an abandoned monthly kept whichever the
     * list happened to yield first and left the other running. Both are
     * `trialing`, so `/billing` and the cancel path both had two rows to choose
     * between — the same two-subscription state this whole step exists to make
     * impossible, arrived at by a different road.
     */
    /**
     * ⚠️ DECIDED BEFORE THE RESUME BRANCH, because the resume branch needs to
     * know what a fresh subscription WOULD give in order to judge whether the
     * abandoned one is still worth handing back.
     */
    const freeTime = resolveFreeTime({
      hasUsedTrial: hasUsedTrial(all),
      graceEndsAt: comp.kind === "grace" ? comp.endsAt : null,
      now: new Date(),
    });

    /**
     * When a subscription created RIGHT NOW would stop being free. The yardstick
     * the resume branch is measured against.
     */
    const freshFreeUntil =
      freeTime.kind === "trial"
        ? Date.now() + freeTime.days * 24 * 60 * 60 * 1000
        : freeTime.kind === "grace"
          ? freeTime.trialEnd * 1000
          : Date.now();

    /**
     * ⚠️ A STALE ATTEMPT IS NOT RESUMED, IT IS REPLACED. Measured against real
     * Stripe on 2026-08-15, and it was charging people early.
     *
     * The old rule resumed ANY abandoned attempt on the same plan, handing back
     * its original `trial_end`. But the checkout screen recomputes its promise
     * every time it mounts — `billingDate(new Date())`, today plus
     * `TRIAL_DAYS` — so a user who abandoned a 3D Secure challenge and came
     * back days later read "7 days free, first charge 22 Aug" above a
     * subscription that was going to charge them on the 17th. Driven: the
     * screen said 22 Aug, the card was set to be hit on 17 Aug, five days
     * early, with a payment method attached.
     *
     * That is the invariant in §3.9 outright — a screen must never state a date
     * the server would contradict — and it contradicted §3.6 as well, which
     * says an abandoned attempt used no trial and the replacement gets a full
     * seven days. The DIFFERENT-plan path already did exactly that. Only the
     * same-plan path did not, which made the two inconsistent for no reason
     * anybody had chosen.
     *
     * So the attempt is resumed only while it is still worth as much as a fresh
     * one. Otherwise it falls through to the cancel loop below and is replaced,
     * which is the treatment every other abandoned attempt already gets.
     *
     * ## Why the tolerance is an hour and not a day
     *
     * The window this preserves is the one the branch exists for: a user part
     * way through a bank challenge who closes the tab and comes straight back.
     * That return must not mint a second subscription. Anything older is
     * cheaper to replace than to reason about, and erring towards replacing is
     * safe in both directions — a fresh subscription always carries the full
     * free run and always matches what the screen just printed. A day-sized
     * tolerance would re-admit the one-calendar-day error this fixes.
     */
    /**
     * What kind of intent a fresh create would produce right now. The resumed
     * attempt has to match it, or resuming would hand back a secret describing
     * a different deal from the one this screen is showing.
     */
    const wantedKind: IntentKind = freeTime.kind === "none" ? "payment" : "setup";

    const resumable = live.find((sub) => {
      if (sub.items.data[0]?.price?.id !== wantedPrice) return false;

      /**
       * ⚠️ EITHER KIND (§3.6). This used to require a SetupIntent, so a paid
       * attempt was never resumable and was cancelled and replaced on every
       * return — a fresh invoice each time, and a trail of dead subscriptions
       * and abandoned invoices on the customer.
       *
       * The Stripe dashboard cancels incomplete payments after FIFTEEN DAYS on
       * this account, not the ~23 hours a comment elsewhere in this file
       * reasons from, so that trail would have had a fortnight to accumulate.
       */
      const intent = confirmableIntent(sub);
      if (!intent || intent.kind !== wantedKind) return false;

      /**
       * ⚠️ A PAID ATTEMPT HAS NO PROMISE TO GO STALE, so the staleness rule
       * does not apply to it.
       *
       * The rule exists because a trial's `trial_end` is a DATE the screen
       * printed, and resuming a decayed one charges earlier than that date said.
       * A paid attempt printed no date: its invoice is the same money today as
       * it was on the day it was raised, and resuming it is what §3.6 asks for
       * — the same subscription and the same invoice rather than a second pair.
       *
       * Written as an explicit null test rather than `?? 0`, which would have
       * quietly made every paid attempt look infinitely stale and replaced it.
       */
      if (sub.trial_end === null) return true;
      return sub.trial_end * 1000 >= freshFreeUntil - RESUME_STALENESS_TOLERANCE;
    });

    for (const other of live) {
      if (other.id === resumable?.id) continue;
      await client.subscriptions.cancel(other.id).catch((err) => {
        console.error(
          `[billing] could not cancel abandoned ${other.id}:`,
          err instanceof Error ? err.message : String(err),
        );
      });
    }

    if (resumable) {
      /**
       * The resolver rather than `setupSecret`, so a resumed PAID attempt hands
       * back its PaymentIntent and reports `payment` — which the sheet then
       * confirms with `confirmPayment` and the mode gate checks like any other.
       */
      const intent = confirmableIntent(resumable);
      if (intent) {
        return {
          status: "ok",
          clientSecret: intent.clientSecret,
          intentKind: intent.kind,
          subscriptionId: resumable.id,
        };
      }
    }

    /**
     * ⚠️ WHAT FREE TIME THIS SUBSCRIPTION IS CREATED WITH. Three answers, and
     * the rules behind them are Adrian's.
     *
     *   1. ONE TRIAL PER CUSTOMER, EVER. See {@link hasUsedTrial}.
     *   2. NO SEPARATE TRIAL FOR A BETA GRACE ACCOUNT. The ~85 people who were
     *      here before billing get a fortnight free, and that fortnight IS their
     *      trial. Seven more on top would be 21 free days for the group that has
     *      already had the whole product for months.
     *   3. ⚠️ A LIVE GRACE IS NEVER CHARGED INSIDE ITSELF. This is the one that
     *      changed. A mid-fortnight user used to have `trial_period_days`
     *      omitted, so Stripe issued an invoice with an amount due immediately —
     *      the app charging somebody before a date it gave them in writing.
     *      Their subscription is now created with `trial_end` AT the grace end.
     *
     * The decision is `resolveFreeTime`, which is pure and tested. The server
     * decides it here from the verified session and never trusts a value the
     * client sends.
     *
     * Rule 3 also happens to fix the broken button, and that is a benefit rather
     * than the justification: nothing due today means Stripe issues a
     * SetupIntent, which is the arm this client is built for. An amount due
     * today gets a PaymentIntent, which the client cannot confirm — that path is
     * `02a`'s to make work.
     *
     * Erring towards GRANTING when a Stripe check fails: somebody gets free
     * time they might not be owed, which costs days. Erring the other way
     * charges a first-time customer immediately against a screen that just
     * promised them seven free days, which is a dispute. The ENTITLEMENTS read
     * is the one exception and it is handled far above, at `comp.kind ===
     * "unknown"` — see the note there.
     *
     * `freeTime` is computed above the resume branch, which needs it.
     */
    const subscription = await client.subscriptions.create(
      {
        customer: customerId,
        items: [{ price: wantedPrice }],
        ...(freeTime.kind === "trial" ? { trial_period_days: freeTime.days } : {}),
        /**
         * A fixed instant, not a day count. The grace end was decided when the
         * grace was granted and has been sitting in `entitlements.active_until`
         * ever since; expressing it as "N days from now" means computing a
         * remainder, and a rounding error in that arithmetic is a charge on the
         * wrong day.
         */
        ...(freeTime.kind === "grace" ? { trial_end: freeTime.trialEnd } : {}),
        // Nothing is owed today, so Stripe leaves the subscription incomplete
        // until the SetupIntent is confirmed. Without this it would activate
        // with no payment method attached and simply fail on day 7.
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
        // No card confirmed by the end of the trial ⇒ cancel rather than bill a
        // method that was never verified.
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
        /**
         * `user_id` is the webhook's fallback for resolving the account: it
         * normally reads `billing_customers`, and this covers an event that
         * outruns that row, which does happen because Stripe fires webhooks
         * concurrently with the call that creates it.
         *
         * ⚠️ `trackd_grace_until` IS WRITTEN BECAUSE THREE DIFFERENT THINGS NOW
         * PRODUCE `trialing`, and nothing downstream could otherwise tell them
         * apart: a real first-time trial, a save-offer courtesy period (marked
         * `trackd_courtesy_until`), and now a grace-aligned start. Reconciliation
         * (`11-reconciliation-and-alerting.md`) needs exactly that distinction to
         * assert that nobody was charged inside a promised free period.
         *
         * It carries the PROMISED end rather than the `trial_end` actually sent.
         * The two differ when the Stripe minimum-offset clamp fires, and the
         * question reconciliation asks is about the promise.
         *
         * Spread so `user_id` survives, which is the merge §3.4 requires.
         */
        metadata: {
          user_id: user.id,
          ...(freeTime.kind === "grace"
            ? { trackd_grace_until: freeTime.graceEndsAt }
            : {}),
        },
        expand: ["pending_setup_intent", "latest_invoice.confirmation_secret"],
      },
      {
        /**
         * THE DOUBLE-TAP, enforced by Stripe. Keyed on the user, the plan, AND
         * WHAT THE CUSTOMER ALREADY HAD when this request looked.
         *
         * A cold review fired five concurrent calls on one session and got FIVE
         * trialing subscriptions, because the duplicate guard is a read followed
         * by a write and the mirror it read is only written by the webhook
         * seconds later. An idempotency key closes the repeat of the SAME
         * request: Stripe returns the first subscription for a repeat of the
         * same key.
         *
         * ## ⚠️ WHY THE FINGERPRINT IS THERE, measured
         *
         * Without it the key is `trial:${user}:${plan}` for 24 hours, and that
         * turned RESUBSCRIBING into a broken screen — which is the exact path
         * the new read-only gate drives everybody down:
         *
         *   1. start a trial, then let it lapse (or cancel it outright);
         *   2. come back the same day and try to subscribe again;
         *   3. Stripe replays the cached FIRST response, so this returns the
         *      client secret of a subscription that is now `canceled`.
         *
         * Driven: trial 2 came back with byte-for-byte the same `clientSecret`
         * and `subscriptionId` as trial 1, on a subscription Stripe reported as
         * `canceled`. The user confirms a card against nothing and cannot get
         * out of it for a day.
         *
         * The fingerprint is the sorted ids of every subscription this customer
         * had at the moment of the read, so:
         *
         *   - two CONCURRENT calls see the same state, compute the same key, and
         *     Stripe dedupes them. The double-tap is still closed.
         *   - a call made AFTER something changed sees a different state and
         *     gets a genuinely new subscription. The retry works.
         *
         * Keying on the user alone was the other candidate and is worse: Stripe
         * rejects a repeated key carrying different parameters with a 400, so a
         * user who abandoned yearly and came back for monthly would be locked
         * out of their own second choice for a day.
         *
         * The cross-plan race is closed one layer up, by the lease this whole
         * call runs inside.
         */
        idempotencyKey: `trial:${user.id}:${plan}:${fingerprint(all)}`,
      },
    );

    /**
     * ⚠️ THE RECONCILE. One live subscription leaves this function, or none.
     *
     * Unreachable while the lease is enforced — two concurrent calls cannot both
     * be here. It is the safety net for the window where
     * `supabase/billing/002` is written but not yet applied, and for anything
     * that creates a subscription outside this path (a hand-made one in the
     * Stripe dashboard, a webhook replay, a future RevenueCat import).
     *
     * The rule is OLDEST WINS, and it is deliberately one both racers compute
     * identically off the same Stripe data, so they cancel the same set and
     * converge on the same survivor rather than cancelling each other's.
     */
    const survivor = await reconcileToOne(
      client,
      customerId,
      subscription,
      wantedPrice,
    );
    if (!survivor) {
      return { status: "error", message: failureMessage(freeTime) };
    }

    /**
     * ⚠️ THE RESOLVER, NOT `setupSecret`. This one call is the whole of §3.1's
     * change at this site, and `reconcileToOne`'s body is deliberately
     * untouched: it returns a `Stripe.Subscription` and never handles a secret,
     * so there is nothing inside it to thread.
     */
    const intent = confirmableIntent(survivor);

    if (!intent) {
      /**
       * The subscription has nothing the client can confirm — no SetupIntent
       * and no PaymentIntent on its invoice. Either the reconcile kept a
       * subscription already past its setup (this request lost a race it should
       * not have been in), or Stripe produced something neither arm expects.
       *
       * Surfaced rather than papered over: the user must not be shown a payment
       * form that cannot complete.
       */
      console.error(
        `[billing] nothing confirmable on ${survivor.id} (status ${survivor.status})`,
      );
      return { status: "error", message: failureMessage(freeTime) };
    }

    /**
     * ⚠️ THE MODE GATE. INVARIANT 1 IN MECHANICAL FORM (§3.3).
     *
     * A PaymentIntent is not a charge until it is confirmed, so REFUSING TO
     * CONFIRM is the whole protection. If the sheet was mounted for a trial and
     * the server has just decided this person is charged today, confirming what
     * we are holding would take money from somebody reading a screen that
     * promises free days.
     *
     * The disagreement is not hypothetical. The client's answer is generous by
     * default and generous on error, and the server decides independently: a
     * trial used up in another tab, or a grace that expired between the two
     * calls, both land here legitimately.
     *
     * ## The cancel happens HERE, on the server, in the same request
     *
     * §3.3 says to leave no confirmable intent behind. Doing it server-side is
     * what makes that true rather than hoped for: a client-driven cleanup is one
     * the client can fail to make — by closing the tab on the very screen that
     * just changed under them, which is exactly when this fires.
     */
    if (mountedMode && intent.kind !== mountedMode) {
      console.error(
        `[billing] mode mismatch on ${survivor.id}: sheet mounted "${mountedMode}", server resolved "${intent.kind}". Cancelling; nothing confirmed.`,
      );
      await client.subscriptions.cancel(survivor.id).catch((err) => {
        console.error(
          `[billing] could not cancel mismatched ${survivor.id}:`,
          err instanceof Error ? err.message : String(err),
        );
      });
      return {
        status: "error",
        /**
         * Honest rather than a silent re-render, because the screen they were
         * reading has just changed what it says. `02b` owns the checkout copy;
         * this is the action's own error string, and it states the fact and the
         * next step and nothing more.
         */
        message:
          intent.kind === "payment"
            ? "Your free trial isn't available on this account. Check the updated price and try again."
            : "Your plan details changed. Please check them and try again.",
        serverMode: intent.kind,
      };
    }

    return {
      status: "ok",
      clientSecret: intent.clientSecret,
      intentKind: intent.kind,
      subscriptionId: survivor.id,
    };
  } catch (err) {
    console.error(
      "[billing] startTrial failed:",
      err instanceof Error ? err.message : String(err),
    );
    // Deliberately generic. A Stripe error string can name the account, the
    // customer or the price, and none of that belongs on a paywall.
    return { status: "error", message: "Couldn't start your trial just now." };
  } finally {
    /**
     * ALWAYS, on every path out of the try — the early returns above included.
     *
     * A lease that is not handed back still expires, so the failure mode is
     * bounded either way. Handing it back promptly is what makes an honest retry
     * after an error instant rather than a 90-second wait, and an error message
     * saying "try again" beside a lock that refuses for a minute and a half
     * would be the app contradicting itself.
     *
     * Skipped when the lease was never enforced, so an unapplied migration does
     * not produce a second pointless failing write per trial start.
     */
    if (lease === "held") await releaseTrialLease(user.id);
  }
}

/* ── the lease, the list and the reconcile ───────────────────────── */

/**
 * How stale an abandoned attempt may be and still be RESUMED rather than
 * replaced.
 *
 * Sized to the case the resume branch exists for: a user part way through a
 * bank challenge who closes the tab and comes straight back. Beyond this the
 * attempt is cancelled and replaced, so the free run always matches what the
 * screen printed. See the note at `resumable`.
 */
const RESUME_STALENESS_TOLERANCE = 60 * 60 * 1000;

/** How many times to re-attempt a busy lease before giving up. */
const WAIT_ATTEMPTS = 5;
/** Between attempts. Five of these is ~2s, which is inside a user's patience. */
const WAIT_MS = 400;

/**
 * Claim the lease, giving a request that is already in flight a moment to
 * finish.
 *
 * A "busy" lease is nearly always the user's own second tap, or a second tab.
 * Returning an error immediately would make the commonest case — the double-tap
 * the old idempotency key handled silently — into a visible failure, which is a
 * regression dressed as a fix.
 *
 * So it waits. If the first call finishes inside ~2s, this one claims the lease,
 * re-lists Stripe, finds the subscription the first one made, and hands back its
 * client secret through the ordinary resume path. The user sees one trial and
 * one card form, which is what they asked for twice.
 */
async function waitForTrialLease(userId: string): Promise<LeaseOutcome> {
  for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt += 1) {
    const outcome = await acquireTrialLease(userId);
    if (outcome !== "busy") return outcome;
    await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
  }
  return "busy";
}

/**
 * Every subscription on this customer that could still take money.
 *
 * `status: "all"` then filtered here rather than one request per status: Stripe
 * takes a single status per list call, and three round-trips can disagree with
 * each other.
 *
 * The filter is {@link BILLABLE_STATUSES}, shared with the cancel path. It used
 * to be a narrower literal three, so a `paused` or `unpaid` subscription did not
 * block a second trial — and both of those can charge once Stripe resumes or
 * retries them. Sharing the set is what stops the two ends drifting: "what would
 * I have to stop?" and "what stops me selling another?" are the same question.
 *
 * `incomplete` is deliberately NOT billable and NOT here. Those are attempts
 * Stripe has already given up on, and treating one as live would refuse a user
 * their own retry.
 */
async function listSubscriptions(
  client: ReturnType<typeof stripe>,
  customerId: string,
): Promise<{ all: Stripe.Subscription[]; live: Stripe.Subscription[] }> {
  /**
   * ⚠️ EVERY PAGE, NOT THE FIRST HUNDRED.
   *
   * `limit: 100` is Stripe's maximum and its lists come back NEWEST FIRST, so a
   * single page silently truncates. §3.2 deliberately stores no "trial used"
   * marker and makes Stripe the only source of truth for it, which makes the
   * COMPLETENESS of this list load-bearing: `hasUsedTrial` reads it.
   *
   * A cold review found the loop that exploits it, and it needs no error path.
   * Each different-plan `startTrial` cancels the previous abandoned attempt and
   * creates a new one, so one call adds one subscription. After about a hundred
   * calls the genuine trial — the OLDEST subscription, the only one carrying a
   * validated card — falls off the end of the page, `hasUsedTrial` answers
   * false, and the customer is handed a fresh seven days. Repeatable for ever.
   * That is precisely the "subscribe, cancel, subscribe again, free for ever in
   * seven-day steps" loop this spec exists to close, reached by another road.
   *
   * `live` is paged for the same reason: a sufficiently old live subscription
   * would otherwise be invisible to both the duplicate guard and the reconcile,
   * which is the one-billable-subscription invariant.
   *
   * The cap is a safety valve rather than a limit anyone should reach — a real
   * customer has single digits.
   */
  const all = await client.subscriptions
    .list({
      customer: customerId,
      status: "all",
      limit: 100,
      /**
       * ⚠️ THE SAME EXPANSIONS AS THE CREATE, AND THAT IS LOAD-BEARING.
       *
       * `reconcileToOne` prefers the freshly-LISTED copy of a subscription over
       * the create response and falls back to the create only when the listed
       * one is absent — which is the uncommon case, not the common one. Widen
       * the create alone and the survivor silently loses the expansion nearly
       * every time, producing a paid path that works when you test the create
       * and returns null in production.
       */
      expand: ["data.pending_setup_intent", "data.latest_invoice.confirmation_secret"],
    })
    .autoPagingToArray({ limit: 1000 });
  return { all, live: all.filter((sub) => BILLABLE_STATUSES.has(sub.status)) };
}

/** Just the live ones, for callers that do not need the whole history. */
async function listLiveSubscriptions(
  client: ReturnType<typeof stripe>,
  customerId: string,
): Promise<Stripe.Subscription[]> {
  return (await listSubscriptions(client, customerId)).live;
}

/**
 * WHAT THIS CUSTOMER HAD, as one stable string.
 *
 * Feeds the create's idempotency key. Sorted so two requests reading the same
 * state compute the same value regardless of the order Stripe's list returned
 * them in — the same total-ordering requirement `survivorOf` documents, and for
 * the same reason: two racers that disagree here would each make their own
 * subscription.
 *
 * Cancelled subscriptions are deliberately INCLUDED. They are exactly what makes
 * a resubscribe different from the attempt before it, which is the whole point.
 */
function fingerprint(subscriptions: readonly Stripe.Subscription[]): string {
  return subscriptions.map((s) => s.id).sort().join(",");
}

/**
 * Statuses Stripe has finished with. A subscription in one of these can never
 * take a card again, so handing back its setup intent is always wrong.
 *
 * Narrower than "not billable" on purpose: `incomplete` is NOT here, because
 * that is exactly the state a fresh `default_incomplete` create lands in when
 * there is an amount due, and it is waiting for the card this call is about to
 * collect.
 */
const DEAD_STATUSES = new Set<string>(["canceled", "incomplete_expired"]);

/**
 * ⚠️ LEAVE THIS CUSTOMER WITH AT MOST ONE LIVE SUBSCRIPTION.
 *
 * Called immediately after a create. Re-lists, and if more than one is live,
 * keeps the OLDEST and cancels the rest.
 *
 * ## Why oldest, and why it must be a total order
 *
 * Two racers have to reach the SAME answer or they cancel each other and the
 * user is left with nothing. `created` is a Stripe-assigned second-resolution
 * timestamp, so it can tie; the id breaks the tie, and Stripe ids are stable
 * strings, so the comparison is a total order that both sides compute
 * identically off the same data.
 *
 * Oldest rather than newest because an older subscription is the one more likely
 * to have a card behind it, an invoice against it, or a user watching a 3DS
 * challenge for it. Cancelling the thing furthest along is the expensive
 * direction.
 *
 * ## The survivor must be the plan the user actually chose
 *
 * If it is not, this returns null and the caller shows an error rather than a
 * card form. That case is reachable: the pre-create cancels swallow their
 * errors (deliberately — one unreachable Stripe call must not lose a user their
 * trial), so a cancel that failed leaves an older subscription on a plan they
 * did not pick, and "oldest wins" would then keep it. Handing back ITS client
 * secret would put a card form on screen priced for the wrong plan, which is a
 * worse outcome than an error.
 *
 * The error converges in one retry: the next call sees exactly one live
 * subscription on the wrong plan with no validated card, cancels it through the
 * ordinary abandoned path, and creates the right one.
 *
 * Returns the survivor, or null.
 */
async function reconcileToOne(
  client: ReturnType<typeof stripe>,
  customerId: string,
  created: Stripe.Subscription,
  wantedPrice: string,
): Promise<Stripe.Subscription | null> {
  const live = await listLiveSubscriptions(client, customerId);

  /**
   * Prefer the freshly-listed copy of what we just made: the create's own
   * response and the list are the same object, but only one of them is
   * guaranteed to reflect anything that happened in between.
   *
   * The fallback to `created` covers a status Stripe reports outside
   * {@link BILLABLE_STATUSES}. That is the old behaviour, kept deliberately —
   * `setupSecret` downstream is what decides whether the object is usable, and
   * refusing here would turn a working trial start into an error.
   */
  const mine = live.find((s) => s.id === created.id) ?? created;

  /**
   * ⚠️ NEVER HAND BACK A DEAD SUBSCRIPTION.
   *
   * `mine` falls back to `created`, and `created` is whatever the create call
   * returned — which, under an idempotency key, can be a REPLAY of an earlier
   * response describing a subscription that has since been cancelled. Driven:
   * lapse a trial, come back the same day, and this returned the original
   * client secret on a `canceled` subscription. The card confirms against
   * nothing.
   *
   * The fingerprint in the key is what stops that happening; this is the second
   * line, because "the key is right" is a claim about a string and this is a
   * check on the object. A subscription Stripe has finished with can never
   * usefully take a card, whatever the key said.
   */
  if (DEAD_STATUSES.has(mine.status)) {
    console.error(
      `[billing] refusing to hand back ${mine.id}, which Stripe reports as ${mine.status}`,
    );
    return null;
  }

  if (live.length <= 1) return mine;

  const { winner, losers } = survivorOf(live);
  if (!winner) return null;

  console.error(
    `[billing] ${live.length} live subscriptions on ${customerId}; keeping ${winner.id}, cancelling ${losers.map((s) => s.id).join(", ")}`,
  );

  for (const loser of losers) {
    await client.subscriptions.cancel(loser.id).catch((err) => {
      console.error(
        `[billing] reconcile could not cancel ${loser.id}:`,
        err instanceof Error ? err.message : String(err),
      );
    });
  }

  if (winner.items.data[0]?.price?.id !== wantedPrice) {
    console.error(
      `[billing] reconcile kept ${winner.id}, which is not the plan that was asked for. Refusing to hand back its setup intent.`,
    );
    return null;
  }

  return winner;
}

/**
 * WHAT TO SAY WHEN THE CREATE FAILS, and it depends on what they were promised.
 *
 * Both post-reconcile failure branches used to return "Couldn't start your trial
 * just now." A user who is being charged today reaches both of them and reads a
 * sentence about a trial they were told two lines earlier they cannot have.
 *
 * ⚠️ THE PAID STRING IS SIGNED COPY (D20, 15 Aug 2026), owned by `02b` and
 * routed here per §3.10. Carried character for character. Do not shorten,
 * soften, or improve it, and note the second sentence: both branches are
 * reached BEFORE anything is confirmed, so "nothing has been charged" is true
 * every time it renders. If that ever stops being true, this string moves.
 */
function failureMessage(freeTime: ReturnType<typeof resolveFreeTime>): string {
  return freeTime.kind === "none"
    ? "We couldn't start your plan just now. Nothing has been charged."
    : "Couldn't start your trial just now.";
}

/** The client secret on a subscription's pending SetupIntent, if it has one. */
function setupSecret(sub: Stripe.Subscription): string | null {
  const intent = sub.pending_setup_intent;
  if (!intent || typeof intent === "string") return null;
  return intent.client_secret ?? null;
}

/**
 * WHAT THE CLIENT HAS TO CONFIRM ON THIS SUBSCRIPTION, and which KIND it is.
 *
 * The two are returned together and cannot be separated, because a secret
 * without its kind is the thing that charges somebody who was promised free
 * days: `confirmSetup` and `confirmPayment` are different calls, and the sheet
 * has to have been mounted in the matching mode before either can run.
 *
 * ## Setup first, payment second
 *
 * Nothing due today ⇒ Stripe issues a SetupIntent and the invoice is a $0 one
 * that is already `paid`. An amount due ⇒ no SetupIntent at all, and the
 * confirmable intent hangs off the invoice. They are mutually exclusive in
 * practice, so the order is about determinism rather than precedence.
 *
 * ## ⚠️ IT READS `latest_invoice.confirmation_secret`, NOT `payment_intent`
 *
 * Spec 02a §3.1 says to expand `latest_invoice.payment_intent`. That field was
 * REMOVED in Stripe's `2025-03-31.basil` API version. This SDK sends its own
 * generated version (`2026-07-29.dahlia` for stripe@22.4.0), which is well past
 * the removal — see the note in `lib/billing/stripe.ts` on why no `apiVersion`
 * is pinned by hand.
 *
 * Measured on 2026-08-15: the expand string `latest_invoice.payment_intent` is
 * still ACCEPTED — no error is raised — and the field comes back `null` every
 * time. So following the spec literally would have produced exactly the defect
 * its own Step 1 warns about, with nothing to catch, on the one path that takes
 * money. `confirmation_secret` is where the secret now lives, and it carries a
 * `type` naming the intent, which is the very thing §3.2 asks the resolver to
 * report. Verified against both a paid-today and a trialing subscription, and
 * through the LIST path as well as the create response.
 */
type ConfirmableIntent = {
  clientSecret: string;
  /** Which confirm call the client must make. Never inferred from anything else. */
  kind: IntentKind;
};

function confirmableIntent(sub: Stripe.Subscription): ConfirmableIntent | null {
  const setup = setupSecret(sub);
  if (setup) return { clientSecret: setup, kind: "setup" };

  const invoice = sub.latest_invoice;
  if (!invoice || typeof invoice === "string") return null;

  /**
   * `confirmation_secret` is `{ client_secret, type }`. The `type` is trusted
   * as Stripe's own answer rather than assumed to be a payment intent: a $0
   * invoice carries none at all, and reading the type is what keeps this honest
   * if Stripe ever puts a setup-shaped secret here.
   */
  const confirmation = invoice.confirmation_secret;
  if (!confirmation?.client_secret) return null;

  return {
    clientSecret: confirmation.client_secret,
    kind: confirmation.type === "setup_intent" ? "setup" : "payment",
  };
}

/**
 * The user's Stripe customer id, created on first use.
 *
 * `billing_customers` is the mapping and `stripe_customer_id` is UNIQUE, so a
 * double-tap that races here cannot end with two customers for one user: the
 * second insert loses and re-reads the winner.
 */
async function findOrCreateCustomer(
  userId: string,
  email: string | undefined,
): Promise<string> {
  const db = serviceClient();

  const { data: existing } = await db
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  const customer = await stripe().customers.create(
    {
      email,
      // So a human looking at the Stripe dashboard can tell who this is without
      // a second lookup. Stripe metadata is not user-visible.
      metadata: { user_id: userId },
    },
    {
      /**
       * ⚠️ ONE CUSTOMER PER USER, enforced by Stripe.
       *
       * This runs BEFORE the lease and cannot be inside it — the lease lives on
       * the `billing_customers` row, so there has to be a row first. That makes
       * it the one unserialised step, and a cold review measured what that
       * costs: fifteen concurrent `startTrial` calls made FIFTEEN Stripe
       * customers, fourteen of them orphans, and any signed-in account can do it
       * on demand.
       *
       * The unique constraint below already stops two of them becoming the
       * mapping, so the orphans were harmless in the sense that none could ever
       * bill — but they are unbounded clutter in the account of record, and
       * "harmless clutter anybody can generate" is a poor thing to leave in a
       * payment provider.
       *
       * An idempotency key closes it without a lock: concurrent calls send the
       * same key with the same body, and Stripe creates one and returns it to
       * all of them. Keys live 24 hours, which is far longer than any burst.
       */
      idempotencyKey: `customer:${userId}`,
    },
  );

  const { error } = await db
    .from("billing_customers")
    .insert({ user_id: userId, stripe_customer_id: customer.id });

  if (error) {
    if (error.code === "23505") {
      // Another request won the race. Theirs is the customer of record; ours is
      // an orphan in Stripe, which is harmless (no subscription, no charge) and
      // far better than two customers both believing they are the mapping.
      const { data } = await db
        .from("billing_customers")
        .select("stripe_customer_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (data?.stripe_customer_id) return data.stripe_customer_id;
    }
    throw new Error(`billing_customers insert: ${error.message}`);
  }

  return customer.id;
}

/**
 * Does this Stripe subscription have a card behind it?
 *
 * The same rule as `cardIsValidated` in `lib/billing/sync.ts`, and it has to
 * agree with it: that one decides whether to GRANT access, this one decides
 * whether to refuse a second subscription. If they disagreed, a user could be
 * simultaneously "already subscribed" and unentitled — which is precisely the
 * state the abandoned-3DS bug left people in.
 *
 * Anything past `trialing` has had money move, so it counts regardless.
 */
/**
 * HAS THIS CUSTOMER ALREADY HAD THEIR TRIAL?
 *
 * Adrian, 2026-08-14: one trial per user, ever. Not per plan, not per
 * subscription. Before this, the loop was subscribe, cancel, wait for it to
 * lapse, subscribe again, free forever in seven-day steps. Harmless while
 * nothing gated; the read-only gate is what turns it into the way to use Trackd
 * Co for nothing.
 *
 * ## ⚠️ THE TEST IS "DID A CARD EVER VALIDATE ON IT", NOT "DID IT HAVE A TRIAL"
 *
 * The obvious version is `all.some((s) => s.trial_end !== null)` and it is wrong
 * in the expensive direction. `startTrial` CREATES AND THEN CANCELS
 * subscriptions itself: an abandoned 3D-Secure challenge leaves a cancelled
 * subscription that carries a `trial_end` and never took a penny. A naive check
 * therefore denies a genuine first-time customer their trial because their bank
 * challenge timed out once, and charges them on the spot against a screen that
 * promised seven free days. That is a chargeback, and it is the direction that
 * costs money and trust.
 *
 * So it reuses {@link hasValidatedCard}, which is already the codebase's answer
 * to "did this attempt actually become real". An abandoned attempt never
 * validated a card, so it never burns the trial. A trial somebody genuinely
 * started did, so it does, whether they later cancelled, lapsed or were charged.
 */
function hasUsedTrial(all: readonly Stripe.Subscription[]): boolean {
  return all.some((sub) => sub.trial_end !== null && hasValidatedCard(sub));
}

/**
 * WHAT `comp` ENTITLEMENT THIS ACCOUNT HOLDS, if any.
 *
 * Two completely different things wear `source: "comp"`, and the `active_until`
 * column is the whole difference between them:
 *
 *   comp + NO expiry    free for life. A founder or one of the three friends.
 *   comp + an expiry    the beta grace, and nothing else produces that shape.
 *
 * `lib/billing/betaGrace.ts` is what enforces the split: a comp-list member gets
 * a comp with no expiry, everybody else gets one with an `active_until`.
 *
 * ## One read answers three questions
 *
 * May this account buy at all (§3.7), have they already had their free run, and
 * when does the run end. `entitlements_one_per_source` means there is at most
 * ONE comp row per user, so a single query settles all three — and asking
 * separately would be two or three things that can fail independently and
 * disagree with each other about whether somebody is charged today.
 *
 * ## Expired graces come back too, and that is deliberate
 *
 * "Have they already had their free run" is answered yes by an expired grace.
 * Filtering to live ones here would hand a post-grace beta account a fresh
 * seven-day trial on top of the fortnight they have already had. Callers apply
 * their own liveness test; `resolveFreeTime` is where that rule lives.
 *
 * ⚠️ THE SELECT IS `source, active_until` AND MUST STAY THAT WAY. Both columns
 * exist and are applied. A column added to this select breaks the whole request
 * if its migration has not been run, and this request decides whether somebody
 * is charged today. `supabase/billing/003_courtesy_until.sql` is written and NOT
 * applied — nothing here may read it.
 *
 * ⚠️ RETURNS `none` ON ANY ERROR. For the grace that grants the trial, which is
 * the direction §3.5 requires. For the comp refusal it means a free-for-life
 * account could reach the create call during a Postgres outage — accepted
 * deliberately, because the alternative is refusing every legitimate purchase on
 * a transient blip, and a comp has no route to this screen in the first place.
 */
type CompEntitlement =
  /** No comp row. An ordinary user. */
  | { kind: "none" }
  /** Free for life. Must never be sold a subscription. */
  | { kind: "forever" }
  /** The beta grace. `endsAt` may be in the past. */
  | { kind: "grace"; endsAt: string }
  /**
   * ⚠️ THE READ FAILED, so we do not know which of the three this is. Kept
   * separate from `none` deliberately, because the two callers need OPPOSITE
   * answers and collapsing them into one value is what made a beta user
   * chargeable inside their own fortnight.
   */
  | { kind: "unknown" };

async function compEntitlement(userId: string): Promise<CompEntitlement> {
  try {
    const { data, error } = await serviceClient()
      .from("entitlements")
      .select("source, active_until")
      .eq("user_id", userId)
      .eq("product", "pro")
      .eq("source", "comp")
      /**
       * ⚠️ `is_active` IS THE KILL SWITCH, and a revoked row must not answer
       * this question. `001_billing_tables.sql` documents it as the way a comp
       * is withdrawn or a chargeback recorded — set false WITHOUT touching the
       * date, so the history stays readable — and `access.ts` already refuses
       * access on it.
       *
       * Without this filter a revoked comp still reads as `forever`, so
       * `startTrial` answers `already-subscribed` and the checkout screen walks
       * them into an app the gate holds read-only. They could never buy their
       * way out, and the only repair would be DELETING the row rather than
       * flipping the flag the schema tells you to flip. A revoked beta grace
       * would likewise still buy a grace-aligned free run.
       *
       * The column is in `001`, which is applied. Nothing here reads `003`.
       */
      .eq("is_active", true)
      .limit(1);
    if (error) {
      console.error(`[billing] could not read the comp entitlement for ${userId}:`, error.message);
      return { kind: "unknown" };
    }
    const row = data?.[0];
    if (!row) return { kind: "none" };
    const activeUntil = row.active_until as string | null;
    return activeUntil === null ? { kind: "forever" } : { kind: "grace", endsAt: activeUntil };
  } catch (err) {
    console.error(
      `[billing] could not read the comp entitlement for ${userId}:`,
      err instanceof Error ? err.message : String(err),
    );
    return { kind: "unknown" };
  }
}

/**
 * Is this ISO instant still in the future?
 *
 * An unreadable date reads as PAST, so the screen simply gets no date rather
 * than one it cannot render. It should be impossible against a `timestamptz`
 * column. Note this withholds a date, never access or free time — the create
 * call's own reading of the same string is in `resolveFreeTime`, and it errs
 * the other way for the reason documented there.
 */
function isStillToCome(iso: string): boolean {
  const at = Date.parse(iso);
  return Number.isFinite(at) && at > Date.now();
}

/**
 * ⚠️ STATUSES WHERE THE CARD STEP MAY NEVER HAVE FINISHED, so the question
 * "did a card ever validate on this" has to be asked properly rather than
 * assumed from the status alone.
 *
 * `trialing` was always here. `canceled` and `incomplete_expired` were added
 * 2026-08-15 (spec 01 step 6) after a drive against real Stripe showed a
 * genuine first-timer losing their trial:
 *
 *   1. They start a trial. The bank opens a 3D Secure challenge and they close
 *      the tab. The subscription sits `trialing` with an unconfirmed
 *      `pending_setup_intent` and no payment method.
 *   2. They come back and pick a DIFFERENT plan. `startTrial` cancels the
 *      abandoned one to make way, exactly as it should.
 *   3. That attempt is now `canceled` and still carries its `trial_end`. The
 *      old `status !== "trialing" ⇒ validated` short-circuit read it as a real
 *      trial, so `hasUsedTrial` said yes and the create dropped the trial.
 *
 * Measured: `default_payment_method` null, `default_source` null,
 * `pending_setup_intent` still pending, and `hasValidatedCard` returning true.
 * No card ever touched it. That is §3.2's "wrong in the expensive direction"
 * arriving through a door the guard did not cover, and it charges a first-time
 * customer on a screen that just promised them seven free days.
 *
 * ## The refunded-but-previously-active case is deliberately unchanged
 *
 * A subscription that genuinely ran and was later cancelled or refunded has no
 * `pending_setup_intent` — confirming clears it — so it still reads as a used
 * trial, which Out of Scope requires. The pending intent is precisely the
 * residue of a card step that never finished, which is why it is the
 * discriminator rather than the payment method: a confirmed TRIAL can
 * legitimately have a null default, because `save_default_payment_method`
 * sets it when an invoice is paid and a trial pays none.
 *
 * ## `sync.ts` does NOT move with this
 *
 * `cardIsValidated` there answers a different question — whether to GRANT
 * access — and is reached only for `ENTITLING` statuses (`trialing`, `active`).
 * It is never asked about a cancelled subscription, so the two cannot disagree
 * about one. The contract that they agree still holds for every status either
 * of them actually sees.
 */
const CARD_STEP_MAY_BE_UNFINISHED: ReadonlySet<string> = new Set([
  "trialing",
  "canceled",
  "incomplete_expired",
]);

function hasValidatedCard(sub: Stripe.Subscription): boolean {
  /**
   * ⚠️ `incomplete` IS NEVER "already subscribed", whatever else is true.
   *
   * It means Stripe issued the first invoice and it has NOT been paid. Nobody in
   * that state has bought anything.
   *
   * This branch arrived with `incomplete` joining {@link BILLABLE_STATUSES},
   * which was itself a cold-review fix: an `incomplete` subscription's first
   * invoice stays payable for ~23 hours, so one left behind can turn `active`
   * and bill alongside another. Making it visible was the fix; without this line
   * it would have become visible as "this customer already has one", and the
   * abandoned-attempt retry — the whole reason the guard asks Stripe rather than
   * the mirror — would refuse every user whose first attempt failed.
   *
   * Falling through to `false` puts it on the abandoned pile, where it is
   * cancelled and replaced. That is the same treatment an abandoned 3DS trial
   * gets, and for the same reason.
   */
  if (sub.status === "incomplete") return false;
  /**
   * `active`, `past_due` and `unpaid`: money has moved or is genuinely owed on
   * a real subscription, so the card question is settled.
   *
   * ⚠️ `paused` is in here and it does NOT mean that. Stripe produces it from
   * `trial_settings.end_behavior.missing_payment_method: "pause"`, which is
   * exactly "the trial ended and no card was ever given" — no money moved and
   * none is owed. This path hardcodes `"cancel"`, so nothing it creates can
   * reach `paused`; one imported or hand-made in the dashboard could, and it
   * would both burn the trial and answer `already-subscribed`, walking a user
   * with no entitlement into the app. Left alone because changing what
   * `paused` means belongs with `BILLABLE_STATUSES`, which is shared with the
   * cancel path and is not this spec's to move. Recorded in `next-tasks.md`.
   */
  if (!CARD_STEP_MAY_BE_UNFINISHED.has(sub.status)) return true;
  // A method is attached — settled, whatever else the object says.
  if (sub.default_payment_method || sub.default_source) return true;
  /**
   * Otherwise: was Stripe still waiting for a card when this ended?
   *
   * `payment_behavior: "default_incomplete"` puts a `pending_setup_intent` on
   * the subscription at creation and clears it the moment the intent succeeds,
   * so its survival is the proof the card step never finished.
   */
  return !sub.pending_setup_intent;
}

/**
 * Has the webhook landed yet? (Spec w2b-15, step 9.)
 *
 * There is typically a one-to-three second gap between the card confirming and
 * the webhook arriving. The user must not be dropped into the app during that
 * window and shown the paywall they just paid to escape — so the client holds
 * and asks this until it turns true.
 *
 * Reads `entitlements` through the same function every gate uses. Deliberately
 * not a faster, looser check: if this said yes while the real gate said no, the
 * holding state would hand the user straight into a redirect back to the paywall,
 * which is the exact failure it exists to prevent.
 */
/**
 * WHAT HAPPENED TO AN INTENT THE BANK JUST REDIRECTED BACK (spec 02a §3.5).
 *
 * When a bank forces a full-page redirect rather than an inline challenge,
 * Stripe returns the user to `/onboarding?step=start` with `redirect_status` and
 * an intent client secret on the URL. Nothing read either parameter before this,
 * so the flow remounted, `holding` was component state and therefore false, and
 * the user landed back on the card form.
 *
 * On the setup path that was merely bad. **On the payment path it is a screen
 * inviting somebody to pay for a charge that may have already succeeded.** The
 * `already-subscribed` guard catches most second attempts, but "most" is not the
 * standard on a payment screen, and the user is being asked a question the app
 * should already know the answer to.
 *
 * ## ⚠️ A CLIENT SECRET IDENTIFIES AN INTENT, NOT A PERSON
 *
 * So ownership is proven here rather than assumed: the intent is retrieved
 * server-side, its customer is compared against the `billing_customers` row for
 * the VERIFIED SESSION, and a mismatch returns `unknown` without revealing that
 * the intent exists. §3.12 requires exactly this before acting on it.
 *
 * Reads only. It confirms nothing, creates nothing and grants nothing — access
 * still comes from `entitlements` via the webhook.
 */
export type ReturningIntent =
  | { status: "succeeded" }
  | { status: "failed" }
  | { status: "requires_action" }
  /** Not ours, not resolvable, or not this user's. Treated as "just show the form". */
  | { status: "unknown" };

export async function resolveReturningIntent(
  clientSecret: string,
): Promise<ReturningIntent> {
  try {
    const { user } = await getSessionContext();
    if (!user) return { status: "unknown" };

    /**
     * `pi_XXX_secret_YYY` / `seti_XXX_secret_YYY`. The id is everything before
     * `_secret_`, and anything that does not match that shape is not a Stripe
     * client secret at all.
     */
    const id = clientSecret.split("_secret_")[0];
    if (!/^(pi|seti)_[A-Za-z0-9]+$/.test(id)) return { status: "unknown" };

    const client = stripe();
    const intent = id.startsWith("seti_")
      ? await client.setupIntents.retrieve(id)
      : await client.paymentIntents.retrieve(id);

    /**
     * ⚠️ OWNERSHIP. The customer on the intent must be the customer mapped to
     * this session. Without this, anybody could paste another user's redirect
     * URL and learn the state of their payment.
     */
    const ours = await customerIdFor(user.id);
    const theirs =
      typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
    if (!ours || !theirs || ours !== theirs) {
      console.error(`[billing] returning intent ${id} does not belong to ${user.id}`);
      return { status: "unknown" };
    }

    switch (intent.status) {
      case "succeeded":
        return { status: "succeeded" };
      case "requires_action":
      case "requires_confirmation":
      case "processing":
        return { status: "requires_action" };
      case "canceled":
      case "requires_payment_method":
        return { status: "failed" };
      default:
        return { status: "unknown" };
    }
  } catch (err) {
    console.error(
      "[billing] could not resolve a returning intent:",
      err instanceof Error ? err.message : String(err),
    );
    // Falls through to rendering the form, which is the same place the user
    // would have landed before this existed.
    return { status: "unknown" };
  }
}

/** This user's Stripe customer id, or null. Never creates one. */
async function customerIdFor(userId: string): Promise<string | null> {
  const { data } = await serviceClient()
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.stripe_customer_id as string | undefined) ?? null;
}

export async function hasEntitlement(): Promise<boolean> {
  return hasProAccess();
}
