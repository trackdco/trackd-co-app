import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CancelSubscription } from "@/components/billing/CancelSubscription";
import { DeclinedCard } from "@/components/billing/DeclinedCard";
import { CaretRight } from "@/components/icons";
import { STAYING_NOTICE_SLOT } from "@/components/billing/StayingNotice";
import {
  formatAccessDate,
  isBetaGrace,
  isGenuineTrial,
  isGraceAligned,
  isPastDue,
  manageActionFor,
  periodEndLabelFor,
  planLabelFor,
  type PlanEntitlement,
} from "@/lib/billing/manage";
import { loadBillingFacts } from "@/lib/billing/screenFacts";
import { billingGateEnabled, reminderPromiseEnabled } from "@/lib/billing/gate";
import { STOPPABLE_NOW } from "@/lib/billing/manage";
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

  const {
    tz,
    entitlement,
    subscription,
    action,
    entitlementEnd,
    accessLive,
    accessKnown,
    declinedOn,
    hasStripeCustomer,
    price,
    planStartsOn,
    showSubscribeRow,
    /**
     * ⚠️ THE COURTESY END ONLY WHILE IT IS STILL RUNNING (Group C). The raw
     * marker on `subscription` stays raw for the readers that ask "did it
     * happen"; this is the one that asks "is it happening now", and Manage's
     * sentence reads the same resolved value.
     */
    courtesyRunningUntil,
    openOffer,
  } = await loadBillingFacts(user.id);

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

      {/**
        * ⚠️ ABOVE THE PLAN CARD, AND IT REPLACES NOTHING (§3.9).
        *
        * "A fourth condition cuts across all three: past-due. It is a state of
        * the PAYMENT rather than of the plan, and it renders as the declined card
        * above the plan card rather than replacing any of the three." So a
        * past-due account still sees Access, Price, the date and its cancel
        * control underneath — the plan has not gone anywhere, only the money has.
        *
        * The two dates are resolved separately and formatted here, on the server,
        * in the user's own timezone. Each may independently be null, and the
        * sentence that names a null date does not render. See `DeclinedCard`.
        */}
      {isPastDue(subscription) ? (
        <DeclinedCard
          declinedOn={declinedOn ? formatAccessDate(declinedOn, tz) : null}
          /**
           * ⚠️ THE ENTITLEMENT'S OWN VALUE, NOT `action.endsOn`. §3.5 is explicit
           * that this is "the same value the entitlement holds, not a guess and
           * not the failure date plus a constant". `action.endsOn` is the EARLIER
           * of the mirror and the entitlement, which is right for the cancel
           * dialog and is a different question from "when does access end"; where
           * no entitlement date exists it falls back to the mirror, and the
           * mirror's period end on a past-due subscription is the end of a period
           * nobody paid for.
           */
          accessEndsOn={entitlementEnd ? formatAccessDate(entitlementEnd, tz) : null}
          /**
           * ⚠️ WHETHER ACCESS IS LIVE, NOT WHETHER A DATE EXISTS. The date above
           * includes dead rows by design, so it is present for a revoked account
           * too — which is how this card promised "stays as it is until 17 Sept
           * 2026" two rows above "Access: Read only".
           */
          accessLive={accessLive}
        />
      ) : null}

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
          {courtesyRunningUntil ? (
            <>
              <Divider />
              {/**
               * ⚠️ IT RENDERS ON THE PERIOD STILL RUNNING, NOT ON THE MARKER
               * MERELY BEING THERE (Group C).
               *
               * This was `subscription?.courtesyUntil ?`, with no test that the
               * date is still in the future — and `courtesy_until` is written once
               * when the offer is granted and never cleared, deliberately, because
               * reconciliation asks "did it happen" and needs it to persist. So a
               * customer who took the free week and was then charged read
               *
               *     Free until   10 Aug 2026
               *     Renews on    17 Aug 2026
               *
               * on one card: a promise stated in the present tense a week after it
               * had been withdrawn, directly above the row saying they are paying.
               *
               * `courtesyIsRunning` is the same question the Manage sentence asks,
               * for the reason `isGenuineTrial` exists one row down — two surfaces
               * asking one question two ways is how only one of them gets taught
               * the answer. The row simply does not render once the period is over;
               * `Renews on` beside it is then the whole truth.
               */}
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
                value={formatAccessDate(courtesyRunningUntil, tz)}
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
          {/**
            * ⚠️ THE DATE ROW IS NEVER ABSENT (Adrian, 2026-08-25).
            *
            * `renewalRow` returns null for anybody with nothing scheduled, so a
            * read-only account's card simply lost a row and changed shape
            * between states. Adrian: *"just have 'Ends on' and then have N/A if
            * it's the read-only account."*
            *
            * A row that is always present is also a row a reader can learn the
            * position of. `N/A` rather than a date because there is genuinely
            * nothing to name: they hold no access that ends.
            *
            * Only where the row would otherwise be missing AND access is not
            * live — an entitled account with nothing scheduled keeps its own
            * rows and must not gain a contradictory "Ends on N/A".
            */}
          {renewalRow(action, subscription, tz) === null && !accessLive ? (
            <>
              <Divider />
              <Row label="Ends on" value="N/A" />
            </>
          ) : null}
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
                href="/plans"
                className="flex w-full min-h-11 items-center gap-3 px-4 py-3.5 text-left outline-none transition-colors hover:bg-bg-surface-raised active:bg-bg-surface-raised focus-visible:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <span className="flex-1 text-sm text-foreground">Set up my plan</span>
                <CaretRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
              </a>
            </>
          ) : null}
          {/**
            * ⚠️ MANAGE IS INSIDE THE PLAN CARD NOW (Adrian, 2026-08-25).
            *
            * It sat in its own card below, separated by a gap, and on the contact
            * sheet Adrian asked for the opposite: *"put the manage section,
            * attach it to where it says 'Access', 'Trial ends' and 'Manage'.
            * They should all be attached together, and then 'Cancel my trial'
            * should be at the very bottom."*
            *
            * He is describing one object rather than three: what you are on, when
            * it changes, and where to go about it belong to the same card. The
            * cancel control stays OUTSIDE and last, which is both what he asked
            * for and what this file already argued for — it is the exit, not the
            * subject, and putting it in the card would rank it beside the facts.
            *
            * ⚠️ THE STORE EXCLUSION STAYS. Apple holds an App Store subscriber's
            * payment method and a Stripe portal would open on a customer with no
            * card. Unreachable today (not on the App Store) and kept because
            * "unreachable" is a claim about today.
            */}
          {action.kind !== "store" ? (
            <>
              <Divider />
              {/* ⚠️ NO ICON (Adrian, 2026-08-25). The rows above it — Access,
                  Price, the date — carry none, so a card icon on this one alone
                  made Manage read as a different KIND of thing rather than the
                  next row down. The chevron already says it navigates. */}
              <Link
                href="/billing/manage"
                className="flex w-full min-h-11 items-center gap-3 px-4 py-3.5 text-left outline-none transition-colors hover:bg-bg-surface-raised active:bg-bg-surface-raised focus-visible:bg-bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <span className="flex-1 text-sm text-foreground">Manage</span>
                <CaretRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
              </Link>
            </>
          ) : null}
        </div>
      </section>

      {/* The control, quiet and in its own block so it is neither buried nor
          competing with the summary above it. */}
      {action.kind === "cancel" || action.kind === "resume" ? (
        <section className="mt-4">
          {/**
            * ⚠️ CANCELLED-BUT-STILL-RUNNING IS A CARD THAT HOLDS BOTH HALVES
            * (§3.9), AND THE PARAGRAPH USED TO SIT OUTSIDE IT.
            *
            * §3.9: "A card explaining what happens on the date, carrying the
            * resume control labelled 'Keep my Pro plan' per D22. `03` owns that
            * control's behaviour and **the explanatory paragraph beneath it**;
            * this spec owns **the card that holds them**."
            *
            * Both words matter. The paragraph was a sibling of the card rather
            * than inside it, so the one thing that explains what happens on the
            * date floated loose underneath a surface it belongs to — read as a
            * footnote about the screen instead of the card's own second half.
            * `03` still owns every word of it; this spec moved the container.
            *
            * The CANCEL state keeps the bare control with no paragraph: there is
            * nothing to explain yet, and the dialog is where the explaining
            * happens once they press it.
            */}
          {/**
            * ⚠️ NO SURFACE ON THE CANCEL STATE (Adrian, 2026-08-25, option C).
            *
            * The wrapper gave BOTH states a card, which put "Cancel my
            * subscription" inside its own raised block — a second card under the
            * plan card, competing with it. The treatment he chose from the
            * rendered swatches is plain red text on the GROUND, no surface at
            * all, so the plan card is the only object on the screen.
            *
            * ⚠️ THE RESUME STATE KEEPS ITS CARD, and that is not an
            * inconsistency. §3.9 requires a card there because it holds two
            * halves — the control AND the paragraph explaining what happens on
            * the date. Cancel has no paragraph: there is nothing to explain
            * until they press it, and the dialog does the explaining.
            */}
          <div
            className={
              action.kind === "resume"
                ? "overflow-hidden rounded-2xl bg-bg-surface px-4 py-1"
                : ""
            }
          >
            {action.kind === "resume" && accessKnown ? (
              <p className="px-1 pt-2 pb-3 text-xs leading-relaxed text-text-muted">
                {/* The tail used to end "unless you restart it", which named a
                    control that no longer says restart. It now states the two
                    facts and stops: what you keep, and that nothing is coming.
                    `03`'s words, unchanged; only the container moved. */}
                You&apos;ll keep everything until{" "}
                {formatAccessDate(action.endsOn, tz)}, and nothing more will be
                charged. You can change your mind until then.
              </p>
            ) : null}
            {/* ⚠️ ORDER REVERSED (Adrian, 2026-08-25): the SENTENCE comes first,
                then a rule, then the control — exactly the shape the "Choose a
                plan" row takes on Manage. It read the other way round, so the
                explanation of what you keep arrived AFTER the button offering to
                undo it. `03` still owns every word; only the order moved. */}
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
              endsImmediately={Boolean(subscription && STOPPABLE_NOW.has(subscription.status))}
              /**
               * ⚠️ AN OFFER SHOWN, NOT CLAIMED, AND STILL INSIDE ITS TEN MINUTES
               * (Group E). Resolved server-side from Stripe's own marker, so a
               * session that ended at that dialog — a closed tab, a dead phone —
               * gets the offer back rather than a bare Resume control with the
               * free week already spent. Same marker, same instant, same window:
               * the countdown carries on rather than restarting.
               */
              serverOffer={openOffer}
            />
            {/**
              * ⚠️ AND IT NEEDS THE ENTITLEMENT READ TO HAVE WORKED (1.5).
              *
              * "You'll keep everything until {date}" is a promise about ACCESS,
              * and `action.endsOn` is `soonerOf(mirror, entitlement)` — so when
              * the entitlement read fails, `entitlementEnd` is null, the mirror
              * substitutes silently, and the promise is made from a table that
              * does not decide access.
              *
              * That is the same null the declined card two hundred lines up
              * handles correctly by WITHHOLDING. Same null, two consumers,
              * opposite directions, until here.
              *
              * The card and the control are unaffected: somebody who has just
              * cancelled still sees what they pressed and can still change their
              * mind. Only the sentence the server cannot back is withheld.
              */}
          </div>
        </section>
      ) : null}

      {/**
        * ⚠️ THE MANAGE ROW REPLACES THE PAYMENT ROW THAT USED TO SIT HERE.
        *
        * §3.2's approved structure is "one card holding Access, Price, the
        * relevant date, and a Manage row", and §3.3 puts Card and Receipts one
        * screen deeper. So this screen no longer carries a payment row at all —
        * it carries the route to the screen that does.
        *
        * Shown on the same terms the payment row was: only to somebody who HAS a
        * Stripe customer, since Manage is Card and Receipts and there is nothing
        * to manage otherwise, and never for an App Store subscription, where
        * Apple holds the payment method and a Stripe portal would be about a
        * customer with no card on it.
        *
        * A plain `next/link`, unlike the subscribe row: this destination is
        * INSIDE the app tree, so a soft navigation is correct and the full
        * document load the onboarding route needs would be a regression here.
        */}
      {/**
        * ⚠️ NO LONGER GATED ON `hasStripeCustomer` (Adrian, 2026-08-23).
        *
        * It was, and the cost was that somebody with NO PLAN had no route to Card
        * or Receipts at all — the row simply vanished, so the one screen that
        * exists to answer "what am I paying and how do I change it" answered
        * neither for the person most likely to be asking.
        *
        * Manage now always appears. The screen behind it states what it can and
        * says what it cannot: with no Stripe customer the Card row reads "None on
        * file" and does nothing, rather than opening a portal session that has no
        * customer id to open.
        *
        * ⚠️ THE STORE EXCLUSION STAYS. Apple holds an App Store subscriber's
        * payment method and a Stripe portal would be about a customer with no card
        * on it. No such account exists yet — the app is not on the App Store — so
        * this is unreachable today and kept because "unreachable" is a claim about
        * today.
        */}

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
      <div className="mt-5 text-sm text-text-muted">
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
  /**
   * ⚠️ THE VERB IS CHOSEN IN `lib/billing/manage.ts`, NOT HERE, so the committed
   * suite can pin it — this file is outside `vitest.config.ts`'s include, and a
   * ternary here meant the two words a user reads had no machine check at all.
   * `null` is unreachable at this point (both early returns above already
   * excluded every other kind) and is handled rather than asserted away.
   */
  const label = periodEndLabelFor(action);
  if (!label) return null;
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
