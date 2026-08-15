import { describe, expect, it } from "vitest";

import { resolveFreeTime, STRIPE_MIN_TRIAL_END_OFFSET } from "./freeTime";
import { TRIAL_DAYS } from "@/lib/onboarding/pricing";

/**
 * The property under test is not "it branches three ways". It is that NOBODY IS
 * EVER HANDED A `trial_end` EARLIER THAN THE DATE THEY WERE PROMISED — by the
 * clamp, by a rounding mode, or by an expired grace resolving to something other
 * than "charge them".
 */

const NOW = new Date("2026-08-15T10:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** `now` at a fixed instant, so nothing here depends on when it is run. */
const facts = (over: Partial<Parameters<typeof resolveFreeTime>[0]> = {}) => ({
  hasUsedTrial: false,
  graceEndsAt: null,
  now: NOW,
  ...over,
});

/** An ISO instant `ms` from {@link NOW}. */
const fromNow = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

describe("resolveFreeTime", () => {
  describe("a full trial", () => {
    it("gives a first-timer the whole trial", () => {
      expect(resolveFreeTime(facts())).toEqual({ kind: "trial", days: TRIAL_DAYS });
    });

    it("reads the length from pricing.ts rather than restating it", () => {
      // The paywall promises this number out loud. A literal here would let the
      // two drift, which is a screen contradicting the server about money.
      const result = resolveFreeTime(facts());
      expect(result).toMatchObject({ kind: "trial", days: TRIAL_DAYS });
    });
  });

  describe("no free time", () => {
    it("refuses a second trial to somebody who used theirs", () => {
      expect(resolveFreeTime(facts({ hasUsedTrial: true }))).toEqual({ kind: "none" });
    });

    it("refuses a trial to a beta account whose grace has ENDED", () => {
      // The case the verification calls out by name. They had their fortnight;
      // it is over. This must be "charge them today", never a negative trial
      // and never a fresh seven days.
      const result = resolveFreeTime(facts({ graceEndsAt: fromNow(-DAY) }));
      expect(result).toEqual({ kind: "none" });
    });

    it("treats a grace that ended one millisecond ago as ended", () => {
      expect(resolveFreeTime(facts({ graceEndsAt: fromNow(-1) }))).toEqual({ kind: "none" });
    });

    it("treats a grace ending exactly NOW as ended", () => {
      // A trial_end at `now` buys nothing and Stripe would refuse it anyway.
      expect(resolveFreeTime(facts({ graceEndsAt: fromNow(0) }))).toEqual({ kind: "none" });
    });

    it("still refuses when an expired grace sits beside an unused trial", () => {
      // A beta account typically has NO Stripe trial history at all, so this is
      // the ordinary shape of an expired-grace user, not an exotic one. If the
      // expired grace did not reach the resolver they would read as a
      // brand-new user and be handed seven free days on top of their fortnight.
      const result = resolveFreeTime(facts({ hasUsedTrial: false, graceEndsAt: fromNow(-DAY) }));
      expect(result).toEqual({ kind: "none" });
    });
  });

  describe("aligned to a live grace", () => {
    it("ends the free time at the grace end, to the second", () => {
      const graceEndsAt = fromNow(5 * DAY);
      const result = resolveFreeTime(facts({ graceEndsAt }));

      expect(result).toEqual({
        kind: "grace",
        trialEnd: Math.ceil(Date.parse(graceEndsAt) / 1000),
        graceEndsAt,
        clamped: false,
      });
    });

    it("carries the PROMISED end, not the value handed to Stripe", () => {
      // `graceEndsAt` becomes the `trackd_grace_until` metadata, which
      // reconciliation reads to ask "was anybody charged inside a period we
      // promised was free". That is a question about the promise, so the
      // promise is what is carried — they differ whenever the clamp fires.
      const graceEndsAt = fromNow(HOUR);
      const result = resolveFreeTime(facts({ graceEndsAt }));

      expect(result).toMatchObject({ kind: "grace", graceEndsAt, clamped: true });
    });

    it("beats the used-trial rule when both are true", () => {
      // Never charging inside a promised free period outranks one-trial-per-user:
      // one costs a few days, the other charges somebody on a date we told them
      // they were safe.
      const graceEndsAt = fromNow(3 * DAY);
      const result = resolveFreeTime(facts({ hasUsedTrial: true, graceEndsAt }));

      expect(result).toMatchObject({ kind: "grace", graceEndsAt });
    });

    it("never rounds the end DOWN past the promised instant", () => {
      // A grace end with sub-second precision. Flooring would land the trial end
      // up to 999ms before the instant the user was promised — the promise
      // broken by a rounding mode.
      const graceEndsAt = new Date(NOW.getTime() + 5 * DAY + 1).toISOString();
      const result = resolveFreeTime(facts({ graceEndsAt }));

      expect(result.kind).toBe("grace");
      if (result.kind !== "grace") return;
      expect(result.trialEnd * 1000).toBeGreaterThanOrEqual(Date.parse(graceEndsAt));
    });
  });

  describe("the Stripe minimum-offset clamp", () => {
    it("clamps a grace ending sooner than Stripe accepts", () => {
      const graceEndsAt = fromNow(HOUR);
      const result = resolveFreeTime(facts({ graceEndsAt }));

      expect(result).toEqual({
        kind: "grace",
        trialEnd: Math.ceil((NOW.getTime() + STRIPE_MIN_TRIAL_END_OFFSET) / 1000),
        graceEndsAt,
        clamped: true,
      });
    });

    it("clamps LATER than the grace end, never earlier", () => {
      // The direction is the entire point of the clamp. A few free hours more
      // than promised costs almost nothing; a moment less is a charge inside a
      // period the app said in writing was free.
      for (const remaining of [1, HOUR, 6 * HOUR, DAY, STRIPE_MIN_TRIAL_END_OFFSET - 1]) {
        const graceEndsAt = fromNow(remaining);
        const result = resolveFreeTime(facts({ graceEndsAt }));

        expect(result.kind).toBe("grace");
        if (result.kind !== "grace") return;
        expect(result.clamped).toBe(true);
        expect(result.trialEnd * 1000).toBeGreaterThan(Date.parse(graceEndsAt));
      }
    });

    it("leaves a grace at exactly the minimum alone", () => {
      const graceEndsAt = fromNow(STRIPE_MIN_TRIAL_END_OFFSET);
      const result = resolveFreeTime(facts({ graceEndsAt }));

      expect(result).toMatchObject({ clamped: false });
    });

    it("leaves anything past the minimum alone", () => {
      const graceEndsAt = fromNow(STRIPE_MIN_TRIAL_END_OFFSET + 1);
      const result = resolveFreeTime(facts({ graceEndsAt }));

      expect(result).toMatchObject({
        clamped: false,
        trialEnd: Math.ceil(Date.parse(graceEndsAt) / 1000),
      });
    });

    it("is at least Stripe's documented create-path minimum", () => {
      // Stripe refuses a trial_end under ~2 days on create. If this is ever
      // lowered below that, every mid-grace subscribe in the last hours of a
      // fortnight fails at the create call.
      expect(STRIPE_MIN_TRIAL_END_OFFSET).toBeGreaterThanOrEqual(2 * DAY);
    });
  });

  describe("failure directions", () => {
    it("grants the trial when the grace end cannot be read", () => {
      // §3.5: a failure to read the grace GRANTS. Being wrong generously costs
      // seven days; being wrong the other way charges a first-time customer on
      // a screen that just promised them seven free days, which is a dispute.
      const result = resolveFreeTime(facts({ graceEndsAt: "not a date" }));
      expect(result).toEqual({ kind: "trial", days: TRIAL_DAYS });
    });

    it("still refuses a used trial when the grace end cannot be read", () => {
      const result = resolveFreeTime(
        facts({ hasUsedTrial: true, graceEndsAt: "not a date" }),
      );
      expect(result).toEqual({ kind: "none" });
    });
  });

  it("reads nothing and mutates nothing", () => {
    // It takes `now` as an argument rather than calling `Date.now()`, which is
    // what makes every case above reproducible rather than dependent on the
    // hour the suite runs at.
    const input = facts({ graceEndsAt: fromNow(3 * DAY) });
    const snapshot = { ...input, now: new Date(input.now) };

    resolveFreeTime(input);

    expect(input).toEqual(snapshot);
  });
});
