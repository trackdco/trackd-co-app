import { describe, expect, it } from "vitest";

import {
  formatPrice,
  PLANS,
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

  it("runs a five day trial", () => {
    expect(TRIAL_DAYS).toBe(5);
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
