import { describe, expect, it } from "vitest";

import { STRIPE_MIN_TRIAL_END_OFFSET } from "@/lib/billing/freeTime";
import { EXTRA_TRIAL_DAYS } from "@/lib/billing/saveOffer";

import { runRules } from "./rules";
import type {
  EntitlementFact,
  InvoiceFact,
  ReconcileSnapshot,
  RuleId,
  StripeCustomerFact,
  SubscriptionFact,
} from "./types";

/**
 * STEP 2's VERIFY — a unit test per rule, each with a CONTROL.
 *
 * ## ⚠️ EVERY TEST HERE GOES THROUGH `runRules`, NOT THROUGH THE RULE FUNCTION
 *
 * Calling the rule directly proves the rule works and proves nothing about
 * whether it RUNS. A rule that is written, exported, tested and never added to
 * `runRules` is a green suite measuring nothing — the exact shape that has now
 * cost this branch six runs. Going through the front door tests the wiring too.
 *
 * ## ⚠️ EVERY DEFECT TEST HAS A CONTROL BESIDE IT
 *
 * "Prove the thing that should still work still works, not only that the defect
 * is gone. A fix that breaks the feature passes a one-sided test." So each rule
 * is shown firing on the broken state AND staying silent on the correct one.
 * A rule that returned a finding unconditionally would pass half of these.
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

function stripeCustomer(over: Partial<StripeCustomerFact> = {}): StripeCustomerFact {
  return { id: CUSTOMER, offerShownAt: null, offerClaimedAt: null, ...over };
}

/** Findings of one rule. The tests assert on this rather than on total counts. */
function of(s: ReconcileSnapshot, rule: RuleId) {
  return runRules(s).filter((f) => f.rule === rule);
}

/* ── §3.1 #6 — a charge inside a promised grace ───────────────────── */

describe("charge-inside-grace (§3.1 #6, Invariant 1)", () => {
  const graceEnd = "2026-08-31T00:00:00.000Z";

  it("catches money taken inside the promised fortnight", () => {
    const s = snapshot({
      subscriptions: [sub({ graceUntil: graceEnd, status: "trialing" })],
      invoices: [inv({ paidAt: secs("2026-08-25T00:00:00Z"), amountPaid: 6999 })],
    });
    const found = of(s, "charge-inside-grace");
    expect(found).toHaveLength(1);
    expect(found[0].account?.userId).toBe(USER);
    expect(found[0].evidence.join(" ")).toContain("in_1");
  });

  it("CONTROL: a charge AFTER the promised end is clean", () => {
    const s = snapshot({
      subscriptions: [sub({ graceUntil: graceEnd })],
      invoices: [inv({ paidAt: secs("2026-09-01T00:00:00Z") })],
    });
    expect(of(s, "charge-inside-grace")).toHaveLength(0);
  });

  /**
   * The distinction the whole rule turns on. Every trial start raises a
   * zero-dollar invoice inside the free period (`sync.ts:579`); that is normal.
   * Only money MOVING is the defect.
   */
  it("CONTROL: a zero-dollar invoice inside the grace is not a charge", () => {
    const s = snapshot({
      subscriptions: [sub({ graceUntil: graceEnd, trialEnd: secs(graceEnd) })],
      invoices: [
        inv({
          amountPaid: 0,
          total: 0,
          paidAt: secs("2026-08-20T00:00:00Z"),
        }),
      ],
    });
    expect(of(s, "charge-inside-grace")).toHaveLength(0);
  });
});

/* ── §3.1 #7 — a charge inside a courtesy period ──────────────────── */

