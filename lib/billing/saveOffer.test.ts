import { describe, expect, it } from "vitest";
import type Stripe from "stripe";

import {
  EXTRA_TRIAL_DAYS,
  OFFER_WINDOW_MINUTES,
  addOffer,
  offerPeriodToGrant,
  offerStillOpen,
  periodIsUnpaid,
} from "./saveOffer";

/**
 * The pure half of the save offer.
 *
 * The grant itself talks to Stripe and is verified by driving it, but three
 * decisions in here are arithmetic and belong in a suite: how long the offer is
 * worth, when it expires, and what "a month" means on the 31st.
 */

const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

function sub(over: {
  status?: string;
  interval?: "day" | "week" | "month" | "year";
}): Stripe.Subscription {
  return {
    status: over.status ?? "active",
    items: {
      data: over.interval
        ? [{ price: { recurring: { interval: over.interval } } }]
        : [{ price: {} }],
    },
  } as unknown as Stripe.Subscription;
}

describe("⚠️ an unpaid period is never offered free time", () => {
  /**
   * Adrian's ruling, 2026-08-16. The offer computes its free period from the
   * current period end, which on a `past_due` subscription is the end of the
   * period the CARD DECLINED ON — measured at +58 unpaid days with the invoice
   * still open. No variant ships for that cohort: not anchored to now, not to a
   * prior period, not shortened. No offer at all.
   */
  const withInvoice = (status: string, invoice: unknown) =>
    ({ status, items: { data: [{ price: {} }] }, latest_invoice: invoice }) as unknown as Stripe.Subscription;

  it("refuses the cohorts whose status already says money is owed", () => {
    for (const status of ["past_due", "unpaid", "incomplete"]) {
      expect(periodIsUnpaid(sub({ status }))).toBe(true);
    }
  });

  it("allows the ones that are paid up", () => {
    expect(periodIsUnpaid(sub({ status: "active" }))).toBe(false);
    expect(periodIsUnpaid(sub({ status: "trialing" }))).toBe(false);
  });

  it("⚠️ catches an ACTIVE subscription sitting on an open invoice", () => {
    // The status alone cannot answer this one, which is why the invoice is
    // expanded and read.
    expect(periodIsUnpaid(withInvoice("active", { status: "open", amount_due: 1199 }))).toBe(true);
    expect(periodIsUnpaid(withInvoice("active", { status: "uncollectible", amount_due: 6999 }))).toBe(true);
  });

  it("does not treat a DRAFT invoice as a debt", () => {
    // A draft is the next period being assembled and is not due yet. Treating it
    // as owed would refuse the offer to healthy subscribers on every renewal.
    expect(periodIsUnpaid(withInvoice("active", { status: "draft", amount_due: 1199 }))).toBe(false);
  });

  it("does not treat a zero invoice as a debt", () => {
    // Every trial start raises one.
    expect(periodIsUnpaid(withInvoice("trialing", { status: "open", amount_due: 0 }))).toBe(false);
  });

  it("falls back to the status when the invoice is absent or unexpanded", () => {
    expect(periodIsUnpaid(withInvoice("active", null))).toBe(false);
    expect(periodIsUnpaid(withInvoice("active", "in_123"))).toBe(false);
    expect(periodIsUnpaid(withInvoice("past_due", "in_123"))).toBe(true);
  });
});

describe("offerPeriodToGrant", () => {
  it("gives a trial a week whatever plan sits behind it", () => {
    // A trial is seven days long regardless of the plan, so the offer that
    // matches the thing being extended is a week. Nobody who has paid nothing
    // gets a free month.
    for (const interval of ["week", "month", "year"] as const) {
      expect(offerPeriodToGrant(sub({ status: "trialing", interval }))).toBe("week");
    }
  });

  it("gives weekly a week, because a month is four times what they pay", () => {
    expect(offerPeriodToGrant(sub({ interval: "week" }))).toBe("week");
  });

  it("gives monthly and yearly a month, never a year", () => {
    expect(offerPeriodToGrant(sub({ interval: "month" }))).toBe("month");
    expect(offerPeriodToGrant(sub({ interval: "year" }))).toBe("month");
  });

  it("falls back to a WEEK when the interval is missing or strange", () => {
    // The failure direction that costs money is the generous one. An unreadable
    // price must not hand out the larger gift.
    expect(offerPeriodToGrant(sub({}))).toBe("week");
    expect(offerPeriodToGrant(sub({ interval: "day" }))).toBe("week");
  });
});

