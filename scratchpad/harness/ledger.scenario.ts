import { afterAll, describe, expect, it } from "vitest";

import { Ledger, admin, seedAccount } from "./core";

/**
 * ⚠️ THE TEARDOWN'S OWN CONTROL (0.3).
 *
 *   npx vitest run --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/ledger.scenario.ts --reporter=verbose
 *
 * `Ledger.teardown()` used to be incapable of failing: every deletion was
 * `.catch(warn)`, the method returned void, and it cleared all three lists
 * unconditionally. **A run whose teardown deleted nothing reported green and left
 * nothing to find the survivors by.** Fifteen scenario files call it from
 * `afterAll` and not one asserted on the result.
 *
 * Asserting that it succeeds proves nothing — it always "succeeded". So this
 * drives the FAILURE direction, which is the direction that was broken, and the
 * success direction beside it as the control that the fix did not simply make
 * teardown always throw.
 *
 * ⚠️ NO STRIPE. Both cases are auth-only, so this runs in the default state with
 * `HARNESS_ALLOW_STRIPE` unset and needs no budget.
 *
 * ⚠️ AND IT DELETES NOTHING IT DID NOT CREATE. The failure case uses an id that
 * belongs to no account at all — a well-formed UUID that was never issued — so
 * the deletion it provokes cannot touch a real row even if it unexpectedly
 * succeeded.
 */

/** This file's own real account, for the success direction. */
const ledger = new Ledger();

afterAll(async () => {
  await ledger.teardown();
}, 180_000);

/**
 * A well-formed UUID that is not an account. Fixed rather than random so the
 * value in a failure message is searchable, and chosen from the reserved-looking
 * all-zero space so it cannot collide with a real Supabase id.
 */
const NOT_AN_ACCOUNT = "00000000-0000-4000-8000-00000000dead";

describe("⚠️ Ledger.teardown reports what it could not delete", () => {
  it("ARRIVAL: the id used by the failure case really is not an account", async () => {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    // A failed read must not read as "not an account" — that is the whole rule.
    expect(error, "could not list users, so this asserts nothing").toBeNull();
    expect(data.users.some((u) => u.id === NOT_AN_ACCOUNT)).toBe(false);
  });

  it("THROWS on a deletion that failed, instead of returning green", async () => {
    const doomed = new Ledger();
    doomed.user(NOT_AN_ACCOUNT);
    expect(doomed.outstanding().users, "ARRIVAL: the ledger holds the id").toEqual([
      NOT_AN_ACCOUNT,
    ]);

    await expect(doomed.teardown()).rejects.toThrow(/TEARDOWN FAILED/);
  });

  it("⚠️ KEEPS the undeleted id, so there is still something to find it by", async () => {
    const doomed = new Ledger();
    doomed.user(NOT_AN_ACCOUNT);
    await doomed.teardown().catch((e: Error) => {
      // The message names the id, so a scrolled-past run is still actionable.
      expect(e.message).toContain(NOT_AN_ACCOUNT);
      expect(e.message).toMatch(/BY ID/);
    });
    expect(
      doomed.outstanding().users,
      "the ledger was cleared despite the deletion failing — the old behaviour",
    ).toEqual([NOT_AN_ACCOUNT]);
  });

  it("⚠️ CONTROL: a teardown that genuinely succeeds resolves and empties the ledger", async () => {
    const real = new Ledger();
    const account = await seedAccount(real, "ledger-control");
    expect(real.outstanding().users, "ARRIVAL: seeded and ledgered").toEqual([account.id]);

    // ARRIVAL on the database, not on the response: the account is really there.
    const before = await admin.auth.admin.getUserById(account.id);
    expect(before.error).toBeNull();
    expect(before.data.user?.id).toBe(account.id);

    await expect(real.teardown()).resolves.toBeUndefined();
    expect(real.outstanding()).toEqual({ users: [], customers: [], clocks: [] });

    // And it is gone from the database, which is the claim that matters.
    const after = await admin.auth.admin.getUserById(account.id);
    expect(after.data.user, "the account survived a teardown that reported success").toBeFalsy();
  });
});
