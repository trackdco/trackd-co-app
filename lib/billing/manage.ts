/**
 * WHAT THE BILLING SCREEN MAY OFFER — pure, so it can be tested without a
 * database, a session or a network. `lib/billing/access.ts` decides whether
 * somebody has access; this decides what they can DO about it.
 *
 * ## Why this is a function and not four `if`s in a component
 *
 * The answer depends on where the entitlement came from, and getting that wrong
 * is not a cosmetic bug. Offering "Cancel" to somebody whose subscription is an
 * App Store purchase would call Stripe about a subscription Stripe has never
 * heard of; offering it to a founder on a `comp` would offer to cancel nothing.
 * Both are one missing branch away, and neither would be caught by a type.
 *
 * ## The rule that outranks the rest of this file
 *
 * **A cancellation never revokes access.** It sets `cancel_at_period_end`, so
 * the user keeps what they already have — the rest of a paid month, or the rest
 * of a free trial — and simply is not charged again. `entitlements` is not
 * written by the cancel path at all: `active_until` already holds the right
 * date, and `isEntitlementActive` lets the clock do the work. That is the same
 * shape `endSubscription` documents in `sync.ts`, and it is why cancelling is
 * safe to make one tap.
 */

import type { Entitlement } from "./access";

/**
 * The entitlement, as much of it as a LABEL needs.
 *
 * `activeUntil` is here for one reason: it is the only thing that separates a
 * founder's comp from the beta fortnight, and without it {@link planLabelFor}
 * cannot tell them apart. See {@link isBetaGrace}.
 */
export type PlanEntitlement = Pick<Entitlement, "source" | "activeUntil">;

/**
 * ⚠️ IS THIS COMP THE BETA FORTNIGHT RATHER THAN FREE FOR LIFE?
 *
 * ## It MOVED here, and the direction is the whole point
 *
 * `08-billing-screen.md` §3.6 says of the grace-label defect: "The codebase
 * already has the predicate that distinguishes them. **The billing display
 * module does not import it. That is the whole gap.** Import it."
 *
 * The import could not be written as stated. This predicate lived in
 * `lib/billing/betaGrace.ts`, which carries `server-only`, and THIS module is
 * reachable from a client component — so `manage.ts` importing `betaGrace.ts`
 * fails the client build outright. The dependency can only point one way.
 *
 * So the predicate moves to the module both sides can reach, and `betaGrace.ts`
 * imports it from here and re-exports it, leaving `graceAsTrial`, the dashboard,
 * the reminder runner and `betaGrace.test.ts` untouched. **There is still
 * exactly ONE implementation**, which is what §3.6 actually asks for; a second
 * copy in this file would have been the defect this whole area keeps paying for.
 *
 * Identical shape to {@link CANCELLABLE_STATUSES}, which lives here and is
 * imported by the `server-only` `cancel.ts` for exactly the same reason.
 *
 * ## What it asks
 *
 * A `comp` with an expiry is the beta fortnight. A `comp` without one is free
 * for life. `access.ts` calls this "the only thing that distinguishes 'free
 * forever' from 'the beta grace' without a migration to add a fourth
 * `entitlement_source`", and tiers the two apart on the same test.
 */
export function isBetaGrace(
  entitlement: { source: string; activeUntil: string | null } | null,
): boolean {
  return Boolean(entitlement && entitlement.source === "comp" && entitlement.activeUntil);
}

/**
 * ⚠️ IS THE COURTESY PERIOD STILL RUNNING? — "IS IT HAPPENING NOW", NOT "DID IT
 * HAPPEN" (Group C).
 *
 * ## The defect this closes, found by a cold reviewer and rediscovered by driving
 *
 * `/billing`'s "Free until {date}" row and `/billing/manage`'s courtesy sentence
 * both rendered on the marker being PRESENT, with no test that the date is still
 * in the future. `subscriptions.courtesy_until` is written once when the save
 * offer is granted and is never cleared — deliberately — so a customer who took
 * the free week and was then charged read
 *
 *     Free until   10 Aug 2026
 *     Renews on    17 Aug 2026
 *
 * on one card, and the Manage sentence told them their plan was free until a date
 * a week in the past. Both surfaces stated a promise that had already been
 * withdrawn.
 *
 * ## ⚠️ THE MARKER IS NOT CLEARED, AND MUST NOT BE
 *
 * Reconciliation depends on it persisting. `charge-inside-courtesy` and
 * `courtesy-granted-while-unpaid` both ask **"did this account ever get a
 * courtesy period?"**, and clearing the marker would make one of them fire on
 * every past courtesy account and the other stop firing at all. The screens want
 * "is it running"; the rules want "did it happen". They are different questions
 * about one column, and the fix belongs at the readers that ask the first.
 *
 * ## Which readers take this test, and which deliberately do not
 *
 *   `/billing`'s "Free until" row            HAPPENING NOW — takes it
 *   `manageSummary`'s `courtesy` state       HAPPENING NOW — takes it
 *   {@link planLabelFor}'s courtesy branch   DID IT HAPPEN — does NOT
 *   {@link isGenuineTrial}                   DID IT HAPPEN — does NOT
 *   `reconcile`'s `chargeInsideCourtesy`     DID IT HAPPEN — does NOT
 *   `reconcile`'s `courtesyGrantedWhileUnpaid`   DID IT HAPPEN — does NOT
 *   `reconcile`'s `freePeriodMarkerMissing`  DID IT HAPPEN — does NOT
 *   `notifications/runner`'s reminder noun   HAPPENING NOW — needs no test
 *
 * The three reconcile rules are the reason the marker may not be cleared at all:
 * every one of them asks a question about the PAST, and two of them read the
 * marker as their only evidence that a free period ever existed.
 *
 * The reminder runner is the interesting one. It wants "is it happening now" and
 * takes no date test, because it cannot reach a stale marker: its read is filtered
 * to `status = "trialing"` AND it runs only inside the branch that is already
 * about to send, which `trialReminderVerdict` reaches only in the two days before
 * an ending it has not passed (`trial-over` refuses it afterwards). Adding a
 * fourth condition there would be a guard against a state that cannot arrive.
 *
 * The last two are not oversights and the direction matters. Both exist to
 * explain a `trialing` status: the save offer buys free time by moving
 * `trial_end`, so Stripe reports `trialing` for a customer of two years. Adding a
 * date test there would make a stale marker beside a `trialing` row resolve to
 * **"Free trial"** — D36's one absolute prohibition — for the exact cohort those
 * two functions were written to protect. Their conservative answer is the right
 * one whether the period is running or long finished.
 *
 * ⚠️ AND `courtesyUntilFor` — THE READ — TAKES NO TEST EITHER. It feeds both
 * kinds of reader, and filtering at the query would silently answer the rules'
 * question wrongly while fixing the screens'.
 *
 * An unparseable value reads as NOT running: it is a date this app wrote itself,
 * so a value that will not parse is our bug, and the safe direction for a
 * PROMISE is to stop making it rather than to keep making it forever.
 */
