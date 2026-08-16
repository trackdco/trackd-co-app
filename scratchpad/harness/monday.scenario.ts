/**
 * MONDAY'S THREE OBSERVATIONS — job D, the tightest constraint on the schedule.
 *
 * Run:  npx vitest run --config scratchpad/harness/vitest.harness.config.ts \
 *         scratchpad/harness/monday.scenario.ts
 *
 * ## D1 — the release condition, and why ONE reminder proves nothing
 *
 * `07` §3.5: "**⚠️ A moved end date is a new claim.** The stamp is keyed to the
 * date, so a courtesy grant that moves the ending produces a fresh claim and a
 * fresh reminder rather than being suppressed by the stamp from the original
 * trial. **This must be verified, not assumed, and it is the mechanism the whole
 * pair rests on.**"
 *
 * So the observation needs TWO reminders:
 *
 *   1. one fired against the ORIGINAL trial end, which stamps its own date;
 *   2. one fired against the MOVED end after the courtesy grant.
 *
 * A single reminder is consistent with the pair being broken. **If the stamp from
 * the first suppresses the second, the courtesy period ends in a charge that was
 * never warned about**, which is precisely the failure D1 exists to catch, and the
 * two promise strings stay behind `REMINDER_PROMISE_ENABLED`.
 *
 * ## ⚠️ D1 NEEDS NO STRIPE TEST CLOCK, and that is the headline
 *
 * The runner takes an injectable `now` (`runner.ts:695-701`), so both reminders
 * can be fired at chosen instants against a seeded mirror. Stripe's clock never
 * enters it. The test clock is needed only for Q79 and Smart Retries below, and
 * for Step 11's actual charge.
 *
 * That means **D1 can be observed at any time, repeatably, in seconds** — it is
 * not gated on a clock, on a reviewer being out of the tree, or on 07 shipping.
 * What it verifies is the RUNNER's half of the pair. The carrier half (that 07
 * composes and delivers the right words) is 07's own, and this file's `describe`
 * for it is left ready.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  Ledger,
  PushSink,
  atLocalTime,
  fireReminder,
  moveTrialEnd,
  readStamp,
  registerPush,
  seedAccount,
  stripeBudgetAvailable,
} from "./core";

const ledger = new Ledger();
const sink = new PushSink();

beforeAll(async () => { await sink.start(); });
afterAll(async () => { await ledger.teardown(); await sink.stop(); });

/** Seven days of courtesy, which is what a trial offer grants (`EXTRA_TRIAL_DAYS`). */
const COURTESY_DAYS = 7;

