"use client";

import { useCallback, useState, type ReactNode } from "react";
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
import type { IntentKind } from "@/lib/billing/stripe";

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
 * webhook writes `entitlements`, which is why the outcome hands off to a holding
 * state rather than into the app.
 *
 * ## The floating "stripe" pill over the CTA is a TEST-MODE ARTEFACT
 *
 * Stripe.js injects a fixed 123x72 iframe bottom-right
 * (`elements-inner-easel`, measured at 390x844 sitting over the button). It is
 * the test-mode indicator and renders ONLY for a `pk_test_` key, so it is absent
 * in production. Worth knowing before someone "fixes" the button's position for
 * a collision that does not exist for a real customer.
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
  mode,
  amountMinor,
  ready,
  ctaLabel,
  disclosure,
  onOutcome,
  onModeCorrection,
}: {
  plan: PlanId;
  /** Lowercase ISO 4217, as Stripe reports it for the selected price. */
  currency: string;
  /**
   * ⚠️ WHICH MODE ELEMENTS MOUNTS IN, AND IT CANNOT BE CHANGED AFTERWARDS.
   *
   * This is the crux of spec 02a §3.3. Stripe takes `mode` at mount, but the
   * client secret only arrives after the user presses the button — far too late
   * to decide which kind of sheet they should have been looking at. So the mode
   * is derived from `trialEligibility()` BEFORE this mounts, and the CTA stays
   * unpressable until that answer lands.
   *
   * `setup` = nothing due today. `payment` = an amount due today, and
   * {@link amountMinor} must be present.
   */
  mode: IntentKind;
  /**
   * ⚠️ HAS THE SERVER'S ELIGIBILITY ANSWER LANDED? Until it has, the CTA is not
   * pressable (spec 02a §3.3).
   *
   * The FIELDS still mount immediately, so the user can fill their card in
   * while the answer is in flight and the screen never flashes empty. Only the
   * commit waits — because pressing early is now the difference between a sheet
   * that collects a card and one that takes money.
   */
  ready: boolean;
  /**
   * The charge, in Stripe's own minor units, for `mode: "payment"` only.
   *
   * ⚠️ Comes from `price.unit_amount` and is NEVER the display figure
   * multiplied back up: measured on this account, `69.99 * 100` is
   * `6998.999999999999`, so the yearly plan would be handed a non-integer and
   * either error or round to $69.98.
   */
  amountMinor?: number;
  ctaLabel: string;
  /**
   * The trial/price/date/auto-renewal disclosure, rendered DIRECTLY ABOVE the
   * CTA — see `PaymentForm`. It is passed in rather than built here because the
   * paywall owns the wording and the figures; what this component owns is that
   * it cannot be separated from the button.
   */
  disclosure: ReactNode;
  onOutcome: (outcome: PaymentOutcome) => void;
  /**
   * ⚠️ THE SERVER DISAGREED ABOUT WHAT THIS SHEET SHOULD BE (§3.3).
   *
   * Called with the mode the server actually resolved, so the screen above can
   * re-render the sheet — and `02b`'s copy with it — instead of leaving a
   * disclosure on screen describing a deal the server has just declined to
   * make. Nothing has been confirmed and nothing charged when this fires; the
   * subscription created for the mismatched attempt is already cancelled.
   */
  onModeCorrection?: (mode: IntentKind) => void;
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
        /**
         * SETUP: nothing is owed today, so there is no amount and no
         * PaymentIntent. `setupFutureUsage` tells Stripe the card is kept for a
         * later off-session charge, which is exactly what a trial converting on
         * day 7 is.
         *
         * PAYMENT: an amount is due now. Stripe requires `amount` in minor
         * units at mount. `setupFutureUsage` stays, because the card must also
         * be saved for the renewal — a paid-today customer who had to re-enter
         * their card next month would be a worse outcome than the trial's.
         */
        ...(mode === "payment"
          ? { mode: "payment" as const, amount: amountMinor ?? 0 }
          : { mode: "setup" as const }),
        currency,
        setupFutureUsage: "off_session",
        /**
         * CARD ONLY in this element, and the wallets live above it.
         *
         * Left to the account's defaults, Stripe renders LINK here — which
         * takes over the block with a phone-number field, a full-name field and
         * its own terms, all before a card number. Measured at 320x568: it
         * pushed everything else off the screen and asked a user mid-signup for
         * a phone number we do not want and have never asked for anywhere else
         * in this product.
         *
         * The spec's shape is "Apple Pay and Google Pay above, card entry as the
         * fallback beneath them", which is exactly this. Every other method
         * Stripe might add stays off by construction rather than appearing one
         * day because a dashboard toggle moved.
         */
        paymentMethodTypes: ["card"],
        appearance: paymentAppearance(),
        // Geist, into the iframe. Without this the Element falls back to a
        // system font and reads as a bolted-on third-party control.
        fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500&display=swap" }],
      }}
    >
      <PaymentForm
        plan={plan}
        mode={mode}
        ready={ready}
        ctaLabel={ctaLabel}
        disclosure={disclosure}
        onOutcome={onOutcome}
        onModeCorrection={onModeCorrection}
      />
    </Elements>
  );
}

