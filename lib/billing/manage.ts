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

import type { EntitlementSource } from "./access";

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
  | { kind: "cancel"; endsOn: string; isTrial: boolean; accessEndsEarly: boolean }
  | { kind: "resume"; endsOn: string; isTrial: boolean; accessEndsEarly: boolean }
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
 * `source` comes from `entitlements`, never from the subscription. That ordering
 * matters: a user could hold a `comp` AND a lapsed Stripe row, and the thing
 * their access actually rests on is what the screen should describe.
 */
export function manageActionFor(
  source: EntitlementSource | null,
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

  const isTrial = subscription.status === "trialing";
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
  const accessEndsEarly =
    subscription.status === "past_due" ||
    (mirrorEnd !== null && endsOn !== null && endsOn !== mirrorEnd);

  return subscription.cancelAtPeriodEnd
    ? { kind: "resume", endsOn, isTrial, accessEndsEarly }
    : { kind: "cancel", endsOn, isTrial, accessEndsEarly };
}

/**
 * The earlier of two dates, either of which may be absent.
 *
 * Absent is not "zero" — it means "this source has nothing to say", so it never
 * wins. Unparseable is treated the same way rather than being allowed to
 * shorten a date to `NaN`.
 */
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
  source: EntitlementSource | null,
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
  if (source === "comp") return "Complimentary";

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
  if (subscription?.status === "trialing") return "Free trial";
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
