import { describe, expect, it } from "vitest";


import { runRules } from "./rules";
import type {
  EntitlementFact,
  InvoiceFact,
  ReconcileSnapshot,
  SubscriptionFact,
} from "./types";

/**
 * ⚠️ WHICH NET CATCHES WHICH PARKED FINDING (2.5). A MEASUREMENT, KEPT.
 *
 * Fixtures are the same shapes `rules.test.ts` uses, deliberately: this file
 * asserts about the SAME rule set from a different angle — not "does each rule
 * work" but "is each accepted gap visible to somebody".
 */

const NOW = new Date("2026-09-10T12:00:00.000Z");
const PRICE_YEARLY = "price_yearly_live";
const PRICE_MONTHLY = "price_monthly_live";
const USER = "user-1";
const CUSTOMER = "cus_1";

/** Unix seconds from an ISO string, which is how Stripe holds every instant. */
function secs(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

function snapshot(over: Partial<ReconcileSnapshot> = {}): ReconcileSnapshot {
  return {
    mode: "test",
    now: NOW,
    subscriptions: [],
    invoices: [],
    stripeCustomers: [],
    entitlements: [],
    customers: [{ userId: USER, stripeCustomerId: CUSTOMER }],
    unstampedWebhooks: [],
    activePriceIds: [PRICE_YEARLY, PRICE_MONTHLY],
    // Non-zero by default so the D46 rule does not fire in every other test and
    // drown the thing each one is actually about.
    alertDevices: 1,
    completeness: { truncated: [], failed: [] },
    ...over,
  };
}

function sub(over: Partial<SubscriptionFact> = {}): SubscriptionFact {
  return {
    id: "sub_1",
    customerId: CUSTOMER,
    status: "active",
    priceIds: [PRICE_YEARLY],
    created: secs("2026-08-01T00:00:00Z"),
    trialEnd: null,
    currentPeriodEnd: secs("2027-08-01T00:00:00Z"),
    cancelAtPeriodEnd: false,
    metadataUserId: USER,
    graceUntil: null,
    courtesyUntil: null,
    ...over,
  };
}

function inv(over: Partial<InvoiceFact> = {}): InvoiceFact {
  return {
    id: "in_1",
    customerId: CUSTOMER,
    subscriptionId: "sub_1",
    status: "paid",
    amountPaid: 6999,
    total: 6999,
    currency: "aud",
    created: secs("2026-08-01T00:00:00Z"),
    paidAt: secs("2026-08-01T00:00:00Z"),
    billingReason: "subscription_create",
    ...over,
  };
}

function ent(over: Partial<EntitlementFact> = {}): EntitlementFact {
  return {
    userId: USER,
    product: "pro",
    source: "stripe",
    activeUntil: "2027-08-01T00:00:00.000Z",
    isActive: true,
    ...over,
  };
}

/** Findings of one rule. The tests assert on this rather than on total counts. */

/**
 * ⚠️ THE THREE PARKED `revokeForCustomer` FINDINGS (2.5), AND WHICH NET CATCHES
 * WHICH. MEASURED, NOT ASSERTED IN PROSE.
 *
 * All three are ACCEPTED under §9g and are present at HEAD, unchanged. Fixing
 * them properly needs per-period accounting across charges and invoices — a
 * different model, not a patch — and their root cause is one line:
 * `otherLiveEntitlementFloor` answers "is another subscription LIVE" where the
 * revoke needs "is money we STILL HOLD paying for this access".
 *
 * ⚠️ THEIR CONTAINMENT ARGUMENT CHANGED AND THIS IS THE CURRENT ONE. It used to
 * be "it gates nothing while BILLING_GATE_ENABLED is unset" (16 Aug). `08` then
 * made the revoked row drive copy on two screens REGARDLESS of the flag, so that
 * argument is dead. What holds now:
 *
 *   · refunds are hand-issued by the founder, one at a time;
 *   · the user base is ~90;
 *   · the realistic frequency in the first weeks is near zero;
 *   · and two of the three are now CAUGHT rather than silent.
 *
 * What would change it: VOLUME, or refunds becoming self-serve. Either makes the
 * frequency argument false, and the model fix becomes the answer.
 *
 * ⚠️ AND P3 IS STILL SILENT. The brief said 2.3's fix takes all three from silent
 * to caught; measured, it takes ONE. This test exists so that stays measured —
 * if a future change makes P1 or P2 silent again, it fails here rather than being
 * discovered by a customer.
 */
describe("⚠️ the three parked revokeForCustomer findings (§9g), and what catches them", () => {
  it("P1 — an EARLIER period refunded revokes the CURRENT paid one: CAUGHT by 2.3's new rule", () => {
    // The shape it leaves: a revoked pro/stripe row beside a live subscription.
    const s = snapshot({ subscriptions: [sub()], entitlements: [ent({ isActive: false })] });
    expect(runRules(s).map((f) => f.rule)).toEqual([
      "revoked-entitlement-beside-live-subscription",
    ]);
  });

  it("P2 — two subscriptions both refunded in full leave access ON: CAUGHT, by an older rule", () => {
    // Not by 2.3. `two-billable-subscriptions` has always fired on this shape,
    // which is worth recording so nobody credits the wrong fix for it.
    const s = snapshot({
      subscriptions: [sub(), sub({ id: "sub_2", priceIds: [PRICE_MONTHLY] })],
      invoices: [inv(), inv({ id: "in_2", subscriptionId: "sub_2" })],
      entitlements: [ent({ isActive: true })],
    });
    expect(runRules(s).map((f) => f.rule)).toEqual(["two-billable-subscriptions"]);
  });

  it("⚠️ P3 — a redelivered invoice.paid reinstates on refunded money: STILL SILENT", () => {
    /**
     * Nothing reports it. The entitlement is active, the subscription is live,
     * and the only thing wrong is that the money went back — which no rule can
     * see without per-period accounting across charges and invoices.
     *
     * Asserted as EMPTY on purpose. If a future rule catches it, this fails and
     * somebody updates the record rather than the gap quietly closing unrecorded.
     */
    const s = snapshot({
      subscriptions: [sub()],
      invoices: [inv()],
      entitlements: [ent({ isActive: true })],
    });
    expect(
      runRules(s).map((f) => f.rule),
      "P3 is now caught — good, and the §9g record must be updated to say so",
    ).toEqual([]);
  });
});
