import { afterAll, describe, expect, it } from "vitest";

import { COMP_EMAILS, betaGrantFor, ensureCompEntitlement, grantExpiry } from "@/lib/billing/betaGrace";

import { Ledger, admin } from "./core";

/**
 * COLDCHAT-GATE — D71, THE SIGNUP GRANT, DRIVEN AGAINST THE REAL DATABASE.
 *
 *   npx vitest run --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/coldgate.scenario.ts --reporter=verbose
 *
 * `ensureCompEntitlement` is the half that keeps a comp-list member's access when
 * they sign up AFTER the backfill has run. It is called from all three sign-in
 * doorways (`app/auth/callback/route.ts:42`, `app/auth/confirm/route.ts:63`,
 * `app/login/actions.ts:171`) with the session's own id and email.
 *
 * ⚠️ THE EMAIL IS AN ARGUMENT, SO THE LIST IS NEVER PATCHED. The function takes
 * `(userId, email)`, so a comp-list address can be passed against a
 * `@trackd-qa.invalid` FIXTURE ACCOUNT. Nothing is added to `COMP_EMAILS` and no
 * auth account is created on a real person's address — both of which the house
 * rules forbid outright.
 *
 * Safety: `@trackd-qa.invalid` accounts, ledgered, deleted BY ID. No Stripe object.
 */

const ledger = new Ledger();
const made: string[] = [];

/** A comp-list address, taken from the list itself rather than retyped. */
const ON_THE_LIST = COMP_EMAILS[0];

async function fixture(tag: string): Promise<string> {
  const email = `qa-gate-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@trackd-qa.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: process.env.QA_TEST_PASSWORD ?? "", email_confirm: true });
  if (error) throw new Error(`fixture: ${error.message}`);
  made.push(data.user.id);
  ledger.user(data.user.id);
  return data.user.id;
}

async function compRow(userId: string) {
  const { data, error } = await admin
    .from("entitlements")
    .select("source, active_until, is_active")
    .eq("user_id", userId)
    .eq("product", "pro");
  if (error) throw new Error(error.message);
  return data ?? [];
}

afterAll(async () => {
  await ledger.teardown();
  console.log(`ledger: ${made.length} account(s) created, all dropped by id`);
});

describe("D71 — the signup grant", () => {
  it("the list itself is lowercase, or an entry silently matches nothing", () => {
    expect(COMP_EMAILS.every((e) => e === e.toLowerCase())).toBe(true);
    expect(COMP_EMAILS.length).toBeGreaterThan(0);
  });

  it("grants a free-for-life comp to a list member, with NO expiry", async () => {
    const id = await fixture("d71-grant");
    // ARRIVAL: nothing there before.
    expect(await compRow(id)).toHaveLength(0);

    await ensureCompEntitlement(id, ON_THE_LIST);

    const rows = await compRow(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "comp", active_until: null, is_active: true });
  });

  it("CONTROL: an address NOT on the list gets no row at all", async () => {
    const id = await fixture("d71-offlist");
    expect(betaGrantFor(`${id}@trackd-qa.invalid`).kind).toBe("grace");

    await ensureCompEntitlement(id, `${id}@trackd-qa.invalid`);

    // ⚠️ The whole point: it must not reach an address the list does not name.
    expect(await compRow(id)).toHaveLength(0);
  });

  it("a capitalised sign-up address still matches (the comparison lowercases)", async () => {
    const id = await fixture("d71-caps");
    await ensureCompEntitlement(id, ON_THE_LIST.toUpperCase());
    expect(await compRow(id)).toHaveLength(1);
  });

  it("is idempotent: a second sign-in writes nothing new and does not throw", async () => {
    const id = await fixture("d71-idem");
    await ensureCompEntitlement(id, ON_THE_LIST);
    const first = await compRow(id);
    await ensureCompEntitlement(id, ON_THE_LIST);
    await ensureCompEntitlement(id, ON_THE_LIST);
    const after = await compRow(id);
    expect(after).toHaveLength(1);
    expect(after[0]).toEqual(first[0]);
  });

  it("⚠️ NEVER RESURRECTS A REVOKED COMP. A revocation is a decision somebody made", async () => {
    const id = await fixture("d71-revoked");
    // The kill switch, in the shape `001_billing_tables.sql` documents: flip the
    // flag, leave the date alone.
    const { error } = await admin.from("entitlements").insert({
      user_id: id, product: "pro", source: "comp", active_until: null, is_active: false });
    if (error) throw new Error(error.message);
    // ARRIVAL: it really is revoked before the sign-in runs.
    expect((await compRow(id))[0]).toMatchObject({ is_active: false });

    await ensureCompEntitlement(id, ON_THE_LIST);

    const after = await compRow(id);
    expect(after).toHaveLength(1);
    expect(after[0].is_active).toBe(false);
  });

  it("leaves a time-limited grace row's DATE alone (upgrading it is the backfill's job)", async () => {
    const id = await fixture("d71-grace");
    const until = new Date(Date.now() + 14 * 864e5).toISOString();
    const { error } = await admin.from("entitlements").insert({
      user_id: id, product: "pro", source: "comp", active_until: until, is_active: true });
    if (error) throw new Error(error.message);

    await ensureCompEntitlement(id, ON_THE_LIST);

    const after = await compRow(id);
    expect(after).toHaveLength(1);
    expect(after[0].active_until).not.toBeNull();
    expect(Date.parse(after[0].active_until as string)).toBe(Date.parse(until));
  });

  it("a row it created is one the launch backfill SKIPS rather than collides with", async () => {
    // The backfill's `answered` set is built from ANY entitlement row and its
    // `timeLimitedComp` set requires a DATED one. A no-expiry comp is in the
    // first and not the second, so it is skipped by both branches.
    const id = await fixture("d71-backfill");
    await ensureCompEntitlement(id, ON_THE_LIST);
    const rows = await compRow(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].active_until).toBeNull();       // -> not in `timeLimitedComp`
    expect(rows.length).toBeGreaterThan(0);        // -> in `answered`
    // And the grant it would otherwise write is the same shape, so even a
    // collision would be on the unique key rather than a data change.
    expect(grantExpiry(betaGrantFor(ON_THE_LIST), new Date())).toBeNull();
  });
});
