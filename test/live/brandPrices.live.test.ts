import { describe, expect, it } from "vitest";

import { loadPrices } from "@/lib/billing/prices";
import { CURRENCY, PLANS, YEARLY_PER_WEEK } from "@/lib/brand";

/**
 * THE GUARD ON THE ONE PLACE TWO PRICE CONTRACTS CAN DRIFT APART.
 *
 * The public landing page is statically rendered and reads its amounts from
 * `lib/brand.ts` (Adrian's call, 2026-09-16, over the older billing spec's "no
 * hardcoded amounts"): a marketing page must not put a Stripe round-trip in
 * front of a stranger, and it must not go down with a billing provider.
 *
 * Checkout does the opposite and is right to: `lib/billing/prices.ts` reads the
 * live price objects, so a dashboard change takes effect without a deploy.
 *
 * Which leaves the failure this test exists for, raised in review on PR #66: a
 * price changed in the Stripe dashboard leaves the landing page advertising the
 * old number while the card is charged the new one. That is a promise on screen
 * and a different truth at the till, and it is the exact class of defect the
 * billing work spent a fortnight removing.
 *
 * ⚠️ THIS IS A LIVE TEST AND IT TALKS TO REAL STRIPE. It runs under
 * `vitest.live.config.ts` (`npx vitest run --config vitest.live.config.ts`),
 * not in the ordinary suite, because the ordinary suite must pass with no keys
 * and no network. Run it after ANY price change on either side.
 *
 * It does not fix the drift, and deliberately so. It makes the drift LOUD, in
 * the one place somebody changing a price will be told about it, while leaving
 * the static page static.
 */
describe("the landing page's prices against live Stripe", () => {
  it("shows the amounts checkout will actually charge", async () => {
    const live = await loadPrices();
    expect(live.length, "Stripe returned no prices").toBeGreaterThan(0);

    for (const price of live) {
      const shown = PLANS[price.plan as keyof typeof PLANS];
      expect(shown, `lib/brand.ts has no entry for the "${price.plan}" plan`).toBeTruthy();

      expect(
        shown.amount,
        `${price.plan}: the landing page says ${shown.amount}, Stripe charges ${price.amount}. ` +
          "Update lib/brand.ts, or the page is advertising a price nobody is charged.",
      ).toBe(price.amount);

      expect(
        price.currency.toUpperCase(),
        `${price.plan}: the landing page says ${CURRENCY}, Stripe bills ${price.currency.toUpperCase()}`,
      ).toBe(CURRENCY);

      expect(
        shown.period,
        `${price.plan}: the landing page says "per ${shown.period}", Stripe bills per ${price.interval}`,
      ).toBe(price.interval);

      // A quarterly plan is `interval: "month"` with `interval_count: 3`, and
      // the page has no way to say that. If one is ever added, this fails
      // rather than pricing it as monthly.
      expect(
        price.intervalCount,
        `${price.plan}: Stripe bills every ${price.intervalCount} ${price.interval}s, which the landing page cannot express`,
      ).toBe(1);
    }
  });

  it("keeps the anchor honest against the live yearly price", async () => {
    const yearly = (await loadPrices()).find((p) => p.plan === "yearly");
    expect(yearly, "Stripe has no yearly price").toBeTruthy();
    expect(Math.round((yearly!.amount / 52) * 100) / 100).toBe(YEARLY_PER_WEEK);
  });
});
