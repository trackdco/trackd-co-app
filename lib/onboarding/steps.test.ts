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
    expect(stepIndex("birthday")).toBeLessThan(stepIndex("demo"));
    expect(stepIndex("birthday")).toBeLessThan(stepIndex("paywall"));
  });

  it("keeps the four housekeeping screens in order, with consent on birthday", () => {
    // Splitting one screen into four is the sort of change that gets reordered
    // later by someone tidying. The ORDER is the product decision (Adrian,
    // 2026-08-05) and the date/consent pairing is the legal one.
    expect(stepIndex("name")).toBeLessThan(stepIndex("birthday"));
    expect(stepIndex("birthday")).toBeLessThan(stepIndex("gender"));
    expect(stepIndex("gender")).toBeLessThan(stepIndex("greeting"));
    expect(stepIndex("greeting")).toBeLessThan(stepIndex("running"));
  });

  it("makes the argument, removes the risk, then asks: cost, free, paywall", () => {
    // Three beats in this order (Adrian, 2026-08-05). `free` exists as its own
    // step precisely so "$0 today" cannot be scrolled past on the way to the
    // prices; folding it back into the paywall would undo that.
    expect(stepIndex("cost")).toBeLessThan(stepIndex("free"));
    expect(stepIndex("free")).toBeLessThan(stepIndex("paywall"));
  });

  it("gates the free-trial screen behind the age gate like every payment step", () => {
    // It is a payment-adjacent screen carrying a price promise, so it sits
    // behind the same clamp as the paywall itself.
    expect(clampStep("free", "birthday")).toBe("birthday");
    expect(clampStep("free", "name")).toBe("name");
  });

  /**
   * THIS ASSERTION IS THE REVERSE OF WHAT IT WAS (Adrian, 2026-08-07).
   *
   * It used to pin install BEFORE notifications, because iOS cannot grant web
   * push to an uninstalled site. That is still true, and it is no longer the
   * ordering constraint that wins: an installed iOS app has its own storage
   * container, so a user who added the icon mid-flow and opened it arrived
   * signed out at `/login` with the rest of onboarding abandoned. Being
   * signed out of something you just paid for beats a deferred prompt.
   *
   * The push constraint did not disappear, it moved into the screen:
   * `notifications` no longer calls `requestPermission()` on iOS.
   */
  it("puts install LAST, so nothing is left to abandon when the icon is added", () => {
    expect(stepIndex("install")).toBe(STEP_ORDER.length - 1);
    expect(stepIndex("install")).toBeGreaterThan(stepIndex("notifications"));
    expect(stepIndex("install")).toBeGreaterThan(stepIndex("letter"));
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
    // `install` is the terminus since 2026-08-07; its CTA calls `finish()`,
    // and there being nothing after it is exactly the point of the move.
    expect(nextStep("install")).toBeNull();
    expect(nextStep("letter")).toBe("install");
  });

  it("walks back to the start and stops", () => {
    expect(prevStep("hook")).toBeNull();
    expect(prevStep("name")).toBe("hook");
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
    expect(stepProgress("install")).toBe(1);
    // The first real step opens at 20%, not at 1/13th.
    expect(stepProgress("name")).toBeCloseTo(0.2, 5);
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
  /**
   * Housekeeping is four screens now, so the clamp walks to the EARLIEST
   * unanswered one rather than to a single fixed step. Every case below is
   * driven by the incomplete step the session would produce.
   */
  it("sends every later step back to the first unanswered screen", () => {
    for (const incomplete of ["name", "birthday", "gender"] as const) {
      for (const step of STEP_ORDER.map((s) => s.id)) {
        if (stepIndex(step) <= stepIndex(incomplete)) continue;
        expect(clampStep(step, incomplete)).toBe(incomplete);
      }
    }
  });

  it("blocks the two that matter most, from the very first screen", () => {
    // An empty session's first hole is `name`, so a deep link to the demo or
    // the paywall lands there — not on a later housekeeping screen with holes
    // behind it, which is what a fixed clamp target would have allowed.
    expect(clampStep("demo", "name")).toBe("name");
    expect(clampStep("paywall", "name")).toBe("name");
  });

  it("never lets an unproven age past the birthday screen", () => {
    // The legally load-bearing case, stated on its own: name given, age or
    // consent still missing. Everything substance-adjacent and every payment
    // path is after this and must be unreachable.
    for (const step of ["gender", "greeting", "running", "demo", "cost", "paywall"] as const) {
      expect(clampStep(step, "birthday")).toBe("birthday");
    }
  });

  it("lets a user reach anything at or before their first hole", () => {
    expect(clampStep("hook", "name")).toBe("hook");
    expect(clampStep("name", "name")).toBe("name");
    expect(clampStep("hook", "gender")).toBe("hook");
    expect(clampStep("name", "gender")).toBe("name");
    expect(clampStep("birthday", "gender")).toBe("birthday");
  });

  it("lets everything through once housekeeping is complete", () => {
    for (const step of STEP_ORDER.map((s) => s.id)) {
      expect(clampStep(step, null)).toBe(step);
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
    for (const step of [
      "hook",
      "name",
      "birthday",
      "gender",
      "greeting",
      "running",
      "struggle",
    ] as const) {
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
