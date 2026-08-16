/**
 * THE `billing_reason` GUARD ON `markPastDue`, BOTH BRANCHES.
 *
 * Run:
 *   HARNESS_ALLOW_STRIPE=1 npx vitest run \
 *     --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/billingreason.scenario.ts
 *
 * A guard is only worth having if the branch it protects still works, so both are
 * driven:
 *
 *   A. FIRST-INVOICE failure on an `incomplete` subscription. The mirror must NOT
 *      be written to `past_due`, and nothing may be clawed back.
 *   B. RENEWAL failure on a paying customer. The clawback must STILL happen.
 *
 * The handler is invoked with the real Stripe invoice object, which is exactly
 * what `app/api/stripe/webhook/route.ts` passes it. That keeps the test on the
 * handler's own decision rather than on webhook delivery, which is not what
 * changed.
 *
 * This lives in the harness rather than as a `.mjs` script because it imports a
 * `server-only` TypeScript module; the harness config supplies the alias and the
 * stub.
 */

import { afterAll, describe, expect, it } from "vitest";

import { markPastDue } from "@/lib/billing/sync";

import { Ledger, admin, requireStripeBudget, stripe, stripeBudgetAvailable } from "./core";

const ledger = new Ledger();
afterAll(async () => { await ledger.teardown(); });

const MONTHLY = process.env.STRIPE_PRICE_MONTHLY!;

const mirrorOf = async (subId: string) =>
  (await admin.from("subscriptions").select("status")
    .eq("stripe_subscription_id", subId).maybeSingle()).data?.status as string | undefined;

const entOf = async (userId: string) =>
  (await admin.from("entitlements").select("active_until")
    .eq("user_id", userId).eq("product", "pro").eq("source", "stripe")
    .maybeSingle()).data?.active_until as string | undefined;

/** An account with a real Stripe customer mapped in `billing_customers`. */
async function account(tag: string, testClock?: string) {
  const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@trackd-qa.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: "Test-passw0rd!", email_confirm: true,
  });
  if (error) throw new Error(error.message);
  const userId = ledger.user(data.user.id);

  const customer = await stripe.customers.create({
    email, metadata: { user_id: userId },
    ...(testClock ? { test_clock: testClock } : {}),
    payment_method: "pm_card_visa",
    invoice_settings: { default_payment_method: "pm_card_visa" },
  });
  ledger.customer(customer.id);
  await admin.from("billing_customers").insert({ user_id: userId, stripe_customer_id: customer.id });
  return { userId, customerId: customer.id };
}

