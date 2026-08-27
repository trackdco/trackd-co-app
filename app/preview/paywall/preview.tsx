"use client";

import { useCallback, useMemo, useState } from "react";

import { FlowContext, type FlowContextValue } from "@/components/onboarding/flow-context";
import { CheckoutScreen } from "@/components/onboarding/screens/checkout";
import { PaywallScreen } from "@/components/onboarding/screens/paywall";
import { TrialHold } from "@/components/onboarding/trial-hold";
import { EMPTY_SESSION, type OnboardingSession } from "@/lib/onboarding/session";
import { PLANS, type PlanId, type PricedPlan } from "@/lib/onboarding/pricing";
import { cn } from "@/lib/utils";

/**
 * The paywall, the CARD SCREEN and the holding state, viewable WITHOUT signing
 * in.
 *
 * ## Why this exists
 *
 * The real paywall sits behind two server-side gates — a verified session and a
 * proven 18+ — and it should. That makes it the one screen in the flow nobody
 * can look at without first making an account, and on a LAN dev server making an
 * account is itself awkward: Google OAuth bounces to whatever Supabase has as
 * its Site URL (production) because a `10.x` origin is not in the redirect
 * allow-list.
 *
 * So this mounts the REAL `PaywallScreen` with the REAL Stripe prices in a
 * minimal flow context. It is for judging the screen, not for testing payment —
 * see the note on the CTA below.
 *
 * Same shape as the six existing `/preview/*` harnesses, and it 404s in
 * production for the same reason they do.
 */

/**
 * ⚠️ THE STRIPE INTERVAL IS CARRIED, and dropping it made this harness lie.
 *
 * `intervalSuffix` (02b §3.3) takes the unit from the price's own recurring
 * interval and returns null when it cannot, and both the checkout disclosure and
 * the paywall price line withhold themselves on that null. This harness passed
 * only plan/amount/currency, so every plan reached those screens with NO
 * interval — and they did exactly what they are built to do and said nothing.
 *
 * Driven, before this was carried: the checkout view of this preview rendered
 * "We couldn't load your plan just now. Please go back and try again." in place
 * of the entire disclosure, which is the one thing 02b is about. The paywall
 * kept its price line only because it was still reading the STATIC table, which
 * is the defect D73 removes — so fixing the paywall would have blanked this
 * harness's last price too.
 *
 * A review harness that cannot show the copy under review is worse than none:
 * it shows an error and invites the conclusion that the SCREEN is broken.
 */
export interface PreviewPrice {
  plan: PlanId;
  amount: number;
  currency: string;
  interval: string;
  intervalCount: number;
}

export function PaywallPreview({ prices }: { prices: PreviewPrice[] }) {
  const [session, setSession] = useState<OnboardingSession>({
    ...EMPTY_SESSION,
    name: "Adrian",
    plan: "yearly",
  });
  const [view, setView] = useState<"plans" | "start" | "holding">("plans");

  const priceFor = useCallback(
    (plan: PlanId): PricedPlan | undefined => {
      const match = prices.find((p) => p.plan === plan);
      return match
        ? {
            ...PLANS[plan],
            price: match.amount,
            currency: match.currency,
            interval: match.interval,
            intervalCount: match.intervalCount,
          }
        : undefined;
    },
    [prices],
  );

  const value = useMemo<FlowContextValue>(
    () => ({
      session,
      patch: (next) => setSession((s) => ({ ...s, ...next })),
      step: view === "start" ? "start" : "plans",
      // The paywall's CTA advances to the card screen, exactly as in the flow.
      goNext: () => setView((v) => (v === "plans" ? "start" : "holding")),
      goBack: () => {},
      goTo: () => {},
      finish: () => {},
      setBackHandler: () => {},
      // No-op: the hand-off beat plays between celebrate and the demo, and
      // neither is reachable from this harness.
      playHandoff: () => {},
      accountName: null,
      // FALSE on purpose. The screen does not branch on it, and claiming a
      // session here would make the harness lie about the one thing the real
      // route actually checks.
      signedIn: false,
      priceFor,
      todayKey: new Date().toISOString().slice(0, 10),
    }),
    [session, priceFor, view],
  );

  return (
    <FlowContext.Provider value={value}>
      <div className="flow-canvas flow-viewport flex flex-col overflow-x-clip">
        {/* Harness chrome. Deliberately plain so it cannot be mistaken for part
            of the screen being judged. */}
        <div className="shrink-0 border-b-[0.5px] border-border-default px-5 py-2">
          <p className="text-[10px] font-sans uppercase tracking-[0.18em] text-text-subtle">
            Paywall · preview
          </p>
          <div className="mt-2 flex gap-1.5">
            {(["plans", "start", "holding"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "h-8 flex-1 rounded-lg text-xs transition-colors duration-[var(--motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                  v === view
                    ? "bg-accent-primary font-medium text-bg-base"
                    : "bg-bg-surface text-text-muted",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col">
          {view === "holding" ? (
            /* It polls a server action that answers for the CURRENT session,
               and there is none here — so it will sit on "Setting up your
               trial" and then reach the recoverable state, which is exactly the
               pair worth looking at. */
            <TrialHold onEntitled={() => setView("plans")} />
          ) : view === "start" ? (
            <CheckoutScreen />
          ) : (
            <PaywallScreen />
          )}
        </div>
      </div>
    </FlowContext.Provider>
  );
}
