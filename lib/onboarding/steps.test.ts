import { describe, expect, it } from "vitest";

import {
  FIRST_STEP,
  isStepId,
  nextStep,
  prevStep,
  STEP_ORDER,
  stepIndex,
  stepProgress,
} from "./steps";

/**
 * "The ordered screen list is §6. Do not reorder it." These tests are what
 * stops a later session quietly moving the paywall in front of the demo, which
 * is the one thing the whole flow is arranged to prevent.
 */

describe("STEP_ORDER", () => {
  it("opens on the hook and never on an account wall", () => {
    expect(FIRST_STEP).toBe("hook");
    expect(STEP_ORDER[0].phase).toBe("anonymous");
  });

  it("runs the demo before the paywall", () => {
    expect(stepIndex("demo")).toBeLessThan(stepIndex("paywall"));
  });

  it("gates the demo behind the age gate", () => {
    expect(stepIndex("housekeeping")).toBeLessThan(stepIndex("demo"));
    expect(stepIndex("housekeeping")).toBeLessThan(stepIndex("paywall"));
  });

  it("puts install before notifications, because iOS push needs the install", () => {
    expect(stepIndex("install")).toBeLessThan(stepIndex("notifications"));
  });

  it("has no authed step before the paywall and no anonymous step after it", () => {
    const paywall = stepIndex("paywall");
    STEP_ORDER.forEach((step, i) => {
      expect(step.phase).toBe(i <= paywall ? "anonymous" : "authed");
    });
  });

  it("keeps the demo as ONE step, so logging a dose never navigates", () => {
    // Four routes made the aha feel like a slideshow. If a later change splits
    // them again this fails, which is the point.
    expect(STEP_ORDER.filter((s) => s.id.startsWith("demo"))).toHaveLength(1);
  });

  it("has unique ids", () => {
    const ids = STEP_ORDER.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("navigation", () => {
  it("walks forward through every step and stops at the end", () => {
    let id = FIRST_STEP;
    const seen = [id];
    for (;;) {
      const next = nextStep(id);
      if (next === null) break;
      id = next;
      seen.push(id);
    }
    expect(seen).toEqual(STEP_ORDER.map((s) => s.id));
    expect(nextStep("letter")).toBeNull();
  });

  it("walks back to the start and stops", () => {
    expect(prevStep("hook")).toBeNull();
    expect(prevStep("housekeeping")).toBe("hook");
  });
});

describe("isStepId", () => {
  it("rejects an untrusted value off the URL", () => {
    expect(isStepId("paywall")).toBe(true);
    expect(isStepId("dashboard")).toBe(false);
    expect(isStepId("")).toBe(false);
    expect(isStepId(null)).toBe(false);
    expect(isStepId(7)).toBe(false);
  });
});

describe("stepProgress", () => {
  it("runs 0 to 1 and never leaves the range", () => {
    expect(stepProgress("hook")).toBe(0);
    expect(stepProgress("letter")).toBe(1);
    for (const step of STEP_ORDER) {
      const p = stepProgress(step.id);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it("never goes backwards", () => {
    let last = -1;
    for (const step of STEP_ORDER) {
      const p = stepProgress(step.id);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
  });
});