describe("charge-inside-courtesy (§3.1 #7, Invariant 1)", () => {
  const claimed = "2026-08-01T00:00:00.000Z";
  const courtesyEnd = "2026-09-01T00:00:00.000Z";

  it("catches money taken inside the courtesy month", () => {
    const s = snapshot({
      subscriptions: [sub({ courtesyUntil: courtesyEnd, status: "trialing" })],
      stripeCustomers: [stripeCustomer({ offerClaimedAt: claimed })],
      invoices: [
        inv({
          // Raised AFTER the claim, which is what makes it a charge inside the
          // free period rather than the payment that bought the eligibility.
          created: secs("2026-08-14T00:00:00Z"),
          paidAt: secs("2026-08-15T00:00:00Z"),
        }),
      ],
    });
    expect(of(s, "charge-inside-courtesy")).toHaveLength(1);
  });

  /**
   * ⚠️ THE FALSE POSITIVE STEP 5 FOUND, PINNED IN THE FAST SUITE.
   *
   * Subscribe, be charged, cancel immediately, take the save offer. The charge
   * that made them ELIGIBLE sits SECONDS before the claim. A rule bounded on
   * payment time reported it; bounding on invoice creation does not.
   */
  it("CONTROL: the eligibility charge seconds before the claim is not inside it", () => {
    const claimInstant = "2026-08-01T00:00:05.000Z";
    const s = snapshot({
      subscriptions: [sub({ courtesyUntil: courtesyEnd, status: "trialing" })],
      stripeCustomers: [stripeCustomer({ offerClaimedAt: claimInstant })],
      invoices: [
        inv({
          created: secs("2026-08-01T00:00:00Z"),
          paidAt: secs("2026-08-01T00:00:00Z"),
        }),
      ],
    });
    expect(of(s, "charge-inside-courtesy")).toHaveLength(0);
  });

  /**
   * ⚠️ THE CONTROL THAT MATTERS MOST HERE. A save offer is taken by somebody who
   * has been PAYING, so there is always a legitimate charge before the courtesy
   * began. A rule that ignored the claim instant would report every single
   * courtesy account.
   */
  it("CONTROL: the payment that preceded the offer is not inside it", () => {
    const s = snapshot({
      subscriptions: [sub({ courtesyUntil: courtesyEnd })],
      stripeCustomers: [stripeCustomer({ offerClaimedAt: claimed })],
      invoices: [inv({ paidAt: secs("2026-07-01T00:00:00Z") })],
    });
    expect(of(s, "charge-inside-courtesy")).toHaveLength(0);
  });

  it("does not guess when the claim instant is missing; the marker rule reports it", () => {
    const s = snapshot({
      subscriptions: [sub({ courtesyUntil: courtesyEnd })],
      stripeCustomers: [stripeCustomer({ offerClaimedAt: null })],
      invoices: [inv({ paidAt: secs("2026-07-01T00:00:00Z") })],
    });
    expect(of(s, "charge-inside-courtesy")).toHaveLength(0);
    expect(of(s, "free-period-marker-missing")).toHaveLength(1);
  });
});

/* ── §3.1 #11 / D75 — courtesy granted while unpaid ───────────────── */

describe("courtesy-granted-while-unpaid (D75)", () => {
  const claimed = "2026-08-10T00:00:00.000Z";

  it("catches a courtesy granted while an invoice was outstanding", () => {
    const s = snapshot({
      subscriptions: [sub({ courtesyUntil: "2026-09-10T00:00:00.000Z" })],
      stripeCustomers: [stripeCustomer({ offerClaimedAt: claimed })],
      invoices: [
        inv({
          status: "open",
          total: 6999,
          amountPaid: 0,
          paidAt: null,
          created: secs("2026-08-01T00:00:00Z"),
        }),
      ],
    });
    const found = of(s, "courtesy-granted-while-unpaid");
    expect(found).toHaveLength(1);
    expect(found[0].evidence.join(" ")).toContain("D70");
  });

  it("CONTROL: a courtesy granted on a paid-up subscription is clean", () => {
    const s = snapshot({
      subscriptions: [sub({ courtesyUntil: "2026-09-10T00:00:00.000Z" })],
      stripeCustomers: [stripeCustomer({ offerClaimedAt: claimed })],
      invoices: [
        inv({
          status: "paid",
          paidAt: secs("2026-08-02T00:00:00Z"),
          created: secs("2026-08-01T00:00:00Z"),
        }),
      ],
    });
    expect(of(s, "courtesy-granted-while-unpaid")).toHaveLength(0);
  });

  it("CONTROL: an invoice raised AFTER the grant says nothing about the grant", () => {
    const s = snapshot({
      subscriptions: [sub({ courtesyUntil: "2026-09-10T00:00:00.000Z" })],
      stripeCustomers: [stripeCustomer({ offerClaimedAt: claimed })],
      invoices: [
        inv({
          status: "open",
          paidAt: null,
          amountPaid: 0,
          created: secs("2026-08-20T00:00:00Z"),
        }),
      ],
    });
    expect(of(s, "courtesy-granted-while-unpaid")).toHaveLength(0);
  });
});

/* ── §3.1 ⚠️ — the markers themselves ─────────────────────────────── */