export function courtesyIsRunning(
  courtesyUntil: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!courtesyUntil) return false;
  const at = Date.parse(courtesyUntil);
  return Number.isFinite(at) && at > now.getTime();
}

/**
 * WHICH SAVE OFFER a cancelling user is shown.
 *
 * Declared HERE, in the pure module, rather than beside the Stripe code that
 * acts on it. `lib/billing/saveOffer.ts` is `server-only`, and the dialog that
 * renders the offer is a client component: importing the type from there would
 * be a type-only import into a client bundle from a module whose whole job is to
 * fail that build. A type has no runtime and belongs where both sides can reach
 * it.
 *
 * `trial` and `paid` are genuinely different offers, not one offer with two
 * labels. See `saveOffer.ts` for what each one does and `CancelSubscription`
 * for what each one says.
 */
export type SaveOfferKind = "trial" | "paid";

/**
 * WHAT A FAILED CANCEL OR RESUME SAYS, IN ONE PLACE.
 *
 * Both the server action and the dialog's own catch need these. The action
 * cannot export them — it is a `"use server"` module, where every export is a
 * dispatchable endpoint and a non-async one fails the build — so they live here,
 * in the pure module both sides already import.
 *
 * They state the FACT and the NEXT ACTION, which is what `ui-context.md` asks of
 * error copy. The dialog's catch used the bare "Something went wrong.", which
 * does neither: a cold review noted it tells somebody whose cancellation just
 * failed nothing about what to do, on the screen where that matters most.
 */
export const CANCEL_FAILED = "We couldn't cancel just now. Please try again.";
export const RESUME_FAILED = "We couldn't restart it just now. Please try again.";
/** `04`'s dialog, but the string is the server's and the client needs it too. */
export const CLAIM_FAILED = "We couldn't add the extra time just now.";

/** The mirror row, as much as the screen needs. Never an access decision. */
export interface ManageableSubscription {
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /**
   * When a save-offer courtesy period ends, or null for a genuine first trial.
   *
   * Only exists so the LABEL can tell the two apart. Nothing gates on it: a
   * courtesy period entitles exactly the same way a trial does, and access is
   * still decided by `entitlements` alone.
   */
  courtesyUntil?: string | null;
}

/**
 * What control the Billing screen renders.
 *
 * `none` and `unavailable` are different on purpose. `none` is a founder on a
 * comp, where there is genuinely nothing to manage and saying so is correct.
 * `unavailable` is a subscription we can see but cannot act on, which is a
 * support case rather than a silent blank.
 */
export type ManageAction =
  /**
   * ⚠️ `isTrial` AND `namesATrial` ARE NOT THE SAME QUESTION, AND BOTH ARE HERE
   * ON PURPOSE.
   *
   *   isTrial      Stripe says `trialing`, so access ends at `trial_ends_at` and
   *                a date row already states it above. A DATE question.
   *   namesATrial  this may be CALLED a trial. A COPY question, and false for a
   *                courtesy period and a beta fortnight, both of which are
   *                `trialing` at Stripe and neither of which is a trial.
   *
   * Consumers must take the one they mean. `renewalRow` wants `isTrial` (is a
   * date already shown?); `CancelSubscription`'s noun wants `namesATrial`.
   */
  | {
      kind: "cancel";
      endsOn: string;
      isTrial: boolean;
      namesATrial: boolean;
      accessEndsEarly: boolean;
    }
  | {
      kind: "resume";
      endsOn: string;
      isTrial: boolean;
      namesATrial: boolean;
      accessEndsEarly: boolean;
    }
  | { kind: "store"; store: "apple" | "google" }
  | { kind: "none"; reason: "comp" | "no-subscription" }
  | { kind: "unavailable"; reason: string };

/**
 * ⚠️ THE STATUSES `cancel_at_period_end` CAN ACTUALLY BE SET ON. ONE LIST, TWO
 * CALLERS, AND THE SPLIT FROM `BILLABLE_STATUSES` IS LOAD-BEARING.
 *
 * `past_due` is included deliberately. Somebody whose card is failing is one of
 * the people most likely to want out, and refusing them the button because a
 * charge did not go through would be the app arguing with them about whether
 * they may leave. Stripe accepts `cancel_at_period_end` on a `past_due`
 * subscription and stops the dunning retries, which is exactly the intent.
 *
 * ## And `paused` and `unpaid` are NOT here, because Stripe refuses them
 *
 * A cold review drove it and it was measured again directly:
 *
 *     stripe.subscriptions.update(id, { cancel_at_period_end: true })
 *       on a `paused` subscription
 *       -> "You cannot set `cancel_at_period_end` while a subscription is
 *          `paused`. Resume the subscription first..."
 *
 * That is a HARD REFUSAL, not a no-op. The cancel action used to read
 * `BILLABLE_STATUSES` — which is wider on purpose, because it answers a
 * different question — so one `paused` subscription on the customer made the
 * loop throw and **the user could not cancel at all, ever**: "We couldn't cancel
 * just now. Please try again." on every attempt, while the live trial ran on and
 * converted. If the paused one sorted later the loop threw halfway, so the
 * cancellation went through at Stripe while the screen said it had failed.
 *
 * `BILLABLE_STATUSES` answers "what could still take this person's money?" and
 * is correct for the DELETION path, which uses `subscriptions.cancel()` — a call
 * Stripe accepts on a paused subscription perfectly happily. This list answers
 * "what may a user press a button on?". They are different questions and they
 * were being answered with one list.
 *
 * ⚠️ This list lives HERE, in the pure module, and `lib/billing/cancel.ts`
 * imports it. Not the other way round: `cancel.ts` is `server-only` and this
 * module is reachable from a client component, so the dependency can only point
 * this way. It also had a private duplicate of exactly these three strings,
 * which is how the screen came to offer a control for one status set while the
 * action acted on another.
 */
export const CANCELLABLE_STATUSES: ReadonlySet<string> = new Set([
  "trialing",
  "active",
  "past_due",
]);

const CANCELLABLE = CANCELLABLE_STATUSES;

