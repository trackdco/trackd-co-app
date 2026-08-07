"use client";

import { useState } from "react";

import { track } from "@/lib/onboarding/analytics";
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
export function CheckoutScreen() {
  const { session, goNext, priceFor } = useFlow();
  const [holding, setHolding] = useState(false);

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
  const disclosure = selected ? (
    <div className="space-y-1 pt-1 text-center text-[0.75rem] leading-relaxed text-text-muted">
      <p>
        <span className="text-foreground">
          {TRIAL_DAYS}{" "}days free
        </span>
        , then{" "}
        <span className="text-foreground">
          {formatPrice(selected.price, selected.currency)}{" "}{selected.currency.toUpperCase()}
        </span>
        {" "}per{" "}
        {selected.period}
        {monthlyEquivalent(selected) !== null ? (
          <>
            {" "}({formatPrice(monthlyEquivalent(selected)!, selected.currency)}/mo)
          </>
        ) : null}
        .
      </p>
      <p>
        First charge{" "}
        <span className="text-foreground">{firstChargeOn}</span>. Renews
        automatically until you cancel.
      </p>
      <p>
        Cancel any time before day{" "}
        {TRIAL_DAYS}.
      </p>
    </div>
  ) : null;

  return (
    <StepFrame
      title={
        <>
          Nothing to pay <em className={FLOW_EMPHASIS}>today</em>.
        </>
      }
      /* ONE LINE. At 320x568 a three-line subcopy under a 2rem headline pushed
         the card fields off the top of the port — measured — leaving a payment
         screen whose payment form you had to scroll UP to find. The reassurance
         only has one job here, and the disclosure above the button says the
         rest properly. */
      sub={selected ? `Just a card, so nothing stops on day ${TRIAL_DAYS}.` : undefined}
    >
      <div className="flex w-full flex-1 flex-col justify-center pb-2">
        {selected ? (
          <PaymentSheet
            plan={selected.id}
            currency={selected.currency}
            ctaLabel={`Start my ${TRIAL_DAYS}-day free trial`}
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
