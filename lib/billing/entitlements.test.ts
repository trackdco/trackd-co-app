import { describe, expect, it } from "vitest";

import {
  deriveEntitlementFacts,
  grantsPro,
  isEntitlementActive,
  PRO,
  strongestEntitlement,
} from "./access";
import type { Entitlement, EntitlementSource } from "./access";

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

describe("⚠️ strongestEntitlement — the beta grace must not outrank a subscription", () => {
  const at = (days: number) => new Date(now.getTime() + days * 86400_000).toISOString();
  const row = (source: EntitlementSource, activeUntil: string | null): Entitlement => ({
    product: PRO,
    source,
    activeUntil,
    isActive: true,
  });

  it("a paying subscription beats a LONGER beta grace", () => {
    // The defect, measured by a cold review: a 14-day `comp` grace outranked a
    // fresh 7-day Stripe trial, so `manageActionFor` saw `comp`, returned
    // `{kind:"none"}`, and /billing rendered "Complimentary" with NO CANCEL
    // CONTROL for somebody whose card was on file. The dashboard told a paying
    // subscriber "Your free trial ends 15 Aug."
    const grace = row("comp", at(14));
    const trial = row("stripe", at(7));
    expect(strongestEntitlement([grace, trial], now)).toBe(trial);
    expect(strongestEntitlement([trial, grace], now)).toBe(trial);
  });

  it("...for apple and google too", () => {
    for (const source of ["apple", "google"] as const) {
      const paid = row(source, at(3));
      expect(strongestEntitlement([row("comp", at(14)), paid], now)).toBe(paid);
    }
  });

  it("but a FOREVER comp still beats everything", () => {
    // Unchanged, and the reason the original rule existed: a founder's access is
    // not described by a subscription they also happen to have.
    const forever = row("comp", null);
    expect(strongestEntitlement([forever, row("stripe", at(365))], now)).toBe(forever);
    expect(strongestEntitlement([row("stripe", at(365)), forever], now)).toBe(forever);
    expect(strongestEntitlement([forever, row("comp", at(14))], now)).toBe(forever);
  });

  it("within a tier, longest still wins", () => {
    const near = row("stripe", at(3));
    const far = row("stripe", at(30));
    expect(strongestEntitlement([near, far], now)).toBe(far);
    expect(strongestEntitlement([far, near], now)).toBe(far);
  });

  it("an EXPIRED subscription does not outrank a live grace", () => {
    // Tiering must never resurrect a dead row: the active filter runs first.
    const grace = row("comp", at(14));
    expect(strongestEntitlement([row("stripe", at(-1)), grace], now)).toBe(grace);
  });

  it("the order the rows arrive in never changes the answer", () => {
    const rows = [row("comp", at(14)), row("stripe", at(7)), row("comp", null)];
    for (const p of [
      rows,
      [rows[2], rows[0], rows[1]],
      [rows[1], rows[2], rows[0]],
      [rows[0], rows[2], rows[1]],
    ]) {
      expect(strongestEntitlement(p, now)?.activeUntil).toBeNull();
    }
  });
});

/**
 * ⚠️ THE WIDENED READ'S DERIVATION (1.1).
 *
 * `currentEntitlement` and `entitlementEndDate` both routed through
 * `listEntitlements`, which returns `[]` on a FAILED read, and both then answered
 * `null` for two different facts: "no entitlement" and "could not read
 * entitlements". Five surfaces spent that null as though it were the first.
 *
 * The three-state answer already existed eight lines away in `proAccessState`,
 * and the WRITE path already used it — so on ONE failed read the app answered
 * "unknown, still syncing, retry" on the write path and "not on a plan" on the
 * billing path, in the same request.
 *
 * The read half is `entitlementFacts` and is server-only. THIS is the deciding
 * half, and it is pure so it can be checked rather than mocked.
 */
