import { describe, expect, it } from "vitest";

import { alertOnReport } from "./alert";
import type { ReconcileReport } from "./types";

/**
 * STEP 7's one testable branch (§3.6, D87).
 *
 * "Alert on a STATE." A clean run is not a state worth waking anybody for, and
 * that short-circuit happens before any network call — which is what makes it
 * testable in the pure suite at all. Everything past it needs real VAPID keys and
 * real devices, and was verified by DELIVERING: 4 of 4 founder devices, from the
 * live run of `npm run reconcile` on 2026-08-17.
 */

function report(over: Partial<ReconcileReport> = {}): ReconcileReport {
  return {
    status: "clean",
    mode: "test",
    ranAt: "2026-08-17T02:00:00.000Z",
    findings: [],
    completeness: { truncated: [], failed: [] },
    counts: {
      subscriptions: 0,
      invoices: 0,
      stripeCustomers: 0,
      entitlements: 0,
      customers: 0,
      unstampedWebhooks: 0,
    },
    ...over,
  };
}

describe("alerting fires on a state, not on a run (§3.6)", () => {
  it("a clean run wakes nobody, and does not even look for a device", async () => {
    const outcome = await alertOnReport(report());
    expect(outcome).toEqual({ delivered: 0, devices: 0, reason: "clean" });
  });

  /**
   * ⚠️ THE CONTROL. If the clean short-circuit were the ONLY thing this function
   * did, the test above would pass and the alerting would be dead. A dirty report
   * must get past it and actually try — here that means reaching the
   * configuration check rather than returning "clean".
   */
  it("CONTROL: a dirty run gets past the short-circuit and tries to send", async () => {
    const outcome = await alertOnReport(
      report({
        status: "dirty",
        findings: [
          {
            rule: "charge-inside-grace",
            account: { userId: "u1", stripeCustomerId: "cus_1" },
            evidence: ["invoice in_1"],
          },
        ],
      }),
    );
    expect(outcome.reason).not.toBe("clean");
  });

  it("CONTROL: an incomplete run alerts too — it proved nothing, which is worth saying", async () => {
    const outcome = await alertOnReport(
      report({
        status: "incomplete",
        completeness: { truncated: ["subscriptions: hit the cap"], failed: [] },
      }),
    );
    expect(outcome.reason).not.toBe("clean");
  });
});
