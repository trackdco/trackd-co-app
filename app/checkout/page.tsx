import type { Metadata } from "next";

import { BillingFlowEntry } from "@/components/billing/BillingFlowEntry";

export const metadata: Metadata = { title: "Payment details · Trackd Co" };

/**
 * `/checkout` — THE CARD SCREEN FOR SOMEBODY WHO ALREADY HAS AN ACCOUNT.
 *
 * The sibling of `/plans`, and the same reasoning: a person changing a card, or
 * an early user picking their first plan, is not partway through onboarding and
 * must not be shown a progress rail that says they are.
 *
 * ⚠️ SAME SCREEN, SAME STRIPE CALLS, SAME ELIGIBILITY. Only the header differs.
 * A second card screen is the last thing this app should own.
 */
export default function CheckoutPage() {
  return <BillingFlowEntry startAt="start" />;
}