/**
 * ⚠️ WHAT THE CANCEL ACTION ACTS ON. WIDER THAN WHAT THE SCREEN OFFERS.
 *
 * The set above answers "what may a user press a button on?" and is consumed by
 * {@link manageActionFor} to decide whether a control renders. This one answers
 * "what must `cancel_at_period_end` actually be applied to?" and is consumed by
 * the action. **They are different questions and the second is wider.**
 *
 * ## The defect this closes, which cost $69.99, driven
 *
 * D76 taught `applyCancelFlag` to void an `incomplete` subscription's open
 * invoice — correctly, and it was separately proven to work. **It was also dead
 * code.** The action resolves its ids through `liveSubscriptionsForUser(user.id,
 * CANCELLABLE_STATUSES)`, and `incomplete` is not in that set, so `incomplete`
 * never reached `applyCancelFlag` at all.
 *
 * The consequence was worse than an un-voided invoice: **the subscription was not
 * cancelled at all**, while the dialog told the user in writing they would not be
 * charged. Measured with a `trialing` monthly and an `incomplete` yearly on one
 * customer: the trial took the flag, the yearly kept its open $69.99 invoice, the
 * abandoned tab's 3D Secure challenge completed, and the money moved.
 *
 * ## Why `incomplete` is added HERE and not to the set above
 *
 * ⚠️ THE ORIGINAL REASONING HERE WAS AIMED ONE LAYER OFF, and is corrected rather
 * than quietly rewritten, because the correction is the useful part.
 *
 * It argued that adding `incomplete` to `CANCELLABLE_STATUSES` would change what
 * {@link manageActionFor} renders. **Measured: it would not.** For an
 * `incomplete` row that function returns `unavailable` either way — the status
 * has no `endsOn` the dialog could name, so it never reaches a cancel control.
 *
 * The gate that actually decided whether an `incomplete` row was seen at all was
 * the STATUS FILTER on `/billing`'s mirror query, which the old comment did not
 * mention. That filter now reads {@link BILLABLE_STATUSES}, so the row reaches
 * `manageActionFor` and gets D83's support line.
 *
 * **The split is still the right shape**, for a plainer reason than the one first
 * given: the two sets answer two different questions — "what may a user press a
 * button on?" and "what must the flag actually be applied to?" — and a single set
 * answering both is a set that gets widened for one of them and silently changes
 * the other. That is the class of defect this whole review found. It is just not
 * what would have happened in this particular case.
 *
 * `paused` and `unpaid` stay OUT of both. Stripe hard-refuses
 * `cancel_at_period_end` on `paused` ("Resume the subscription first"), so
 * including it would make one paused subscription break cancelling entirely. They
 * are handled by D80's immediate-cancel path instead.
 */
export const FLAG_CANCELLABLE_STATUSES: ReadonlySet<string> = new Set([
  ...CANCELLABLE_STATUSES,
  "incomplete",
]);

/**
 * ⚠️ STOPPABLE, BUT NOT BY THE FLAG (D80).
 *
 * Stripe hard-refuses `cancel_at_period_end` on these and accepts
 * `subscriptions.cancel()` on them, so they ARE stoppable — just by the other
 * mechanism. They have no paid period to protect, which is the entire reason
 * period-end cancellation exists, so ending them now costs the user nothing.
 *
 * Kept apart from {@link CANCELLABLE_STATUSES} rather than folded into it,
 * because the two drive different code: one decides which Stripe call to make,
 * the other is read by callers asking what the period-end flag may touch.
 * {@link manageActionFor} forms the union where it needs it.
 */
export const STOPPABLE_NOW: ReadonlySet<string> = new Set(["paused", "unpaid"]);

/**
 * Statuses Stripe has finished with. Nothing here can ever charge again.
 *
 * Declared locally rather than imported from `cancel.ts`'s `BILLABLE_STATUSES`:
 * that module is `server-only` and already imports from this one, so the
 * dependency cannot point back without breaking the client build.
 */
const DEAD_STATUSES: ReadonlySet<string> = new Set(["canceled", "incomplete_expired"]);

/**
 * Which control to show, given where access came from and what Stripe mirrors.
 *
 * The entitlement comes from `entitlements`, never from the subscription. That
 * ordering matters: a user could hold a `comp` AND a lapsed Stripe row, and the
 * thing their access actually rests on is what the screen should describe.
 */
