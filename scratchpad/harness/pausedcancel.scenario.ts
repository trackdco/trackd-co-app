/**
 * D80's MONEY HALF: a genuinely `paused` subscription, cancelled immediately.
 *
 * Run:
 *   HARNESS_ALLOW_STRIPE=1 npx vitest run \
 *     --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/pausedcancel.scenario.ts
 *
 * The screen half of D80 is driven (`scratchpad/qa-24.mjs`): `paused` and
 * `unpaid` now render a cancel control. **This is the half that moves money**, and
 * a proven screen over an unproven mechanism is the exact shape that has bitten
 * three times on this branch.
 *
 * ## Producing a genuinely `paused` subscription
 *
 * `pause_collection` alone does not do it. A trial that ends with
 * `trial_settings.end_behavior.missing_payment_method = "pause"` and no payment
 * method attached transitions to `paused` when the trial expires, which needs a
 * test clock to reach.
 *
 * ## What is asserted
 *
 *   1. Stripe genuinely REFUSES `cancel_at_period_end` on it — the premise D80
 *      rests on, verified rather than quoted.
 *   2. `cancelImmediately` succeeds where the flag failed.
 *   3. The subscription is gone at Stripe (`canceled`).
 *   4. ⚠️ The ENTITLEMENT IS UNTOUCHED. Cancelling never revokes what was paid
 *      for, and an immediate cancel must be no exception.
 */

import { afterAll, describe, expect, it } from "vitest";

import { cancelImmediately } from "@/lib/billing/cancel";

import { Ledger, QA_PASSWORD, TestClock, admin, requireStripeBudget, stripe, stripeBudgetAvailable } from "./core";

const ledger = new Ledger();
afterAll(async () => { await ledger.teardown(); });

const MONTHLY = process.env.STRIPE_PRICE_MONTHLY!;

describe.skipIf(!stripeBudgetAvailable())("D80 — cancelling a paused subscription", () => {
  it("refuses the flag, accepts the immediate cancel, and leaves the entitlement alone", async () => {
    requireStripeBudget("driving D80's immediate cancel");

    const t0 = new Date();
    const clock = new TestClock(ledger);
    await clock.create(t0);

    const email = `d80-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@trackd-qa.invalid`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password: QA_PASSWORD, email_confirm: true,
    });
    if (error) throw new Error(error.message);
    const userId = ledger.user(data.user.id);

    // ⚠️ NO payment method. That is what makes the trial end in `paused`.
    const customer = await stripe.customers.create({ email, test_clock: clock.id });
    ledger.customer(customer.id);
    await admin.from("billing_customers").insert({ user_id: userId, stripe_customer_id: customer.id });

    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: MONTHLY }],
      trial_period_days: 1,
      trial_settings: { end_behavior: { missing_payment_method: "pause" } },
    });
    const entitledUntil = new Date(sub.trial_end! * 1000).toISOString();
    await admin.from("entitlements").insert({
      user_id: userId, product: "pro", source: "stripe",
      active_until: entitledUntil, is_active: true,
    });
    // ⚠️ A MIRROR ROW, so `cancelImmediately`'s mirror write is actually
    // exercised. Without one the update matches nothing and passes vacuously —
    // the same "green and measuring nothing" shape logged for the test audit.
    await admin.from("subscriptions").insert({
      user_id: userId, stripe_subscription_id: sub.id, stripe_price_id: MONTHLY,
      status: "trialing", cancel_at_period_end: false,
    });
    console.log(`  created ${sub.id} status=${sub.status}, entitled until ${entitledUntil}`);

    // Past the trial end, with no card: Stripe pauses it.
    await clock.advanceTo(new Date(sub.trial_end! * 1000 + 3_600_000));
    const paused = await stripe.subscriptions.retrieve(sub.id);
    console.log(`  after the trial ends: status=${paused.status}`);
    expect(paused.status).toBe("paused");

    // 1. ⚠️ THE PREMISE D80 RESTS ON, verified rather than quoted.
    let refused: string | null = null;
    try {
      await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
    } catch (e) {
      refused = (e as Error).message;
    }
    console.log(`  cancel_at_period_end refused: ${refused}`);
    expect(refused).toBeTruthy();

    // 2 + 3. The mechanism D80 uses instead.
    await cancelImmediately(sub.id);
    const after = await stripe.subscriptions.retrieve(sub.id);
    console.log(`  after cancelImmediately: status=${after.status}`);
    expect(after.status).toBe("canceled");

    // The mirror agrees with Stripe.
    const { data: row } = await admin.from("subscriptions")
      .select("status, cancel_at_period_end").eq("stripe_subscription_id", sub.id).maybeSingle();
    console.log(`  mirror: ${JSON.stringify(row)}`);
    expect(row?.status).toBe("canceled");
    expect(row?.cancel_at_period_end).toBe(false);

    // 4. ⚠️ CANCELLING NEVER REVOKES WHAT WAS PAID FOR.
    const { data: ent } = await admin.from("entitlements")
      .select("active_until, is_active").eq("user_id", userId)
      .eq("product", "pro").eq("source", "stripe").maybeSingle();
    console.log(`  entitlement after: ${JSON.stringify(ent)}`);
    // ⚠️ COMPARED AS INSTANTS, NOT STRINGS. Postgres returns `+00:00` where JS
    // writes `.000Z`; the same moment serialised two ways. Asserting the string
    // fails for a reason that has nothing to do with the behaviour under test.
    expect(Date.parse(ent!.active_until as string)).toBe(Date.parse(entitledUntil));
    expect(ent?.is_active).toBe(true);
  }, 600_000);
});
