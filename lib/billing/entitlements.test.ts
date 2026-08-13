import { describe, expect, it } from "vitest";

import { grantsPro, isEntitlementActive, strongestEntitlement } from "./access";

/**
 * The access rule, pinned.
 *
 * This is the single predicate the whole app's paid access rests on, so it is
 * tested as a pure function rather than only through a query. Every case below
 * is one the spec names.
 */

const now = new Date("2026-08-08T12:00:00.000Z");

describe("isEntitlementActive", () => {
  it("grants while the clock has time left", () => {
    expect(
      isEntitlementActive(
        { isActive: true, activeUntil: "2026-08-15T00:00:00.000Z" },
        now,
      ),
    ).toBe(true);
  });

  it("stops granting once the date passes", () => {
    expect(
      isEntitlementActive(
        { isActive: true, activeUntil: "2026-08-01T00:00:00.000Z" },
        now,
      ),
    ).toBe(false);
  });

  it("treats a NULL expiry as never expiring — this is what a `comp` is", () => {
    // Founder, cofounder and beta-tester access. The spec requires a `comp` to
    // grant with no Stripe subscription present at all, which is also the
    // cheapest possible proof that this path never asks Stripe.
    expect(isEntitlementActive({ isActive: true, activeUntil: null }, now)).toBe(
      true,
    );
  });

  it("honours the kill switch regardless of the date", () => {
    // A chargeback or a withdrawn comp. `is_active` is deliberately separate
    // from the clock so revoking does not have to rewrite history.
    expect(
      isEntitlementActive(
        { isActive: false, activeUntil: "2099-01-01T00:00:00.000Z" },
        now,
      ),
    ).toBe(false);
    expect(isEntitlementActive({ isActive: false, activeUntil: null }, now)).toBe(
      false,
    );
  });

  it("keeps access to the end of a period that was already paid for", () => {
    // `customer.subscription.deleted` sets access to end at `current_period_end`,
    // NOT immediately. Someone who cancels on day 3 of a paid month keeps the
    // month. From this function's side that is simply a future date still
    // running, which is why cancellation is not a condition here at all.
    expect(
      isEntitlementActive(
        { isActive: true, activeUntil: "2026-08-31T00:00:00.000Z" },
        now,
      ),
    ).toBe(true);
  });

  it("survives a card failure, because a decline does not revoke", () => {
    // `invoice.payment_failed` records `past_due` on the SUBSCRIPTION mirror and
    // leaves the entitlement standing until `active_until` passes naturally.
    // Cards decline for boring reasons. Nothing about `past_due` reaches here —
    // this function cannot see subscription status, by design.
    expect(
      isEntitlementActive(
        { isActive: true, activeUntil: "2026-08-09T00:00:00.000Z" },
        now,
      ),
    ).toBe(true);
  });

  it("refuses on the exact boundary instant", () => {
    // Strictly greater than. An entitlement that ran out at this millisecond has
    // run out; granting on equality would be a free millisecond that only ever
    // shows up as a flapping gate.
    expect(
      isEntitlementActive(
        { isActive: true, activeUntil: now.toISOString() },
        now,
      ),
    ).toBe(false);
  });

  it("withholds access on a date it cannot read", () => {
    // Should be impossible against a `timestamptz` column. The safe direction
    // for a value we cannot parse is to withhold rather than to grant.
    expect(
      isEntitlementActive({ isActive: true, activeUntil: "not a date" }, now),
    ).toBe(false);
  });
});

describe("grantsPro", () => {
  const base = { product: "pro" as const, source: "stripe" as const };

  it("is false with nothing", () => {
    expect(grantsPro([], now)).toBe(false);
  });

  it("grants on a `comp` with no Stripe subscription present at all", () => {
    // The spec's own check: "A `comp` entitlement grants access with no Stripe
    // subscription present." Nothing in this path can even see Stripe.
    expect(
      grantsPro(
        [{ ...base, source: "comp", activeUntil: null, isActive: true }],
        now,
      ),
    ).toBe(true);
  });

  it("grants when ANY row is live, not only the first", () => {
    // A founder who also subscribes, or a beta tester converting. Revoking
    // because one of two grants lapsed would be a bug with a ticket attached.
    expect(
      grantsPro(
        [
          { ...base, activeUntil: "2026-08-01T00:00:00.000Z", isActive: true },
          { ...base, source: "comp", activeUntil: null, isActive: true },
        ],
        now,
      ),
    ).toBe(true);
  });

  it("is false when every row has lapsed", () => {
    expect(
      grantsPro(
        [
          { ...base, activeUntil: "2026-08-01T00:00:00.000Z", isActive: true },
          { ...base, source: "comp", activeUntil: null, isActive: false },
        ],
        now,
      ),
    ).toBe(false);
  });
});

describe("strongestEntitlement", () => {
  const base = { product: "pro" as const, source: "stripe" as const };

  it("returns null when nothing is active", () => {
    expect(strongestEntitlement([], now)).toBeNull();
    expect(
      strongestEntitlement(
        [{ ...base, activeUntil: "2026-01-01T00:00:00.000Z", isActive: true }],
        now,
      ),
    ).toBeNull();
  });

  it("prefers the one that lasts longest, so the date shown is the real one", () => {
    const far = { ...base, activeUntil: "2027-01-01T00:00:00.000Z", isActive: true };
    expect(
      strongestEntitlement(
        [{ ...base, activeUntil: "2026-09-01T00:00:00.000Z", isActive: true }, far],
        now,
      ),
    ).toBe(far);
  });

  it("lets a never-expiring comp win from either position", () => {
    // A founder's access is not described by a subscription they also happen to
    // have, and `reduce` order must not decide which one the Billing row names.
    const comp = { ...base, source: "comp" as const, activeUntil: null, isActive: true };
    const paid = { ...base, activeUntil: "2027-01-01T00:00:00.000Z", isActive: true };
    expect(strongestEntitlement([comp, paid], now)).toBe(comp);
    expect(strongestEntitlement([paid, comp], now)).toBe(comp);
  });
});
