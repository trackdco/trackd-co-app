"use client";

import { useEffect, useState } from "react";

import {
  resolveReturningIntent,
  type TrialEligibility,
} from "@/app/onboarding/billing-actions";
import { track } from "@/lib/onboarding/analytics";
import type { IntentKind } from "@/lib/billing/stripe";
import {
  billingDate,
  formatPrice,
  intervalSuffix,
  monthlyEquivalent,
  TRIAL_DAYS,
} from "@/lib/onboarding/pricing";
import { FLOW_EMPHASIS } from "@/lib/ui-presets";

import { StepFrame } from "../chrome";
import { useFlow } from "../flow-context";
import { PaymentSheet, type PaymentOutcome } from "../payment-sheet";
import { TrialHold } from "../trial-hold";

/**
 * CHECKOUT — the card, on its own screen (Adrian, 2026-08-08).
 *
 * The paywall used to do two jobs at once: make the argument, list the plans AND
 * take a card. Measured at 320x568 that put the commit button roughly 1,400px
 * down one screen. Split, each screen has one job — `paywall` asks WHICH,
 * this asks for the card — and the whole payment surface fits in a phone.
 *
 * That is also what makes the disclosure requirement structural rather than
 * something to re-measure after every edit: on a screen this short, the trial
 * length, the amount, the charge date and the auto-renewal notice sit beside the
 * button by construction rather than by luck.
 *
 * **Still inside TRACKD.** The spec's rule is that the user never reaches a
 * stripe.com domain — not that payment has to share a screen with the price
 * list. Apple Pay and Google Pay render above the card fields exactly as before.
 */
/**
 * The intent client secret Stripe appended when a bank redirect came back, or
 * null.
 *
 * Both spellings are read because the parameter name follows the INTENT KIND,
 * not the flow: a returning SetupIntent arrives as `setup_intent_client_secret`
 * and a returning PaymentIntent as `payment_intent_client_secret`. Reading only
 * one would work on the trial path and silently do nothing on the paid one,
 * which is the path where landing back on the card form is dangerous.
 *
 * Guarded for SSR: this runs during render to seed state, and there is no
 * `window` on the server.
 */
function readReturningSecret(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("payment_intent_client_secret") ??
    params.get("setup_intent_client_secret")
  );
}

/**
 * Strip the redirect's parameters, keeping the step.
 *
 * `replaceState` rather than a navigation: the flow is one client tree that
 * reads `?step=` at mount and on `popstate`, so pushing or navigating here
 * would remount it. This edits the address bar and nothing else, which is what
 * stops a refresh or a Back replaying the branch.
 */
