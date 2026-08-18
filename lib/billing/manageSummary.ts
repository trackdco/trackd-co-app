/**
 * ⚠️ `BETA_GRACE_DAYS` COMES FROM ITS OWN MODULE, WHICH IS `server-only`.
 *
 * That is fine and deliberate: this module is consumed by `/billing/manage`,
 * a Server Component, and never by a client bundle. Vitest resolves `server-only`
 * to a no-op stub, so the sentences stay unit-testable. The alternative — copying
 * the number 14 into this file — is the one thing the signed copy forbids
 * outright: "The 14 from BETA_GRACE_DAYS, never typed."
 */
import { BETA_GRACE_DAYS } from "./betaGrace";
import {
  STOPPABLE_NOW,
  isBetaGrace,
  isGenuineTrial,
  isGraceAligned,
  type ManageableSubscription,
  type PlanEntitlement,
} from "./manage";

/**
 * MANAGE'S ONE SENTENCE — what you're on, and when the next thing happens.
 *
 * `08-billing-screen.md` §3.3 opens the Manage sub-screen with "a one-sentence
 * plain-English summary of what they are on". This is that sentence, in a form
 * per state, signed 2026-08-18.
 *
 * ## ⚠️ D84 IS RE-DECIDED, AND THE NUMBER SURVIVES
 *
 * D84 read: "The signed sentence is that summary. No second 'what you're on' line
 * ships alongside it." It was resolved against the only sentence that existed at
 * the time — "Update your card or download receipts. Stripe handles both
 * securely." — which describes what the SCREEN DOES rather than what the user is
 * on, a different job that §3.3 itself flagged as a change of purpose.
 *
 * Adrian, 2026-08-18: D84's INTENT was one sentence rather than two, and these
 * per-state sentences are that one sentence. So the set below REPLACES §3.3's
 * line; Manage still carries exactly one summary. Nothing is lost by dropping the
 * replaced one — §3.4's handoff dialog already says "Stripe handles payments for
 * Trackd Co, so your card details never touch us", to the same person, one tap
 * later, at the moment it matters.
 *
 * ## ⚠️ EVERY SUBSTITUTION COMES FROM ITS SOURCE. NONE IS TYPED.
 *
 *   {price}     `formatPrice(amount, currency)` + the currency, so "$69.99 USD".
 *   {interval}  the PRICE'S OWN recurring interval. Never the literal "year" —
 *               a monthly subscriber reads "a month" because their price says so.
 *   {date}      formatted server-side in the user's stored timezone, by the
 *               caller. This module never formats or computes a date.
 *   14          {@link BETA_GRACE_DAYS}. Never typed, so the fortnight and the
 *               sentence describing it cannot disagree.
 *   {store}     from the entitlement source, so "the App Store" / "Google Play".
 *               Both are reachable: `google` is in the live `entitlement_source`
 *               enum.
 *
 * ## ⚠️ A SENTENCE WHOSE SUBSTITUTION IS MISSING DOES NOT RENDER
 *
 * Rule 0, and the same prescription the declined card follows: null means we do
 * not know, and an unknown may not become a word on a screen. A state that needs a
 * price and has none returns null rather than a sentence with a gap in it.
 * `loadPricesSafe` returns an empty list when Stripe is unconfigured, so this is
 * reachable rather than theoretical — though the states that name a price cannot
 * exist without Stripe either, so in practice the two absences arrive together.
 */

/** ⚠️ THE STATE, resolved once, so twelve sentences cannot overlap. */
export type SummaryState =
  | "app-store"
  | "cancelled-paid"
  | "cancelled-never-charged"
  | "past-due"
  | "comp-forever-paying"
  | "comp-forever"
  | "grace-aligned"
  | "beta-grace"
  | "courtesy"
  | "trial"
  | "paying"
  | "suspended"
  | "lapsed"
  /**
   * ⚠️ THE SETTLED DISPUTE (2.4). Access revoked AND the subscription cancelled,
   * which since 2.1 is what a dispute leaves behind once the cancel lands.
   *
   * Its own state rather than a variant of `suspended`, because the two say
   * OPPOSITE things about the money: one says the plan is still active, the other
   * says it was cancelled. A single sentence with a conditional clause would be
   * one sentence that is false half the time.
   */
  | "dispute-cancelled"
  /** ⚠️ NO SENTENCE. See {@link manageSummaryFor} — R5(b), withheld deliberately. */
  | "withheld";

