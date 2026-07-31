"use client";

import { useFlow } from "../flow-context";
import { CostVariantD } from "./cost-variants";

/**
 * The cost screen, in the flow.
 *
 * Variant D is in place because that is the one Adrian picked out of six
 * (2026-07-31); the full set stays reachable at `/onboarding/cost` until the
 * choice is final, at which point the losers and that route both get deleted.
 * Swapping the winner is one import.
 */
export function CostScreen() {
  const { goNext } = useFlow();
  return <CostVariantD onContinue={goNext} />;
}
