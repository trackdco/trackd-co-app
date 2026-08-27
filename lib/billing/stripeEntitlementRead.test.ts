import { describe, expect, it } from "vitest";

import { readStripeEntitlement } from "./sync";

/**
 * ⚠️ STANDING RULE 0, FINDINGS 1 AND 2: A FAILED READ IS NOT AN ABSENT ROW.
 *
 * `markPastDue` and `endSubscription` both discarded the read error and answered
 * "nothing to shorten", so an unreachable database left the rolled-forward unpaid
 * period standing and let access survive a cancellation. Both permissive, both in
 * the money path.
 *
 * These pin the three states, and **the `absent` case is the control**: the fix
 * must not trade a permissive failure for a refusing one. On
 * `subscription.deleted` a spurious refusal would revoke access from somebody
 * entitled, which is the direction that costs a real user their product rather
 * than costing us money.
 *
 * The stub is the query-builder SHAPE and nothing more — `.from().select().eq()`
 * chained, resolving to `{ data, error }`. It is not a mock of Supabase's
 * behaviour, so there is nothing here that can pass by testing the mock.
 */
type Answer = { data: unknown; error: { message: string } | null };

function stubDb(answer: Answer) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    then: (resolve: (a: Answer) => unknown) => Promise.resolve(answer).then(resolve),
  };
  return { from: () => chain } as never;
}

const USER = "11111111-1111-4111-8111-111111111111";

describe("readStripeEntitlement — the three states", () => {
  it("a read ERROR is `unknown`, and carries the message for the log", async () => {
    const read = await readStripeEntitlement(
      stubDb({ data: null, error: { message: "connection reset" } }),
      USER,
    );
    expect(read.kind).toBe("unknown");
    expect(read.kind === "unknown" && read.message).toBe("connection reset");
  });

  /**
   * ⚠️ THE CONTROL. A genuinely missing row must still be `absent`, so the
   * callers keep returning "handled" for it. Without this, a fix that answered
   * `unknown` for everything would satisfy the test above perfectly and start
   * throwing on every cancellation of an account that never had an entitlement.
   */
  it("no row is `absent`, NOT unknown", async () => {
    expect((await readStripeEntitlement(stubDb({ data: [], error: null }), USER)).kind).toBe("absent");
    expect((await readStripeEntitlement(stubDb({ data: null, error: null }), USER)).kind).toBe("absent");
  });

  it("a row is `present`, and a null date stays null rather than becoming absent", async () => {
    const dated = await readStripeEntitlement(
      stubDb({ data: [{ active_until: "2026-09-01T00:00:00Z" }], error: null }),
      USER,
    );
    expect(dated.kind).toBe("present");
    expect(dated.kind === "present" && dated.activeUntil).toBe("2026-09-01T00:00:00Z");

    /**
     * ⚠️ `present` WITH A NULL DATE IS NOT `absent`. A row that exists with no
     * end date is a real row, and the pre-existing behaviour for it is "nothing
     * to shorten". Collapsing the two would have changed a second thing while
     * fixing the first.
     */
    const undated = await readStripeEntitlement(
      stubDb({ data: [{ active_until: null }], error: null }),
      USER,
    );
    expect(undated.kind).toBe("present");
    expect(undated.kind === "present" && undated.activeUntil).toBeNull();
  });

  /**
   * ⚠️ THE KILL SWITCH RIDES ALONG, BECAUSE ONE CALLER NOW GRANTS (Group A).
   *
   * `markPastDue` can lengthen the date as well as shorten it, and it refuses to
   * lengthen a row `revokeForCustomer` turned off. That refusal needs `is_active`
   * to have SURVIVED the read, so it is asserted here rather than assumed there.
   *
   * ⚠️ AND A MISSING COLUMN READS AS TRUE, not as revoked. The default matters in
   * the direction it fails: `true` leaves the existing behaviour for every healthy
   * row, whereas defaulting to `false` would silently switch the grace off for
   * everybody the moment the field went missing from a select.
   */
  it("carries `is_active`, and a row without the field reads as live rather than revoked", async () => {
    const revoked = await readStripeEntitlement(
      stubDb({ data: [{ active_until: "2026-09-01T00:00:00Z", is_active: false }], error: null }),
      USER,
    );
    expect(revoked.kind === "present" && revoked.isActive).toBe(false);

    const live = await readStripeEntitlement(
      stubDb({ data: [{ active_until: "2026-09-01T00:00:00Z", is_active: true }], error: null }),
      USER,
    );
    expect(live.kind === "present" && live.isActive).toBe(true);

    const missing = await readStripeEntitlement(
      stubDb({ data: [{ active_until: "2026-09-01T00:00:00Z" }], error: null }),
      USER,
    );
    expect(missing.kind === "present" && missing.isActive).toBe(true);
  });
});

describe("the callers refuse on unknown and only on unknown", () => {
  const source = readFileSyncSafe("lib/billing/sync.ts");

  /**
   * Source assertions, for the reason `failureDirections.test.ts` gives about the
   * same class of rule: these handlers reach `serviceClient()` and Stripe, which
   * this pure `lib/**` suite cannot exercise, and mocking them wholesale would
   * test the mock. What must not silently disappear is the REFUSAL.
   */
  it("both shortening paths throw on `unknown` rather than returning handled", () => {
    const throwsOnUnknown = source.match(/if \(read\.kind === "unknown"\) \{\s*throw new Error\(/g);
    expect(
      throwsOnUnknown?.length,
      "a shortening path stopped refusing on an unreadable entitlement",
    ).toBe(2);
  });

  it("neither path reads the entitlement without checking the error again", () => {
    // The old shape, which must not come back in either function.
    expect(source).not.toMatch(/const \{ data: ents \} = await db/);
    expect(source).not.toMatch(/const \{ data: existing \} = await db/);
  });
});

function readFileSyncSafe(path: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  return readFileSync(path, "utf8");
}