describe("⚠️ deriveEntitlementFacts — the four facts that must not disagree", () => {
  const now = new Date("2026-08-18T00:00:00.000Z");
  const e = (over: Partial<Entitlement>): Entitlement => ({
    product: PRO,
    source: "stripe" as EntitlementSource,
    activeUntil: "2027-08-18T00:00:00.000Z",
    isActive: true,
    ...over,
  });

  it("an ordinary paying account: live, not revoked, with its date", () => {
    const f = deriveEntitlementFacts([e({})], now);
    expect(f.accessLive).toBe(true);
    expect(f.revoked).toBe(false);
    expect(f.entitlement?.source).toBe("stripe");
    expect(f.endDate).toBe("2027-08-18T00:00:00.000Z");
  });

  it("⚠️ THE REVOKED SHAPE: the flag is false, the DATE IS UNTOUCHED", () => {
    // Field for field what revokeForCustomer leaves behind: is_active false,
    // active_until exactly as it was. This is the cohort 1.4 is about.
    const f = deriveEntitlementFacts([e({ isActive: false })], now);
    expect(f.revoked, "the revocation flag is the fact, and it is readable").toBe(true);
    expect(f.accessLive, "a revoked row grants nothing").toBe(false);
    expect(f.entitlement, "and it must not name their plan").toBeNull();
    // ⚠️ The date SURVIVES, which is why every surface could still print it.
    expect(f.endDate).toBe("2027-08-18T00:00:00.000Z");
  });

  it("⚠️ CONTROL: a LAPSED account is not a revoked one, and they differ in `revoked` alone", () => {
    // Both grant nothing and both name no plan. The old code could not tell them
    // apart at all, which is how a revoked account read "You're on your Pro plan".
    const lapsed = deriveEntitlementFacts(
      [e({ activeUntil: "2026-08-01T00:00:00.000Z" })],
      now,
    );
    const revoked = deriveEntitlementFacts([e({ isActive: false })], now);
    expect(lapsed.accessLive).toBe(false);
    expect(revoked.accessLive).toBe(false);
    expect(lapsed.entitlement).toBeNull();
    expect(revoked.entitlement).toBeNull();
    expect(lapsed.revoked, "a date that passed is not a decision somebody made").toBe(false);
    expect(revoked.revoked).toBe(true);
  });

  it("no rows at all: nothing live, nothing revoked, no date to state", () => {
    const f = deriveEntitlementFacts([], now);
    expect(f).toEqual({ entitlement: null, endDate: null, revoked: false, accessLive: false });
  });

  it("a free-for-life comp is live and names NO date, which is not the same as no access", () => {
    const f = deriveEntitlementFacts([e({ source: "comp", activeUntil: null })], now);
    expect(f.accessLive).toBe(true);
    expect(f.endDate, "null here means `this source has nothing to say`").toBeNull();
    expect(f.revoked).toBe(false);
  });

  it("⚠️ endDate takes the FURTHEST date, so a live row is never under-cut by a stale one", () => {
    const f = deriveEntitlementFacts(
      [
        e({ source: "comp", activeUntil: "2026-08-20T00:00:00.000Z" }),
        e({ source: "stripe", activeUntil: "2027-08-18T00:00:00.000Z" }),
      ],
      now,
    );
    expect(f.endDate).toBe("2027-08-18T00:00:00.000Z");
  });

  it("⚠️ a revoked row BESIDE a live one: access holds, and the revocation is still reported", () => {
    // A withdrawn comp beside a paid subscription. `revoked` is about the rows,
    // not about the outcome, so 2.3's exemption can ask which row it belongs to.
    const f = deriveEntitlementFacts(
      [e({ source: "comp", isActive: false, activeUntil: null }), e({ source: "stripe" })],
      now,
    );
    expect(f.accessLive).toBe(true);
    expect(f.entitlement?.source).toBe("stripe");
    expect(f.revoked).toBe(true);
  });

  it("ignores rows for another product entirely", () => {
    const other = { ...e({}), product: "not-pro" as unknown as typeof PRO };
    const f = deriveEntitlementFacts([other], now);
    expect(f.accessLive).toBe(false);
    expect(f.revoked, "another product's dead row is not this product's revocation").toBe(false);
    expect(f.endDate).toBeNull();
  });
});
