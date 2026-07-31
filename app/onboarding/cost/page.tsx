import type { Metadata } from "next";

import { CostVariantPicker } from "@/components/onboarding/cost-picker";

export const metadata: Metadata = {
  title: "Cost screen options · Trackd Co",
};

/**
 * A REVIEW HARNESS, not a shipping screen (Adrian, 2026-07-31).
 *
 * Four candidates for the cost screen, side by side at full size, so the choice
 * is made by looking rather than by reading a description. Whichever wins moves
 * into the flow and the other three are deleted along with this route.
 *
 * It sits under `/onboarding` so it inherits the desktop-gate exemption and can
 * be opened on a laptop as well as a phone.
 */
export default function CostOptionsPage() {
  return <CostVariantPicker />;
}
