"use client";

import { createContext, useContext } from "react";

import type { OnboardingSession } from "@/lib/onboarding/session";
import type { PlanId, PricedPlan } from "@/lib/onboarding/pricing";
import type { TrialEligibility } from "@/app/onboarding/billing-actions";
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
   * Play the "Here's how it works." beat over whatever is on screen.
   *
   * ⚠️ IT LIVES ON THE FLOW, NOT ON THE SCREEN THAT TRIGGERS IT, and that is
   * the whole reason it is here. Owned by the celebrate screen it could not do
   * its job: the caller wants to ADVANCE THE STEP and let the beat cover the
   * change, but advancing unmounts celebrate, which unmounted the overlay with
   * it. The flow outlives every step, so the overlay does too.
   *
   * Call it immediately before `goNext()`. The step swaps underneath while the
   * canvas is covered, and the fade-out reveals the screen you moved to rather
   * than the one you left.
   */
  playHandoff: () => void;
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
  /**
   * ⚠️ THE SERVER'S ELIGIBILITY ANSWER, resolved at page render (spec 02b
   * §3.6) rather than fetched from an effect on the checkout screen.
   *
   * It decides what the checkout copy SAYS and, since `02a`, which mode the
   * Payment Element mounts in — so one answer at one moment is the difference
   * between a stable payment screen and one whose promise changes mid-read.
   *
   * Undefined only where there is no server behind the flow, i.e. the
   * `/preview/paywall` harness, which falls back to the generous default.
   */
  eligibility?: TrialEligibility;
  /**
   * The first-charge date, formatted server-side in the user's stored timezone
   * (spec 02b §3.5). One value for the paywall and the checkout screen, so the
   * two cannot name different days.
   */
  firstChargeOn?: string;
  /** A mid-grace user's grace end, formatted the same way. Null otherwise. */
  graceEndsOn?: string | null;
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
