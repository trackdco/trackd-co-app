import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CancelSubscription } from "@/components/billing/CancelSubscription";
import { CaretRight } from "@/components/icons";
import { StripeHandoff } from "@/components/billing/StripeHandoff";
import { STAYING_NOTICE_SLOT } from "@/components/billing/StayingNotice";
import { currentEntitlement, entitlementEndDate } from "@/lib/billing/entitlements";
import { BILLABLE_STATUSES } from "@/lib/billing/cancel";
import { courtesyUntilFor } from "@/lib/billing/courtesy";
import { billingGateEnabled, reminderPromiseEnabled } from "@/lib/billing/gate";
import {
  CANCELLABLE_STATUSES,
  STOPPABLE_NOW,
  formatAccessDate,
  isBetaGrace,
  isGenuineTrial,
  isGraceAligned,
  manageActionFor,
  planLabelFor,
  type PlanEntitlement,
} from "@/lib/billing/manage";
import { loadPricesSafe } from "@/lib/billing/prices";
import { formatPrice } from "@/lib/onboarding/pricing";
import { CARD_EYEBROW, PAGE_TITLE } from "@/lib/ui-presets";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Billing · Trackd Co" };

/**
 * Billing — what you're on, when it renews, and how to stop it.
 *
 * Opened from the App card on Profile, at its own route for the same reason
 * `/notifications` has one: it is a subject with its own controls, not a value
 * that fits on a row.
 *
 * ## It cannot start billing, and that is structural
 *
 * There is no link to `/onboarding` on this page and no upgrade control. A user
 * with no subscription is told what they are on and nothing else. That is not a
 * gap to be filled in later without a decision: Adrian's standing rule is that
 * nothing may route a user at the paywall until he says so, and a "Subscribe"
 * button here would be exactly that route.
 *
 * ## What it reads
 *
 * `entitlements` decides what access rests on, because that is the only table
 * that decides anything. `subscriptions` supplies the DATES and the cancel flag,
 * which is the mirror doing the job it exists for — stating "renews on the 14th"
 * without a network call. Nothing here gates on the mirror.
 */
