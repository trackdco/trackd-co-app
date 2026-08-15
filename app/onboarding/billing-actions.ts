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

import { priceIdFor, stripe, type PlanKey } from "@/lib/billing/stripe";
import { BETA_GRACE_DAYS } from "@/lib/billing/betaGrace";
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
  | { status: "ok"; clientSecret: string; subscriptionId: string }
  /** Already entitled. The caller should move them into the app, not charge them. */
  | { status: "already-subscribed" }
  | { status: "error"; message: string };

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

export async function startTrial(plan: PlanKey): Promise<StartTrialResult> {
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
  if (comp.kind === "forever") return { status: "already-subscribed" };

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
    const resumable = live.find(
      (sub) => sub.items.data[0]?.price?.id === wantedPrice && setupSecret(sub),
    );

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
      const secret = setupSecret(resumable);
      if (secret) {
        return { status: "ok", clientSecret: secret, subscriptionId: resumable.id };
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
     * Erring towards GRANTING when a check fails: a Stripe or Postgres error
     * means somebody gets free time they might not be owed, which costs days.
     * Erring the other way charges a first-time customer immediately against a
     * screen that just promised them seven free days, which is a dispute.
     */
    const freeTime = resolveFreeTime({
      hasUsedTrial: hasUsedTrial(all),
      graceEndsAt: comp.kind === "grace" ? comp.endsAt : null,
      now: new Date(),
    });

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
        expand: ["pending_setup_intent"],
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
      return { status: "error", message: "Couldn't start your trial just now." };
    }

    const clientSecret = setupSecret(survivor);

    if (!clientSecret) {
      /**
       * Either Stripe created something other than a trialing subscription — a
       * paid trial, or a price with an amount due today — or the reconcile kept
       * a subscription that is already past its setup (this request lost a race
       * it should not have been in).
       *
       * Surfaced rather than papered over either way: the user must not be shown
       * a payment form that cannot complete.
       */
      console.error(
        `[billing] no usable pending_setup_intent on ${survivor.id} (status ${survivor.status})`,
      );
      return { status: "error", message: "Couldn't start your trial just now." };
    }

    return { status: "ok", clientSecret, subscriptionId: survivor.id };
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
  const { data } = await client.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
    expand: ["data.pending_setup_intent"],
  });
  return { all: data, live: data.filter((sub) => BILLABLE_STATUSES.has(sub.status)) };
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

/** The client secret on a subscription's pending SetupIntent, if it has one. */
function setupSecret(sub: Stripe.Subscription): string | null {
  const intent = sub.pending_setup_intent;
  if (!intent || typeof intent === "string") return null;
  return intent.client_secret ?? null;
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
  /** No comp row, or the read failed. Both are treated as "an ordinary user". */
  | { kind: "none" }
  /** Free for life. Must never be sold a subscription. */
  | { kind: "forever" }
  /** The beta grace. `endsAt` may be in the past. */
  | { kind: "grace"; endsAt: string };

async function compEntitlement(userId: string): Promise<CompEntitlement> {
  try {
    const { data, error } = await serviceClient()
      .from("entitlements")
      .select("source, active_until")
      .eq("user_id", userId)
      .eq("product", "pro")
      .eq("source", "comp")
      .limit(1);
    if (error) {
      console.error(`[billing] could not read the comp entitlement for ${userId}:`, error.message);
      return { kind: "none" };
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
    return { kind: "none" };
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
  // `active`, `past_due`, `unpaid`, `paused`: money has moved or is genuinely
  // owed on a real subscription, so the card question is settled.
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
export async function hasEntitlement(): Promise<boolean> {
  return hasProAccess();
}
