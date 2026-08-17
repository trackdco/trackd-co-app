import { afterAll, describe, expect, it } from "vitest";

import { Ledger, admin, atLocalTime, seedAccount } from "./core";

/**
 * ⚠️ STANDING RULE 0, FINDING 7 — AND IT MUST BE DRIVEN WITH THE GATE ON.
 *
 *   BILLING_GATE_ENABLED=true npx vitest run \
 *     --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/rule0.scenario.ts --reporter=verbose
 *
 * The entitlement read in `collectTrial` is the `then` branch of a
 * `billingGateEnabled()` ternary (`runner.ts:202`), so with the gate OFF it is a
 * resolved `{data: null, error: null}` and finding 7 cannot fire at all.
 * **A gate-off run would report every case here as a pass while testing nothing**,
 * which is why the flag is asserted before anything else and the file refuses
 * rather than skips.
 *
 * This one runs the runner IN PROCESS, so the flag is this process's own — it does
 * not depend on the dev server's environment.
 */

const ledger = new Ledger();

afterAll(async () => {
  await ledger.teardown();
}, 180_000);

describe("finding 7 — an unreadable entitlement is not 'no grace'", () => {
  it("⚠️ REFUSES to run with the gate off, rather than passing vacuously", () => {
    expect(
      process.env.BILLING_GATE_ENABLED,
      "BILLING_GATE_ENABLED is not 'true' in THIS process: finding 7 is dormant and " +
        "every case below would pass without exercising it. Re-run with the flag set.",
    ).toBe("true");
  });

  it("reports `entitlements-unreadable`, not `no-trial`, and claims nothing", async () => {
    const { runForUser } = await import("@/lib/notifications/runner");

    const account = await seedAccount(ledger, "rule0-f7", { notificationsEnabled: true });

    /* ── ⚠️ ARRIVAL: no mirror row, so the GRACE path is the one in play ── */
    const sub = await admin.from("subscriptions").select("id").eq("user_id", account.id);
    expect(sub.data?.length ?? 0, "a mirror row exists, so the grace read is bypassed").toBe(0);

    /**
     * ⚠️ THE CONTROL, FIRST. With the entitlement table readable and this account
     * having no rows, the runner must report `no-trial` — the account genuinely
     * has no ending. That is the answer the defect made indistinguishable from a
     * failed read, so it has to be observed before the failure case means
     * anything.
     */
    /**
     * ⚠️ `now` MUST BE OUTSIDE QUIET HOURS, and the first run of this scenario was
     * not. `runner.ts:867` short-circuits on quiet hours BEFORE the trial verdict
     * and returns `trialReminder: undefined`, so the control read as "the runner
     * refused" when in fact it never got there. Quiet hours are 22:00-08:00 and
     * this session runs near local midnight — the exact trap the harness README
     * records about probing "the ending plus an hour".
     *
     * 09:05 local, which is also past the 09:00 reminder time, so neither guard
     * fires and the verdict is actually reached.
     */
    const morning = atLocalTime(new Date().toISOString(), 0, "09:05", "Australia/Sydney");
    console.log(`  probing at ${morning.toISOString()} (09:05 Australia/Sydney)`);
    const control = await runForUser(admin as never, account.id, { now: morning });
    console.log(`  CONTROL (readable, no rows): trialReminder=${control.trialReminder}`);
    expect(
      control.trialReminder,
      "the control did not report no-trial, so the two states were never distinguishable here",
    ).toBe("no-trial");

    /**
     * Now make the entitlement read FAIL, without touching any other read: a
     * client whose key cannot select from `entitlements`. The runner's other
     * queries go through the same client, so this is the honest shape of "the
     * database would not answer" rather than a mock of one query.
     */
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
    const restricted = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const probe = await restricted.from("entitlements").select("source").limit(1);
    /* ── ⚠️ ARRIVAL: the read really does fail for this client ─────────── */
    console.log(`  probe error: ${probe.error?.code ?? "(none)"} ${probe.error?.message ?? ""}`);
    expect(
      probe.error,
      "the restricted client CAN read entitlements, so nothing below exercises a failed read",
    ).not.toBeNull();

    /**
     * ⚠️ CAPTURE `console.error`, BECAUSE THE RETURN VALUE CANNOT SEE THE SPLIT.
     *
     * The restricted client cannot read `profiles` either, so the runner
     * short-circuits at `reason: "disabled"` (`runner.ts:860`) BEFORE the trial
     * verdict. The first version of this test asserted only
     * `trialReminder !== "no-trial"` and passed — **satisfied by any
     * short-circuit, having never reached the code under test.** That is the same
     * vacuous pass as route 1's detector, for the fourth time this session.
     *
     * The log line is the artefact that IS emitted from inside the split, so it is
     * what gets asserted.
     */
    const errors: string[] = [];
    const realError = console.error;
    console.error = (...a: unknown[]) => { errors.push(a.map(String).join(" ")); };
    let failed;
    try {
      failed = await runForUser(restricted as never, account.id, { now: morning });
    } finally {
      console.error = realError;
    }
    console.log(`  FAILED READ: trialReminder=${failed.trialReminder} reason=${failed.reason ?? "-"}`);
    console.log(`  captured: ${JSON.stringify(errors.filter((e) => e.includes("entitlements unreadable")))}`);

    /**
     * ⚠️ THE ASSERTION THAT REACHES THE SPLIT. This line is emitted only from the
     * `entitlementsUnknown` branch, so it proves the read error was SEEN rather
     * than collapsed into an empty array.
     */
    expect(
      errors.some((e) => e.includes("entitlements unreadable")),
      "the entitlement read error was swallowed — finding 7's split did not happen",
    ).toBe(true);
    expect(
      errors.some((e) => e.includes("write access REFUSED")),
      "the log does not record canWrite refusing on unknown",
    ).toBe(true);

    /**
     * ⚠️ AND WHAT THIS DRIVE DOES **NOT** OBSERVE, stated rather than implied.
     *
     * The `entitlements-unreadable` REASON is not reached here, because this
     * client also cannot read `profiles` and the runner bails at "disabled"
     * first. Reaching it needs a client that can read `profiles` and
     * `notification_preferences` but NOT `entitlements`, which would mean a grant
     * change on a PRODUCTION table — banned outright.
     *
     * So: the SPLIT is driven, the LOG is driven, the non-burn is driven. The
     * reason string reaching the cron's payload is verified by `tsc` and by
     * reading `runner.ts`, and is NOT ticked as observed. Do not tick it.
     */
    expect(failed.reason, "this drive short-circuits at 'disabled', as documented above").toBe(
      "disabled",
    );

    /**
     * And nothing may be claimed on this path, or the deferral becomes a burn: the
     * next tick would answer `already-sent` about a reminder nobody received.
     */
    const stamp = await admin
      .from("notification_preferences")
      .select("trial_reminder_sent_for")
      .eq("user_id", account.id)
      .maybeSingle();
    console.log(`  stamp after the failed read: ${JSON.stringify(stamp.data)}`);
    expect(
      stamp.data?.trial_reminder_sent_for,
      "the failed read BURNED the dedupe key; the next tick would suppress the real reminder",
    ).toBeNull();
  }, 300_000);
});