export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
    entitlement,
  ] = await Promise.all([
      supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle(),
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
        .eq("user_id", user.id)
        .in("status", [...BILLABLE_STATUSES])
        .order("current_period_end", { ascending: true }),
      // Whether there is anything for the Stripe portal to open onto. A user can
      // legitimately have a customer row and no live subscription (they
      // cancelled and it lapsed), and their invoices are still theirs to read.
      supabase
        .from("billing_customers")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle(),
      currentEntitlement(),
    ]);
  const hasStripeCustomer = Boolean(customer?.stripe_customer_id);

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
      `[billing] ${user.id} has ${liveRows.length} live subscription rows (${liveRows
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
  const courtesyUntil = await courtesyUntilFor(user.id);
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
  const action = manageActionFor(
    entitlement,
    subscription,
    await entitlementEndDate(),
  );

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
  const planStartsOn = graceStartsOn(entitlement, subscription);

  /**
   * ⚠️ THE D35 SUBSCRIBE ROW, AND ITS COHORT IS NARROW ON PURPOSE.
   *
   * §3.8, as corrected by the founder: **a live beta grace AND no subscription.
   * Nothing else.**
   *
   *   not a courtesy user   a courtesy period only exists ON a live
   *                         subscription, so they already have one and a
   *                         subscribe control invites a SECOND — which the
   *                         one-subscription invariant forbids outright.
   *   not a lapsed account  `05`'s pop-up owns that route.
   *   not a free-for-life comp  `01` refuses them at the create call.
   *   not a paying subscriber   nothing to set up.
   *
   * It exists because `06`'s notice is dismissible and shows ONCE. After "Got
   * it" the notice is gone for the rest of the fortnight, and without this row a
   * beta user who dismissed it on day one has no route to checkout for thirteen
   * days. `06` says so in as many words: "`08` carries the standing route via
   * its subscribe row (D31), which is what makes a one-shot notice safe."
   *
   * ⚠️ `subscriptionsKnown` IS NOT DECORATION. See the destructure above: an
   * unreadable mirror must not read as "no subscription", because the answer to
   * that question is a control that starts a charge.
   */
  const subscriptionsKnown = !subsError;
  const showSubscribeRow =
    subscriptionsKnown && liveRows.length === 0 && isBetaGrace(entitlement);

  return (
    <div className="animate-home-up mx-auto w-full max-w-md px-5 pt-4 pb-5">
      {/* NO SUBTITLE. It read "Your plan and when it renews." and Adrian cut it
          (2026-08-12): the Plan card underneath already says the plan and the
          date, so the line was a caption for something that captions itself.
          `/notifications` keeps its subtitle because it introduces a screen full
          of switches whose purpose is not self-evident; this one does not. */}
      <h1 className={PAGE_TITLE}>Billing</h1>

      {/**
       * WHERE THE "Glad you're staying." CARD LANDS, and why it is a slot.
       *
       * `03-cancel-flow.md` §3.10 puts that card at the TOP of Billing, while
       * the state it follows from belongs to the resume action, which runs in
       * `CancelSubscription` further down the page. The card is portaled up into
       * this element rather than lifting the whole screen into a client
       * component: the state stays in the component that took the action (§3.10
       * forbids persisting it anywhere), this file stays a Server Component, and
       * `08-billing-screen.md` can move one empty div when it places things.
       *
       * Empty until a resume happens, so it costs nothing in every other state.
       */}
      {/* `role="status"` sits on the SLOT, not on the card. A live region
          inserted into the document at the same instant as its text is the
          classic case a screen reader skips; this one is in the server-rendered
          markup long before there is anything to announce. */}
      <div id={STAYING_NOTICE_SLOT} role="status" />

      <section className="mt-6">
        <p className={`mb-3 ${CARD_EYEBROW}`}>Plan</p>
        <div className="overflow-hidden rounded-2xl bg-bg-surface">
          <Row
            label="Access"
            value={accessValue(entitlement, subscription, tz)}
          />
          {price ? (
            <>
              <Divider />
              <Row
                label="Price"
                value={`${formatPrice(price.amount, price.currency)} ${price.currency.toUpperCase()} / ${price.interval}`}
              />
            </>
          ) : null}
          {/**
            * ⚠️ ACCESS, PRICE, THEN THE DATE — §3.2's order, and the `Starts` row
            * was briefly above `Price` before this. "One card holding Access,
            * Price, the relevant date." Every date row below sits here, so a
            * reader finds the date in the same place whichever state they are in.
            *
            * EXACTLY ONE of the three renders, because each belongs to a
            * different state and they are mutually exclusive by construction:
            * `Starts` needs a grace, `Free until` needs a courtesy period, and
            * `Trial ends` needs a genuine trial — and `isGenuineTrial` is false
            * whenever either of the other two is true.
            */}
          {planStartsOn ? (
            <>
              <Divider />
              {/**
               * §3.6, signed as written: a grace-aligned `trialing`
               * subscription "names the plan and its server-sourced start date",
               * rendered as `Starts {date}`. The Access row above says "Pro" for
               * them, so this is the row that says when the paid plan begins —
               * and the word "trial" appears nowhere for somebody who is not on
               * one, which is D36's one absolute rule.
               *
               * The date is the GRACE end, from `entitlements.active_until`,
               * which is the instant they were promised in writing. Not the
               * mirror's `trial_ends_at`: `resolveFreeTime`'s 48-hour clamp can
               * push that later than the promise, and this row is about the
               * promise.
               */}
              <Row label="Starts" value={formatAccessDate(planStartsOn, tz)} />
            </>
          ) : null}
          {subscription?.courtesyUntil ? (
            <>
              <Divider />
              {/**
               * ⚠️ "Free until {date}" — SIGNED 2026-08-18, and it exists because
               * withholding `Trial ends` from this cohort left them with no date
               * at all.
               *
               * A courtesy customer's Access row reads "Pro" and their Price row
               * names a real amount, so without this the card states a price and
               * never says the next period is free. The three alternatives were
               * ruled out on the record: "Renews on" is false, and the signed
               * COURTESY sentence says so in as many words — "the next event is a
               * first charge after free time"; "First charge" is false for the
               * two-year customer who is most of this cohort; "Trial ends" is
               * D36's one prohibited word.
               *
               * "Free until" is true for every one of them regardless of payment
               * history, and it is the Manage sentence's own word: "Your Pro plan
               * is free until {date}, and then it's {price} a year."
               *
               * The date is `courtesy_until` from the mirror, read through the
               * tolerant query — never computed, and never the trial end beside
               * it. The CHARGE is disclosed three other times: the save offer's
               * terms line at accept, the Manage sentence, and `07`'s reminder two
               * days out.
               */}
              <Row
                label="Free until"
                value={formatAccessDate(subscription.courtesyUntil, tz)}
              />
            </>
          ) : null}
          {/**
            * ⚠️ THE WORD IS WITHHELD FOR ANYONE NOT ON A TRIAL, AND THIS ROW
            * ASKS THE SAME FUNCTION THE LABEL DOES.
            *
            * This compared the mirror's status against the trialing literal
            * directly, which is Stripe's status and not the question. Driven: a
            * mid-grace
            * subscriber, whose Access row had just been fixed to read "Pro"
            * precisely to avoid the word, got
            *
            *     Access      Pro
            *     Starts      20 Aug 2026
            *     Trial ends  20 Aug 2026
            *
            * — D36's one absolute rule broken two rows under the fix for it, and
            * the same date twice under two labels, which is the defect
            * `renewalRow` below already carries a correction for. A courtesy
            * customer of two years hit the identical row for the identical
            * reason.
            *
            * `isGenuineTrial` is what `planLabelFor` branches on, so the row and
            * the label cannot answer differently. Withheld, never reworded: the
            * date is not lost, it is stated by the row that is true for them —
            * `Starts` for a grace, and the Manage sentence for a courtesy.
            */}
          {subscription?.trialEndsAt && isGenuineTrial(entitlement, subscription) ? (
            <>
              <Divider />
              <Row
                label="Trial ends"
                value={formatAccessDate(subscription.trialEndsAt, tz)}
              />
            </>
          ) : null}
          {renewalRow(action, subscription, tz)}
          {showSubscribeRow ? (
            <>
              <div className="mx-4 hairline-t" aria-hidden />
              {/**
                * ⚠️ D35's LABEL, IDENTICAL TO `06`'s SECONDARY CONTROL. One
                * action, one name everywhere — a user who dismissed the notice
                * and finds this row a week later must recognise it as the same
                * thing, not wonder whether it is a different offer.
                *
                * ⚠️ NOT AMBER (§3.8): "It is a route, not a live state." It reads
                * as available rather than urgent, matching the no-pressure
                * hierarchy the notice uses for the same cohort — so it is an
                * ordinary row with a caret, the same weight as the values above
                * it, and not a filled button.
                *
                * ⚠️ NO SUPPORTING LINE, and that is a decision rather than an
                * omission. §3.8 allows one that "names the end date from its
                * server source, in the signed days-on-us vocabulary" — but the
                * Access row two rows above ALREADY says "On us until 20 Aug
                * 2026", in exactly that vocabulary, from exactly that source.
                * Repeating it here is the "two rows, two labels, one date" defect
                * this card carries three separate corrections for. The date is
                * stated once, where somebody looking for it will look.
                *
                * ⚠️ A BARE `<a>`, NOT `next/link`. THE SEAM.
                *
                * `/onboarding?step=plans` is the price list, and it is the same
                * destination `05`'s "Choose a plan" and `06`'s "Set up my plan"
                * both use — three surfaces, one URL, which is what the seam
                * requires and what the drivers assert. The onboarding flow reads
                * `?step=` and its session at MOUNT and on `popstate` only, so a
                * soft navigation would change the address bar and leave this
                * app's tree on screen, which is the defect w2b-14 records. An
                * anchor is a full document load without needing a client
                * component to say so.
                */}
              <a
                href="/onboarding?step=plans"
                className="flex w-full min-h-11 items-center gap-3 px-4 py-3.5 text-left outline-none transition-colors hover:bg-bg-surface-raised active:bg-bg-surface-raised focus-visible:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <span className="flex-1 text-sm text-foreground">Set up my plan</span>
                <CaretRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
              </a>
            </>
          ) : null}
        </div>
      </section>

      {/* The control, quiet and in its own block so it is neither buried nor
          competing with the summary above it. */}
      {action.kind === "cancel" || action.kind === "resume" ? (
        <section className="mt-6">
          <div className="rounded-2xl bg-bg-surface px-4 py-1">
            <CancelSubscription
              mode={action.kind}
              endsOn={formatAccessDate(action.endsOn, tz)}
              /**
               * ⚠️ `namesATrial`, NOT `isTrial`. THE COPY QUESTION, NOT THE DATE
               * QUESTION.
               *
               * This prop's only job inside `03`'s component is the NOUN — it
               * picks `Cancel my {trial|subscription}` and the staying notice's
               * "Your {trial|subscription} will carry on as usual." Fed Stripe's
               * status, it called a beta fortnight and a two-year customer's
               * courtesy month a trial, which is D36's one absolute prohibition.
               * Driven, both cohorts, both reading "Cancel my trial".
               *
               * The prop keeps `03`'s name because the component is `03`'s; only
               * the value passed changes, and it selects between two variants
               * that are already signed. No new copy.
               *
               * ⚠️ `action.isTrial` still exists and is still correct — it is the
               * DATE question, and `renewalRow` below is its right consumer.
               */
              isTrial={action.namesATrial}
              userId={user.id}
              /**
               * ⚠️ FREE FOR LIFE, WHICH MAKES THREE OF THE FOUR CONFIRM SENTENCES
               * FALSE (D78).
               *
               * A no-expiry comp holding a live billable subscription is the only
               * way this control renders for a comp at all — with no subscription
               * `manageActionFor` already returns `none`. So the row must STAY:
               * hiding it hides the exit from something that is charging them,
               * which is the defect `manage.ts` §"A COMP DOES NOT MAKE A LIVE
               * STRIPE SUBSCRIPTION STOP BILLING" records two cold reviews driving.
               *
               * What is wrong is the WORDS, not the control. `active_until` null
               * on a `comp` row is exactly the discriminator `isBetaGrace` uses to
               * separate free-for-life from the beta fortnight.
               */
              compForever={
                entitlement?.source === "comp" &&
                (entitlement?.activeUntil ?? null) === null
              }
              /**
               * Read here, on the server, so `REMINDER_PROMISE_ENABLED` never
               * reaches the client bundle. Unset withholds both promise strings
               * (amended D1) — see `lib/billing/reminderPromise.ts`.
               */
              remindersPromised={reminderPromiseEnabled()}
              /**
               * ⚠️ D80: this row cannot take the period-end flag, so pressing the
               * control ends it NOW. The dialog has to say so before it reassures.
               * Resolved here, from the row's status, because the client must not
               * decide which Stripe call happens.
               */
              endsImmediately={Boolean(row && STOPPABLE_NOW.has(row.status as string))}
            />
          </div>
          {action.kind === "resume" ? (
            <p className="mt-3 px-1 text-xs leading-relaxed text-text-muted">
              {/* The tail used to end "unless you restart it", which named a
                  control that no longer says restart. It now states the two
                  facts and stops: what you keep, and that nothing is coming. */}
              You&apos;ll keep everything until{" "}
              {formatAccessDate(action.endsOn, tz)}, and nothing more will be
              charged. You can change your mind until then.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Handing card details to Stripe rather than touching them. Shown only to
          someone who HAS a Stripe customer, since there is nothing to manage
          otherwise. Not shown for an App Store subscription: Apple holds the
          payment method there, and a Stripe portal would be about a customer
          that has no card on it. */}
      {hasStripeCustomer && action.kind !== "store" ? (
        <section className="mt-6">
          <div className="overflow-hidden rounded-2xl bg-bg-surface">
            <StripeHandoff rows={[{ key: "both", label: "Payment method and invoices" }]} />
          </div>
        </section>
      ) : null}

      {action.kind === "store" ? (
        <p className="mt-6 px-1 text-sm leading-relaxed text-text-muted">
          This subscription is managed by{" "}
          {action.store === "apple" ? "the App Store" : "Google Play"}, so it can
          only be changed there.
        </p>
      ) : null}

      {/**
        * ⚠️ A LIVE SUBSCRIPTION THE MIRROR HAS NOT HEARD OF IS NOT "NO
        * SUBSCRIPTION", AND IT MUST NOT RENDER AS SILENCE.
        *
        * A cold review deleted the mirror row while Stripe still said
        * `trialing` — the `unattributed` state the webhook route deliberately
        * leaves unprocessed, plus any 500'd handler or in-flight window — and
        * the whole screen came back as "Access / Pro / Payment method and
        * invoices". No price, no date, no cancel control, and no signpost. The
        * ACTION would have worked (it asks Stripe, not the mirror); only the
        * screen could not reach it.
        *
        * So a user who has a Stripe customer but no readable subscription gets
        * the same support line as any other subscription we can see but cannot
        * act on. Same string, one more way to arrive at it.
        */}
      {action.kind === "unavailable" ||
      (action.kind === "none" &&
        action.reason === "no-subscription" &&
        hasStripeCustomer) ? (
        <p className="mt-6 px-1 text-sm leading-relaxed text-text-muted">
          This one can&apos;t be changed from here. Email{" "}
          <a className="text-foreground" href="mailto:support@trackdco.app">
            support@trackdco.app
          </a>{" "}
          and we&apos;ll sort it out.
        </p>
      ) : null}

      {/* ⚠️ A 44px TAP TARGET, which is Apple's floor. It measured 112x18: a
          bare text link with no box of its own. `03`'s cancel row already passes
          at exactly 318x44, so the shell around it was the part failing.
          `min-h-11` gives the height outright rather than leaving it to padding
          arithmetic on a line box, and the negative inline margin keeps the text
          optically where it was. */}
      <div className="mt-10 text-sm text-text-muted">
        <Link
          href="/profile"
          className="-ml-2 inline-flex min-h-11 items-center rounded-md px-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          ← Back to profile
        </Link>
      </div>
    </div>
  );
}

/* ── Pure display helpers ────────────────────────────────────────── */

/**
 * ⚠️ THE ACCESS ROW'S VALUE. THE STATE COMES FROM THE SHARED FUNCTION; THE DATE
 * IS COMPOSED HERE.
 *
 * `planLabelFor` is shared with Profile's plan pill precisely so the two screens
 * cannot disagree about what somebody is on (Q88). It therefore answers the
 * STATE and nothing else, and takes no formatter, no timezone and no date —
 * Profile has none of those and renders one word.
 *
 * §3.6's defect is that Billing, "the screen somebody opens specifically to find
 * out what they are on and when it ends", was **the only surface not showing the
 * grace date** while the notice, the reminder and the banner all did. So the date
 * is appended HERE, to this screen's row, where there is a formatter and a
 * timezone. Billing reading "On us until 20 Nov 2026" while Profile reads "On us"
 * is a difference of detail, not of state (Adrian, 2026-08-18).
 *
 * ⚠️ THE FULL DATE FORM, not `formatAccessDateShort`. That function's own note
 * reserves the year-less form for a CONTROL LABEL read at a glance, and says
 * every place the date is the SUBJECT — "the confirm dialog, the plan card, the
 * sentence under the control" — keeps the full form. This is the plan card.
 *
 * ⚠️ AND ONLY THE GRACE GETS A DATE. A free-for-life comp gets "no date and no
 * expiry language" (§3.6) because there is no date to state and inventing one
 * would mean somebody's access appearing to end on a day nobody chose. Every
 * other state's date is already carried by its own row.
 */
function accessValue(
  entitlement: PlanEntitlement | null,
  subscription: Parameters<typeof planLabelFor>[1],
  tz: string,
): string {
  const label = planLabelFor(
    entitlement,
    subscription,
    // See `planLabelFor`: the same switch that decides the read-only gate
    // decides whether "no entitlement" reads as "Pro" or "Read only". They
    // cannot be allowed to disagree.
    billingGateEnabled(),
  );

  // The grace, and only when it is the state being described. A mid-grace
  // subscriber reads "Pro" above and gets the `Starts` row instead, so the two
  // renderings never both carry a date. ⚠️ Asked by NAME: this file carries no
  // status literal, which is property 3 and was a defect three separate times.
  if (!isBetaGrace(entitlement) || isGraceAligned(entitlement, subscription)) return label;
  const until = formatAccessDate(entitlement!.activeUntil!, tz);
  // An unformattable date withholds the clause rather than printing "On us
  // until". The bare state is still true; a dangling preposition is not.
  return until ? `${label} until ${until}` : label;
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

/** "Renews on" / "Ends on", depending on whether a cancellation is scheduled. */
function renewalRow(
  action: ReturnType<typeof manageActionFor>,
  subscription: { currentPeriodEnd: string | null } | null,
  tz: string,
) {
  if (action.kind !== "cancel" && action.kind !== "resume") return null;
  const when = formatAccessDate(action.endsOn, tz);
  if (!when) return null;
  /**
   * On a trial the date is already stated above as "Trial ends", so this row
   * would repeat it. The guard covered `cancel` only, and a cold review loaded
   * the RESUME screen and got the same date three times:
   *
   *     Trial ends  13 Aug 2026
   *     Ends on     13 Aug 2026
   *     "You'll keep everything until 13 Aug 2026."
   *
   * Two rows, two labels, one date, read as two different deadlines to somebody
   * who has just cancelled and is re-reading the screen to be sure.
   *
   * ⚠️ `isTrial` AND NOT `namesATrial`, WHICH IS THE WHOLE POINT OF THE SPLIT.
   *
   * The question here is "has a date already been shown above?", and for all
   * THREE `trialing` cohorts the answer is yes — `Trial ends` for a genuine
   * trial, `Starts` for a grace, `Free until` for a courtesy period. Switching
   * this to the copy question would put a second date row under every one of
   * them, which is the exact defect this guard exists to prevent. The noun is a
   * different question and is answered separately, above.
   */
  if (action.isTrial) return null;
  /**
   * ⚠️ "Renews on" IS A CLAIM ABOUT WHAT HAPPENS NEXT, AND IT HAS TO BE TRUE.
   *
   * `action.endsOn` is the earlier of the mirror's period end and the
   * entitlement's, which is right for the dialog and wrong under this label the
   * moment the two disagree — and they disagree exactly when the subscription is
   * `past_due`. A cold review measured "Renews on 26 Aug 2026" for an account
   * whose access dies on the 26th and whose next Stripe attempt is the 29th.
   * Nothing renews on that date, so the row says what the date actually is.
   */
  const label =
    action.kind === "resume" || action.accessEndsEarly ? "Ends on" : "Renews on";
  return (
    <>
      <Divider />
      <Row label={label} value={when} />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="flex-1 text-sm text-foreground">{label}</span>
      <span className="shrink-0 text-sm text-text-muted">{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="mx-4 hairline-t" aria-hidden />;
}