export function manageActionFor(
  /**
   * ⚠️ THE ENTITLEMENT, NOT ITS `source`, FOR THE SAME REASON {@link
   * planLabelFor} TAKES IT.
   *
   * This took the bare source, so both comp states arrived as the string "comp"
   * and {@link isGenuineTrial} could not be asked here at all — which is why the
   * noun was keyed off Stripe's status and a beta fortnight was called a trial.
   * `activeUntil` is the whole difference and it has to reach this function.
   *
   * The signature is otherwise unchanged: three parameters, no formatter, no
   * timezone, no date.
   */
  entitlement: PlanEntitlement | null,
  subscription: ManageableSubscription | null,
  /**
   * ⚠️ WHEN ACCESS ACTUALLY ENDS, FROM THE TABLE THAT DECIDES IT.
   *
   * The mirror supplies the date this screen displays, and for almost everybody
   * the two agree exactly. For a `past_due` user they do not, and a cold review
   * measured the gap: on a failed renewal Stripe rolls the period forward FIRST,
   * so `current_period_end` is the end of the period that was never paid for,
   * while `markPastDue` claws the entitlement back to the last paid period plus
   * three days. Nothing reconciled the two, so the confirmation dialog read
   *
   *     "You'll have full access to your Pro plan until 15 Sept 2026"
   *
   * to somebody who goes read only on 18 Aug. Twenty-seven days of promise the
   * server would contradict, on the one screen where a date is the whole point.
   *
   * So the earlier of the two wins. It can only ever UNDER-promise, which is the
   * direction this file already argues for in `planLabelFor`: a screen that
   * under-promises to a paying user is a support email, and one that
   * over-promises to a locked-out user is a lie at the worst moment.
   *
   * Optional, and absent means "use the mirror". A trial whose entitlement row
   * has not been written yet must not have its date pulled back to nothing.
   */
  entitlementActiveUntil?: string | null,
): ManageAction {
  /**
   * ⚠️ A COMP DOES NOT MAKE A LIVE STRIPE SUBSCRIPTION STOP BILLING, SO IT MUST
   * NOT MAKE THE WAY OUT OF ONE DISAPPEAR.
   *
   * This branch used to sit ABOVE the subscription checks and return "nothing to
   * manage" from the entitlement's source alone. Its stated reasoning was that a
   * cancel button "would offer to end access that no subscription is paying
   * for" — and that reasoning only holds when there is no subscription. Where
   * there IS one, cancelling does not end access at all: it stops a CHARGE, and
   * the comp is a different entitlement row that a Stripe cancellation can never
   * touch.
   *
   * Two independent cold reviews drove the cost. A comped paying customer read:
   *
   *     Access    Complimentary
   *     Price     $11.99 USD / month
   *     Trial ends 23 Aug 2026
   *
   * with **no cancel control and no support line**, while Stripe went on
   * charging them. `access.ts` already describes this exact defect at length and
   * calls it "the exact chargeback this whole area exists to avoid"; the fix
   * there was applied to EXPIRING comps only, so a no-expiry comp still hid the
   * control, and the grace cohort reopened it whenever the `stripe` entitlement
   * row was absent — which is a designed state, not merely a race, because
   * `syncSubscription` writes the mirror and then withholds the entitlement
   * while `cardIsValidated` is false.
   *
   * So the source still decides what they are ON (`planLabelFor` says
   * "Complimentary", because that is what their access rests on) and the
   * SUBSCRIPTION decides whether there is something to stop. Two questions.
   */
  /**
   * ⚠️ AND THE SAME IS TRUE OF AN APP STORE SOURCE, FOR THE SAME REASON.
   *
   * RevenueCat will write `apple` / `google` rows when TRACKD reaches the App
   * Store, and that subscription really cannot be cancelled from here — the only
   * honest control for IT is a pointer at the right place. But this branch used
   * to run before the subscription was consulted at all, so an Apple entitlement
   * beside a live STRIPE subscription hid every control while Stripe charged.
   *
   * Worse than the comp version, because `page.tsx` suppresses the Stripe portal
   * row for `kind: "store"` — so that cohort had no route out of the app at all.
   * Driven: "Access: Free trial · $11.99 USD / month · managed by the App Store",
   * with Stripe reporting `trialing, cancel_at_period_end: false`.
   *
   * Not reachable today (no RevenueCat rows exist). Reachable the day it ships,
   * which is exactly when nobody will be looking at this function.
   */
  const source = entitlement?.source ?? null;
  const store = source === "apple" ? "apple" : source === "google" ? "google" : null;
  const comped = source === "comp";
  /**
   * ⚠️ D80 HAS LANDED, AND IT CHANGED WHAT "ACTIONABLE" MEANS. This is the line
   * the seam marker pointed at.
   *
   * `paused` and `unpaid` used to fall through to `unavailable` and the support
   * line, because Stripe hard-refuses `cancel_at_period_end` on them and there
   * was no other way to stop them. That was correct **only while no mechanism
   * existed.** D80 cancels them immediately via `subscriptions.cancel()`, which
   * Stripe accepts where it refuses the flag — so the app now has a way to stop
   * exactly the subscriptions this screen was signposting as unstoppable.
   *
   * Leaving them out would have been the same defect this file already carries
   * two corrections for: a correct fix the screen cannot dispatch. D76's void was
   * dead because the status set never reached it; these rows were invisible
   * because the page filtered them out. Both were reachability, not logic.
   *
   * ⚠️ `CANCELLABLE_STATUSES` IS DELIBERATELY NOT WIDENED. It answers "what may a
   * user press a button on" for OTHER readers too, and the whole lesson of this
   * review is that one set answering two questions gets widened for one of them.
   * The union is formed here, where the question is specifically what THIS screen
   * may offer a control for.
   */
  const actionable =
    subscription !== null &&
    (CANCELLABLE.has(subscription.status) || STOPPABLE_NOW.has(subscription.status));

  if (!actionable) {
    if (store) return { kind: "store", store };
    if (!subscription) return { kind: "none", reason: comped ? "comp" : "no-subscription" };
    /**
     * ⚠️ A COMP STILL NEEDS THE SIGNPOST WHEN SOMETHING CAN STILL BILL THEM.
     *
     * The comp branch used to sit above this, so `unavailable` could never fire
     * for them and a comped user with a `paused` or `unpaid` subscription got
     * total silence — no control, no support line — while the same state without
     * the comp got the line. But a comp whose subscription is genuinely DEAD has
     * nothing to be signposted about, and telling a healthy founder "this can't
     * be changed from here" is its own false claim.
     *
     * So the split is what Stripe could still take money on, not the source.
     */
    if (comped && DEAD_STATUSES.has(subscription.status)) {
      return { kind: "none", reason: "comp" };
    }
    return { kind: "unavailable", reason: subscription.status };
  }

  /**
   * ⚠️ TWO QUESTIONS, TWO ANSWERS, ONE READ. DO NOT COLLAPSE THEM.
   *
   * `isTrial` is Stripe's status and it answers **WHEN ACCESS ENDS**: a
   * subscription inside any free period ends at `trial_ends_at`, whether that
   * period is a first trial, a save-offer courtesy month or a beta fortnight. It
   * is a DATE question and the status is the right input for it.
   *
   * {@link isGenuineTrial} answers **WHAT TO CALL IT**, and the status is the
   * wrong input for that: three states arrive wearing `trialing` and only one is
   * a trial. Driven — a mid-grace subscriber and a courtesy customer of two years
   * both read "Cancel my trial", which is D36's one absolute prohibition.
   *
   * ## ⚠️ AND IT IS NOT THE OTHER WAY ROUND. READ THIS BEFORE "SIMPLIFYING" IT.
   *
   * The obvious tidy is to delete `isTrial` and drive everything from
   * `isGenuineTrial`, on the reasoning that it is the more careful answer. It is
   * the more careful answer to a DIFFERENT question, and using it here would be
   * worse than the bug this split fixes.
   *
   * A courtesy customer's access really does end at `trial_ends_at` — that is the
   * whole mechanism the save offer uses, and Stripe reports `trialing` because it
   * is telling the truth about when money next moves. `isGenuineTrial` is false
   * for them, so a merged field would read `current_period_end` instead and the
   * screen would promise access until a day AFTER it had already stopped. The
   * same for a beta fortnight.
   *
   * One direction costs a wrong noun. The other costs a date that over-promises
   * access, which is the failure this whole area exists to prevent. So both are
   * computed, from one read, and each caller takes the one it actually needs.
   */
  const isTrial = subscription.status === TRIALING;
  const namesATrial = isGenuineTrial(entitlement, subscription);
  /**
   * WHEN ACCESS ACTUALLY RUNS OUT.
   *
   * The trial end while trialing, the period end once paying — the same choice
   * `entitledUntil` makes in `sync.ts`, for the same reason. Reading
   * `currentPeriodEnd` on a trialing subscription would name the date of the
   * first renewal rather than the date they stop being charged nothing.
   */
  const mirrorEnd = (isTrial ? subscription.trialEndsAt : subscription.currentPeriodEnd)
    ?? subscription.currentPeriodEnd
    ?? subscription.trialEndsAt;

  const endsOn = soonerOf(mirrorEnd, entitlementActiveUntil ?? null);

  if (!endsOn) {
    // Every branch below states a date out loud. A cancel confirmation that
    // cannot say when access ends is worse than no button.
    return { kind: "unavailable", reason: "no-period-end" };
  }

  /**
   * ⚠️ DID THE ENTITLEMENT PULL THE DATE IN? THE LABEL DEPENDS ON IT.
   *
   * When the two disagree it is because the subscription is `past_due`: Stripe
   * has rolled the period forward and `markPastDue` has clawed the entitlement
   * back, so `endsOn` is the day access STOPS and emphatically not a day
   * anything renews. Stating the earlier date fixed the dialog and left the plan
   * card printing it under "Renews on" — a cold review measured
   * "Renews on 26 Aug 2026" for an account whose next Stripe attempt is 29 Aug
   * and whose access dies on the 26th. Nothing renews on that date.
   */
  /**
   * ⚠️ AND `past_due` COUNTS EVEN BEFORE THE CLAWBACK LANDS.
   *
   * Keying this on the two dates disagreeing missed the window before
   * `markPastDue` runs, and the cohort whose entitlement is withheld entirely —
   * both of which rendered "Renews on 16 Sept 2026" for a subscription whose
   * card has already failed. Nothing renews on that date; the next thing Stripe
   * does is retry. The status says so directly, so it is asked directly.
   */
  /**
   * ⚠️ AND THE QUESTION IS "WILL ANYTHING RENEW", NOT "IS THIS `past_due`".
   *
   * Asking about one status answered correctly for that status and wrongly for
   * every other one that also does not renew. Driven: a `paused` subscription
   * read **"Renews on 17 Sept 2026"** — it is charging nobody, and D80 means
   * pressing the control ends it immediately, so nothing renews on that date and
   * nothing was ever going to. Same false claim `40e961d` fixed for `past_due`,
   * one status across, which is what happens when a condition enumerates
   * instances instead of naming the question.
   *
   * So {@link renewsOnPeriodEnd} is asked instead, and the enumeration lives
   * there, once, next to its reasoning.
   */
  /**
   * ⚠️ COMPARED AS INSTANTS, DELIBERATELY. DO NOT "SIMPLIFY" IT BACK TO `!==`.
   *
   * ## The two dates ARRIVE IN DIFFERENT SERIALISATIONS, BY CONSTRUCTION
   *
   *   mirrorEnd    raw from PostgREST — MICROSECOND precision and a `+00:00`
   *                offset:  `2027-08-18T05:55:22.247123+00:00`
   *   endsOn       ultimately from `deriveEntitlementFacts`, which round-trips
   *                through `new Date(...).toISOString()` — MILLISECOND precision
   *                and a `Z`:  `2027-08-18T05:55:22.247Z`
   *
   * Same instant, different strings, for essentially every account. Measured on
   * 20 Aug 2026.
   *
   * ## This read `endsOn !== mirrorEnd`, and it was correct BY ACCIDENT
   *
   * `soonerOf` returns one of its two inputs VERBATIM, so that comparison was an
   * IDENTITY test — "did `soonerOf` pick the entitlement's date?" — and the
   * decision itself was made on instants. It answered correctly on all five
   * cases. But it rested on two undocumented properties of `soonerOf`:
   *
   *   1. that it returns its argument rather than a normalised string, and
   *   2. that it TIE-BREAKS TO ITS FIRST ARGUMENT.
   *
   * Either one is a plausible tidy-up. Normalise the return and every paying
   * customer whose mirror carries microseconds reads **"Ends on"** — the exact
   * false claim {@link renewsOnPeriodEnd} exists to remove. Flip the tie-break to
   * the second argument and the branch inverts for every account whose two rows
   * hold the same instant, which is almost all of them.
   *
   * Comparing instants removes both dependencies. A comment describing them would
   * only have relied on the next person reading it.
   *
   * ## ⚠️ AND IT IS NOT THE DRIVER FLAKE, WHICH LOOKED IDENTICAL
   *
   * A seed writing `active_until: iso(365*DAY)` beside
   * `current_period_end: iso(365*DAY)` called `Date.now()` twice and produced two
   * genuinely DIFFERENT instants — so this branch reported divergence CORRECTLY
   * and the fixture was wrong. Same symptom, opposite cause. The harness has
   * carried `sameInstant`/`earlierThan` for exactly this class since it was
   * written; product code had no equivalent, and that gap is what this closes.
   */
  const accessEndsEarly =
    !renewsOnPeriodEnd(subscription.status) ||
    (mirrorEnd !== null && endsOn !== null && endsBefore(endsOn, mirrorEnd));

  return subscription.cancelAtPeriodEnd
    ? { kind: "resume", endsOn, isTrial, namesATrial, accessEndsEarly }
    : { kind: "cancel", endsOn, isTrial, namesATrial, accessEndsEarly };
}

