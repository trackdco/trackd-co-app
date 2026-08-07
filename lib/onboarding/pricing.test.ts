import { describe, expect, it } from "vitest";

import {
  billingDate,
  formatPrice,
  monthlyEquivalent,
  PLANS,
  REMINDER_DAY,
  TRIAL_DAYS,
  weeklyAnchor,
  weeklyEquivalent,
  yearlySavingPercent,
} from "./pricing";
import { codeFromSearch, normaliseCode, validateCode } from "./affiliate";

/**
 * Prices render from config (Spec 3-01 "Check When Done"). The derived figures
 * matter more than the placeholders themselves: a per-week line or a saving
 * badge that disagrees with the price beside it is the kind of thing a user
 * screenshots.
 */

describe("formatPrice", () => {
  it("drops a pointless decimal but keeps a real one", () => {
    expect(formatPrice(70)).toBe("$70");
    expect(formatPrice(9.99)).toBe("$9.99");
  });
});

describe("derived figures", () => {
  it("derives the weekly equivalent from the yearly price", () => {
    expect(weeklyEquivalent(PLANS.yearly)).toBeCloseTo(70 / 52, 2);
  });

  it("keeps the anchor line honestly 'under' the real weekly figure", () => {
    const weekly = weeklyEquivalent(PLANS.yearly);
    const claimed = Number(/\$([\d.]+)/.exec(weeklyAnchor())?.[1]);
    expect(claimed).toBeGreaterThanOrEqual(weekly);
  });

  it("derives the saving badge from the two prices", () => {
    const saving = yearlySavingPercent();
    expect(saving).not.toBeNull();
    const monthlyYear = PLANS.monthly.price * 12;
    expect(saving).toBe(
      Math.round(((monthlyYear - PLANS.yearly.price) / monthlyYear) * 100),
    );
  });

  it("runs a seven day trial, covering one full week", () => {
    // Seven is a product decision, not an arbitrary number (Adrian,
    // 2026-08-05): a protocol has a weekly shape, and a shorter trial ends
    // before the user has hit every dose day or run anything out. Pinned so a
    // later "tighten the funnel" edit has to argue with this comment first.
    expect(TRIAL_DAYS).toBe(7);
  });

  /**
   * THE FIGURES THE PAYWALL ACTUALLY PRINTS.
   *
   * A cold review pointed out that the tested functions were not the rendered
   * ones: `monthlyEquivalent`, `billingDate` and `REMINDER_DAY` all appear on
   * the paywall and none had coverage, and `PLANS.weekly` was never exercised
   * at all. Every one of them is part of a payment promise.
   */
  it("shows a monthly equivalent only where it makes the plan read cheaper", () => {
    expect(monthlyEquivalent(PLANS.yearly)).toBeCloseTo(5.83, 2);
    // Null, not "$11.99/mo" — printing "$11.99 ($11.99/mo)" is a tautology and
    // the caller renders nothing rather than repeating itself.
    expect(monthlyEquivalent(PLANS.monthly)).toBeNull();
    // Null for WEEKLY (Adrian, 2026-08-07). The bracket exists to shrink a
    // headline figure; on weekly it grew $4.99 into $21.62 and argued against
    // the plan in its own sub-line. Pinned so a later "every plan should show
    // one" tidy-up cannot quietly put it back.
    expect(monthlyEquivalent(PLANS.weekly)).toBeNull();
  });

  it("prices the weekly plan as the most expensive way to buy Trackd", () => {
    // The whole point of the tier. If this ever inverts, the paywall is
    // steering people to the wrong plan and the saving badge becomes a lie.
    expect(weeklyEquivalent(PLANS.weekly)).toBeGreaterThan(
      weeklyEquivalent(PLANS.yearly),
    );
    expect(weeklyEquivalent(PLANS.weekly)).toBeGreaterThan(
      weeklyEquivalent(PLANS.monthly),
    );
  });

  it("warns before it bills, never after", () => {
    // The paywall promises a reminder on this day out loud.
    expect(REMINDER_DAY).toBeLessThan(TRIAL_DAYS);
    expect(REMINDER_DAY).toBeGreaterThanOrEqual(1);
  });

  it("bills TRIAL_DAYS after today, across month and year boundaries", () => {
    // Dates are the classic place for an off-by-one to reach a payment screen.
    expect(billingDate(new Date(2026, 7, 5))).toBe("12 Aug 2026");
    expect(billingDate(new Date(2026, 7, 28))).toBe("4 Sept 2026");
    expect(billingDate(new Date(2026, 11, 28))).toBe("4 Jan 2027");
    // Leap year: 2028 has a 29 February.
    expect(billingDate(new Date(2028, 1, 25))).toBe("3 Mar 2028");
  });
});

describe("affiliate codes", () => {
  it("normalises case and whitespace", () => {
    expect(normaliseCode("  trackd ")).toBe("TRACKD");
  });

  it("rejects a code that is not code-shaped", () => {
    expect(normaliseCode("")).toBeNull();
    expect(normaliseCode("a")).toBeNull();
    expect(normaliseCode("<script>")).toBeNull();
    expect(normaliseCode("-LEADING")).toBeNull();
    expect(normaliseCode(null)).toBeNull();
  });

  it("reads a code off a deep link", () => {
    expect(codeFromSearch("?code=angus")).toBe("ANGUS");
    expect(codeFromSearch("?utm=x")).toBeNull();
    expect(codeFromSearch("")).toBeNull();
  });

  it("applies a known code", async () => {
    await expect(validateCode("TRACKD")).resolves.toMatchObject({
      status: "applied",
      code: "TRACKD",
    });
  });

  it("fails an unknown code quietly rather than throwing", async () => {
    await expect(validateCode("NOPE123")).resolves.toEqual({
      status: "invalid",
      code: "NOPE123",
    });
  });

  it("treats an absent code as none, not as invalid", async () => {
    await expect(validateCode(null)).resolves.toEqual({ status: "none" });
  });
});