describe("D1 — a reminder fires before the ORIGINAL end, and again before the MOVED end", () => {
  it("stamps the first reminder against the original trial end", async () => {
    const trialEnd = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const user = await seedAccount(ledger, "d1", { trialEndsAt: trialEnd, status: "trialing" });
    await registerPush(user.id, sink.url);

    expect(await readStamp(user.id)).toBeNull();

    // Too early: the day before the promised day must produce nothing at all.
    const early = await fireReminder(user.id, atLocalTime(trialEnd, 4), sink);
    expect(early.trialReminder).toBe("too-early");
    expect(early.delivered).toBe(0);
    expect(await readStamp(user.id)).toBeNull();

    // The promised day: two days before the end, at the user's reminder time.
    const first = await fireReminder(user.id, atLocalTime(trialEnd, 2), sink);
    expect(first.delivered).toBeGreaterThan(0);
    expect(first.stampAfter).not.toBeNull();

    // And it does not fire twice for the same ending.
    const again = await fireReminder(user.id, atLocalTime(trialEnd, 2, "09:30"), sink);
    expect(again.trialReminder).toBe("already-sent");
    expect(again.delivered).toBe(0);
    expect(await readStamp(user.id)).toBe(first.stampAfter);
  });

  it("⚠️ FIRES A SECOND TIME once the courtesy grant moves the end date", async () => {
    const trialEnd = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const user = await seedAccount(ledger, "d1move", { trialEndsAt: trialEnd, status: "trialing" });
    await registerPush(user.id, sink.url);

    const first = await fireReminder(user.id, atLocalTime(trialEnd, 2), sink);
    expect(first.delivered).toBeGreaterThan(0);
    const firstStamp = first.stampAfter;
    expect(firstStamp).not.toBeNull();

    // The courtesy grant. `grantExtraTime` moves Stripe's `trial_end` and mirrors
    // it; from the runner's point of view the only thing that changes is this.
    const movedEnd = new Date(Date.parse(trialEnd) + COURTESY_DAYS * 86_400_000).toISOString();
    await moveTrialEnd(user.id, movedEnd);

    // Still nothing between the two promised days: the first is spent, the second
    // has not arrived. A send here would be a reminder about the wrong ending.
    const between = await fireReminder(user.id, atLocalTime(movedEnd, 5), sink);
    expect(between.delivered).toBe(0);

    // ⚠️ THE OBSERVATION D1 IS ABOUT.
    const second = await fireReminder(user.id, atLocalTime(movedEnd, 2), sink);
    expect(second.delivered).toBeGreaterThan(0);
    expect(second.stampAfter).not.toBe(firstStamp);
  });

  it("says nothing to somebody who has already cancelled", async () => {
    // The promise is "before anything changes". For them nothing is.
    const trialEnd = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const user = await seedAccount(ledger, "d1canc", {
      trialEndsAt: trialEnd, status: "trialing", cancelAtPeriodEnd: true,
    });
    await registerPush(user.id, sink.url);

    const out = await fireReminder(user.id, atLocalTime(trialEnd, 2), sink);
    expect(out.trialReminder).toBe("already-cancelled");
    expect(out.delivered).toBe(0);
  });

  it("never fires after the charge instant, only before it", async () => {
    // A trial ends at an INSTANT, not at the end of a calendar day. A reminder
    // after the money moved tells somebody they still have time when they do not.
    //
    // ⚠️ The probe instant is the morning AFTER the ending, not "the ending plus
    // an hour": these trials end near local midnight, so plus-an-hour lands
    // inside quiet hours (22:00-08:00) and the runner short-circuits on THAT
    // first. The scenario would then pass or fail for a reason unrelated to what
    // it is testing. Measured on the first run: it returned "quiet-hours".
    const trialEnd = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const user = await seedAccount(ledger, "d1late", { trialEndsAt: trialEnd, status: "trialing" });
    await registerPush(user.id, sink.url);

    const after = await fireReminder(user.id, atLocalTime(trialEnd, -1), sink);
    expect(after.trialReminder).toBe("trial-over");
    expect(after.delivered).toBe(0);
  });
});

describe.skipIf(!stripeBudgetAvailable())(
  "Q79 — Stripe's own trial-ending email against a trial_end moved mid-cycle",
  () => {
    /**
     * Stripe's email is configured SEVEN DAYS before trial end, and a trial
     * courtesy period is seven days long. So the question is whether it fires at
     * all for a moved end, and what it does when the whole courtesy period is
     * shorter than the lead time.
     *
     * ⚠️ It is supplementary and explicitly NOT the backstop (`04` §0). This
     * observation records what it does; it must never become the thing D1 rests
     * on. Requires a test clock: only Stripe's clock decides when Stripe emails.
     */
    it.todo("records whether the email fires for a trial_end moved forward 7 days");
    it.todo("records what happens when the courtesy period is shorter than the 7-day lead");
  },
);

describe.skipIf(!stripeBudgetAvailable())(
  "Smart Retries — when the first retry actually lands, against the 3-day grace",
  () => {
    /**
     * The past-due handler claws entitlement back to the last paid period plus a
     * grace. If Stripe's first Smart Retry lands AFTER that grace expires, a payer
     * whose card blipped goes read-only before Stripe has finished trying to
     * charge them. Measuring the real interval is the only way to know.
     */
    it.todo("measures the interval from failed charge to first retry on a test clock");
  },
);
