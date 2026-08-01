import { describe, expect, it } from "vitest";

import {
  clampIntent,
  clampStep,
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

  it("orders the demo and the paywall after the age gate", () => {
    // Ordering only. Enforcement is clampStep, tested below — this assertion
    // used to be NAMED "gates the demo behind the age gate" and asserted
    // nothing of the sort, which is how a bypass shipped under a green suite.
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
    // The first real step opens at 20%, not at 1/13th.
    expect(stepProgress("housekeeping")).toBeCloseTo(0.2, 5);
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

describe("clampStep — the age gate, enforced", () => {
  /**
   * A deep link is untrusted input. `?step=` appears in the address bar on
   * every screen, so every URL a user bookmarks or shares hits this.
   */
  it("sends every post-gate step back to housekeeping when the gate is open", () => {
    for (const step of STEP_ORDER.map((s) => s.id)) {
      if (stepIndex(step) <= stepIndex("housekeeping")) continue;
      expect(clampStep(step, false)).toBe("housekeeping");
    }
  });

  it("blocks the two that matter most by name", () => {
    expect(clampStep("demo", false)).toBe("housekeeping");
    expect(clampStep("paywall", false)).toBe("housekeeping");
  });

  it("lets the hook and housekeeping through with the gate still open", () => {
    expect(clampStep("hook", false)).toBe("hook");
    expect(clampStep("housekeeping", false)).toBe("housekeeping");
  });

  it("lets everything through once the gate is satisfied", () => {
    for (const step of STEP_ORDER.map((s) => s.id)) {
      expect(clampStep(step, true)).toBe(step);
    }
  });
});

describe("clampIntent", () => {
  const none = { running: [], struggle: [] };
  const both = { running: ["trt"], struggle: ["whats_left"] };

  it("sends an unanswered deep link back to the first unanswered screen", () => {
    // Browser FORWARD after untickng the only answer, and a bookmarked link,
    // both land here. Adrian requires one answer on each (2026-08-01) and the
    // disabled button only covers the forward path.
    expect(clampIntent("celebrate", none)).toBe("running");
    expect(clampIntent("demo", none)).toBe("running");
    expect(clampIntent("paywall", none)).toBe("running");
    expect(clampIntent("celebrate", { running: ["trt"], struggle: [] })).toBe(
      "struggle",
    );
  });

  it("passes a fully answered session straight through", () => {
    for (const step of ["celebrate", "demo", "payoff", "cost", "paywall"] as const) {
      expect(clampIntent(step, both)).toBe(step);
    }
  });

  it("never touches the steps before the intent screens", () => {
    for (const step of ["hook", "housekeeping", "running", "struggle"] as const) {
      expect(clampIntent(step, none)).toBe(step);
    }
  });

  it("NEVER touches a post-paywall step, whatever the answers", () => {
    // This is the load-bearing half. `welcome` is where OAuth returns, so a
    // user coming back from Google with an empty session must not be thrown
    // back to the intent screens with their trial already started.
    for (const step of ["welcome", "install", "notifications", "attribution", "letter"] as const) {
      expect(clampIntent(step, none)).toBe(step);
    }
  });
});