describe("free-period-marker-missing (§3.1 ⚠️ — a removed marker must fail loudly)", () => {
  it("catches a paying customer in a free period with no courtesy marker", () => {
    const s = snapshot({
      subscriptions: [sub({ status: "trialing", courtesyUntil: null, trialEnd: secs("2026-10-01T00:00:00Z") })],
      invoices: [inv({ paidAt: secs("2026-07-01T00:00:00Z"), amountPaid: 6999 })],
      entitlements: [ent()],
    });
    const found = of(s, "free-period-marker-missing");
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found.map((f) => f.evidence.join(" ")).join(" ")).toContain(
      "trackd_courtesy_until",
    );
  });

  it("catches a grace-aligned trial carrying no grace marker", () => {
    const graceEnd = "2026-10-01T00:00:00.000Z";
    const s = snapshot({
      subscriptions: [
        sub({ status: "trialing", trialEnd: secs(graceEnd), graceUntil: null }),
      ],
      entitlements: [ent({ source: "comp", activeUntil: graceEnd })],
    });
    const found = of(s, "free-period-marker-missing");
    expect(found).toHaveLength(1);
    expect(found[0].evidence.join(" ")).toContain("trackd_grace_until");
  });

  it("CONTROL: a correctly marked grace-aligned trial is clean", () => {
    const graceEnd = "2026-10-01T00:00:00.000Z";
    const s = snapshot({
      subscriptions: [
        sub({ status: "trialing", trialEnd: secs(graceEnd), graceUntil: graceEnd }),
      ],
      entitlements: [ent({ source: "comp", activeUntil: graceEnd })],
    });
    expect(of(s, "free-period-marker-missing")).toHaveLength(0);
  });

  /**
   * ⚠️ THE CONTROL THAT KEEPS THIS RULE HONEST. A first-time seven-day trial has
   * NO markers and must have none. If this rule fired on it, every new signup
   * would be a finding.
   */
  it("CONTROL: an ordinary first trial needs no marker at all", () => {
    const s = snapshot({
      subscriptions: [
        sub({ status: "trialing", trialEnd: secs("2026-09-17T00:00:00Z") }),
      ],
      entitlements: [ent({ activeUntil: "2026-09-17T00:00:00.000Z" })],
    });
    expect(of(s, "free-period-marker-missing")).toHaveLength(0);
  });
});

/* ── §3.1 #1 — two billable subscriptions ─────────────────────────── */

describe("two-billable-subscriptions (§3.1 #1)", () => {
  it("catches two billable subscriptions on one customer", () => {
    const s = snapshot({
      subscriptions: [sub({ id: "sub_a" }), sub({ id: "sub_b", status: "trialing" })],
      entitlements: [ent()],
    });
    expect(of(s, "two-billable-subscriptions")).toHaveLength(1);
  });

  /**
   * §3.1 #1 says "counting every status the app treats as billable, INCLUDING the
   * incomplete one". An `incomplete` subscription keeps its first invoice payable
   * for ~23 hours, so this pair is two things that can both take money.
   */
  it("counts `incomplete` as billable, because it can still take money", () => {
    const s = snapshot({
      subscriptions: [sub({ id: "sub_a" }), sub({ id: "sub_b", status: "incomplete" })],
      entitlements: [ent()],
    });
    expect(of(s, "two-billable-subscriptions")).toHaveLength(1);
  });

  it("CONTROL: one live subscription beside dead ones is clean", () => {
    const s = snapshot({
      subscriptions: [
        sub({ id: "sub_a" }),
        sub({ id: "sub_old", status: "canceled" }),
        sub({ id: "sub_dead", status: "incomplete_expired" }),
      ],
      entitlements: [ent()],
    });
    expect(of(s, "two-billable-subscriptions")).toHaveLength(0);
  });
});

/* ── §3.1 #3 and #2 — the two directions of the access question ───── */

describe("live-subscription-without-entitlement (§3.1 #3)", () => {
  it("catches a paying customer with no active entitlement", () => {
    const s = snapshot({ subscriptions: [sub()], entitlements: [] });
    expect(of(s, "live-subscription-without-entitlement")).toHaveLength(1);
  });

  it("catches a live subscription that cannot be tied to any account", () => {
    const s = snapshot({
      subscriptions: [sub({ metadataUserId: null, customerId: "cus_unknown" })],
      customers: [],
    });
    const found = of(s, "live-subscription-without-entitlement");
    expect(found).toHaveLength(1);
    expect(found[0].account?.userId).toBeNull();
  });

  it("CONTROL: a paying customer with an entitlement is clean", () => {
    const s = snapshot({ subscriptions: [sub()], entitlements: [ent()] });
    expect(of(s, "live-subscription-without-entitlement")).toHaveLength(0);
  });

  /**
   * A brand-new `incomplete` subscription legitimately has no entitlement — that
   * is every checkout for its first seconds. Firing here would make the report
   * noisy on normal traffic, which §3.5 forbids.
   */
  it("CONTROL: a fresh `incomplete` subscription is not expected to have one", () => {
    const s = snapshot({
      subscriptions: [sub({ status: "incomplete", created: secs("2026-09-10T11:00:00Z") })],
      entitlements: [],
    });
    expect(of(s, "live-subscription-without-entitlement")).toHaveLength(0);
  });
});

