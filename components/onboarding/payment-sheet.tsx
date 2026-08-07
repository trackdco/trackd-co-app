"use client";

import { useCallback, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

import { CircleNotch } from "@/components/icons";
import { startTrial } from "@/app/onboarding/billing-actions";
import type { PlanId } from "@/lib/onboarding/pricing";

import { paymentAppearance } from "./stripe-appearance";

/**
 * The payment surface, mounted INSIDE the paywall (Spec w2b-15).
 *
 * Not Stripe Hosted Checkout and not Embedded Checkout: **the user must never be
 * redirected to a stripe.com domain.** This is TRACKD's own screen with Stripe's
 * fields on it.
 *
 * Onboarding-scoped, like `chrome.tsx` — nothing outside this flow imports it,
 * which is the line the spec draws about new shared components.
 *
 * ## The deferred-intent flow, and why it has to be that one
 *
 * The Element mounts in `mode: "setup"` with NO client secret. That matters:
 * the alternative is creating a Stripe subscription on page load so there is a
 * secret to mount with, which would mint a subscription for every visitor who
 * merely LOOKED at the paywall. Nothing is created until the user commits.
 *
 * On submit: `elements.submit()` validates the fields, the server creates the
 * subscription and hands back the pending SetupIntent's secret, and the client
 * confirms THAT. Because the amount due today is zero there is no PaymentIntent
 * to confirm — and confirming a SetupIntent is better than a workaround, since
 * it runs 3D Secure while the user is present rather than against a sleeping
 * phone on day 7.
 *
 * ## Confirming grants nothing
 *
 * A confirmed SetupIntent proves a card was accepted. Access arrives when the
 * webhook writes `entitlements`, which is why `onConfirmed` hands off to a
 * holding state rather than into the app.
 */

/**
 * Loaded ONCE per document, at module scope, per Stripe's own guidance —
 * `loadStripe` injects a script tag and calling it per render would add one per
 * mount. The promise is created lazily so a missing key does not throw at import
 * time and take the whole flow down with it.
 */
let stripePromise: Promise<Stripe | null> | null = null;
function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripePromise = key ? loadStripe(key) : Promise.resolve(null);
  }
  return stripePromise;
}

export type PaymentOutcome =
  /** The card was accepted. Access still has to come from the webhook. */
  | { status: "confirmed" }
  /** Already entitled — do not charge them again. */
  | { status: "already-subscribed" }
  | { status: "error"; message: string };

export function PaymentSheet({
  plan,
  currency,
  ctaLabel,
  onOutcome,
}: {
  plan: PlanId;
  /** Lowercase ISO 4217, as Stripe reports it for the selected price. */
  currency: string;
  ctaLabel: string;
  onOutcome: (outcome: PaymentOutcome) => void;
}) {
  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    // Said out loud rather than rendered as an empty space. This is the one
    // screen where showing nothing is worse than showing a fault: the user is
    // trying to pay and would otherwise sit looking at a gap.
    return (
      <p role="alert" className="text-center text-[0.8rem] text-[var(--state-error)]">
        Payments aren&apos;t available right now. Please try again shortly.
      </p>
    );
  }

  return (
    <Elements
      stripe={getStripe()}
      options={{
        // SETUP mode: nothing is owed today, so there is no amount and no
        // PaymentIntent. `setupFutureUsage` is what tells Stripe the card is
        // being kept for a later off-session charge — which is exactly what a
        // trial converting on day 7 is.
        mode: "setup",
        currency,
        setupFutureUsage: "off_session",
        appearance: paymentAppearance(),
        // Geist, into the iframe. Without this the Element falls back to a
        // system font and reads as a bolted-on third-party control.
        fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500&display=swap" }],
      }}
    >
      <PaymentForm plan={plan} ctaLabel={ctaLabel} onOutcome={onOutcome} />
    </Elements>
  );
}

function PaymentForm({
  plan,
  ctaLabel,
  onOutcome,
}: {
  plan: PlanId;
  ctaLabel: string;
  onOutcome: (outcome: PaymentOutcome) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * One path for the card fields and for a wallet, so they cannot diverge.
   *
   * `elements.submit()` first — it validates and, on the wallet path, is what
   * Stripe requires before confirming. Then the server creates the subscription.
   * Then the client confirms the SetupIntent it handed back.
   */
  const run = useCallback(async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        // A field-level problem — a missing number, a bad expiry. Stripe's own
        // message is the useful one here and is safe to show: it is about what
        // the user typed, not about our account.
        setError(submitError.message ?? "Please check your card details.");
        return;
      }

      // NOTHING IS CREATED UNTIL HERE. This is the commit.
      const result = await startTrial(plan);
      if (result.status === "already-subscribed") {
        onOutcome({ status: "already-subscribed" });
        return;
      }
      if (result.status === "error") {
        setError(result.message);
        return;
      }

      const { error: confirmError } = await stripe.confirmSetup({
        elements,
        clientSecret: result.clientSecret,
        confirmParams: {
          // Only used if the bank forces a full redirect for 3D Secure. Coming
          // back to the paywall is right: the holding state picks up from there
          // and polls for the entitlement, exactly as it would have done inline.
          return_url: `${window.location.origin}/onboarding?step=paywall`,
        },
        // Keep the user on THIS page wherever the bank allows it. The spec's
        // rule is that they never leave for a stripe.com domain, and most 3DS
        // challenges can run in a modal rather than a navigation.
        redirect: "if_required",
      });

      if (confirmError) {
        setError(confirmError.message ?? "That card couldn't be confirmed.");
        return;
      }

      // The card is good. Access is NOT granted yet — the webhook does that.
      onOutcome({ status: "confirmed" });
    } catch (err) {
      console.error("[billing] confirm failed:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [stripe, elements, plan, onOutcome]);

  return (
    <div className="space-y-4">
      {/* THE WALLETS, ABOVE THE CARD FIELDS. Not optional and not a nicety —
          the spec calls this the primary conversion path on mobile, and a
          buried Apple Pay button is a button nobody uses. `ExpressCheckoutElement`
          renders nothing at all on a device with no wallet configured, so it
          costs a desktop user no space. */}
      <ExpressCheckoutElement
        options={{
          buttonTheme: { applePay: "white-outline", googlePay: "white" },
          buttonHeight: 48,
        }}
        onConfirm={() => void run()}
      />

      <PaymentElement
        options={{
          layout: "accordion",
          // The wallets are already above, as their own buttons. Leaving them
          // enabled here too would draw a second Apple Pay control inside the
          // card block.
          wallets: { applePay: "never", googlePay: "never" },
        }}
      />

      {error ? (
        <p role="alert" className="text-[0.8rem] text-[var(--state-error)]">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void run()}
        disabled={busy || !stripe || !elements}
        className="h-13 w-full rounded-2xl bg-accent-primary px-6 text-[0.95rem] font-medium text-bg-base transition-all duration-[var(--motion-base)] ease-[var(--motion-ease)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        {busy ? (
          <span className="flex items-center justify-center gap-2">
            <CircleNotch className="h-4 w-4 animate-spin" />
            Starting
          </span>
        ) : (
          ctaLabel
        )}
      </button>
    </div>
  );
}
