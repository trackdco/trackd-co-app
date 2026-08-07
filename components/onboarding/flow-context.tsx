"use client";

import { createContext, useContext } from "react";

import type { OnboardingSession } from "@/lib/onboarding/session";
import type { PlanId, PricedPlan } from "@/lib/onboarding/pricing";
import type { StepId } from "@/lib/onboarding/steps";

/**
 * What every onboarding screen can reach: the anonymous session, a patcher for
 * it, and the three navigation verbs. Screens never compute their own "next" —
 * the order lives in `lib/onboarding/steps.ts` and nowhere else.
 */
export interface FlowContextValue {
  session: OnboardingSession;
  patch: (next: Partial<OnboardingSession>) => void;
  step: StepId;
  goNext: () => void;
  goBack: () => void;
  goTo: (step: StepId) => void;
  /** Ends the flow and hands off to the today-dashboard. */
  finish: () => void;
  /**
   * Let a screen intercept BACK. The demo is one step with four stages, so
   * backing out of stage three should land on stage two, not throw the user out
   * of the whole demo (Adrian, 2026-08-01). Return true to say "handled";
   * return false and the flow walks history as usual. Pass null to release it.
   */
  setBackHandler: (fn: (() => boolean) | null) => void;
  /**
   * Name resolved from the claimed account. Null while anonymous.
   *
   * `setAccountName` used to sit beside this and had no consumer once the
   * paywall's `setAccountName(null)` was deleted — the flow sets it from
   * `onClaimed` using its own setter. A shared setter nobody calls is an
   * invitation to write to this from a leaf screen, which is the one thing it
   * must not be.
   */
  accountName: string | null;
  /**
   * THE PRICES, AS STRIPE REPORTS THEM.
   *
   * Not in the codebase — spec w2b-15 forbids a hardcoded dollar amount so a
   * dashboard change takes effect without a deploy. Fetched server-side in
   * `app/onboarding/page.tsx` and handed down, because three ANONYMOUS screens
   * need them well before there is a session.
   *
   * **A plan may be `undefined`**, and every caller has to handle that rather
   * than assert it away: the loader deliberately swallows a Stripe outage so a
   * free flow does not go down with a billing provider. A missing price means
   * render nothing, never render a blank number.
   */
  priceFor: (plan: PlanId) => PricedPlan | undefined;
  /**
   * Whether the SERVER saw a session for this page load. Read by the account
   * screen to show its waiting state instead of the sign-in controls; never a
   * substitute for a real guard, which lives in `app/onboarding/page.tsx`.
   */
  signedIn: boolean;
  /** "YYYY-MM-DD" for today, resolved once on mount so every screen agrees. */
  todayKey: string;
}

export const FlowContext = createContext<FlowContextValue | null>(null);

export function useFlow(): FlowContextValue {
  const ctx = useContext(FlowContext);
  if (!ctx) {
    throw new Error("useFlow must be used inside the onboarding flow");
  }
  return ctx;
}