export interface SummaryFacts {
  entitlement: PlanEntitlement | null;
  subscription:
    | (Pick<ManageableSubscription, "status" | "courtesyUntil"> & {
        cancelAtPeriodEnd?: boolean;
      })
    | null;
  /** `manageActionFor`'s answer, so this cannot disagree with the controls. */
  actionKind: "cancel" | "resume" | "store" | "none" | "unavailable";
  /**
   * ⚠️ 04 §3.2's OWN predicate, threaded in rather than re-derived.
   *
   * `CancelSubscription` renders `won't be charged${noun === "subscription" ? "
   * again" : ""}` from `noun = isTrial ? "trial" : "subscription"`, and its
   * `isTrial` prop is fed `action.namesATrial`. Passing the same value here is
   * what stops the two surfaces describing one cancellation two ways.
   *
   * ⚠️ IT IS AN APPROXIMATION AND THE APPROXIMATION IS REPORTED, NOT HIDDEN. See
   * the note in {@link manageSummaryFor}.
   */
  namesATrial: boolean;
  /** All pre-formatted, server-side, in the user's stored timezone. */
  endsOn: string | null;
  graceEndsOn: string | null;
  courtesyEndsOn: string | null;
  /** "$69.99 USD", from the Stripe price. Null when prices are unavailable. */
  price: string | null;
  /** "year" / "month" / "week" — the price's own recurring interval. */
  interval: string | null;
  gateEnabled: boolean;
  /**
   * ⚠️ DOES THIS PERSON HOLD ACCESS RIGHT NOW (1.3).
   *
   * ## The two questions `accessEndsEarly` was answering
   *
   * It asks "will anything renew on this date", which is a question about the
   * DATES and the subscription's status. Two readers took it:
   *
   *   `/billing`'s "Renews on" vs "Ends on" verb genuinely wants that question.
   *   It is a claim about what happens next, it has to be true, and
   *   `accessEndsEarly` answers it correctly. **That reader is not changed.**
   *
   *   This file's sentence selection wants a DIFFERENT fact — does this person
   *   hold access right now — and asking the date question instead is why the
   *   signed `suspended` sentence could never fire. On a real revocation
   *   `sync.ts:339` and `sync.ts:399` write both dates from the same
   *   `entitledUntil(sub)` call and `revokeForCustomer` leaves `active_until`
   *   alone, so the dates are EQUAL and the date question always answers "no".
   *
   * So the predicate is split rather than the branch reordered. Both facts come
   * from `entitlements`, which is the table that DECIDES access — not from a
   * coincidence between two writers.
   */
  accessLive: boolean;
  /**
   * ⚠️ A PRO ROW SOMEBODY TURNED OFF. A decision, not an absence, and the only
   * thing that distinguishes a revoked account from one that simply lapsed —
   * they are otherwise identical in every field this file can see.
   */
  accessRevoked: boolean;
}

/**
 * WHICH STATE, in the order they outrank each other.
 *
 * ⚠️ THE PRECEDENCE IS A STANDING RULING (Adrian, 2026-08-18) AND IT LIVES HERE
 * RATHER THAN ONLY IN A REPORT:
 *
 *   **`store` outranks everything.** Nothing in this app can act on an App Store
 *   subscription, so no sentence about renewals or cancellation could be acted on.
 *
 *   **Cancelled outranks past-due and courtesy.** It is the user's own later
 *   decision, and "won't be charged again" is the promise Standing Law 1 protects.
 *   Telling somebody who has just cancelled about their next charge would be the
 *   screen arguing with them.
 *
 * Everything below that is mutually exclusive by construction rather than by
 * ordering — `isGenuineTrial` is false whenever courtesy or grace is true, and a
 * comp cannot be a stripe entitlement.
 */