/**
 * ⚠️ WILL ANYTHING ACTUALLY RENEW WHEN THIS PERIOD ENDS?
 *
 * The question `accessEndsEarly` needs, and the one it was not asking. "Renews
 * on {date}" is a CLAIM ABOUT WHAT HAPPENS NEXT and it has to be true.
 *
 * ## ⚠️ NOT A FIFTH STATUS SET, AND DELIBERATELY NOT
 *
 * There are already four in this file plus `BILLABLE_STATUSES` next door, and a
 * new one answering a fifth question is how the next defect gets written — a set
 * gets widened for one of its readers and silently changes the others. **No
 * existing set expresses "will not renew" on its own**: {@link STOPPABLE_NOW} is
 * `{paused, unpaid}` and says nothing about `past_due`, which also does not renew
 * on that date. So this composes the sets that already exist rather than
 * declaring a sixth, and the composition is a function with a name instead of a
 * condition nobody can search for.
 *
 * Three reasons a period end is not a renewal, each already named elsewhere:
 *
 *   STOPPABLE_NOW   `paused` and `unpaid`. Collection is stopped. That set's own
 *                   note says they "have no paid period to protect", which is the
 *                   same fact from the other side.
 *   past_due        Stripe rolled the period forward on a charge that FAILED, so
 *                   this date is the end of a period nobody paid for. The next
 *                   thing Stripe does is retry, not renew.
 *   DEAD_STATUSES   finished. Unreachable from here — `manageActionFor` has
 *                   already returned `unavailable` — and listed so this function
 *                   is correct read on its own rather than only in its caller.
 *
 * Everything else (`active`, `trialing`) genuinely does bill again on that date.
 */