describe("entitlement-without-source (§3.1 #2)", () => {
  it("catches an active entitlement with nothing paying for it", () => {
    const s = snapshot({
      subscriptions: [sub({ status: "canceled" })],
      entitlements: [ent()],
    });
    expect(of(s, "entitlement-without-source")).toHaveLength(1);
  });

  /**
   * ⚠️ THE MONEY QUESTION. An `incomplete` subscription has taken nothing, so it
   * is not a source for access — asking "is there a subscription row" instead of
   * "is money we hold paying for this" is the shape of three CRITICALs here.
   */
  it("does not accept an `incomplete` subscription as a source; nothing was paid", () => {
    const s = snapshot({
      subscriptions: [sub({ status: "incomplete" })],
      entitlements: [ent()],
    });
    expect(of(s, "entitlement-without-source")).toHaveLength(1);
  });

  it("CONTROL: a comp needs nothing behind it, by definition", () => {
    const s = snapshot({
      subscriptions: [],
      entitlements: [ent({ source: "comp", activeUntil: null })],
    });
    expect(of(s, "entitlement-without-source")).toHaveLength(0);
  });

  it("CONTROL: `past_due` still pays for access, because access lapses by date", () => {
    const s = snapshot({
      subscriptions: [sub({ status: "past_due" })],
      entitlements: [ent()],
    });
    expect(of(s, "entitlement-without-source")).toHaveLength(0);
  });

  it("CONTROL: an EXPIRED entitlement is not asserted on at all", () => {
    const s = snapshot({
      subscriptions: [],
      entitlements: [ent({ activeUntil: "2026-01-01T00:00:00.000Z" })],
    });
    expect(of(s, "entitlement-without-source")).toHaveLength(0);
  });
});

/* ── §3.1 #5 and D72 — the one-way date tolerance ─────────────────── */

describe("charge-and-entitlement-dates-disagree (§3.1 #5, D72)", () => {
  it("catches a charge landing BEFORE the date the user was shown", () => {
    const s = snapshot({
      subscriptions: [
        sub({ status: "trialing", trialEnd: secs("2026-09-20T00:00:00Z") }),
      ],
      entitlements: [ent({ activeUntil: "2026-09-25T00:00:00.000Z" })],
    });
    const found = of(s, "charge-and-entitlement-dates-disagree");
    expect(found).toHaveLength(1);
    expect(found[0].evidence.join(" ")).toContain("BEFORE");
  });

  /**
   * ⚠️ D72 — THE WHOLE POINT. A trial deliberately extended a few hours to honour
   * a date already printed on a screen is a FIX, not a defect. "A check that
   * flags the product keeping its word is a check that trains its reader to
   * ignore findings."
   */
  it("D72: a slightly-extended trial produces NO finding", () => {
    const s = snapshot({
      subscriptions: [
        sub({ status: "trialing", trialEnd: secs("2026-09-25T06:00:00Z") }),
      ],
      entitlements: [ent({ activeUntil: "2026-09-25T00:00:00.000Z" })],
    });
    expect(of(s, "charge-and-entitlement-dates-disagree")).toHaveLength(0);
  });

  it("D72: and an extension in the OTHER direction still does", () => {
    const s = snapshot({
      subscriptions: [
        sub({ status: "trialing", trialEnd: secs("2026-09-24T18:00:00Z") }),
      ],
      entitlements: [ent({ activeUntil: "2026-09-25T00:00:00.000Z" })],
    });
    expect(of(s, "charge-and-entitlement-dates-disagree")).toHaveLength(1);
  });

  it("CONTROL: dates that agree exactly are clean", () => {
    const s = snapshot({
      subscriptions: [
        sub({ status: "trialing", trialEnd: secs("2026-09-25T00:00:00Z") }),
      ],
      entitlements: [ent({ activeUntil: "2026-09-25T00:00:00.000Z" })],
    });
    expect(of(s, "charge-and-entitlement-dates-disagree")).toHaveLength(0);
  });

  /**
   * ⚠️ D88 — one-way did not mean unlimited. A trial extended by a year was
   * never reported, and giving away a year is the defect this project already
   * paid for once through a 100%-off coupon on a yearly invoice.
   */
  it("D88: a year of unexplained free access IS reported", () => {
    const s = snapshot({
      subscriptions: [
        sub({ status: "trialing", trialEnd: secs("2027-09-25T00:00:00Z") }),
      ],
      entitlements: [ent({ activeUntil: "2026-09-25T00:00:00.000Z" })],
    });
    const found = of(s, "charge-and-entitlement-dates-disagree");
    expect(found).toHaveLength(1);
    expect(found[0].evidence.join(" ")).toContain("D88");
  });

  /**
   * The bound has to leave every BUILT mechanism alone. A save offer's calendar
   * month on top of a clamped grace start is the largest legitimate gap there is,
   * and it must still pass.
   */
  it("D88: CONTROL — a save offer's month plus the 48h clamp still passes", () => {
    const shown = "2026-09-25T00:00:00.000Z";
    const monthPlusClamp = new Date(
      Date.parse(shown) + 31 * 24 * 3600_000 + 48 * 3600_000 - 3600_000,
    );
    const s = snapshot({
      subscriptions: [
        sub({
          status: "trialing",
          trialEnd: Math.floor(monthPlusClamp.getTime() / 1000),
          courtesyUntil: monthPlusClamp.toISOString(),
        }),
      ],
      stripeCustomers: [stripeCustomer({ offerClaimedAt: "2026-09-20T00:00:00.000Z" })],
      entitlements: [ent({ activeUntil: shown })],
    });
    expect(of(s, "charge-and-entitlement-dates-disagree")).toHaveLength(0);
  });

  /**
   * ⚠️ PINS THE DERIVATION, NOT THE NUMBER. D88's bound is the save offer's
   * LARGEST grant. `addOffer` has two branches — a calendar month and
   * `EXTRA_TRIAL_DAYS` — and the constant is derived from the month. If anybody
   * ever raises `EXTRA_TRIAL_DAYS` past a month, the bound silently stops being
   * the maximum and this fails.
   */
  it("D88: the month branch really is the save offer's larger grant", () => {
    const longestMonthDays = 31;
    expect(EXTRA_TRIAL_DAYS).toBeLessThan(longestMonthDays);
    expect(STRIPE_MIN_TRIAL_END_OFFSET).toBe(48 * 60 * 60 * 1000);
  });
});