export function summaryStateFor(f: SummaryFacts): SummaryState {
  /**
   * ⚠️ R5(b): `paused`, `unpaid` AND `incomplete` GET NO SENTENCE, DELIBERATELY.
   *
   * No signed sentence describes them, and stretching a neighbouring one onto a
   * subscription in a state nobody wrote copy for is the screen inventing a state.
   * D83's approved support line is what they get on Billing, and it already says
   * the true thing. A withhold, never a reworded neighbour.
   *
   * ## ⚠️ AND `actionKind === "unavailable"` DOES NOT IDENTIFY THEM. DRIVEN.
   *
   * That was the first version of this gate and it was wrong, in the direction
   * that renders a sentence rather than withholding one. **D80 changed what
   * `paused` and `unpaid` produce**: they are stoppable immediately, so
   * `manageActionFor` now returns `cancel` for them, and only `incomplete` and the
   * dead statuses still return `unavailable`.
   *
   * So a `paused` account fell all the way through to `paying` and read **"You're
   * on your Pro plan at $69.99 USD a year, and it renews on 17 Sept 2026"** — on
   * an account that is charging nobody and renewing nothing. Found by driving,
   * and found only because the log printed the sentence beside a green
   * "no sentence appears" tick: the assertion compared against a FIXED date, so
   * the same sentence with a different date slipped past it.
   *
   * The status is asked directly, through {@link STOPPABLE_NOW} rather than a
   * fresh list, so this cannot drift from the set that decides which Stripe call
   * the control makes.
   */
  if (f.actionKind === "unavailable" || STOPPABLE_NOW.has(f.subscription?.status ?? "")) {
    return "withheld";
  }
  if (f.actionKind === "store") return "app-store";

  const comp = f.entitlement?.source === "comp";
  const compForever = comp && (f.entitlement?.activeUntil ?? null) === null;
  const cancelled = f.actionKind === "resume";

  if (cancelled) {
    return f.namesATrial ? "cancelled-never-charged" : "cancelled-paid";
  }
  if (f.subscription?.status === "past_due") return "past-due";

  /**
   * ⚠️ R5(a): FREE FOR LIFE **WHILE STRIPE IS CHARGING**, which is its own
   * sentence because the ordinary one would be false.
   *
   * `access.ts` tiers a no-expiry comp above a `stripe` entitlement, so this
   * cohort labels as Complimentary while a live subscription bills them —
   * `page.tsx` records two cold reviews driving exactly that. "There's nothing to
   * pay and nothing to renew" told to somebody being charged $69.99 a year is the
   * kind of false statement Standing Law 1 exists for, so it is not stretched
   * onto them.
   */
  if (compForever) {
    return f.actionKind === "cancel" ? "comp-forever-paying" : "comp-forever";
  }
  if (isGraceAligned(f.entitlement, f.subscription)) return "grace-aligned";
  if (isBetaGrace(f.entitlement)) return "beta-grace";
  if (f.subscription?.courtesyUntil) return "courtesy";
  if (isGenuineTrial(f.entitlement, f.subscription)) return "trial";

  /**
   * ⚠️ SUSPENDED: ACCESS REVOKED WHILE THE SUBSCRIPTION IS STILL BILLING.
   *
   * The PAYING sentence is the only one in the set that claims a RENEWAL — "and
   * it renews on {date}" — and `accessEndsEarly` is `manageActionFor` saying that
   * date is when access STOPS. Rendering it anyway put two verbs on one account:
   *
   *     /billing         Ends on 17 Sept 2026
   *     /billing/manage  ...and it renews on 17 Sept 2026.
   *
   * ⚠️ THE STATE IS REAL AND IS NOT `past_due`, SO D37'S SENTENCE DOES NOT COVER
   * IT. `revokeForCustomer` writes `is_active: false` and leaves `active_until`
   * standing (sync.ts:1112-1117), and a dispute does not cancel the Stripe
   * subscription — so a disputed customer holds a revoked entitlement beside an
   * `active`, still-billing subscription.
   *
   * ## ⚠️ AND UNTIL 18 AUG 2026 THIS BRANCH COULD NOT FIRE AT ALL (1.4)
   *
   * It keyed on `accessEndsEarly`, whose date half is "the entitlement's date and
   * the mirror's disagree". **They never disagree on a revocation.**
   * `sync.ts:339` writes `subscriptions.current_period_end` from
   * `entitledUntil(sub)`; `sync.ts:399` writes `entitlements.active_until` from
   * the SAME call on the SAME object; and the revoke touches neither. The two
   * dates are equal by construction, so the condition was a coincidence between
   * two writers that never happens.
   *
   * Found by three independent reviewers — one by reading, one by measuring, one
   * by driving with a control — and measured on a real revoked account:
   *
   *     gate off  "You're on your Pro plan at $11.99 USD a month, and it renews
   *                on 18 Sept 2026."
   *     gate on   "You're not on a plan at the moment, so Trackd Co is read only."
   *
   * Both to a customer Stripe will invoice on schedule.
   *
   * So it keys on the REVOCATION FLAG, which is the fact it is actually about and
   * does not depend on a coincidence. Three conditions, each load-bearing:
   *
   *   `accessRevoked`   a pro row somebody TURNED OFF. Without it a merely lapsed
   *                     account — same null entitlement, same absent access —
   *                     would read a dispute sentence about a dispute that never
   *                     happened.
   *   `!accessLive`     they hold nothing NOW. Without it, somebody whose beta
   *                     comp was withdrawn and who then subscribed reads
   *                     "suspended" while perfectly entitled: `accessRevoked` is
   *                     true of that account forever.
   *   `actionKind === "cancel"`  there is a live, unflagged subscription. Without
   *                     it the second half of the sentence — "your Pro plan is
   *                     still active" — is asserted about somebody who has no
   *                     subscription at all. `resume`, `store`, `unavailable` and
   *                     the stoppable statuses have all returned above; `none`
   *                     (no subscription) had not, and would have fallen in here.
   *
   * The precedence is UNCHANGED and the branch has not moved: it still sits below
   * `past-due` so D37's signed sentence keeps its own cohort.
   *
   * It was WITHHELD from 18 Aug until the founder signed a sentence for it the
   * same day. ⚠️ The `past-due` sentence must still never be stretched onto it —
   * that would put two sentences on one state, which is the defect a vacuous pass
   * has already cost — and the branch stays BELOW `past-due` so D37's signed
   * sentence keeps its own cohort. `past_due` also sets `accessEndsEarly`, so
   * ordering is the only thing separating them.
   *
   * ## ⚠️ ONE NARROW WINDOW WHERE THE WORD "dispute" IS NOT YET TRUE
   *
   * The same shape arrives for seconds after a successful renewal, between
   * `customer.subscription.updated` rolling the mirror forward and `invoice.paid`
   * extending the entitlement. A customer who opens Manage inside that window
   * reads "dispute" when there is none. It is bounded by webhook delivery, needs
   * the screen opened inside it, and the alternative — withholding for everybody
   * so the transient case is never wrong — leaves a genuinely disputed customer
   * with no explanation at all for as long as the dispute lasts. Recorded rather
   * than traded, and the scoping is the founder's (2026-08-18).
   */
  if (f.accessRevoked && !f.accessLive && f.actionKind === "cancel") return "suspended";

  /**
   * ⚠️ THE SAME REVOCATION, ONCE THE CANCEL HAS LANDED (2.4).
   *
   * Two sentences, two states, selected on whether the subscription is LIVE or
   * CANCELLED — which is the only thing that differs between them and the only
   * thing they disagree about.
   *
   *   live       "...and your Pro plan at {price} a {interval} is still active."
   *   cancelled  "Your subscription was cancelled because a payment was disputed"
   *
   * `actionKind === "none"` is the cancelled shape and not a guess: `canceled` is
   * absent from `BILLABLE_STATUSES`, so `screenFacts` filters the mirror row out
   * entirely, `manageActionFor` receives `null` and answers `{kind: "none"}`.
   * Before this branch existed that cohort fell to the bottom and read "You're not
   * on a plan at the moment", which is true of the access and says nothing about
   * why — on the one screen where the reason is the whole point.
   *
   * ⚠️ `accessRevoked` IS THE STRIPE ROW ALONE, which is what makes this safe to
   * key on `none`. A withdrawn comp with no subscription has the identical shape
   * in every other field, and telling that person their subscription was
   * cancelled over a payment dispute would be inventing an event.
   */
  if (f.accessRevoked && !f.accessLive && f.actionKind === "none") return "dispute-cancelled";

  /**
   * ⚠️ A LIVE SUBSCRIPTION WITH NO LIVE ACCESS, AND NOBODY REVOKED ANYTHING.
   * WITHHELD, which is the founder's own standing ruling for this cohort.
   *
   * Reached when the entitlement's date has passed while the mirror still shows a
   * live, unflagged subscription. Two ways in:
   *
   *   the `invoice.paid` lag after a renewal — `customer.subscription.updated`
   *   rolls the mirror forward before `invoice.paid` extends the entitlement.
   *   Seconds to minutes, and the state Spec 08's P2 cohort seeds.
   *
   *   a webhook that never landed, which is `11`'s live-subscription-without-
   *   entitlement alert and a real, durable state.
   *
   * ⚠️ IT MUST NOT FALL THROUGH TO `paying`, WHICH IS WHAT IT DID BETWEEN THE
   * DATE-KEYED BRANCH AND 1.4. The paying sentence reads "and it renews on
   * {date}", and `endsOn` here is `soonerOf(entitlement, mirror)` — the
   * entitlement's date, which has ALREADY PASSED. Driven: Manage read "your Pro
   * plan at $69.99 USD a year, and it renews on 15 Aug 2026" while Billing read
   * "Ends on 15 Aug 2026". One account, one date, two verbs, and the verb that
   * claims a renewal names a day in the past.
   *
   * ⚠️ AND IT MUST NOT TAKE THE `suspended` SENTENCE EITHER, which is what it did
   * BEFORE 1.4 — the date-keyed branch caught this cohort and told them a payment
   * dispute was being looked into when nothing had been disputed. That was
   * recorded at the time as a known narrow-window wrong answer. Keying on the
   * revocation flag removes it: `suspended` is now about a decision somebody
   * made, and nobody made one here.
   *
   * No signed sentence names this state, so it gets none. A withhold, never a
   * reworded neighbour — the same rule R5(b) applies to `paused` and `unpaid`.
   *
   * ⚠️ An unreadable entitlement read arrives here too, and correctly: `accessLive`
   * is false when we could not ask, and a screen that cannot read the deciding
   * table must not assert a renewal.
   */
  if (!f.accessLive && f.actionKind === "cancel") return "withheld";

  if (f.entitlement) return "paying";
  return f.gateEnabled ? "lapsed" : "paying";
}