function PaymentForm({
  plan,
  mode,
  ready,
  ctaLabel,
  disclosure,
  onOutcome,
  onModeCorrection,
}: {
  plan: PlanId;
  /** The mode Elements was mounted in. The confirm call must match it. */
  mode: IntentKind;
  /** False until eligibility resolves. Disables the CTA, nothing else. */
  ready: boolean;
  ctaLabel: string;
  disclosure: ReactNode;
  onOutcome: (outcome: PaymentOutcome) => void;
  /** See `PaymentSheet`. */
  onModeCorrection?: (mode: IntentKind) => void;
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
  const run = useCallback(async (onFail?: () => void) => {
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);

    /**
     * TELL THE WALLET, not just the page.
     *
     * Apple Pay and Google Pay render in an OS sheet that sits ABOVE our DOM, so
     * the inline error below is painted behind it — invisible, while the sheet
     * spins forever. `ExpressCheckoutElement`'s confirm event carries
     * `paymentFailed()` and it is the only way to dismiss that sheet. Not
     * calling it left the spec's "primary conversion path on mobile" hanging on
     * every decline.
     */
    const fail = (message: string) => {
      setError(message);
      onFail?.();
    };

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        // A field-level problem — a missing number, a bad expiry. Stripe's own
        // message is the useful one here and is safe to show: it is about what
        // the user typed, not about our account.
        fail(submitError.message ?? "Please check your card details.");
        return;
      }

      /**
       * NOTHING IS CREATED UNTIL HERE. This is the commit.
       *
       * The mounted mode goes with it so the server can refuse to hand back a
       * secret this sheet cannot confirm — see the mode gate in `startTrial`.
       */
      const result = await startTrial(plan, mode);
      if (result.status === "already-subscribed") {
        onOutcome({ status: "already-subscribed" });
        return;
      }
      if (result.status === "error") {
        /**
         * ⚠️ A MODE MISMATCH. The server cancelled what it made and confirmed
         * nothing; `serverMode` names what this sheet should have been.
         *
         * Handing it up re-renders the sheet in that mode, which re-renders
         * `02b`'s copy with it, so the disclosure and the button stop describing
         * a deal the server has just declined to make.
         */
        if (result.serverMode) onModeCorrection?.(result.serverMode);
        fail(result.message);
        return;
      }

      /**
       * ⚠️ THE SECOND HALF OF THE MODE GATE, on the client.
       *
       * The server already refused a mismatch, so this cannot normally fire. It
       * is here because the cost of the two disagreeing is a charge against a
       * screen that promised free days, and `confirmPayment` on a sheet mounted
       * in setup mode is a call that must never be reachable by any route —
       * including a future caller that forgets to pass its mounted mode.
       */
      if (result.intentKind !== mode) {
        console.error(
          `[billing] refusing to confirm: sheet is "${mode}", server returned "${result.intentKind}"`,
        );
        onModeCorrection?.(result.intentKind);
        fail("Your plan details changed. Please check them and try again.");
        return;
      }

      const confirmArgs = {
        elements,
        clientSecret: result.clientSecret,
        confirmParams: {
          // Only used if the bank forces a full redirect for 3D Secure. Coming
          // back to the paywall is right: the holding state picks up from there
          // and polls for the entitlement, exactly as it would have done inline.
          // The CARD screen, not the paywall. Payment moved to its own step,
          // and coming back to the price list someone has just paid on is
          // precisely what the spec forbids.
          return_url: `${window.location.origin}/onboarding?step=start`,
        },
        // Keep the user on THIS page wherever the bank allows it. The spec's
        // rule is that they never leave for a stripe.com domain, and most 3DS
        // challenges can run in a modal rather than a navigation.
        redirect: "if_required" as const,
      };

      /**
       * ⚠️ TWO DIFFERENT STRIPE CALLS, chosen by the kind the server returned
       * and never by anything the client inferred.
       *
       * `confirmSetup` saves a card for later. `confirmPayment` takes money
       * now. They are not interchangeable and the wrong one against the wrong
       * intent either errors or charges.
       */
      const { error: confirmError } =
        result.intentKind === "payment"
          ? await stripe.confirmPayment(confirmArgs)
          : await stripe.confirmSetup(confirmArgs);

      if (confirmError) {
        fail(confirmError.message ?? "That card couldn't be confirmed.");
        return;
      }

      // The card is good. Access is NOT granted yet — the webhook does that.
      onOutcome({ status: "confirmed" });
    } catch (err) {
      console.error("[billing] confirm failed:", err);
      fail("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [stripe, elements, plan, mode, onOutcome, onModeCorrection]);

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
        onConfirm={(event) => void run(() => event.paymentFailed({ reason: "fail" }))}
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

      {/* THE DISCLOSURE SITS HERE, and its position is the requirement.
          It was above the Payment Element, which measured at 390x844 as the CTA
          being 550px below the last line of it — so the price, the charge date
          and the auto-renewal notice were all scrolled off before the button
          came into view. That is exactly the defect the spec's previous audit of
          this screen found: it could be paid on without the price ever having
          rendered. Adjacent to the button is the only arrangement that cannot
          drift back into that, whatever is added above. */}
      {disclosure}

      <button
        type="button"
        onClick={() => void run()}
        /**
         * ⚠️ `!ready` joins the existing disabled conditions rather than
         * introducing a new control or a new treatment. `ui-context.md`: the
         * primary action is a WHITE button (`bg-accent-primary`) and is never
         * amber, and its not-yet-pressable state is the `disabled:opacity-40`
         * already on this element. Nothing new to style, nothing to drift.
         */
        disabled={busy || !ready || !stripe || !elements}
        aria-busy={busy || !ready}
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
