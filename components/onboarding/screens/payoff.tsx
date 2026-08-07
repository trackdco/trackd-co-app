"use client";

import { useEffect } from "react";

import { track } from "@/lib/onboarding/analytics";

import { useFlow } from "../flow-context";
import { PAYOFF_COPY, PayoffVariantB } from "./payoff-variants";

/**
 * Screen 9 — Payoff (Spec 3-01 §9).
 *
 * **Variant B ships** (Adrian, 2026-08-05: "B is amazing"). It replaced the
 * original three-bar comparison — notes app / spreadsheet / Trackd — which
 * argued about TOOLS while the person reading it is thinking about their own
 * run. B shows the record filling in over three months and then says what that
 * gets you.
 *
 * The other three candidates stay reachable at `/onboarding/payoff` until the
 * choice is final, at which point they and that route are deleted together.
 * Swapping the winner is one import.
 *
 * ## What this screen may not say
 *
 * Adrian's note was "people will be able to know what compounds did what". That
 * is the appeal and it cannot be worded that way: "what worked" is an outcome
 * claim about a prescription-only substance, which §3.1 and the TGA line rule
 * out. What is true is that everything lands on one timeline, so the comparison
 * becomes possible — and the copy hands the interpretation back to the user
 * explicitly. See the comment in `payoff-variants.tsx`.
 *
 * There are no percentages and no invented statistics anywhere on this screen
 * (§14 bans both outright).
 */
export function PayoffScreen() {
  const { goNext } = useFlow();

  useEffect(() => {
    track("payoff_viewed");
  }, []);

  // B3 (Adrian, 2026-08-05: "one tap a day, a year of answers — that is the
  // best one"). It is the only one of the three that states the COST of the
  // habit and the size of the reward in the same breath, which is the actual
  // trade being offered.
  return <PayoffVariantB onContinue={goNext} copy={PAYOFF_COPY[2]} />;
}