/**
 * THE SENTENCE, or null when it cannot be stated truthfully.
 *
 * ## ⚠️ A KNOWN WRONG ANSWER, REPORTED RATHER THAN PAPERED OVER
 *
 * The cancelled pair keys on `namesATrial`, which is 04 §3.2's own predicate —
 * threaded in rather than re-derived, exactly so the dialog and this sentence
 * cannot drift. **It is not actually "paid at least once", and for one cohort it
 * is wrong:** a GRACE-ALIGNED subscriber who cancels has `namesATrial === false`,
 * so both surfaces say "won't be charged **again**" to somebody who has never been
 * charged at all.
 *
 * It is a claim about history rather than about money — nobody is charged after
 * being told they would not be — but it is false, and it is recorded here rather
 * than left for a cold review to find. The codebase has no true "has this account
 * ever paid" predicate; building one is a decision, not an implementation, and
 * both surfaces are wrong together rather than differently, which is the property
 * that was actually asked for.
 */
export function manageSummaryFor(f: SummaryFacts): string | null {
  const state = summaryStateFor(f);
  const price = f.price;
  const per = f.interval;
  /** A price sentence needs both halves or it does not render. Rule 0. */
  const amount = price && per ? `${price} a ${per}` : null;

  switch (state) {
    case "withheld":
      return null;

    case "app-store": {
      const store =
        f.entitlement?.source === "apple"
          ? "the App Store"
          : f.entitlement?.source === "google"
            ? "Google Play"
            : null;
      if (!store) return null;
      return `Your subscription is managed through ${store}, so you'll need to change or cancel it there.`;
    }

    case "cancelled-paid":
      if (!f.endsOn) return null;
      return `You've cancelled, so you keep your Pro plan until ${f.endsOn} and won't be charged again.`;

    case "cancelled-never-charged":
      if (!f.endsOn) return null;
      return `You've cancelled, so you keep your Pro plan until ${f.endsOn} and won't be charged.`;

    case "past-due":
      if (!f.endsOn) return null;
      return `Your last payment didn't go through, so your Pro plan runs until ${f.endsOn} and your account goes read only after that until a payment goes through.`;

    case "comp-forever-paying":
      if (!amount) return null;
      return `You have free access for life, so your Pro plan at ${amount} adds nothing, and cancelling it won't change what you can do.`;

    case "comp-forever":
      return "You have free access for life, so there's nothing to pay and nothing to renew.";

    case "grace-aligned":
      if (!f.graceEndsOn || !amount) return null;
      return `You've got ${BETA_GRACE_DAYS} days on us until ${f.graceEndsOn}, and then your Pro plan starts at ${amount}.`;

    case "beta-grace":
      if (!f.graceEndsOn) return null;
      return `You've got ${BETA_GRACE_DAYS} days on us until ${f.graceEndsOn}, and you'll need a plan after that to keep adding.`;

    case "courtesy":
      if (!f.courtesyEndsOn || !amount) return null;
      return `Your Pro plan is free until ${f.courtesyEndsOn}, and then it's ${amount}.`;

    case "trial":
      if (!f.endsOn || !amount) return null;
      return `You're on a free trial of your Pro plan until ${f.endsOn}, and then it's ${amount}.`;

    case "paying":
      if (!f.endsOn || !amount) return null;
      return `You're on your Pro plan at ${amount}, and it renews on ${f.endsOn}.`;

    /**
     * ⚠️ SIGNED 2026-08-18. Character for character, no em dash.
     *
     * It names BOTH halves because either alone is a lie: the access is gone AND
     * the money is still moving. It promises no resolution and no timeframe,
     * because neither is ours to promise.
     *
     * "Suspended" is a NEW word, deliberately. Not "read only" — they did not
     * lapse, and that phrase belongs to an account with no entitlement at all.
     * Not "cancelled" — they did not cancel, and nothing has stopped.
     */
    case "suspended":
      if (!amount) return null;
      return `Your access has been suspended while we look into a payment dispute, and your Pro plan at ${amount} is still active.`;

    /**
     * ⚠️ SIGNED 18 AUG 2026. Character for character, no em dash.
     *
     * It names no price and no date deliberately: the subscription is gone, so
     * there is no amount that is still true and no date anything happens on. The
     * support address is the route for "that wasn't me", and the plan list is the
     * route for "it was, and I still want this".
     *
     * ⚠️ THEY MAY RESUBSCRIBE FREELY. Founder ruling: no approval flow and no
     * email gate. A dispute is often a stolen card, a forgotten charge, or a bank
     * acting automatically — the person is frequently not hostile, and a second
     * dispute is a dashboard problem rather than a feature.
     */
    case "dispute-cancelled":
      return (
        "Your subscription was cancelled because a payment was disputed with your bank. " +
        "Email support@trackdco.app if that wasn't you, or choose a plan below whenever you're ready."
      );

    case "lapsed":
      return "You're not on a plan at the moment, so Trackd Co is read only.";
  }
}
