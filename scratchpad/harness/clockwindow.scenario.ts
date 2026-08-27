/**
 * ⚠️ HOW LONG DOES AN `incomplete` SUBSCRIPTION'S FIRST INVOICE STAY PAYABLE?
 *
 * Run:
 *   HARNESS_ALLOW_STRIPE=1 npx vitest run \
 *     --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/clockwindow.scenario.ts
 *
 * ## Why this is being measured rather than read
 *
 * The codebase asserts two incompatible figures on a MONEY PATH:
 *
 *   ~23 hours   billing-actions.ts:1075, :1744, cancel.ts:134, :222  (four)
 *   15 days     billing-actions.ts:570-572, which explicitly calls the others
 *               wrong and says "the Stripe dashboard cancels incomplete payments
 *               after FIFTEEN DAYS on this account"
 *
 * D76's void reasons from the 23-hour figure. D83 was ruled on it too. Whichever
 * is right, four or five comments are lying about how long a user sits with an
 * open, payable invoice and no in-app control.
 *
 * ## ⚠️ THE TWO WINDOWS THAT ARE EASY TO CONFUSE, which is the hypothesis here
 *
 *   A. **Stripe's built-in expiry for an `incomplete` subscription** whose FIRST
 *      payment never completes. Nothing to do with dunning. This is what D76 and
 *      D83 actually depend on.
 *   B. **The dunning schedule for a `past_due` subscription** once Smart Retries
 *      is exhausted. This account runs 8 retries over 2 weeks — close enough to
 *      "fifteen days" to be the likely source of the confusion.
 *
 * They are different subscriptions in different states. This scenario measures A
 * and nothing else, so the answer cannot be contaminated by B.
 *
 * ## Reading the result
 *
 * A test clock only moves FORWARD, so a binary search is impossible on one clock.
 * The schedule below brackets both candidates and reports the tightest interval
 * observed. The exact transition is stated as a BRACKET (last seen alive, first
 * seen expired), because that is what was measured; a single number would be a
 * claim beyond the observation, which is the thing this file exists to fix.
 */

import { afterAll, describe, expect, it } from "vitest";

import { Ledger, TestClock, stripe, stripeBudgetAvailable, requireStripeBudget } from "./core";

const ledger = new Ledger();
afterAll(async () => { await ledger.teardown(); });

/** Hours after T0 to sample. Brackets ~23h tightly, then reaches past 15 days. */
const SAMPLES_HOURS = [1, 12, 22, 23, 24, 25, 26, 48, 72, 24 * 7, 24 * 14, 24 * 15, 24 * 16];

describe.skipIf(!stripeBudgetAvailable())("the incomplete-subscription expiry window", () => {
  it(
    "measures the hour an unpaid first invoice stops being payable",
    async () => {
      requireStripeBudget("measuring the incomplete expiry window");

      const t0 = new Date();
      const clock = new TestClock(ledger);
      await clock.create(t0);
      const customerId = await clock.customer("clockwindow@trackd-qa.invalid");

      // ⚠️ NO payment method attached, and `default_incomplete`. This is exactly
      // the abandoned-3DS shape: a subscription whose first invoice is finalised
      // and OPEN, and which nobody ever pays.
      const sub = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: process.env.STRIPE_PRICE_YEARLY! }],
        payment_behavior: "default_incomplete",
        expand: ["latest_invoice"],
      });
      expect(sub.status).toBe("incomplete");

      const timeline: Array<{ hours: number; status: string; invoice?: string }> = [];
      const record = async (hours: number) => {
        const s = await stripe.subscriptions.retrieve(sub.id, { expand: ["latest_invoice"] });
        const inv = (s.latest_invoice as { status?: string } | null)?.status;
        timeline.push({ hours, status: s.status, invoice: inv });
        console.log(
          `  +${String(hours).padStart(4)}h  subscription=${s.status.padEnd(19)} invoice=${inv}`,
        );
        return s.status;
      };

      console.log(`\nT0 ${t0.toISOString()}  ${sub.id}`);
      await record(0);

      let lastAlive = 0;
      let firstExpired: number | null = null;

      for (const hours of SAMPLES_HOURS) {
        await clock.advanceTo(new Date(t0.getTime() + hours * 3_600_000));
        const status = await record(hours);
        if (status === "incomplete_expired") {
          firstExpired = hours;
          break;
        }
        lastAlive = hours;
      }

      console.log("\n=== RESULT ===");
      if (firstExpired === null) {
        console.log(
          `  STILL PAYABLE at +${lastAlive}h (${(lastAlive / 24).toFixed(1)} days). ` +
            `Neither figure is confirmed; the window is LONGER than the schedule sampled.`,
        );
      } else {
        console.log(
          `  Alive at +${lastAlive}h, expired by +${firstExpired}h ` +
            `(${(lastAlive / 24).toFixed(2)}d .. ${(firstExpired / 24).toFixed(2)}d).`,
        );
        const supports23h = firstExpired <= 26;
        console.log(
          supports23h
            ? "  -> SUPPORTS ~23 HOURS. The four comments are right; billing-actions.ts:570-572 is wrong."
            : "  -> CONTRADICTS ~23 HOURS. billing-actions.ts:570-572's longer figure is closer.",
        );
      }
      console.log(`  timeline: ${JSON.stringify(timeline)}`);

      // The measurement is the deliverable; the assertion only pins that we
      // actually observed a transition rather than running out of schedule.
      expect(firstExpired).not.toBeNull();
    },
    // Each advance must settle before the next; 13 samples needs room.
    30 * 60_000,
  );
});
