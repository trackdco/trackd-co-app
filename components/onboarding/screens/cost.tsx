"use client";

import { useFlow } from "../flow-context";
import { CostVariantG } from "./cost-variants";

/**
 * The cost screen, in the flow.
 *
 * **Variant G ships** (Adrian, 2026-08-05: "I really like that one"). It
 * replaced D, which he picked out of the first six on 2026-07-31 and then
 * rejected the diagram of — he kept the line and wanted a different picture
 * under it.
 *
 * G is the tiers idea he described: the things you already pay for accumulating
 * as one bar, each row carrying a MASKED amount (`$X,XXX`) rather than a figure
 * we would be inventing, and Trackd last as the only real price on the screen.
 *
 * The full set stays reachable at `/onboarding/cost` until he says the choice is
 * final, at which point the losers and that route both get deleted. Swapping the
 * winner is one import.
 */
export function CostScreen() {
  const { goNext } = useFlow();
  return <CostVariantG onContinue={goNext} />;
}
