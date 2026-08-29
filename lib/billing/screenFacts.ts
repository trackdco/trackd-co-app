import "server-only";

import { entitlementFacts } from "@/lib/billing/entitlements";
import { BILLABLE_STATUSES } from "@/lib/billing/cancel";
import { courtesyUntilFor } from "@/lib/billing/courtesy";
import { declinedOnFor } from "@/lib/billing/declined";
import { billingGateEnabled } from "@/lib/billing/gate";
import {
  CANCELLABLE_STATUSES,
  courtesyIsRunning,
  isBetaGrace,
  isGraceAligned,
  isPastDue,
  manageActionFor,
  type ManageableSubscription,
  type PlanEntitlement,
} from "@/lib/billing/manage";
import { openOfferFor, type RestorableOffer } from "@/lib/billing/openOffer";
import { loadPricesSafe } from "@/lib/billing/prices";
import { createClient } from "@/lib/supabase/server";

/**
 * EVERYTHING BOTH BILLING SCREENS READ, RESOLVED ONCE.
 *
 * ## ⚠️ IT IS ONE FUNCTION BECAUSE TWO SCREENS DESCRIBE ONE SUBSCRIPTION
 *
 * `/billing` and `/billing/manage` are the same subject one tap apart. If they
 * resolved their own facts they could pick DIFFERENT rows for the same user — and
 * that is not hypothetical, it is the $69.99 defect exactly: a cancelled trial
 * sorts ahead of an active yearly, so the screen that picked by ordering described
 * the trial while the yearly went on billing. Two screens picking independently is
 * that defect with a second chance to happen.
 *
 * So the reads, the row selection and every derived value live here, and both
 * pages render what this returns. The four properties five commits put into
 * `page.tsx` moved with the code they belong to, comment for comment.
 *
 * ⚠️ NOTHING HERE DECIDES ACCESS. `entitlements` does, via `currentEntitlement`
 * and `hasProAccess`. The mirror supplies dates for display and gates nothing.
 */
export interface BillingFacts {
  tz: string;
  entitlement: PlanEntitlement | null;
  subscription: ManageableSubscription | null;
  action: ReturnType<typeof manageActionFor>;
  entitlementEnd: string | null;
  /**
   * ⚠️ DOES THIS PERSON HOLD ACCESS RIGHT NOW, AND DO WE KNOW?
   *
   * The app carried a DATE for when access ends and never carried whether access
   * is LIVE, so three surfaces reconstructed it from the date and got it wrong.
   * The worst of them: a REVOKED account read "Access: Read only" with "Your
   * account stays as it is until 17 Sept 2026" two rows above it, because
   * `entitlementEnd` includes dead rows by design and nothing said the row was
   * dead.
   *
   * `accessKnown` is false when the entitlement read FAILED. It is not "they have
   * nothing" and no surface may spend it as though it were — the same distinction
   * `subscriptionsKnown` makes below, for the same reason.
   */
  accessLive: boolean;
  accessKnown: boolean;
  /**
   * ⚠️ A PRO ROW SOMEBODY TURNED OFF. The fact `suspended` keys on.
   *
   * Not derived from the two dates disagreeing: `sync.ts:339` and `sync.ts:399`
   * both write from `entitledUntil(sub)` and `revokeForCustomer` leaves
   * `active_until` alone, so on a real revocation the dates are EQUAL and a date
   * comparison always answers no.
   */
  accessRevoked: boolean;
  /**
   * ⚠️ WHY it was revoked (D101 / Q106). `unknown` when we could not ask, when
   * `005` is unapplied, or when the row predates it — and NEVER treated as
   * `dispute`, because that default would tell a refunded customer their bank
   * disputed a payment.
   */
  accessRevokedReason: "dispute" | "refund" | "unknown";
  declinedOn: string | null;
  /**
   * ⚠️ THE COURTESY PERIOD'S END, ONLY WHILE IT IS STILL RUNNING (Group C).
   *
   * `subscription.courtesyUntil` above is the RAW marker and stays raw: it is
   * written once when the save offer is granted, never cleared — deliberately,
   * because reconciliation asks "did this account ever get one" and the answer
   * has to survive — and `planLabelFor` / `isGenuineTrial` both need that
   * "did it happen" reading to keep D36's prohibited word away from a customer of
   * two years whom Stripe reports as `trialing`.
   *
   * This is the OTHER question, "is it happening now", and it is resolved once
   * here so `/billing`'s "Free until" row and `/billing/manage`'s courtesy
   * sentence read ONE value. Both rendered on mere presence before, and a
   * customer who took the free week and was then charged read "Free until 10 Aug
   * 2026" beside "Renews on 17 Aug 2026" on one card.
   */
  courtesyRunningUntil: string | null;
  /**
   * ⚠️ A SAVE OFFER THAT WAS SHOWN, NOT CLAIMED, AND IS STILL INSIDE ITS TEN
   * MINUTES (Group E).
   *
   * The offer burns on being SHOWN, and `openOfferStore` remembers a dismissed one
   * in `sessionStorage` — which dies with the tab. So somebody whose phone died at
   * that dialog came back to a bare Resume control with their free week already
   * spent, never having seen it. Closing a tab is ordinary behaviour, not an edge
   * case.
   *
   * Null for everybody else, and null is the overwhelming majority: see the
   * gating at the call site, which is what stops this being a Stripe read on every
   * billing page load.
   */
  openOffer: RestorableOffer | null;
  hasStripeCustomer: boolean;
  price: { amount: number; currency: string; interval: string } | undefined;
  planStartsOn: string | null;
  showSubscribeRow: boolean;
  gateEnabled: boolean;
  liveRowCount: number;
}