/* ── §3.1 #8 — incomplete past the measured window ────────────────── */

describe("incomplete-past-window-with-entitlement (§3.1 #8)", () => {
  it("catches an old `incomplete` subscription still carrying access", () => {
    const s = snapshot({
      subscriptions: [
        sub({ status: "incomplete", created: secs("2026-09-01T00:00:00Z") }),
      ],
      entitlements: [ent()],
    });
    const found = of(s, "incomplete-past-window-with-entitlement");
    expect(found).toHaveLength(1);
    // The measured window, not the spec's fifteen days.
    expect(found[0].evidence.join(" ")).toContain("~23h");
  });

  it("CONTROL: a recent `incomplete` is inside the window and clean", () => {
    const s = snapshot({
      subscriptions: [
        sub({ status: "incomplete", created: secs("2026-09-10T06:00:00Z") }),
      ],
      entitlements: [ent()],
    });
    expect(of(s, "incomplete-past-window-with-entitlement")).toHaveLength(0);
  });

  it("CONTROL: an old `incomplete` with NO entitlement is the expected state", () => {
    const s = snapshot({
      subscriptions: [
        sub({ status: "incomplete", created: secs("2026-09-01T00:00:00Z") }),
      ],
      entitlements: [],
    });
    expect(of(s, "incomplete-past-window-with-entitlement")).toHaveLength(0);
  });
});

/* ── §3.1 #12 — a zero-dollar invoice nobody granted ──────────────── */

describe("unexplained-zero-invoice (§3.1 #12, D69)", () => {
  it("catches a zero invoice on a subscription with no free period at all", () => {
    const s = snapshot({
      subscriptions: [sub({ trialEnd: null, graceUntil: null, courtesyUntil: null })],
      invoices: [inv({ total: 0, amountPaid: 0 })],
      entitlements: [ent()],
    });
    expect(of(s, "unexplained-zero-invoice")).toHaveLength(1);
  });

  it("CONTROL: a courtesy period explains its zero invoice", () => {
    const s = snapshot({
      subscriptions: [sub({ courtesyUntil: "2026-10-01T00:00:00.000Z" })],
      stripeCustomers: [stripeCustomer({ offerClaimedAt: "2026-09-01T00:00:00.000Z" })],
      invoices: [inv({ total: 0, amountPaid: 0 })],
      entitlements: [ent()],
    });
    expect(of(s, "unexplained-zero-invoice")).toHaveLength(0);
  });

  it("CONTROL: a grace-aligned start explains its zero invoice", () => {
    const s = snapshot({
      subscriptions: [sub({ graceUntil: "2026-10-01T00:00:00.000Z" })],
      invoices: [inv({ total: 0, amountPaid: 0 })],
      entitlements: [ent()],
    });
    expect(of(s, "unexplained-zero-invoice")).toHaveLength(0);
  });

  /**
   * ⚠️ THE THIRD EXPLANATION. §3.4 names three things that wear `trialing`, and a
   * genuine first trial raises a zero invoice too. Flagging those would make the
   * report permanently noisy — see the rule's own comment, and the note routed to
   * the spec chat.
   */
  it("CONTROL: an ordinary first trial explains its zero invoice", () => {
    const s = snapshot({
      subscriptions: [
        sub({ status: "trialing", trialEnd: secs("2026-09-17T00:00:00Z") }),
      ],
      invoices: [
        inv({ total: 0, amountPaid: 0, billingReason: "subscription_create" }),
      ],
      entitlements: [ent()],
    });
    expect(of(s, "unexplained-zero-invoice")).toHaveLength(0);
  });

  /**
   * ⚠️ THE FIRST TRIAL IS IDENTIFIED POSITIVELY, NOT BY ABSENCE.
   *
   * A zero-dollar RENEWAL is not a first trial however much the subscription
   * around it looks like one. `19` §3.1 expects an undiscriminated zero-dollar
   * invoice to be reported as unattributed, so one must not be able to hide
   * inside "probably a first trial" — which is what accepting it merely for
   * having a trial end would have allowed.
   */
  it("a zero-dollar RENEWAL cannot hide inside 'probably a first trial'", () => {
    const s = snapshot({
      subscriptions: [
        sub({ status: "trialing", trialEnd: secs("2026-09-17T00:00:00Z") }),
      ],
      invoices: [
        inv({ total: 0, amountPaid: 0, billingReason: "subscription_cycle" }),
      ],
      entitlements: [ent()],
    });
    const found = of(s, "unexplained-zero-invoice");
    expect(found).toHaveLength(1);
    expect(found[0].evidence.join(" ")).toContain("subscription_cycle");
  });

  it("nor can a first invoice on a subscription with no trial at all", () => {
    const s = snapshot({
      subscriptions: [sub({ status: "active", trialEnd: null })],
      invoices: [
        inv({ total: 0, amountPaid: 0, billingReason: "subscription_create" }),
      ],
      entitlements: [ent()],
    });
    expect(of(s, "unexplained-zero-invoice")).toHaveLength(1);
  });
});

