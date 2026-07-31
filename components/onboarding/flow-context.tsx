"use client";

import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { OnboardingSession } from "@/lib/onboarding/session";
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
  /** Name from auth, once the paywall has run. Null while anonymous. */
  accountName: string | null;
  setAccountName: Dispatch<SetStateAction<string | null>>;
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
