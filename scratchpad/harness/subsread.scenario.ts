import { afterAll, describe, expect, it } from "vitest";

import { Ledger, admin, atLocalTime, seedAccount } from "./core";

/**
 * ⚠️ 1.6 — THE SUBSCRIPTIONS READ BESIDE THE ONE THAT WAS FIXED.
 *
 *   npx vitest run --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/subsread.scenario.ts --reporter=verbose
 *
 * `runner.ts`'s Promise.all makes three reads. `graceRes.error` became a third
 * state under finding 7 and `stampRes.error` is inspected for the migration
 * code. `subRes.error` was never read, so a failed subscriptions read produced
 * `row === undefined` and the account reported `no-trial`.
 *
 * **That is the read where money actually moves.** The grace read that got the
 * fix is the fallback for accounts with NO subscription; this one finds the
 * trials about to bill.
 *
 * The second effect is worse than the first: `row === undefined` made
 * `trial = grace`, so a GRACE-ALIGNED subscriber whose subscriptions read failed
 * was sent the grace's ending and the grace's DATE — a wrong date on a notice
 * about money.
 *
 * ## ⚠️ NO STRIPE, AND NO FLAG
 *
 * Both cases are Supabase-only and neither touches the billing gate, so this
 * runs in the default state. Contrast `rule0.scenario.ts`, which REFUSES without
 * `BILLING_GATE_ENABLED` because its branch is behind a ternary on the flag.
 *
 * ## ⚠️ THE FAILURE IS REAL, NOT MOCKED
 *
 * The same technique `rule0.scenario.ts` uses: a client whose key genuinely
 * cannot select from the table. Not a stub of one query — the honest shape of
 * "the database would not answer".
 *
 * And the CONSOLE LINE is what gets asserted, for the reason rule0 records: the
 * restricted client cannot read `profiles` either, so the runner short-circuits
 * at `reason: "disabled"` BEFORE the trial verdict. Asserting only on the return
 * value would be satisfied by that short-circuit, having never reached the code
 * under test — a vacuous pass this project has already paid for.
 */

const ledger = new Ledger();

afterAll(async () => {
  await ledger.teardown();
}, 180_000);

describe("1.6 — a failed subscriptions read is not 'no trial'", () => {
  it("⚠️ CONTROL: the grace fallback still works for the cohort it is FOR", async () => {
    /**
     * An account with a beta grace and NO subscription. `row` is legitimately
     * undefined here, and falling through to the grace is correct — that is the
     * behaviour 1.6 must not have broken while stopping the same fallback from
     * firing on an unreadable read.
     */
    const { runForUser } = await import("@/lib/notifications/runner");
    const graceEnds = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const account = await seedAccount(ledger, "subsread-control", {
      graceUntil: graceEnds,
      notificationsEnabled: true,
    });

    /* ── ARRIVAL, on the database: no mirror row, one comp row ────────── */
    const subs = await admin.from("subscriptions").select("id").eq("user_id", account.id);
    expect(subs.error, "could not read subscriptions, so this asserts nothing").toBeNull();
    expect(subs.data?.length).toBe(0);
    const ents = await admin
      .from("entitlements")
      .select("source, active_until")
      .eq("user_id", account.id);
    expect(ents.error).toBeNull();
    expect(ents.data?.length).toBe(1);
    expect(ents.data?.[0]?.source).toBe("comp");

    const morning = atLocalTime(graceEnds, 1, "09:05", "Australia/Sydney");
    const res = await runForUser(admin as never, account.id, { now: morning });
    /**
     * The point of the control: with the read WORKING, this account has an
     * ending and the runner finds it. Whatever it decides to do about it, it
     * must not be reporting the account as having nothing.
     */
    expect(res.trialReminder).not.toBe("subscriptions-unreadable");
  });

  it("⚠️ reports the SUBSCRIPTIONS read failing, and names that table", async () => {
    const { runForUser } = await import("@/lib/notifications/runner");
    const graceEnds = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const account = await seedAccount(ledger, "subsread-fail", {
      graceUntil: graceEnds,
      trialEndsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      status: "trialing",
      notificationsEnabled: true,
    });

    /* ── ARRIVAL: this really IS the grace-aligned shape, both rows present ── */
    const subs = await admin
      .from("subscriptions")
      .select("status")
      .eq("user_id", account.id);
    expect(subs.error).toBeNull();
    expect(subs.data?.length, "no mirror row, so this is not the aligned cohort").toBe(1);
    expect(subs.data?.[0]?.status).toBe("trialing");

    const { createClient } = await import("@supabase/supabase-js");
    const restricted = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    /* ── ⚠️ ARRIVAL: the read really does fail for this client ─────────── */
    const probe = await restricted.from("subscriptions").select("status").limit(1);
    expect(
      probe.error,
      "the restricted client CAN read subscriptions, so nothing below exercises a failed read",
    ).not.toBeNull();

    const errors: string[] = [];
    const realError = console.error;
    console.error = (...a: unknown[]) => {
      errors.push(a.map(String).join(" "));
    };
    try {
      await runForUser(restricted as never, account.id, {
        now: atLocalTime(graceEnds, 1, "09:05", "Australia/Sydney"),
      });
    } finally {
      console.error = realError;
    }

    /**
     * ⚠️ THE ARTEFACT EMITTED FROM INSIDE THE SPLIT. It exists only on the
     * `subscriptionsUnknown` branch, so it proves the read error was SEEN rather
     * than collapsed into `row === undefined`.
     */
    expect(
      errors.some((e) => e.includes("subscriptions unreadable")),
      "the subscriptions read error was swallowed — 1.6's split did not happen",
    ).toBe(true);
    /** And it defers rather than suppressing: nothing is claimed or stamped. */
    expect(
      errors.some((e) => e.includes("deferred to the next tick")),
      "the log does not record the deferral",
    ).toBe(true);
  });

  it("⚠️ and the stamp is NOT burned, so the next tick still sends", async () => {
    // A deferral that consumed the once-per-day stamp would be a permanent
    // silence wearing a different name.
    const account = await seedAccount(ledger, "subsread-stamp", {
      graceUntil: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      notificationsEnabled: true,
    });
    const prefs = await admin
      .from("notification_preferences")
      .select("trial_reminder_sent_for")
      .eq("user_id", account.id)
      .maybeSingle();
    expect(prefs.error).toBeNull();
    expect(prefs.data?.trial_reminder_sent_for).toBeNull();
  });
});