/* ── §3.1 #4 / §3.3 — the two webhook states, held apart ──────────── */

describe("the webhook ledger (§3.1 #4, §3.3)", () => {
  const base = {
    eventId: "evt_1",
    type: "invoice.paid",
    receivedAt: "2026-09-10T00:00:00.000Z",
  };

  it("reports an unattributable event as UNATTRIBUTED", () => {
    const s = snapshot({
      unstampedWebhooks: [
        { ...base, attributableToUserId: null, customerId: "cus_gone" },
      ],
    });
    expect(of(s, "webhook-unattributed")).toHaveLength(1);
    expect(of(s, "webhook-unprocessed")).toHaveLength(0);
  });

  it("reports an attributable one as UNPROCESSED, separately", () => {
    const s = snapshot({
      unstampedWebhooks: [
        { ...base, attributableToUserId: USER, customerId: CUSTOMER },
      ],
    });
    expect(of(s, "webhook-unprocessed")).toHaveLength(1);
    expect(of(s, "webhook-unattributed")).toHaveLength(0);
  });

  /**
   * §3.3: `claimEvent` retries anything left unstamped for over a minute, so a
   * row still unstamped when this runs "has failed more than once, and that is
   * worth saying in the output rather than counting".
   */
  it("says an old row has already been retried, rather than only counting it", () => {
    const s = snapshot({
      unstampedWebhooks: [
        { ...base, attributableToUserId: USER, customerId: CUSTOMER },
      ],
    });
    expect(of(s, "webhook-unprocessed")[0].evidence.join(" ")).toContain("retried");
  });

  it("CONTROL: an empty ledger produces nothing", () => {
    expect(of(snapshot(), "webhook-unattributed")).toHaveLength(0);
    expect(of(snapshot(), "webhook-unprocessed")).toHaveLength(0);
  });
});

/* ── §3.1 #9 and #10 ──────────────────────────────────────────────── */

describe("subscription-on-archived-price (§3.1 #9)", () => {
  it("catches a live subscription on a price we no longer sell", () => {
    const s = snapshot({
      subscriptions: [sub({ priceIds: ["price_archived_2025"] })],
      entitlements: [ent()],
    });
    expect(of(s, "subscription-on-archived-price")).toHaveLength(1);
  });

  it("CONTROL: a configured price is clean", () => {
    const s = snapshot({
      subscriptions: [sub({ priceIds: [PRICE_MONTHLY] })],
      entitlements: [ent()],
    });
    expect(of(s, "subscription-on-archived-price")).toHaveLength(0);
  });

  it("CONTROL: a DEAD subscription on an archived price is not a finding", () => {
    const s = snapshot({
      subscriptions: [sub({ status: "canceled", priceIds: ["price_archived_2025"] })],
    });
    expect(of(s, "subscription-on-archived-price")).toHaveLength(0);
  });

  /**
   * With no configured prices the rule cannot answer, and answering anyway would
   * report every subscription in the account. `fetch.ts` records that as a failed
   * read, so the run reports INCOMPLETE instead of a flood.
   */
  it("stays silent rather than reporting everything when prices are unconfigured", () => {
    const s = snapshot({
      activePriceIds: [],
      subscriptions: [sub()],
      entitlements: [ent()],
    });
    expect(of(s, "subscription-on-archived-price")).toHaveLength(0);
  });
});

