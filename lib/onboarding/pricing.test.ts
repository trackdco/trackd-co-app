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

/**
 * PRICES NO LONGER LIVE IN THE CODEBASE (spec w2b-15): they are read from
 * Stripe, so a dashboard change takes effect without a deploy. These fixtures
 * stand in for what Stripe returns.
 *
 * That makes these tests better, not weaker. They were pinned to the particular
 * placeholder amounts, so they proved the constants had not been edited. Now
 * they prove the ARITHMETIC — which is the part that can silently disagree with
 * the price printed beside it, and the part a user screenshots.
 */
const priced = {
  yearly: { ...PLANS.yearly, price: 69.99 },
  monthly: { ...PLANS.monthly, price: 11.99 },
  weekly: { ...PLANS.weekly, price: 3.99 },
};

describe("the module holds no dollar amounts", () => {
  it("carries labels and periods, never a price", () => {
    // The spec's hardest rule about pricing: "There must be no dollar amount
    // hardcoded anywhere in the codebase." A `price` reappearing on `PLANS` is
    // the exact regression, and it would silently win over Stripe wherever a
    // caller forgot to pass the real one.
    for (const plan of Object.values(PLANS)) {
      expect(plan).not.toHaveProperty("price");
    }
  });
});

describe("derived figures", () => {
  it("derives the weekly equivalent from the yearly price", () => {
    expect(weeklyEquivalent(priced.yearly)).toBeCloseTo(69.99 / 52, 2);
  });

  it("keeps the anchor line honestly 'under' the real weekly figure", () => {
    const weekly = weeklyEquivalent(priced.yearly);
    const claimed = Number(
      /\$([\d.]+)/.exec(weeklyAnchor(priced.yearly) ?? "")?.[1],
    );
    expect(claimed).toBeGreaterThanOrEqual(weekly);
  });

  it("renders no anchor at all when the price did not load", () => {
    // Rather than "Under $ a week". The payoff screen is anonymous and
    // reachable before Stripe has answered, so this case is real.
    expect(weeklyAnchor(undefined)).toBeNull();
  });

  it("derives the saving badge from the two prices", () => {
    const saving = yearlySavingPercent(priced.yearly, priced.monthly);
    const monthlyYear = priced.monthly.price * 12;
    expect(saving).toBe(
      Math.round(((monthlyYear - priced.yearly.price) / monthlyYear) * 100),
    );
  });

  it("shows no badge rather than a number derived from nothing", () => {
    expect(yearlySavingPercent(undefined, priced.monthly)).toBeNull();
    expect(yearlySavingPercent(priced.yearly, undefined)).toBeNull();
    // And none when there is genuinely nothing to claim.
    expect(
      yearlySavingPercent({ ...PLANS.yearly, price: 200 }, priced.monthly),
    ).toBeNull();
  });

  it("runs a seven day trial, covering one full week", () => {
    // Seven is a product decision, not an arbitrary number (Adrian,
    // 2026-08-05): a protocol has a weekly shape, and a shorter trial ends
    // before the user has hit every dose day or run anything out. Reaffirmed
    // 2026-08-08 against spec w2b-15's "5-day trial", which loses. Pinned so a
    // later "tighten the funnel" edit has to argue with this comment first.
    expect(TRIAL_DAYS).toBe(7);
  });

  /**
   * THE FIGURES THE PAYWALL ACTUALLY PRINTS.
   *
   * A cold review pointed out that the tested functions were not the rendered
   * ones: `monthlyEquivalent`, `billingDate` and `REMINDER_DAY` all appear on
   * the paywall and none had coverage. Every one is part of a payment promise.
   */
  it("shows a monthly equivalent only where it makes the plan read cheaper", () => {
    expect(monthlyEquivalent(priced.yearly)).toBeCloseTo(5.83, 2);
    // Null, not "$11.99/mo" — printing "$11.99 ($11.99/mo)" is a tautology and
    // the caller renders nothing rather than repeating itself.
    expect(monthlyEquivalent(priced.monthly)).toBeNull();
    // Null for WEEKLY (Adrian, 2026-08-07). The bracket exists to shrink a
    // headline figure; on weekly it grew the number and argued against the plan
    // in its own sub-line. Pinned so a later "every plan should show one"
    // tidy-up cannot quietly put it back.
    expect(monthlyEquivalent(priced.weekly)).toBeNull();
  });

  it("prices the weekly plan as the most expensive way to buy Trackd", () => {
    // The whole point of the tier, and now a check on the DASHBOARD rather than
    // on a constant: if Adrian ever prices weekly below the yearly per-week
    // figure, the paywall is steering people to the wrong plan and the saving
    // badge becomes a lie. This asserts the relationship the screen depends on.
    expect(weeklyEquivalent(priced.weekly)).toBeGreaterThan(
      weeklyEquivalent(priced.yearly),
    );
    expect(weeklyEquivalent(priced.weekly)).toBeGreaterThan(
      weeklyEquivalent(priced.monthly),
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