function renewsOnPeriodEnd(status: string): boolean {
  if (STOPPABLE_NOW.has(status)) return false;
  if (status === PAST_DUE) return false;
  if (DEAD_STATUSES.has(status)) return false;
  return true;
}

/**
 * The earlier of two dates, either of which may be absent.
 *
 * Absent is not "zero" — it means "this source has nothing to say", so it never
 * wins. Unparseable is treated the same way rather than being allowed to
 * shorten a date to `NaN`.
 */
/**
 * Is `a` strictly EARLIER than `b`, as instants?
 *
 * The same shape as the harness's `earlierThan`, which exists because `+00:00`
 * and `.000Z` are the same instant and different strings — a distinction product
 * code had no way to make until now.
 *
 * ⚠️ UNPARSEABLE ERRS TOWARDS "SOMETHING ENDS EARLY", which is the direction that
 * withholds a renewal claim. This file's own rule: "Renews on {date}" is a CLAIM
 * ABOUT WHAT HAPPENS NEXT and it has to be true, so a date we cannot read is not
 * permission to promise one. Unreachable in practice — both values are
 * `timestamptz` columns — and stated rather than left to inference.
 */
/**
 * ⚠️ "Renews on" OR "Ends on" — THE VERB `/billing` PRINTS ABOVE THE DATE (08).
 *
 * ## Why it is here and not in the page
 *
 * It was one ternary inside `app/(app)/billing/page.tsx`, which the committed
 * suite cannot reach — `vitest.config.ts` includes `lib/**` tests and nothing
 * else. So the decision this file spent four separate fixes getting right had its
 * FINAL STEP, the two words a user actually reads, sitting outside every pin.
 * This file's own opening rule applies: a rule buried where nobody can check it
 * is a rule nobody can check.
 *
 * ## ⚠️ "Renews on" IS A CLAIM ABOUT WHAT HAPPENS NEXT AND IT HAS TO BE TRUE
 *
 * Four measured false claims stand behind the predicate it reads — a `past_due`
 * account promised a renewal three days after its access died, a `paused` one
 * promised a renewal that was never going to happen, and a yearly whose
 * entitlement had been clawed back. {@link manageActionFor} answers the question;
 * this only chooses the words, and it chooses "Ends on" whenever anything at all
 * says the date is not a renewal.
 *
 * A scheduled cancellation (`resume`) always reads "Ends on": the whole point of
 * that screen is that nothing renews.
 */
export function periodEndLabelFor(
  action: ReturnType<typeof manageActionFor>,
): "Renews on" | "Ends on" | null {
  if (action.kind !== "cancel" && action.kind !== "resume") return null;
  return action.kind === "resume" || action.accessEndsEarly ? "Ends on" : "Renews on";
}

export function endsBefore(a: string, b: string): boolean {
  const at = Date.parse(a);
  const bt = Date.parse(b);
  if (!Number.isFinite(at) || !Number.isFinite(bt)) return true;
  return at < bt;
}

function soonerOf(a: string | null, b: string | null): string | null {
  const at = a ? Date.parse(a) : NaN;
  const bt = b ? Date.parse(b) : NaN;
  if (!Number.isFinite(at)) return Number.isFinite(bt) ? b : a;
  if (!Number.isFinite(bt)) return a;
  return bt < at ? b : a;
}

/**
 * WHAT THE USER IS ON, IN ONE WORD OR TWO. The label Profile's pill and the
 * Billing screen both show.
 *
 * ## It reads `entitlements`, and no longer `profiles.tier`
 *
 * Profile hardcoded `"Beta · Pro"` from `profiles.tier` while `/billing` read
 * the entitlement, so one user could be told two different things on two
 * screens. `tier` is historical: `grants/003` locked it to the service role and
 * `architecture.md` makes `entitlements` the only table that decides access.
 * One function, both screens, one answer.
 *
 * ## The source is what matters, not the subscription's status
 *
 * A founder who also subscribes is on a `comp`, and describing them by the
 * subscription would be wrong. `strongestEntitlement` has already picked which
 * row their access actually rests on before this is called.
 */