describe("duplicate-entitlement-source (§3.1 #10)", () => {
  it("catches two rows sharing (user, product, source)", () => {
    const s = snapshot({
      subscriptions: [sub()],
      entitlements: [ent(), ent({ activeUntil: "2028-01-01T00:00:00.000Z" })],
    });
    expect(of(s, "duplicate-entitlement-source")).toHaveLength(1);
  });

  /**
   * `001_billing_tables.sql` is explicit that a user may legitimately hold a
   * `comp` AND a `stripe` row at once — a founder who also subscribes, or a beta
   * tester converting. The constraint is per SOURCE, and so is this rule.
   */
  it("CONTROL: a comp beside a stripe entitlement is legitimate", () => {
    const s = snapshot({
      subscriptions: [sub()],
      entitlements: [ent(), ent({ source: "comp", activeUntil: null })],
    });
    expect(of(s, "duplicate-entitlement-source")).toHaveLength(0);
  });
});

/* ── D46 — nowhere to send an alert ───────────────────────────────── */

describe("no-alert-device-subscribed (D46)", () => {
  it("fails the clean run when no founder device is subscribed", () => {
    expect(of(snapshot({ alertDevices: 0 }), "no-alert-device-subscribed")).toHaveLength(1);
  });

  it("CONTROL: one subscribed device is enough", () => {
    expect(of(snapshot({ alertDevices: 1 }), "no-alert-device-subscribed")).toHaveLength(0);
  });
});

/* ── §3.4 — the three-way trial-status case ───────────────────────── */

/**
 * ⚠️ THE CASE STEP 2's VERIFY NAMES EXPLICITLY.
 *
 * "Three different things wear Stripe's trial status, and this script is the one
 * place that has to hold all three apart. Getting it wrong here produces noise on
 * a report whose entire value is that it is quiet when things are fine."
 *
 * All three below are CORRECT states. The whole snapshot must be silent.
 */
describe("§3.4 — three things wear `trialing`, and none of them is a finding", () => {
  const graceEnd = "2026-10-01T00:00:00.000Z";
  const courtesyEnd = "2026-10-05T00:00:00.000Z";

  const threeWay = snapshot({
    customers: [
      { userId: "u-grace", stripeCustomerId: "cus_grace" },
      { userId: "u-courtesy", stripeCustomerId: "cus_courtesy" },
      { userId: "u-trial", stripeCustomerId: "cus_trial" },
    ],
    stripeCustomers: [
      stripeCustomer({ id: "cus_grace" }),
      stripeCustomer({ id: "cus_courtesy", offerClaimedAt: "2026-09-05T00:00:00.000Z" }),
      stripeCustomer({ id: "cus_trial" }),
    ],
    subscriptions: [
      // 1. A beta user's grace-aligned start.
      sub({
        id: "sub_grace",
        customerId: "cus_grace",
        metadataUserId: "u-grace",
        status: "trialing",
        trialEnd: secs(graceEnd),
        graceUntil: graceEnd,
      }),
      // 2. A paying customer's save-offer courtesy month.
      sub({
        id: "sub_courtesy",
        customerId: "cus_courtesy",
        metadataUserId: "u-courtesy",
        status: "trialing",
        trialEnd: secs(courtesyEnd),
        courtesyUntil: courtesyEnd,
      }),
      // 3. A genuine first-time seven-day trial.
      sub({
        id: "sub_trial",
        customerId: "cus_trial",
        metadataUserId: "u-trial",
        status: "trialing",
        trialEnd: secs("2026-09-17T00:00:00Z"),
      }),
    ],
    invoices: [
      inv({ id: "in_grace", subscriptionId: "sub_grace", customerId: "cus_grace", total: 0, amountPaid: 0 }),
      // The courtesy account paid BEFORE the offer, which is what makes them
      // eligible for it in the first place.
      inv({
        id: "in_courtesy_old",
        subscriptionId: "sub_courtesy",
        customerId: "cus_courtesy",
        paidAt: secs("2026-08-01T00:00:00Z"),
        created: secs("2026-08-01T00:00:00Z"),
      }),
      inv({ id: "in_trial", subscriptionId: "sub_trial", customerId: "cus_trial", total: 0, amountPaid: 0 }),
    ],
    entitlements: [
      ent({ userId: "u-grace", source: "comp", activeUntil: graceEnd }),
      ent({ userId: "u-courtesy", activeUntil: courtesyEnd }),
      ent({ userId: "u-trial", activeUntil: "2026-09-17T00:00:00.000Z" }),
    ],
  });

  it("produces ZERO findings across all three", () => {
    const findings = runRules(threeWay);
    expect(
      findings.map((f) => `${f.rule}: ${f.evidence.join(" | ")}`),
    ).toEqual([]);
  });

  /**
   * ⚠️ ASSERT THE STATE WAS REACHED BEFORE ASSERTING ANYTHING ABOUT IT. A
   * three-way snapshot that accidentally held zero subscriptions would also
   * produce zero findings, and would prove nothing at all.
   */
  it("and the snapshot really does contain all three shapes", () => {
    expect(threeWay.subscriptions).toHaveLength(3);
    expect(threeWay.subscriptions.filter((x) => x.status === "trialing")).toHaveLength(3);
    expect(threeWay.subscriptions.filter((x) => x.graceUntil !== null)).toHaveLength(1);
    expect(threeWay.subscriptions.filter((x) => x.courtesyUntil !== null)).toHaveLength(1);
    expect(
      threeWay.subscriptions.filter(
        (x) => x.graceUntil === null && x.courtesyUntil === null,
      ),
    ).toHaveLength(1);
  });
});

