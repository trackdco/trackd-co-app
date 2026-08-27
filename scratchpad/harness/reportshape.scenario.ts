import { describe, it } from "vitest";

import { runRules } from "@/lib/billing/reconcile/rules";
import { buildReport, exitCodeFor, renderReport } from "@/lib/billing/reconcile/report";
import type { ReconcileSnapshot } from "@/lib/billing/reconcile/types";

/**
 * STEP 3's VERIFY, THE HALF A UNIT TEST CANNOT DO.
 *
 * "Run it against deliberately broken seeded state and read the output cold. If
 * it takes more than ten seconds to understand, it is wrong."
 *
 * ⚠️ TOUCHES NOTHING. No Stripe, no Supabase, no network — it builds a snapshot
 * in memory and prints what the report would look like. It lives in the harness
 * only because the committed suite is not a place to print things.
 *
 *   npx vitest run --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/reportshape.scenario.ts --reporter=verbose
 */

const NOW = new Date("2026-09-10T12:00:00.000Z");
const s = (iso: string) => Math.floor(Date.parse(iso) / 1000);

function broken(): ReconcileSnapshot {
  return {
    mode: "live",
    now: NOW,
    customers: [
      { userId: "u-charged-in-grace", stripeCustomerId: "cus_grace" },
      { userId: "u-locked-out", stripeCustomerId: "cus_paying" },
      { userId: "u-double", stripeCustomerId: "cus_double" },
    ],
    stripeCustomers: [
      { id: "cus_grace", offerShownAt: null, offerClaimedAt: null },
      { id: "cus_paying", offerShownAt: null, offerClaimedAt: null },
      { id: "cus_double", offerShownAt: null, offerClaimedAt: null },
    ],
    subscriptions: [
      // The worst one: charged inside a fortnight we promised.
      {
        id: "sub_grace",
        customerId: "cus_grace",
        status: "active",
        priceIds: ["price_yearly"],
        created: s("2026-08-17T00:00:00Z"),
        trialEnd: null,
        currentPeriodEnd: s("2027-08-31T00:00:00Z"),
        cancelAtPeriodEnd: false,
        metadataUserId: "u-charged-in-grace",
        graceUntil: "2026-08-31T00:48:47.401Z",
        courtesyUntil: null,
      },
      // Paying, and the app is giving them nothing.
      {
        id: "sub_paying",
        customerId: "cus_paying",
        status: "active",
        priceIds: ["price_yearly"],
        created: s("2026-09-01T00:00:00Z"),
        trialEnd: null,
        currentPeriodEnd: s("2027-09-01T00:00:00Z"),
        cancelAtPeriodEnd: false,
        metadataUserId: "u-locked-out",
        graceUntil: null,
        courtesyUntil: null,
      },
      // Two that can both take money, one of them on a price we stopped selling.
      {
        id: "sub_double_a",
        customerId: "cus_double",
        status: "active",
        priceIds: ["price_yearly"],
        created: s("2026-09-01T00:00:00Z"),
        trialEnd: null,
        currentPeriodEnd: s("2027-09-01T00:00:00Z"),
        cancelAtPeriodEnd: false,
        metadataUserId: "u-double",
        graceUntil: null,
        courtesyUntil: null,
      },
      {
        id: "sub_double_b",
        customerId: "cus_double",
        status: "trialing",
        priceIds: ["price_archived_2025"],
        created: s("2026-09-05T00:00:00Z"),
        trialEnd: s("2026-09-12T00:00:00Z"),
        currentPeriodEnd: s("2026-09-12T00:00:00Z"),
        cancelAtPeriodEnd: false,
        metadataUserId: "u-double",
        graceUntil: null,
        courtesyUntil: null,
      },
    ],
    invoices: [
      {
        id: "in_inside_grace",
        customerId: "cus_grace",
        subscriptionId: "sub_grace",
        status: "paid",
        amountPaid: 6999,
        total: 6999,
        currency: "aud",
        created: s("2026-08-24T00:00:00Z"),
        paidAt: s("2026-08-24T00:00:00Z"),
        billingReason: "subscription_create",
      },
    ],
    entitlements: [
      {
        userId: "u-double",
        product: "pro",
        source: "stripe",
        activeUntil: "2027-09-01T00:00:00.000Z",
        isActive: true,
      },
      {
        userId: "u-charged-in-grace",
        product: "pro",
        source: "comp",
        activeUntil: "2026-08-31T00:48:47.401Z",
        isActive: true,
      },
    ],
    // A flood, to prove one noisy rule cannot bury a wrong charge.
    unstampedWebhooks: Array.from({ length: 148 }, (_, i) => ({
      eventId: `evt_${i}`,
      type: "invoice.payment_failed",
      receivedAt: "2026-09-09T00:00:00.000Z",
      attributableToUserId: null,
      customerId: `cus_gone_${i}`,
    })),
    activePriceIds: ["price_yearly", "price_monthly", "price_weekly"],
    alertDevices: 0,
    completeness: { truncated: [], failed: [] },
  };
}

describe("what the report actually looks like", () => {
  it("dirty — read this cold", () => {
    const snapshot = broken();
    const findings = runRules(snapshot);
    const report = buildReport(snapshot, findings, NOW.toISOString());
    console.log(`\n${renderReport(report)}\n`);
    console.log(`exit code: ${exitCodeFor(report.status)}`);
  });

  it("clean — read this cold too", () => {
    const snapshot: ReconcileSnapshot = {
      ...broken(),
      subscriptions: [],
      invoices: [],
      entitlements: [],
      unstampedWebhooks: [],
      alertDevices: 2,
    };
    const report = buildReport(snapshot, runRules(snapshot), NOW.toISOString());
    console.log(`\n${renderReport(report)}\n`);
    console.log(`exit code: ${exitCodeFor(report.status)}`);
  });

  it("incomplete — the one that must never read as clean", () => {
    const snapshot: ReconcileSnapshot = {
      ...broken(),
      subscriptions: [],
      invoices: [],
      entitlements: [],
      unstampedWebhooks: [],
      alertDevices: 2,
      completeness: {
        truncated: ["subscriptions: more than 5000 exist; only the first 5000 were read"],
        failed: [],
      },
    };
    const report = buildReport(snapshot, runRules(snapshot), NOW.toISOString());
    console.log(`\n${renderReport(report)}\n`);
    console.log(`exit code: ${exitCodeFor(report.status)}`);
  });
});
