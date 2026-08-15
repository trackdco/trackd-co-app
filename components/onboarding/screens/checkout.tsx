"use client";

import { useEffect, useState } from "react";

import {
  resolveReturningIntent,
  trialEligibility,
  type TrialEligibility,
} from "@/app/onboarding/billing-actions";
import { track } from "@/lib/onboarding/analytics";
import type { IntentKind } from "@/lib/billing/stripe";
import {
  billingDate,
  formatPrice,
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
  const { session, goNext, priceFor } = useFlow();
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
   * Starts as `true` and narrows on the answer. That direction is deliberate and
   * matches the server: `trialEligibility` and `startTrial` both err towards
   * granting, so the worst case is a screen that promised a trial and a server
   * that grants one. The reverse would be the defect.
   */
  const [eligibility, setEligibility] = useState<TrialEligibility>({
    eligible: true,
    reason: "new",
    days: TRIAL_DAYS,
    // No grace date before the server answers, which is the generous default's
    // own shape: a brand-new user has no beta grace to be told about. `02b`
    // owns whatever this screen eventually says with it.
    graceEndsAt: null,
  });
  /**
   * ⚠️ HAS THE SERVER ANSWERED YET? The CTA waits on this (spec 02a §3.3).
   *
   * Until spec 02a the sheet was setup-only, so pressing early was harmless: the
   * worst case was a card form that collected a card. It is not harmless now.
   * Elements takes its `mode` at MOUNT and cannot be switched afterwards, so a
   * press before this resolves is the difference between mounting a sheet that
   * collects a card and one that takes money.
   *
   * The generous default above still RENDERS immediately, so the screen never
   * flashes empty. Only the button waits.
   */
  const [resolved, setResolved] = useState(false);
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

  useEffect(() => {
    let alive = true;
    void trialEligibility()
      .then((r) => {
        if (alive) setEligibility(r);
      })
      .catch(() => {
        // Keep the generous default. See above.
      })
      .finally(() => {
        /**
         * `finally`, so a FAILED call also releases the button. The generous
         * default stands in that case and the server decides independently
         * anyway — leaving the CTA dead forever because one call failed would
         * be a worse screen than one that lets them try.
         */
        if (alive) setResolved(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const selected = priceFor(session.plan);
  // Resolved ONCE, so the date cannot move under the user mid-session — the
  // whole point of printing it is that it is a fixed commitment.
  const [firstChargeOn] = useState(() => billingDate(new Date()));

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
    track("trial_started", { plan: session.plan, days: TRIAL_DAYS });
    setHolding(true);
  };

  if (holding) return <TrialHold onEntitled={goNext} />;

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
        <div className="flex w-full flex-1 flex-col justify-center gap-3 pb-2" aria-busy="true">
          <div className="h-13 w-full animate-pulse rounded-2xl bg-bg-surface-raised" />
          <div className="h-13 w-full animate-pulse rounded-2xl bg-bg-surface-raised" />
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
  /** "yr" / "mo" / "wk" — the compact suffix, so the line stays one line. */
  const suffix =
    selected?.period === "year" ? "yr" : selected?.period === "month" ? "mo" : "wk";

  const disclosure = selected ? (
    <div className="space-y-1 pt-1 text-center text-[0.75rem] leading-relaxed text-text-muted">
      <p>
        {/* ⚠️ The four required facts, and the FIRST one changes for a returning
            customer. Somebody who has already had their trial is charged today,
            so promising free days here would be a lie told directly above the
            button that takes their money. */}
        <span className="text-foreground">
          {trial ? `${TRIAL_DAYS} days free` : "Starts today"}
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
        .
      </p>
      <p>
        First charge{" "}
        <span className="text-foreground">{trial ? firstChargeOn : "today"}</span>
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
      title={
        trial ? (
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
      sub={
        selected
          ? trial
            ? "Just a card to keep your trial going."
            : wasBeta
              ? `Your ${hadDays} days on us was it, so your plan starts today.`
              : "Free trials are for new accounts, so your plan starts today."
          : undefined
      }
    >
      <div className="flex w-full flex-1 flex-col justify-center pb-2">
        {selected ? (
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
            mode={trial ? "setup" : "payment"}
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