describe("addOffer", () => {
  it("adds seven days for a week", () => {
    expect(iso(addOffer(at("2026-08-19T15:39:00Z"), "week"))).toBe(
      "2026-08-26T15:39:00.000Z",
    );
  });

  it("adds a calendar month, not thirty days", () => {
    expect(iso(addOffer(at("2026-08-19T15:39:00Z"), "month"))).toBe(
      "2026-09-19T15:39:00.000Z",
    );
    // February is short and the offer still lands on the same day number.
    expect(iso(addOffer(at("2026-01-15T00:00:00Z"), "month"))).toBe(
      "2026-02-15T00:00:00.000Z",
    );
  });

  it("clamps the 31st rather than rolling into the following month", () => {
    // Plain arithmetic turns 31 Jan into 3 Mar, which would tell somebody their
    // next charge is on the 3rd when every other date on the account is the 31st.
    expect(iso(addOffer(at("2026-01-31T09:00:00Z"), "month"))).toBe(
      "2026-02-28T09:00:00.000Z",
    );
    expect(iso(addOffer(at("2026-05-31T09:00:00Z"), "month"))).toBe(
      "2026-06-30T09:00:00.000Z",
    );
  });

  it("handles a leap February", () => {
    expect(iso(addOffer(at("2028-01-31T09:00:00Z"), "month"))).toBe(
      "2028-02-29T09:00:00.000Z",
    );
  });

  it("rolls the year over in December", () => {
    expect(iso(addOffer(at("2026-12-19T15:39:00Z"), "month"))).toBe(
      "2027-01-19T15:39:00.000Z",
    );
  });

  it("only ever moves time forward", () => {
    const from = at("2026-08-19T15:39:00Z");
    expect(addOffer(from, "week")).toBeGreaterThan(from);
    expect(addOffer(from, "month")).toBeGreaterThan(from);
  });
});

describe("offerStillOpen", () => {
  const shown = "2026-08-19T15:00:00.000Z";
  const now = (iso: string) => Date.parse(iso);

  it("is open inside the window", () => {
    expect(offerStillOpen(shown, now("2026-08-19T15:00:00Z"))).toBe(true);
    expect(offerStillOpen(shown, now("2026-08-19T15:09:59Z"))).toBe(true);
  });

  it("is open at exactly the boundary", () => {
    // A claim landing on the tick is a claim the user made in time.
    expect(offerStillOpen(shown, now("2026-08-19T15:10:00Z"))).toBe(true);
  });

  it("is closed one second after", () => {
    expect(offerStillOpen(shown, now("2026-08-19T15:10:01Z"))).toBe(false);
  });

  it("is closed an hour later, which is the replay case", () => {
    expect(offerStillOpen(shown, now("2026-08-19T16:00:00Z"))).toBe(false);
  });

  it("is closed when it was never shown", () => {
    expect(offerStillOpen(undefined)).toBe(false);
    expect(offerStillOpen("")).toBe(false);
  });

  it("is OPEN on an unparseable stamp, deliberately", () => {
    // Only our own server writes this value, so a value that will not parse is
    // our bug. Refusing a week we have just promised on screen is the worse
    // outcome, and CLAIMED_KEY still makes it unrepeatable.
    expect(offerStillOpen("not a date", now("2026-08-19T16:00:00Z"))).toBe(true);
  });

  it("matches the window the dialog counts down", () => {
    expect(OFFER_WINDOW_MINUTES).toBe(10);
  });
});

describe("the offer's own constants", () => {
  it("keeps the trial extension at a week", () => {
    // The copy says "another week, free". If this moves, the copy moves with it.
    expect(EXTRA_TRIAL_DAYS).toBe(7);
  });
});