export async function loadBillingFacts(userId: string): Promise<BillingFacts> {
  const supabase = await createClient();
  const [
    { data: profile },
    /**
     * ⚠️ THE ERROR IS DESTRUCTURED, AND RULE 0 IS WHY.
     *
     * `subs` is `null` both when the user genuinely has no subscription and when
     * the read FAILED, and those are not the same fact. Everything below that
     * merely DESCRIBES a subscription may safely treat them alike — it renders
     * less. The subscribe row may not: it is offered on "this account has no
     * subscription", and a failed read defaulting to that answer would offer a
     * second billable subscription to somebody who already has one, straight
     * through the one-subscription invariant `startTrial`'s lease exists to hold.
     *
     * `?? []` feeding a decision is the signature defect. The shape here is
     * `compEntitlement`'s: ask whether the read WORKED, and withhold when it did
     * not. See `subscriptionsKnown` below.
     */
    { data: subs, error: subsError },
    { data: customer },
    /**
     * ⚠️ THE WIDENED READ. It says whether it worked, so nothing below can spend
     * "could not read entitlements" as "not on a plan".
     */
    access,
  ] = await Promise.all([
      supabase.from("profiles").select("timezone").eq("id", userId).maybeSingle(),
      // ⚠️ FILTERED AND ORDERED THE SAME WAY THE ACTION DECIDES.
      //
      // This had NO status filter and ordered by `updated_at`, while the action
      // filtered to live statuses. A cold review put a dead `incomplete_expired`
      // row (which `startTrial` creates when it cancels an abandoned attempt)
      // beside a live trial: the page rendered "This one can't be changed from
      // here. Email support@trackdco.app" and offered no cancel control, for a
      // user whose trial Stripe said was perfectly live and about to bill.
      //
      // Soonest-ending first, so an imminent charge is what the screen shows.
      /**
       * ⚠️ EVERY LIVE ROW, NOT `limit(1)`. This is the DISPLAY half of the
       * $69.99 defect, and it survived the fix to the action half.
       *
       * Driven by a cold review: a user with a `trialing` monthly (cancelled) and
       * an `active` yearly running to 2027 read
       *
       *     Access   Free trial
       *     Price    $11.99 USD / month
       *     ...nothing more will be charged
       *
       * with **zero cancel controls on the page**, because `manageActionFor`
       * received the trial's `cancelAtPeriodEnd: true` and rendered the resume
       * card. The yearly underneath had `cancel_at_period_end: false` and no exit
       * from inside the app at all.
       *
       * `limit(1)` cannot describe two subscriptions, and the ONE it picks is the
       * soonest-ending — which is precisely the one that matters least when
       * another is still billing. So all live rows are read and the one the
       * screen is ABOUT is chosen below, with the rest counted rather than
       * silently dropped.
       *
       * ⚠️ AND THE FILTER IS `BILLABLE_STATUSES`, WHICH IS THE RIGHT QUESTION.
       *
       * It read a literal three — `trialing`, `active`, `past_due` — so a
       * `paused`, `unpaid` or `incomplete` row never reached `manageActionFor`
       * at all. That function then saw `null`, answered `{kind: "none"}`, and the
       * support line's condition needs `no-subscription`, so a comp with a paused
       * subscription got no control AND no signpost: the entire screen was
       * "Access Complimentary / Payment method and invoices / Back to profile".
       *
       * `BILLABLE_STATUSES` asks "what could still take this person's money?",
       * which is the question a screen offering an exit should be asking. The
       * narrower "what may they press a button on?" is `CANCELLABLE_STATUSES`,
       * and it is applied BELOW, when choosing which row the screen describes —
       * not here, where it silently drops rows the user needs to know about.
       */
      supabase
        .from("subscriptions")
        .select(
          "status, trial_ends_at, current_period_end, cancel_at_period_end, stripe_price_id",
        )
        .eq("user_id", userId)
        .in("status", [...BILLABLE_STATUSES])
        .order("current_period_end", { ascending: true }),
      // Whether there is anything for the Stripe portal to open onto. A user can
      // legitimately have a customer row and no live subscription (they
      // cancelled and it lapsed), and their invoices are still theirs to read.
      supabase
        .from("billing_customers")
        .select("stripe_customer_id")
        .eq("user_id", userId)
        .maybeSingle(),
      entitlementFacts(),
    ]);
  const hasStripeCustomer = Boolean(customer?.stripe_customer_id);
  /**
   * ⚠️ `entitlement` IS NULL IN BOTH DIRECTIONS AND THAT IS DELIBERATE — it is a
   * DISPLAY value, and displaying nothing is right whether the row is absent or
   * unreadable. What may not collapse is the DECISIONS, and those read
   * `accessKnown` beside it rather than inferring from this null.
   */
  const entitlement = access.known ? access.entitlement : null;

  const tz = (profile?.timezone as string | null) || "Australia/Sydney";

  /**
   * ⚠️ THE ROW THE SCREEN IS ABOUT IS THE ONE THAT WILL STILL CHARGE.
   *
   * Ordering by `current_period_end` and taking the first picks the SOONEST
   * ending, which is exactly the wrong one when another subscription is still
   * billing: a cancelled trial ending next week sorts ahead of an active yearly
   * running to 2027, so the screen described the trial, rendered the resume card
   * from its `cancel_at_period_end: true`, and left the yearly with **no exit
   * from inside the app**. That is the display half of the $69.99 defect.
   *
   * So: prefer a row that is still going to bill. Among those, soonest-ending, so
   * an imminent charge is what is described. If everything is already cancelled
   * the old ordering is correct and unchanged.
   *
   * A user should only ever have one live subscription — `startTrial`'s lease and
   * the reconcile both exist to guarantee it — so more than one is an anomaly and
   * is logged as one rather than quietly rendered.
   */
  const liveRows = subs ?? [];
  /**
   * ⚠️ "STILL GOING TO CHARGE" IS NOT THE SAME AS "NOT FLAGGED", and the first
   * version of this conflated them.
   *
   * A `paused` subscription carries `cancel_at_period_end: false` and is charging
   * nobody, so a bare `!cancel_at_period_end` filter ranked it ABOVE a cancelled
   * `active` yearly — describing the screen with the one that cannot be acted on
   * and hiding the resume card for the one that can.
   *
   * Three questions in order, which is the order they matter in:
   *
   *   1. something the user can act on that WILL still take money  -> cancel
   *   2. something the user can act on that is already stopped     -> resume
   *   3. anything else still live (paused, unpaid, incomplete)     -> unavailable,
   *      which is what renders D83's support line
   *
   * Tier 3 is the one 2.4 was about: those rows used to be filtered out entirely,
   * so `manageActionFor` saw `null`, returned `{kind: "none"}`, and a comp with a
   * paused subscription got no control AND no support line — the whole screen was
   * "Access Complimentary / Payment method and invoices / Back to profile".
   */
  const actionable = liveRows.filter((r) => CANCELLABLE_STATUSES.has(r.status));
  const row =
    actionable.find((r) => !r.cancel_at_period_end) ?? actionable[0] ?? liveRows[0];
  if (liveRows.length > 1) {
    console.error(
      `[billing] ${userId} has ${liveRows.length} live subscription rows (${liveRows
        .map((r) => `${r.status}${r.cancel_at_period_end ? " cancelled" : ""}`)
        .join(", ")}); the screen describes the one still billing`,
    );
  }

  /**
   * ⚠️ READ IN ITS OWN QUERY, and its failure is swallowed.
   *
   * `courtesy_until` arrives with `supabase/billing/003`, **which was applied on
   * 16 August** (probe: `select courtesy_until` returns an empty set, not
   * `42703`). The separate query STAYS regardless: folding it into the select
   * above would mean an unapplied migration
   * takes down the WHOLE billing screen -- PostgREST rejects the entire request
   * for one unknown column -- so somebody trying to see what they are paying
   * would get nothing at all.
   *
   * Exactly the shape `notifications/004` uses for the same reason, and the same
   * lesson `trialLease.ts` paid for: the deploy and the migration do not land in
   * the same instant, and the code has to be correct in the gap.
   *
   * The tolerance is not hypothetical and is not removed now that 003 is applied:
   * a deploy and a migration do not land in the same instant, and this shape is
   * what makes the code correct in the gap. Where the column cannot be read this
   * is null and the label falls back to today's behaviour.
   *
   * ⚠️ THE QUERY MOVED TO `lib/billing/courtesy.ts` AND DID NOT CHANGE. It was a
   * private helper at the foot of this file; Profile now needs the same value,
   * for the same label, and was passing none at all — so a courtesy customer read
   * "Free trial" there while this screen read "Pro". One function, two callers,
   * rather than a copy that can drift. Every property above is preserved
   * verbatim: its own query, its own `try`, the named status set, and a `null`
   * that can only ever change one word on the screen.
   */
  const courtesyUntil = await courtesyUntilFor(userId);
  const subscription = row
    ? {
        status: row.status as string,
        trialEndsAt: (row.trial_ends_at as string | null) ?? null,
        currentPeriodEnd: (row.current_period_end as string | null) ?? null,
        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
        courtesyUntil,
      }
    : null;

  // The entitlement's own end date goes in as well: it is the table that
  // DECIDES access, and where it and the mirror disagree the screen must state
  // the earlier of the two. See `manageActionFor` — a `past_due` user was being
  // promised twenty-seven days past the day they actually go read only.
  /**
   * ⚠️ THE DATE COMES FROM A READ THAT INCLUDES DEAD ENTITLEMENTS; THE SOURCE
   * DOES NOT. Two questions, two reads, deliberately.
   *
   * `currentEntitlement` filters to rows active RIGHT NOW, which is right for
   * "what is this person ON" — a revoked comp must not be labelled
   * Complimentary. It is wrong for "when does their access end", because an
   * expired or revoked row answered `null` and `soonerOf` then fell back to the
   * mirror: the guard stopped applying at exactly the moment the two dates
   * disagree most. Measured at 365 days of over-promised access on a yearly whose
   * entitlement had been clawed back to 14 Aug.
   */
  /**
   * Read ONCE and used twice: `manageActionFor` needs it to shorten an
   * over-promising date, and the declined card needs it as the date access
   * actually ends. `entitlementEndDate` is request-`cache()`d, so this is one
   * query either way — naming it makes the two uses visible instead of implying
   * they are separate reads that could drift.
   */
  /**
   * ⚠️ THIS NULL MEANS TWO THINGS, AND A CONSUMER MAKING AN ACCESS CLAIM MUST
   * ASK WHICH.
   *
   *   no dated row   a free-for-life comp, or no rows. `soonerOf` correctly
   *                  treats it as "this source has nothing to say" and the
   *                  mirror supplies the date.
   *   unreadable     we could not ask. The mirror substituting here is the
   *                  screen sourcing an ACCESS promise from the SUBSCRIPTION
   *                  table, which does not decide access.
   *
   * `manageActionFor` cannot tell them apart and does not need to — `endsOn` is
   * a SUBSCRIPTION fact, and the "Renews on" row and the cancel control are
   * right to use it either way. What may not spend it blind is a sentence
   * PROMISING ACCESS, and those consult `accessKnown` beside it: the declined
   * card's "stays as it is until", and the resume line's "you'll keep everything
   * until", both in `page.tsx`.
   */
  const entitlementEnd = access.known ? access.endDate : null;
  const action = manageActionFor(entitlement, subscription, entitlementEnd);

  /**
   * ⚠️ THE ONLY STRIPE READ ON THIS PAGE, AND ONLY FOR A FAILING CARD.
   *
   * §5 requires the declined card's two dates to come from two sources: "the
   * failure date from Stripe, the access date from the entitlement". The mirror
   * has no failure column and this spec produces no migration, so Stripe is the
   * only place it exists. Display only — nothing here decides access, which is
   * still `entitlements` and nothing else.
   *
   * Gated on the status so an ordinary page load never makes a network call, and
   * tolerant: `null` withholds the sentence rather than inventing a date.
   */
  const declinedOn =
    isPastDue(subscription) && customer?.stripe_customer_id
      ? await declinedOnFor(customer.stripe_customer_id as string)
      : null;

  /**
   * ⚠️ THE SECOND STRIPE READ ON THIS PAGE, AND IT IS AS NARROW AS THE FIRST.
   *
   * Gated on `resume`, which means this account HAS a subscription flagged to
   * cancel — the only state a save offer can have been shown in, because
   * `offerAfterCancel` runs immediately after the cancel is written. Every other
   * visitor to `/billing` makes no network call for this.
   *
   * ⚠️ THE MIRROR-LAG WINDOW IS DELIBERATELY NOT COVERED, and it costs nothing.
   * For a few seconds after a cancellation the mirror can still read
   * `cancel_at_period_end: false`, so the action is `cancel` and this does not
   * run. In that window the TAB IS STILL ALIVE and `openOfferStore` has the offer
   * in `sessionStorage`, which is the mechanism that already works. This one is
   * for the tab being GONE, which is minutes later and long past the lag.
   *
   * Tolerant: `openOfferFor` returns null on any failure rather than throwing,
   * because a retention offer must never be able to take down the screen somebody
   * opened to find out what they are paying.
   */
  const openOffer =
    action.kind === "resume" && customer?.stripe_customer_id
      ? await openOfferFor(customer.stripe_customer_id as string, tz)
      : null;

  // The plan's name and amount, matched by price id. `loadPricesSafe` returns an
  // empty list when Stripe is unconfigured (which is production today), so every
  // consumer below is written to render nothing rather than a blank number.
  const prices = await loadPricesSafe();
  const price = row?.stripe_price_id
    ? prices.find((p) => p.priceId === row.stripe_price_id)
    : undefined;

  /**
   * When the paid plan begins, for a mid-grace subscriber, or null for everybody
   * else. Computed once and read twice below. See {@link graceStartsOn}.
   */
  const planStartsOn = graceStartsOn(entitlement ?? null, subscription);

  /**
   * ⚠️ THE D35 SUBSCRIBE ROW. ITS COHORT IS NARROW, AND IT IS ONE NAME WIDER
   * THAN IT WAS.
   *
   * §3.8, as corrected by the founder, said: **a live beta grace AND no
   * subscription. Nothing else.** The exclusions it listed, all still enforced:
   *
   *   not a courtesy user   a courtesy period only exists ON a live
   *                         subscription, so they already have one and a
   *                         subscribe control invites a SECOND — which the
   *                         one-subscription invariant forbids outright.
   *   not a free-for-life comp  `01` refuses them at the create call.
   *   not a paying subscriber   nothing to set up.
   *
   * It exists because `06`'s notice is dismissible and shows ONCE. After "Got
   * it" the notice is gone for the rest of the fortnight, and without this row a
   * beta user who dismissed it on day one has no route to checkout for thirteen
   * days. `06` says so in as many words: "`08` carries the standing route via
   * its subscribe row (D31), which is what makes a one-shot notice safe."
   *
   * ## ⚠️ AN ACCOUNT WITH NO ENTITLEMENT AT ALL NOW GETS IT TOO (Adrian, 2026-08-29)
   *
   * The fourth exclusion read **"not a lapsed account — `05`'s pop-up owns that
   * route"**, and that sentence was doing more work than it could carry.
   *
   * `05`'s pop-up fires on an ATTEMPTED WRITE. It is not a route somebody can go
   * and find; it is a thing that happens to you when you try to log a dose. So an
   * account holding no entitlement row — which is every account that reached the
   * app without going through the onboarding paywall — had **no route to a plan
   * anywhere in the product**. Not on Billing, which is the screen a person
   * actually opens when they want to sort their plan out, and where this file's
   * own header explains there is deliberately no upgrade control. Adrian walked
   * straight into it: signed in, landed in the app, went looking, found nothing.
   *
   * ⚠️ AND THE ARGUMENT HOLDS WHICHEVER WAY THE SWITCH IS SET, which is why it
   * does not rest on reading it:
   *
   *   gate OFF  `canWriteData` returns `allowed`, so the pop-up cannot fire AT
   *             ALL. The route the exclusion delegated to does not exist for the
   *             cohort being excluded. (`next-tasks.md` G4 — "set
   *             `BILLING_GATE_ENABLED=true` in Vercel production" — is still an
   *             unticked box, so this is the live case as far as this repo says.)
   *   gate ON   the pop-up can fire, but only at somebody already mid-write. It
   *             is still not a thing you can go and FIND, and Billing is still
   *             the screen you would look on.
   *
   * ⚠️ THIS DOES NOT BREAK THE STANDING RULE that nothing may route a user at
   * the paywall until Adrian says so. Nothing routes them. The row sits on a
   * screen they navigated to themselves, in the ordinary weight §3.8 specifies —
   * a caret row, not a filled button, "available rather than urgent" — and it
   * answers a question they arrived asking. It is a route, not a push.
   *
   * ⚠️ `access.known` IS LOAD-BEARING AND `entitlement === null` ALONE IS NOT
   * ENOUGH. See the destructure above: that null means BOTH "nothing entitles
   * them" and "the entitlements read failed", and the header there says in as
   * many words that the DECISIONS must read `accessKnown` beside it rather than
   * inferring from the null. A database that would not answer is not grounds to
   * offer somebody a control that starts a charge — exactly the argument
   * `subscriptionsKnown` already makes one line down, for the mirror.
   *
   * ⚠️ `subscriptionsKnown` IS NOT DECORATION either. An unreadable mirror must
   * not read as "no subscription", for the same reason.
   */
  const subscriptionsKnown = !subsError;
  const nothingEntitlesThem = access.known && entitlement === null;
  const showSubscribeRow =
    subscriptionsKnown &&
    liveRows.length === 0 &&
    (isBetaGrace(entitlement) || nothingEntitlesThem);

  return {
    tz,
    entitlement: entitlement ?? null,
    subscription,
    action,
    entitlementEnd,
    accessLive: access.known ? access.accessLive : false,
    accessKnown: access.known,
    accessRevoked: access.known ? access.revoked : false,
    accessRevokedReason: access.known ? access.revokedReason : "unknown",
    declinedOn,
    courtesyRunningUntil: courtesyIsRunning(courtesyUntil) ? courtesyUntil : null,
    openOffer,
    hasStripeCustomer,
    price,
    planStartsOn,
    showSubscribeRow,
    gateEnabled: billingGateEnabled(),
    liveRowCount: liveRows.length,
  };
}

/**
 * WHEN A MID-GRACE SUBSCRIBER'S PAID PLAN BEGINS, or null for everybody else.
 *
 * §3.6 gives this cohort the plan name and a `Starts {date}` row rather than any
 * trial vocabulary. The date is the GRACE end from `entitlements.active_until` —
 * the instant they were promised in writing — and deliberately not the mirror's
 * `trial_ends_at`, which `resolveFreeTime`'s 48-hour clamp can push later than
 * the promise. `11-reconciliation-and-alerting.md` makes the same choice for the
 * same reason: the question is always about the promise.
 *
 * ⚠️ Reachable only while the dated comp is the STRONGEST entitlement. Once
 * `syncSubscription` writes the `stripe` row, `access.ts`'s tiering prefers it
 * and this returns null. That cohort is a reported gap, not a silent one: the
 * mirror carries no grace marker to detect it with.
 */
function graceStartsOn(
  entitlement: PlanEntitlement | null,
  subscription: { status: string } | null,
): string | null {
  return isGraceAligned(entitlement, subscription) ? entitlement!.activeUntil : null;
}
