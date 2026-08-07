import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { loadPricesSafe } from "@/lib/billing/prices";

import { PaywallPreview } from "./preview";

export const metadata: Metadata = {
  title: "Paywall preview · Trackd Co",
  robots: { index: false, follow: false },
};

/**
 * DEV-ONLY preview of the paywall and the post-payment holding state, with the
 * REAL Stripe prices and the REAL Payment Element, viewable WITHOUT signing in.
 *
 * ## Why the real screen cannot be looked at
 *
 * It sits behind two server-side gates — a verified session AND a proven 18+ —
 * and both should stay. That makes it the only screen in the flow that cannot be
 * judged without first making an account, which on a LAN dev server is itself
 * awkward: Google OAuth bounces to Supabase's Site URL (production) because a
 * `10.x` origin is not in the redirect allow-list.
 *
 * ## THE CTA WILL NOT TAKE A PAYMENT HERE, and that is correct
 *
 * `startTrial` resolves identity from the verified session and re-checks the age
 * gate, so with no session it answers "Please sign in again". The card fields,
 * the wallets, the appearance, the disclosure and the layout are all real; the
 * commit is not. **A harness that could take a payment would be a hole in the
 * two guards this whole spec is built on.** To test payment end to end, sign in
 * properly and use the real `/onboarding?step=paywall`.
 *
 * ## NOT REACHABLE IN PRODUCTION
 *
 * Gated on `VERCEL_ENV` rather than `NODE_ENV`, matching
 * `app/onboarding/cost/page.tsx`: a Vercel preview deploy IS a production build,
 * so a `NODE_ENV` gate would 404 the exact link this exists to be reviewed
 * through. `robots: noindex` on top.
 */
export default async function PaywallPreviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  const prices = await loadPricesSafe();
  return (
    <PaywallPreview
      prices={prices.map((p) => ({
        plan: p.plan,
        amount: p.amount,
        currency: p.currency,
      }))}
    />
  );
}
