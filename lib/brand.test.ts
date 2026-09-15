import { describe, expect, it } from "vitest";

import { ACN, CURRENCY, LEGAL_ENTITY, PLANS, PRODUCT_NAME, SUPPORT_EMAIL, YEARLY_PER_WEEK } from "./brand";

/**
 * These are the figures a stranger reads on the public page, so the test is
 * about the page not contradicting itself or the company register.
 */
describe("brand", () => {
  it("derives the weekly anchor from the yearly amount", () => {
    // The spec's checklist names $1.35 per week against $69.99 billed yearly.
    expect(YEARLY_PER_WEEK).toBe(1.35);
    expect(PLANS.yearly.amount).toBe(69.99);
  });

  it("keeps the anchor below the real weekly plan, or the comparison is a lie", () => {
    expect(YEARLY_PER_WEEK).toBeLessThan(PLANS.weekly.amount);
  });

  it("names the registered entity exactly as ASIC holds it", () => {
    // "Trackd.co" is retired and must never appear (Adrian, 2026-09-04).
    expect(LEGAL_ENTITY).toBe("Trackd Co Pty Ltd");
    expect(LEGAL_ENTITY).not.toMatch(/trackd\.co/i);
    expect(PRODUCT_NAME).not.toMatch(/trackd\.co/i);
    expect(ACN).toBe("698 405 462");
  });

  it("carries a support address on the domain the entity operates", () => {
    expect(SUPPORT_EMAIL).toMatch(/@trackdco\.app$/);
  });

  it("states a currency, because $69.99 means two different things", () => {
    expect(CURRENCY).toBe("USD");
  });
});