export function planLabelFor(
  /**
   * ⚠️ THE ENTITLEMENT, NOT ITS `source`. THE TYPE CHANGED AND THAT IS THE FIX.
   *
   * This took `EntitlementSource | null`, so **both comp states arrived as the
   * string `"comp"`** and D36's defect — a founder and a fortnight that expires
   * in two days reading identically — could not be fixed inside this function at
   * any cost. `isBetaGrace` needs `activeUntil` and there was no way to hand it
   * over.
   *
   * ⚠️ A THIRD PARAMETER WAS THE WRONG ANSWER and was ruled out (Adrian,
   * 2026-08-18). The signature stays THREE WIDE, and **no formatter, timezone or
   * date may ever enter it**: Profile's pill has no formatter and is one word, so
   * a function that composed "On us until 20 Nov" could not be shared. This
   * answers the STATE. The date is composed at the billing surface.
   *
   * Q88's invariant is about the two screens disagreeing on STATE, not on detail:
   * Billing saying "On us until 20 Nov" while Profile says "On us" is not a
   * disagreement. Profile saying "Pro" while Billing says "Read only" is.
   */
  entitlement: PlanEntitlement | null,
  subscription: Pick<ManageableSubscription, "status" | "courtesyUntil"> | null,
  /**
   * Is the read-only gate switched on? (`billingGateEnabled()`.)
   *
   * Passed in rather than read, because this module is pure and the switch is
   * server-side. Defaults to FALSE, which is the pre-gate world and the safe
   * direction for a caller that forgets: it can only ever make the label more
   * generous than reality, never less, and a screen that under-promises to a
   * paying user is a support email while one that over-promises to a locked-out
   * user is a lie at the worst moment.
   */
  gateEnabled = false,
): string {
  const source = entitlement?.source ?? null;

  /**
   * ⚠️ TWO COMPS, TWO LABELS. D36, and §3.6 calls this a DEFECT rather than a
   * gap: "'Complimentary' is returned on the first branch for any comp
   * entitlement, and that branch never looks at whether the entitlement expires.
   * A free-for-life account and a fortnight that runs out in two days read
   * identically."
   *
   * The three labels are signed (Adrian, 2026-08-18), and each is D36's own
   * word rather than one invented here:
   *
   *   comp, no expiry                      Complimentary   §3.6, verbatim
   *   comp, dated, no subscription         On us           §3.6's "days on us"
   *   comp, dated, trialing subscription   Pro             §3.6, verbatim
   *
   * ⚠️ THE THIRD IS THE MID-GRACE SUBSCRIBER AND "Free trial" WOULD BE A LIE.
   * D36's governing rule is absolute — **the word "trial" never renders for
   * anyone who is not on one** — and somebody inside their beta fortnight whose
   * plan starts at the end of it is not on a trial. §3.6 gives them the plan name
   * and a `Starts {date}` row, which the billing surface composes.
   *
   * Reaching this branch at all means the dated comp is the STRONGEST
   * entitlement, which per `access.ts`'s tiering means no `stripe` row has been
   * written yet — the documented window where `syncSubscription` has written the
   * mirror and is withholding the entitlement while `cardIsValidated` is false.
   * ⚠️ Once that row lands, `strongestEntitlement` returns it instead and the
   * label falls through to "Free trial" below. That cohort is NOT fixed here and
   * is reported rather than guessed at: the mirror carries no grace marker
   * (probed: `trackd_grace_until` and `grace_until` both `42703`), and inventing
   * one is a migration this spec forbids.
   */
  if (source === "comp") {
    if (!isBetaGrace(entitlement)) return COMP_FOREVER_LABEL;
    return subscription?.status === "trialing" ? FULL_ACCESS_LABEL : GRACE_LABEL;
  }

  /**
   * ⚠️ GATE ON PLUS NO ENTITLEMENT IS "READ ONLY", DECIDED BEFORE ANY MIRROR READ.
   *
   * This sat at the BOTTOM, under two checks that read the mirror — so with the
   * gate on, an account with no entitlement row at all was told it was on a
   * **Free trial** the instant the switch flipped, purely because a `trialing`
   * row existed in the mirror.
   *
   * Driven with a real `trialing` subscription whose 3D Secure was abandoned,
   * which is a state Stripe leaves standing until it expires. That account has
   * no entitlement, is read-only the moment the gate is on, and was reading
   * "Free trial" on the one screen somebody opens to find out why they are
   * locked out.
   *
   * **The mirror cannot answer the access question and must not be asked first.**
   * `entitlements` is the only table that decides access; the mirror is display.
   * Asking "what does Stripe's status say?" before "does this account actually
   * have access?" is the same inversion that produced the filter defect on
   * `/billing` and the row-selection defect beside it. Founder ruling: gate on,
   * no entitlement, "Read only", full stop.
   *
   * Below `comp`, because a comp IS a source and is entitled. With the gate OFF
   * nothing changes: the pre-gate world still falls through to the mirror checks
   * and ends at {@link FULL_ACCESS_LABEL}.
   */
  if (gateEnabled && !source) return NO_ACCESS_LABEL;

  /**
   * ⚠️ A COURTESY PERIOD IS NOT A TRIAL, even though Stripe calls it one.
   *
   * The save offer gives free time by moving `trial_end`, which is the only
   * mechanism that means "this period is free" exactly and works the same on
   * every interval. The side effect is that Stripe reports `trialing` for the
   * free stretch, so without this check a customer of two years who accepted a
   * free month would be told they are on a "Free trial" -- the label meant for
   * somebody who has never paid a cent. Adrian, 2026-08-14.
   *
   * They read "Pro", because that is what they are on. The fact that this
   * particular month costs nothing is carried by the date beside it, not by
   * relabelling their plan.
   */
  if (subscription?.courtesyUntil) return "Pro";
  // A running trial says so whether or not the entitlement row has caught up.
  // The webhook writes that row moments after the subscription exists, and in
  // the gap the screen used to read "Pro" beside its own "Trial ends 19 Aug".
  if (isGenuineTrial(entitlement, subscription)) return TRIAL_LABEL;
  if (source) return "Pro";
  return gateEnabled ? NO_ACCESS_LABEL : FULL_ACCESS_LABEL;
}

/**
 * ⚠️ WHAT SOMEBODY WITH NO ENTITLEMENT IS TOLD. TWO ANSWERS, ONE SWITCH.
 *
 * This was a single constant reading `"Pro"`, with a comment saying it was true
 * only because nothing gated on `entitlements` yet and that whoever wired the
 * gate had to change it IN THE SAME COMMIT. This is that commit.
 *
 * It cannot be one string, because the same state means two different things
 * either side of `BILLING_GATE_ENABLED`:
 *
 *   OFF — nothing gates, so an account with no entitlement row genuinely has
 *         the whole product. All ~90 real accounts are in this state today.
 *         Saying "Free" would be the app lying about what it is giving away.
 *   ON  — the same account is read-only. Saying "Pro" would be the app telling
 *         a locked-out user they are on the paid plan, on the one screen they
 *         went to in order to find out why they are locked out.
 *
 * So the switch that decides the gate decides the label, which is why it lives
 * in `lib/billing/gate.ts` and is threaded through rather than read twice.
 *
 * "Read only" and not "Free" or "Expired". It names what the account can
 * currently DO, which is the question somebody on this screen is asking, and it
 * is the same phrase the pop-up and the refusal message use.
 */
const FULL_ACCESS_LABEL = "Pro";
const NO_ACCESS_LABEL = "Read only";

/**
 * ⚠️ THE TWO COMP LABELS, WHICH MUST NEVER BE THE SAME STRING (D36).
 *
 * Named rather than inlined for one reason: the defect §3.6 records is that both
 * comp states returned ONE label, and a named pair is a thing a test can assert
 * differ. `manage.test.ts` does exactly that, so the defect cannot be rewritten
 * by somebody tidying two literals into one.
 *
 * `COMP_FOREVER_LABEL` is unchanged and always was correct for a founder. §3.6:
 * "A free-for-life comp keeps 'Complimentary', with no date and no expiry
 * language."
 *
 * `GRACE_LABEL` is the bare STATE, and the billing surface composes the date
 * onto it as "On us until {date}". It is deliberately two short words: Profile's
 * pill renders it as-is with no date and truncates past roughly 35 characters,
 * and "days on us" is the signed vocabulary the notice, the reminder and the
 * banner already use for this fortnight. It is never "trial" — that word is
 * D36's one absolute prohibition for anyone not on one — and never
 * "Complimentary", which is the whole defect.
 *
 * Neither is exported, like the two above, so no other surface can drift onto a
 * copy of them.
 */