function clearReturningParams(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const key of [
    "payment_intent",
    "payment_intent_client_secret",
    "setup_intent",
    "setup_intent_client_secret",
    "redirect_status",
    "source_redirect_slug",
  ]) {
    url.searchParams.delete(key);
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function CheckoutScreen() {
  const {
    session,
    goNext,
    priceFor,
    eligibility: flowEligibility,
    firstChargeOn: serverFirstChargeOn,
    graceEndsOn,
  } = useFlow();
  const [holding, setHolding] = useState(false);
  /**
   * ⚠️ DOES THIS PERSON ACTUALLY GET THE FREE DAYS THIS SCREEN PROMISES?
   *
   * One trial per user (Adrian, 2026-08-14) means a returning customer is
   * charged from day one. Every line on this screen was written when everybody
   * got seven free days, so without this it promises a trial, takes a card, and
   * charges immediately. That is a broken promise on a payment screen, which is
   * both the thing the disclosure rules are about and a straightforward
   * chargeback.
   *
   * ⚠️ IT ARRIVES AS A PROP, RESOLVED ON THE SERVER (spec 02b §3.6).
   *
   * This used to be `useState` seeded with the generous default and corrected
   * by an effect. On a setup-only sheet that was a cosmetic flicker; with `02a`
   * shipped it is a payment screen that can say "7 days free" and then "First
   * charge today" while somebody is reading it — and the Elements mode is
   * derived from the same answer, so the flicker was a mode change too.
   *
   * The fallback is the same generous default the server itself returns when it
   * cannot decide, and it applies only where there is no server behind the flow
   * (the `/preview/paywall` harness). Erring the other way would charge a
   * first-timer against a screen promising free days.
   */
  const eligibility: TrialEligibility = flowEligibility ?? {
    eligible: true,
    reason: "new",
    days: TRIAL_DAYS,
    graceEndsAt: null,
    // The preview harness has no server and therefore no comp. False is also
    // the direction that changes nothing here: `comp` withholds a line on the
    // welcome screen and this screen does not read it.
    comp: false,
  };

  /**
   * ⚠️ `02a`'s CTA gate, now satisfied AT MOUNT.
   *
   * The button waits for the eligibility answer, and since `02b` that answer
   * arrives with the page. So there is nothing to wait for — unless the flow
   * was mounted with no server behind it, where the generous default is a
   * guess and the gate still means something.
   */
  const resolved = flowEligibility !== undefined;
  /**
   * ⚠️ THE SERVER'S CORRECTION, which OUTRANKS the eligibility answer.
   *
   * `trialEligibility()` is generous by default and generous on error, and
   * `startTrial` decides independently — a trial used up in another tab, or a
   * grace that expired between the two calls, both land here legitimately. When
   * they disagree the server has already cancelled what it made and confirmed
   * nothing, so this simply re-renders the sheet in the mode it actually
   * decided, and `02b`'s copy re-renders with it.
   *
   * Null until a mismatch happens, which is almost always.
   */
  const [correctedMode, setCorrectedMode] = useState<IntentKind | null>(null);

  /**
   * ⚠️ A BANK REDIRECT COMING BACK (spec 02a §3.5), resolved BEFORE the form is
   * rendered and before anything is created.
   *
   * Stripe appends `redirect_status` and an intent client secret when a 3D
   * Secure challenge needed a full page navigation. Nothing read them before,
   * so the flow remounted, `holding` was component state and therefore false,
   * and the user landed back on the card form. On the setup path that was
   * merely bad; on the PAYMENT path it is a screen inviting somebody to pay for
   * a charge that may have already gone through.
   *
   * `pending` while it is being resolved, so the form is not rendered underneath
   * a question that is about to answer itself.
   */
  const [returning, setReturning] = useState<
    "none" | "pending" | "failed" | "requires_action"
  >(() => (readReturningSecret() ? "pending" : "none"));
  /**
   * A correction beats the eligibility answer, because it came from the code
   * path that actually creates subscriptions rather than the one that decides
   * what a screen says.
   */
  const trial = correctedMode ? correctedMode === "setup" : eligibility.eligible;
  /**
   * ⚠️ THE MID-GRACE BETA USER (spec 02b §3.4), selected by ONE condition:
   * `reason` is "beta" AND `graceEndsAt` is non-null, which `01` sets only while
   * the fortnight is still running.
   *
   * Four approved lines are FALSE for this person, because `01` guarantees they
   * are not charged until their grace ends: they have not "had their trial",
   * their plan does not "start from today", and neither charge date is today.
   *
   * ⚠️ THIS VARIANT READS AS WELCOME, NOT AS WARNING. A mid-grace user adding a
   * card early is pre-arming billing so nothing interrupts them when the
   * fortnight ends. Nothing here may frame their free time as running out,
   * expiring or being used up, and it never uses the word "trial" — the grace is
   * not one. That is a stated requirement (D17), not a matter of taste.
   *
   * A correction from `02a` drops it, because a correction means the server has
   * just decided they are being charged today after all.
   */
  const midGrace =
    !correctedMode &&
    eligibility.reason === "beta" &&
    eligibility.graceEndsAt !== null &&
    Boolean(graceEndsOn);
  /** Which free run they already had, so the copy names the right one. */
  const hadDays = eligibility.days;
  const wasBeta = eligibility.reason === "beta";

  useEffect(() => {
    const secret = readReturningSecret();
    if (!secret) return;

    let alive = true;
    void resolveReturningIntent(secret)
      .then((r) => {
        if (!alive) return;
        if (r.status === "succeeded") {
          /**
           * The charge already went through on the other side of the redirect.
           * Straight to the holding state, which polls `entitlements` exactly as
           * it would have done inline. Never back to the card form.
           */
          setHolding(true);
          return;
        }
        setReturning(r.status === "failed" ? "failed" : r.status === "requires_action" ? "requires_action" : "none");
      })
      .catch(() => {
        if (alive) setReturning("none");
      })
      .finally(() => {
        /**
         * ⚠️ CLEARED IN EVERY CASE, so a refresh or a back-navigation cannot
         * replay the branch — and cannot re-send a stale intent secret through
         * the resolver either.
         */
        clearReturningParams();
      });

    return () => {
      alive = false;
    };
  }, []);


  const selected = priceFor(session.plan);
  /**
   * ⚠️ FROM THE SERVER, in the user's STORED timezone (spec 02b §3.5).
   *
   * It was `billingDate(new Date())` on mount, in the DEVICE's timezone, while
   * `/billing` formats the same kind of date server-side in the stored one — so
   * the two disagreed for anyone travelling, and the paywall computed its own so
   * the two onboarding screens could disagree across midnight.
   *
   * Derived from the prop, never `setState` in an effect. The fallback only
   * applies where there is no server behind the flow (the preview harness).
   */
  const firstChargeOn = serverFirstChargeOn ?? billingDate(new Date());

  /**
   * The card was accepted. That is NOT "the user is subscribed".
   *
   * A confirmed SetupIntent proves a card works and proves nothing about
   * entitlement — the webhook grants that, one to three seconds later. So this
   * hands over to `TrialHold` rather than into the app.
   */
  const onOutcome = (outcome: PaymentOutcome) => {
    if (outcome.status === "error") return; // The sheet shows its own message.
    if (outcome.status === "already-subscribed") {
      goNext();
      return;
    }
    /**
     * ⚠️ ONLY WHEN A TRIAL WAS ACTUALLY GRANTED (spec 02a §3.8).
     *
     * This fired on every confirmed outcome, so the moment the paid-today path
     * worked, a customer charged today would have been logged as having started
     * a seven-day trial. Every downstream funnel number would be wrong from the
     * first paying customer onward.
     *
     * ## Nothing replaces it, deliberately
     *
     * `13-billing-analytics.md` owns the event taxonomy, and inventing a name
     * here would hand `13` a string it did not choose. The consequence is stated
     * rather than hidden: BETWEEN THIS SHIPPING AND `13` SHIPPING, A PAID-TODAY
     * SUBSCRIBE IS UNMEASURED. That is the right trade — an unmeasured event is
     * a gap, a wrong one is a lie in a dashboard.
     */
    if (trial) track("trial_started", { plan: session.plan, days: TRIAL_DAYS });
    setHolding(true);
  };

  /**
   * `paid` follows the same answer the sheet's mode does, so the words on the
   * holding screen cannot disagree with what the user was just charged. A
   * returning redirect lands here too, and it lands with the correct variant
   * because `trial` is resolved from the same eligibility state.
   */
  /**
   * ⚠️ `paid` MEANS "MONEY MOVED TODAY", not "not on a trial".
   *
   * A cold review caught this: a mid-grace user has `trial` false, so they were
   * shown the PAID variant — "Your payment is safe" — when their invoice was
   * $0 and their first charge is a fortnight away. D15's paid copy was signed
   * off on the premise that it acknowledges money moving, so saying it to
   * somebody who paid nothing is exactly the kind of unearned claim that
   * variant exists to avoid.
   *
   * The condition is the same question the Elements mode asks, and the same
   * one the title asks: was anything due TODAY.
   */
  if (holding) {
    return (
      <TrialHold
        onEntitled={goNext}
        variant={trial ? "trial" : midGrace ? "grace" : "paid"}
      />
    );
  }

  /**
   * ⚠️ THE FORM IS NOT RENDERED WHILE A RETURNING INTENT IS UNRESOLVED (§3.5).
   *
   * "No subscription is created while a returning intent is unresolved. The
   * resolve happens first, always." A card form on screen during that window is
   * a form somebody can submit, which is the second charge this exists to
   * prevent. A skeleton rather than a spinner, per `ui-context.md`.
   */
  if (returning === "pending") {
    return (
      <StepFrame title="One moment.">
        {/* Top-aligned for the same reason as the loaded state below, and it has
            to match it: a centred skeleton followed by a top-aligned form is a
            layout jump at the moment the card fields appear, on the screen where
            a jump is most likely to be tapped through. */}
        {/* `pb-2` dropped for the same reason as the loaded state below: ScrollPort
            already pads the tail. `gap-3` was already on the scale and now matches the
            form's own `space-y-3`, so the two branches finally share a rhythm. */}
        <div className="flex w-full flex-1 flex-col justify-start gap-3" aria-busy="true">
          <div className="h-13 w-full animate-pulse rounded-2xl bg-bg-surface-raised motion-reduce:animate-none" />
          <div className="h-13 w-full animate-pulse rounded-2xl bg-bg-surface-raised motion-reduce:animate-none" />
          <p className="text-center text-[0.8rem] text-text-muted">
            Checking your payment with your bank.
          </p>
        </div>
      </StepFrame>
    );
  }

  /**
   * THE DISCLOSURE, handed to `PaymentSheet` so it renders DIRECTLY ABOVE the
   * button and cannot be separated from it by anything added in between.
   *
   * All four things must be visible at the same time as the CTA with no
   * scrolling: the trial length, the exact renewal amount with its currency, the
   * date of the first charge, and that it renews automatically until cancelled.
   * A previous audit of the old combined screen found it could be paid on
   * without the price ever having rendered.
   *
   * Every figure derives from the selected plan and from `TRIAL_DAYS`, so none
   * can contradict another or the summary above it.
   */
  /**
   * "yr" / "mo" / "wk", FROM STRIPE (spec 02b §3.3), and null where the price
   * cannot be stated correctly — a quarterly plan, or an interval this app has
   * no suffix for. The disclosure is withheld entirely in that case rather than
   * printing a unit that does not match the amount beside it.
   */
  const suffix = selected ? intervalSuffix(selected) : null;

  const disclosure = selected && suffix ? (
    /* ⚠️ NO `pt-1` (09 Step 6). It was the only per-element padding in the payment
       block, so the disclosure sat 20px below the button while every other gap was
       16px — asymmetric on both sides, and invisible in the container's class string
       because half of it lived in `payment-sheet.tsx`. `space-y-1` stays: it is
       `ui-context.md`'s own "tight label/value pairs" pick and was already correct.
       Subtractive: −4px. No character of the signed disclosure is touched. */
    <div className="space-y-1 text-center text-[0.75rem] leading-relaxed text-text-muted">
      <p>
        {/* ⚠️ The four required facts, and the FIRST one changes for a returning
            customer. Somebody who has already had their trial is charged today,
            so promising free days here would be a lie told directly above the
            button that takes their money. */}
        <span className="text-foreground">
          {trial
            ? `${TRIAL_DAYS} days free`
            : midGrace
              ? `Starts ${graceEndsOn}`
              : "Starts today"}
        </span>
        , then{" "}
        <span className="text-foreground">
          {formatPrice(selected.price, selected.currency)}{" "}
          {selected.currency.toUpperCase()}/{suffix}
        </span>
        {monthlyEquivalent(selected) !== null ? (
          <>
            {" "}({formatPrice(monthlyEquivalent(selected)!, selected.currency)}/mo)
          </>
        ) : null}
        {/* NO TERMINAL PERIOD. `02b` quotes this line without one, both plain
            (§ line 162) and with the monthly-equivalent bracket (§ line 245),
            while lines 2 and 3 are quoted with one. That asymmetry is
            deliberate and this is signed copy, so the stop is withheld rather
            than the other two being tidied to match it. */}
      </p>
      <p>
        First charge{" "}
        <span className="text-foreground">
          {trial ? firstChargeOn : midGrace ? graceEndsOn : "today"}
        </span>
        , then renews until you cancel.
      </p>
      {/* THE REMINDER, promised on this screen too (Adrian, 2026-08-08).
          The paywall's timeline already says it, and the fear it answers — "am
          I going to be charged without noticing" — is felt hardest with a card
          on screen, so it is stated where the card is.

          THIS IS NOW SENT (2026-08-12). `lib/notifications/trialReminder.ts`
          decides it and the existing reminder cron sends it, off
          `subscriptions.trial_ends_at`, on day {REMINDER_DAY} in the user's own
          timezone and outside their quiet hours. Stripe's `trial_will_end`
          fires on day 4 and is deliberately NOT the trigger; it only refreshes
          the stored trial end.

          ⚠️ Two conditions on the promise, both carried in `next-tasks.md`:
          it needs `supabase/notifications/004_trial_reminder.sql` applied, and
          it is a PUSH, so a user who never granted notification permission has
          no channel to receive it on. */}
      {/* The day-5 reminder is a promise about a TRIAL. There is no trial to
          remind anybody about here, and a reminder we would not send is worse
          than no line at all. */}
      {trial ? (
        <p>
          {/* No channel named. Push reaches only opted-in users and there is no
              email system in this codebase, so promising either would be a
              promise we cannot keep for everybody. "We'll notify you" is true
              via the in-app banner for all of them. */}
          We&apos;ll notify you before your trial ends. Cancel any time before
          then.
        </p>
      ) : (
        <p>Cancel any time from your Billing screen.</p>
      )}
    </div>
  ) : null;

  return (
    <StepFrame
      /**
       * ⚠️ APPROVED COPY. The no-trial title is §5 of the founder's brief; the
       * emphasis markup changes no character. The MID-GRACE title reuses the
       * trial variant's string (D17), which is literally true for that cohort
       * and invents nothing: they genuinely have nothing to pay today.
       */
      title={
        trial || midGrace ? (
          <>
            Nothing to pay <em className={FLOW_EMPHASIS}>today</em>.
          </>
        ) : (
          <>
            You&apos;ve had your <em className={FLOW_EMPHASIS}>trial</em>.
          </>
        )
      }
      /* ONE SHORT LINE. At 320x568 a three-line subcopy under a 2rem headline
         pushed the card fields off the top of the port — measured — leaving a
         payment screen whose form you had to scroll UP to find. The reassurance
         has one job here; the disclosure above the button says the rest. */
      /**
       * ⚠️ EVERY LINE HERE IS DECIDED COPY, CARRIED CHARACTER FOR CHARACTER.
       * Do not shorten, soften or improve any of them.
       *
       *   trial      D16. Replaces the built "Just a card to keep your trial
       *              going.", which §6 of the brief cut.
       *   mid-grace  D17. Present tense, one line, no the word "trial" — the
       *              grace is not one — and no language of expiry, running out
       *              or being used up. It reads as WELCOME: they are pre-arming
       *              billing so nothing interrupts them later.
       *   beta       §5 of the brief. Replaces the built "Your 14 days on us
       *              was it, so your plan starts today.", which was never the
       *              approved line.
       *   returning  §5 of the brief. Already correct as built.
       *
       * ⚠️ The `14` renders from `BETA_GRACE_DAYS` via `hadDays` and is never
       * typed, so the number on screen cannot drift from the grant.
       */
      sub={
        selected
          ? trial
            ? "We're setting billing up now, so nothing interrupts you later."
            : midGrace
              ? `Your plan starts when your ${hadDays} days on us end, on ${graceEndsOn}.`
              : wasBeta
                ? `We gave you ${hadDays} days free when Trackd Co went paid. Your plan starts from today.`
                : "Free trials are for new accounts, so your plan starts today."
          : undefined
      }
    >
      {/**
       * ⚠️ TOP-ALIGNED, NOT CENTRED (09 §3.2). This was `justify-center`, and it
       * is the whole of the dead space.
       *
       * The shared frame is not the culprit: this screen passes no centring flag,
       * so `StepFrame` already pins its header and aligns its scroll port to the
       * top. Then this column took the remaining port height and centred its
       * contents inside it.
       *
       * ⚠️ The gap is VARIABLE rather than a fixed amount, which is why §3.2
       * insists on measuring both widths: the wrapper is sized as the larger of
       * its content and the available space, so centring only does anything when
       * there IS spare room. At 390x844 there is, and it splits above and below.
       * At 320x568 the content already overflows, so this changes nothing there —
       * measured, and stated rather than assumed.
       */}
      {/* ⚠️ NO `pb-2` (09 Step 6). `ScrollPort` already supplies
          `pb-[max(1.25rem,env(safe-area-inset-bottom))]` because this screen passes no
          `footer`, and 1.25rem IS `ui-context.md`'s documented `pb-5`. The extra 8px
          was exactly the "per-screen ad-hoc padding" that table forbids, stacked on
          top of the documented value. Subtractive: −8px. */}
      <div className="flex w-full flex-1 flex-col justify-start">
        {selected && suffix ? (
          <PaymentSheet
            plan={selected.id}
            currency={selected.currency}
            /**
             * ⚠️ THE MODE COMES FROM THE SERVER'S ANSWER, not from the button
             * label. `eligible` false means no free days, which means an amount
             * is due today, which means a PaymentIntent.
             *
             * `resolved` gates the CTA rather than this, deliberately: the sheet
             * still mounts immediately in the generous default so the fields are
             * there to fill in, and only the commit waits. If the answer lands
             * as `payment`, the mode prop changes and Elements remounts with it.
             */
            /**
             * ⚠️ MID-GRACE IS A SETUP, NOT A PAYMENT, and getting this wrong
             * stopped a mid-grace user subscribing at all.
             *
             * `trial` is false for a beta account — they are not on a trial —
             * but `01` gives them a grace-ALIGNED start, so nothing is due
             * today and Stripe issues a SetupIntent. Keying the mode off
             * `trial` alone mounted the sheet for a payment, the server
             * returned a setup secret, and `02a`'s mode gate correctly refused
             * and cancelled. It failed safe, and it failed.
             *
             * The rule is "is anything due TODAY", which is what the mode
             * actually means, and it is the same question the title asks:
             * both `trial` and `midGrace` read "Nothing to pay today."
             */
            mode={trial || midGrace ? "setup" : "payment"}
            onModeCorrection={setCorrectedMode}
            /**
             * What the bank redirect came back with, if anything. Rendered by
             * the sheet in its own error slot so it sits with the CTA rather
             * than somewhere else on the screen.
             */
            notice={
              returning === "failed"
                ? "That payment didn't go through. Nothing has been charged. Please try again."
                : returning === "requires_action"
                  ? "Your bank is still checking that payment. Give it a moment, then try again."
                  : undefined
            }
            amountMinor={selected.amountMinor}
            ready={resolved}
            ctaLabel={
              trial ? `Start my ${TRIAL_DAYS}-day free trial` : "Subscribe"
            }
            disclosure={disclosure}
            onOutcome={onOutcome}
          />
        ) : (
          /* No price means no plan, and a payment form with nothing behind it
             would be worse than saying so. Reached only if Stripe could not be
             reached at all — the paywall before this says the same thing. */
          <p
            role="alert"
            className="text-center text-[0.8rem] text-[var(--state-error)]"
          >
            We couldn&apos;t load your plan just now. Please go back and try
            again.
          </p>
        )}
      </div>
    </StepFrame>
  );
}