/* ── §3.4 — a dispute, where our rule and Stripe's disagree ───────── */

describe("§3.4 — a dispute deactivates our entitlement while Stripe stays overdue", () => {
  /**
   * "This script asserts against OUR rule. A disputed subscription with a
   * deactivated entitlement is correct and must not be reported. Asserting
   * against Stripe's status instead would report a false positive on every
   * dispute, and a check that cries wolf on a known-good state is a check that
   * gets ignored."
   */
  it("CONTROL: `past_due` with a revoked entitlement produces no finding", () => {
    const s = snapshot({
      subscriptions: [sub({ status: "past_due" })],
      entitlements: [ent({ isActive: false })],
    });
    expect(runRules(s)).toEqual([]);
  });

  /**
   * ⚠️ FOUND BY DRIVING (Step 5), NOT BY REASONING. Stripe leaves a disputed
   * subscription ACTIVE while our rule revokes the entitlement immediately. Both
   * rules below reported that state until Step 5 seeded it for real.
   */
  it("CONTROL: an ACTIVE subscription with a revoked entitlement is a dispute, not a lockout", () => {
    const s = snapshot({
      subscriptions: [sub({ status: "active" })],
      entitlements: [ent({ isActive: false })],
    });
    expect(of(s, "live-subscription-without-entitlement")).toHaveLength(0);
  });

  it("CONTROL: a revoked entitlement's stale date is not compared against a charge", () => {
    const s = snapshot({
      subscriptions: [
        sub({ status: "trialing", trialEnd: secs("2026-09-20T00:00:00Z") }),
      ],
      // The date is still there — is_active and active_until are separate columns
      // so a revocation does not rewrite history — but nobody is being shown it.
      entitlements: [ent({ isActive: false, activeUntil: "2027-09-25T00:00:00.000Z" })],
    });
    expect(of(s, "charge-and-entitlement-dates-disagree")).toHaveLength(0);
  });

  /**
   * ⚠️ THE CONTROL THAT KEEPS THE FIX HONEST. A revoked row must not become a
   * blanket amnesty: an account with a revoked row AND a live paying subscription
   * that has genuinely lost access still has to be reported when nothing was
   * revoked for the product in question.
   */
  it("CONTROL: a genuinely locked-out payer with NO revoked row is still caught", () => {
    const s = snapshot({
      subscriptions: [sub({ status: "active" })],
      entitlements: [],
    });
    expect(of(s, "live-subscription-without-entitlement")).toHaveLength(1);
  });

  it("but a disputed subscription with a LIVE entitlement is a finding", () => {
    const s = snapshot({
      subscriptions: [sub({ status: "canceled" })],
      entitlements: [ent({ isActive: true })],
    });
    expect(of(s, "entitlement-without-source")).toHaveLength(1);
  });
});

/* ── the whole set ────────────────────────────────────────────────── */

describe("runRules", () => {
  it("is silent on a healthy account", () => {
    const s = snapshot({
      subscriptions: [sub()],
      invoices: [inv()],
      entitlements: [ent()],
      stripeCustomers: [stripeCustomer()],
    });
    expect(runRules(s)).toEqual([]);
  });

  it("orders findings worst first, money rules ahead of hygiene rules", () => {
    const s = snapshot({
      alertDevices: 0,
      subscriptions: [
        sub({ status: "trialing", graceUntil: "2026-09-20T00:00:00.000Z" }),
      ],
      invoices: [inv({ paidAt: secs("2026-09-05T00:00:00Z") })],
      entitlements: [ent()],
    });
    const rules = runRules(s).map((f) => f.rule);
    expect(rules[0]).toBe("charge-inside-grace");
    expect(rules[rules.length - 1]).toBe("no-alert-device-subscribed");
  });
});