const COMP_FOREVER_LABEL = "Complimentary";
const GRACE_LABEL = "On us";
const TRIAL_LABEL = "Free trial";

/**
 * ⚠️ IS THIS ACTUALLY A TRIAL? THE ONE QUESTION D36 TURNS ON.
 *
 * D36's governing rule is absolute: **the word "trial" never renders for anyone
 * who is not on one.** Three different states arrive at this screen carrying
 * Stripe's `trialing` status and only one of them is a trial:
 *
 *   a first-timer's seven days          a trial. The word is theirs.
 *   a save-offer courtesy period        NOT a trial. The offer buys free time by
 *                                       moving `trial_end`, which is why Stripe
 *                                       says `trialing` for a customer of two
 *                                       years. See `courtesyUntil` above.
 *   a grace-aligned subscription        NOT a trial. Somebody inside their beta
 *                                       fortnight with a paid plan waiting
 *                                       behind it. `01` starts it by setting
 *                                       `trial_end` to the grace end.
 *
 * ## ⚠️ IT IS EXPORTED BECAUSE THE LABEL IS NOT THE ONLY THING THAT ASKS
 *
 * Driven, and found only by driving: `/billing` rendered a **"Trial ends"** row
 * off `status === "trialing"` directly, so a mid-grace subscriber read
 *
 *     Access      Pro
 *     Starts      20 Aug 2026
 *     Trial ends  20 Aug 2026
 *
 * — the forbidden word, on a screen whose Access row had just been fixed to
 * avoid it, **and the same date twice under two labels**, which `renewalRow`
 * already carries its own correction for ("two rows, two labels, one date, read
 * as two different deadlines").
 *
 * The label branch and the row asked the same question two ways, and only one of
 * them had been taught the answer. So the question lives here, {@link
 * planLabelFor} uses it for its own branch, and the row asks the identical
 * function. They cannot drift, which is the whole lesson `CANCELLABLE_STATUSES`
 * is written up for one screen further down this file.
 */
export function isGenuineTrial(
  entitlement: PlanEntitlement | null,
  subscription: Pick<ManageableSubscription, "status" | "courtesyUntil"> | null,
): boolean {
  if (subscription?.status !== TRIALING) return false;
  // A courtesy period is free time on an existing plan, not a first trial.
  if (subscription.courtesyUntil) return false;
  // The beta fortnight is "14 days on us", and never the word below.
  if (isBetaGrace(entitlement)) return false;
  return true;
}

/**
 * ⚠️ IS THIS THE MID-GRACE SUBSCRIBER? §3.7's "two entitlements" cohort.
 *
 * Somebody inside their beta fortnight who has already set up a plan. `01`
 * starts it by setting `trial_end` to the grace end, so Stripe reports
 * `trialing` for the rest of the fortnight and the plan begins when it runs out.
 *
 * ## It is here rather than in the page, and that is property 3
 *
 * `/billing` may carry NO status literal. Every one it ever held became a defect:
 * a literal three on the mirror filter hid `paused` rows from the screen that
 * needed to describe them, and a literal on the courtesy read went stale the
 * moment a set moved. This module owns the status vocabulary — these are its
 * definitions rather than a duplicate of somebody else's — so the page asks a
 * question by name and never compares a string.
 *
 * Two callers on that page: the Access row, which must NOT append the grace date
 * for this cohort, and the `Starts` row, which states it instead. One question,
 * so the two renderings can never both carry the date or both drop it.
 */
export function isGraceAligned(
  entitlement: PlanEntitlement | null,
  subscription: Pick<ManageableSubscription, "status"> | null,
): boolean {
  return isBetaGrace(entitlement) && subscription?.status === TRIALING;
}

/**
 * Stripe's status for a subscription inside any free period, whatever that
 * period MEANS. Named because three different states arrive wearing it — see
 * {@link isGenuineTrial}, which is the function that tells them apart.
 */
const TRIALING = "trialing";

/**
 * A card that has failed and is being retried. Named for the same reason as
 * {@link TRIALING}: it is asked about in two different places for two different
 * reasons, and a bare literal in a condition is not searchable.
 */
const PAST_DUE = "past_due";

/**
 * ⚠️ IS THE CARD FAILING? The state D37's declined card describes.
 *
 * Asked by name so `/billing` carries no status literal (property 3), for the
 * same reason {@link isGraceAligned} exists. `past_due` is Stripe's word for "the
 * renewal was attempted and the card said no", and it is the ONLY state the
 * declined card renders for — an `unpaid` subscription has already exhausted the
 * retries and is a different surface.
 *
 * §3.9: this "cuts across all three" of Normal, cancelled-but-running and lapsed,
 * so it is asked independently of the cancel/resume question rather than folded
 * into {@link ManageAction}.
 */
export function isPastDue(
  subscription: Pick<ManageableSubscription, "status"> | null,
): boolean {
  return subscription?.status === PAST_DUE;
}

/**
 * A date for a human, in the user's own timezone.
 *
 * Takes the zone explicitly rather than reading the runtime's, because this is
 * rendered on a SERVER in whatever region Vercel chose and the date it prints is
 * the date somebody is deciding whether to be charged on.
 */
export function formatAccessDate(iso: string, tz: string): string {
  const when = new Date(Date.parse(iso));
  if (Number.isNaN(when.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(when);
}

/**
 * The same date with the YEAR DROPPED, for a control label.
 *
 * "Keep Trackd after 19 Aug" is a button, and a button is read at a glance. The
 * year is noise there: the date being named is inside the next twelve months by
 * construction (it is a trial end or a billing period end), so "2026" carries no
 * information and costs the label a third of its width on a 390px phone.
 *
 * Every place the date is the SUBJECT rather than a label — the confirm dialog,
 * the plan card, the sentence under the control — still uses the full form,
 * because that is where somebody is checking a date rather than reading a
 * button.
 *
 * Same timezone contract as `formatAccessDate`, and both are fed the same ISO
 * string, so the two forms cannot name different days.
 */
export function formatAccessDateShort(iso: string, tz: string): string {
  const when = new Date(Date.parse(iso));
  if (Number.isNaN(when.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: tz,
    day: "numeric",
    month: "short",
  }).format(when);
}