describe.skipIf(!stripeBudgetAvailable())("markPastDue's billing_reason guard", () => {
  it("A — a FIRST-invoice failure writes nothing", async () => {
    requireStripeBudget("driving the first-invoice branch");
    const a = await account("brA");

    const inc = await stripe.subscriptions.create({
      customer: a.customerId,
      items: [{ price: MONTHLY }],
      payment_behavior: "default_incomplete",
      expand: ["latest_invoice"],
    });
    await admin.from("subscriptions").insert({
      user_id: a.userId, stripe_subscription_id: inc.id, stripe_price_id: MONTHLY,
      status: "incomplete", cancel_at_period_end: false,
    });

    const invoice = inc.latest_invoice as import("stripe").Stripe.Invoice;
    console.log(`  invoice ${invoice.id} billing_reason=${invoice.billing_reason} status=${invoice.status}`);

    // The premise: if Stripe ever stopped calling this `subscription_create`,
    // the guard would silently stop guarding.
    expect(invoice.billing_reason).toBe("subscription_create");

    const outcome = await markPastDue(invoice);
    const mirror = await mirrorOf(inc.id);
    console.log(`  handler=${outcome}  mirror=${mirror}`);

    // ⚠️ The mirror keeps the status Stripe actually holds.
    expect(mirror).toBe("incomplete");
    // Handled, not ignored: the event is real and must not sit unprocessed.
    expect(outcome).toBe("handled");
    // Nothing to claw back, and nothing invented.
    expect(await entOf(a.userId)).toBeUndefined();
  }, 240_000);

  it("B — a RENEWAL failure still records past_due and still claws back", async () => {
    requireStripeBudget("driving the renewal branch");
    const clock = await stripe.testHelpers.testClocks.create({
      frozen_time: Math.floor(Date.now() / 1000),
    });
    ledger.clock(clock.id);
    const b = await account("brB", clock.id);

    const paid = await stripe.subscriptions.create({
      customer: b.customerId, items: [{ price: MONTHLY }],
    });
    const periodEnd = new Date(paid.items.data[0].current_period_end * 1000).toISOString();
    await admin.from("subscriptions").insert({
      user_id: b.userId, stripe_subscription_id: paid.id, stripe_price_id: MONTHLY,
      status: "active", cancel_at_period_end: false, current_period_end: periodEnd,
    });
    await admin.from("entitlements").insert({
      user_id: b.userId, product: "pro", source: "stripe",
      active_until: periodEnd, is_active: true,
    });
    console.log(`  entitled until ${periodEnd}`);

    // A card that declines on the renewal, then roll the clock past it.
    const declining = await stripe.paymentMethods.create({
      type: "card", card: { token: "tok_chargeCustomerFail" },
    });
    await stripe.paymentMethods.attach(declining.id, { customer: b.customerId });
    await stripe.customers.update(b.customerId, {
      invoice_settings: { default_payment_method: declining.id },
    });

    await stripe.testHelpers.testClocks.advance(clock.id, {
      frozen_time: Math.floor(Date.parse(periodEnd) / 1000) + 3600,
    });
    for (let i = 0; i < 90; i += 1) {
      const c = await stripe.testHelpers.testClocks.retrieve(clock.id);
      if (c.status === "ready") break;
      await new Promise((r) => setTimeout(r, 2000));
    }

    const invoices = await stripe.invoices.list({ subscription: paid.id, limit: 10 });
    const renewal = invoices.data.find((i) => i.billing_reason === "subscription_cycle");
    console.log(`  renewal ${renewal?.id} reason=${renewal?.billing_reason} status=${renewal?.status}`);
    expect(renewal).toBeDefined();
    expect(renewal!.status).not.toBe("paid");

    /**
     * ⚠️ STEP 1 OF THE DOCUMENTED SEQUENCE HAS TO BE REPRODUCED, or there is
     * nothing for the clawback to claw back.
     *
     * `markPastDue`'s header describes three events: the renewal rolls the period
     * forward and reports `active`, THEN the charge fails. Step 1 is
     * indistinguishable from a successful renewal, so `syncSubscription` has
     * already extended `active_until` into the new, unpaid period by the time
     * this handler runs. That optimistic extension is exactly what the clawback
     * exists to undo.
     *
     * The first version of this test seeded `active_until` at the OLD period end
     * and skipped step 1 — so `Math.min(current, graceEnds)` was already `current`
     * and the handler correctly returned early having done nothing. It read as a
     * broken clawback and was a broken test: the code was right and the scenario
     * had not put it in the state it guards.
     */
    const rolled = await stripe.subscriptions.retrieve(paid.id);
    const newPeriodEnd = new Date(rolled.items.data[0].current_period_end * 1000).toISOString();
    await admin.from("entitlements")
      .update({ active_until: newPeriodEnd })
      .eq("user_id", b.userId).eq("product", "pro").eq("source", "stripe");
    console.log(`  syncSubscription would have extended to ${newPeriodEnd} (the unpaid period)`);

    const before = await entOf(b.userId);
    const outcome = await markPastDue(renewal!);
    const mirror = await mirrorOf(paid.id);
    const after = await entOf(b.userId);
    console.log(`  handler=${outcome}  mirror=${mirror}`);
    console.log(`  entitlement ${before} -> ${after}`);

    // ⚠️ The branch the guard must NOT have broken.
    expect(mirror).toBe("past_due");
    expect(Date.parse(after!)).toBeLessThan(Date.parse(before!));
  }, 300_000);
});
