import { afterAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";

import { endSubscription, revokeForCustomer, syncSubscription } from "@/lib/billing/sync";

import { Ledger, admin, requireStripeBudget, stripe, stripeBudgetAvailable } from "./core";

/**
 * SPEC 05 Step 8 — THE ENTITLEMENT WRITERS, on real Stripe objects.
 *
 *   HARNESS_ALLOW_STRIPE=1 npx vitest run \
 *     --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/writers.scenario.ts --reporter=verbose
 *
 * ⚠️ Measured against THE DATES STRIPE HOLDS, not against what the code intends.
 *
 * ## What is here, and what is deliberately NOT
 *
 * Step 8's first case — **a failed payment that shortens rather than extends** —
 * is already driven on a real test clock by `billingreason.scenario.ts` case B,
 * including the step-1 optimistic extension without which the clawback has nothing
 * to claw back. It is not duplicated here; it is RE-RUN as part of this step
 * rather than cited from memory.
 *
 * ⚠️ **That path is `04`'s too.** It is the same handler `04` Step 4b was written
 * for, and Step 4b was verified by READING the ordering rather than by driving it,
 * with `04` Steps 9 to 11 still unrun. So anything this turns up on the past-due
 * path bears on **D70** as much as on `05`: same handler, two doorways.
 *
 * Safety: `@trackd-qa.invalid` accounts, ledgered, Stripe torn down BEFORE the
 * accounts. No route that writes billing tables is called.
 */

const ledger = new Ledger();
const MONTHLY = process.env.STRIPE_PRICE_MONTHLY ?? "";
const guarded = stripeBudgetAvailable() ? describe : describe.skip;

interface Seeded {
  userId: string;
  customerId: string;
}

async function account(tag: string): Promise<Seeded> {
  const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@trackd-qa.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: process.env.QA_TEST_PASSWORD ?? "",
    email_confirm: true,
  });
  if (error) throw new Error(`account: ${error.message}`);
  const userId = ledger.user(data.user.id);
  const customer = await stripe.customers.create({ email });
  const customerId = ledger.customer(customer.id);
  const { error: linkErr } = await admin
    .from("billing_customers")
    .insert({ user_id: userId, stripe_customer_id: customerId });
  if (linkErr) throw new Error(`link: ${linkErr.message}`);
  return { userId, customerId };
}

async function entitlement(userId: string) {
  const { data } = await admin
    .from("entitlements")
    .select("active_until, is_active")
    .eq("user_id", userId)
    .eq("product", "pro")
    .eq("source", "stripe")
    .maybeSingle();
  return data ?? null;
}

/** A card that pays, so a subscription reaches a state worth attacking. */
async function payingCard(customerId: string): Promise<void> {
  const pm = await stripe.paymentMethods.create({
    type: "card",
    card: { token: "tok_visa" },
  });
  await stripe.paymentMethods.attach(pm.id, { customer: customerId });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: pm.id },
  });
}

afterAll(async () => {
  await ledger.teardown();
}, 300_000);

guarded("Step 8 — the entitlement writers", () => {
  it("2. a CANCELLATION shortens, and never restores what the failure handler removed", async () => {
    requireStripeBudget("the cancellation writer");
    const a = await account("w8-cancel");
    await payingCard(a.customerId);

    const sub = await stripe.subscriptions.create({
      customer: a.customerId,
      items: [{ price: MONTHLY }],
      metadata: { user_id: a.userId },
    });
    const stripePeriodEnd = new Date(
      sub.items.data[0].current_period_end * 1000,
    ).toISOString();

    /**
     * ⚠️ ARRIVAL: the state the clawback LEAVES BEHIND.
     *
     * The defect this guards is exact: "An earlier version wrote the computed end
     * unconditionally after a cancellation and handed back the exact free month
     * the past-due handler had just removed." So the entitlement is put where a
     * clawback would have put it — WELL SHORT of the period Stripe still holds —
     * and the cancellation is then asked to honour that.
     */
    const clawedBackTo = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();
    const { error } = await admin.from("entitlements").insert({
      user_id: a.userId,
      product: "pro",
      source: "stripe",
      active_until: clawedBackTo,
      is_active: true,
    });
    if (error) throw new Error(`seed: ${error.message}`);

    expect(
      Date.parse(stripePeriodEnd),
      "the seed is wrong: Stripe's period must be LATER than the clawback, or there is nothing to restore",
    ).toBeGreaterThan(Date.parse(clawedBackTo));

    const cancelled = await stripe.subscriptions.cancel(sub.id);
    const outcome = await endSubscription(cancelled);
    const after = await entitlement(a.userId);

    console.log(`  stripe period end ${stripePeriodEnd}`);
    console.log(`  clawed back to    ${clawedBackTo}`);
    console.log(`  after cancel      ${after?.active_until}  (handler=${outcome})`);

    expect(after).not.toBeNull();
    // ⚠️ THE ASSERTION. Never later than where the clawback left it.
    expect(Date.parse(after!.active_until!)).toBeLessThanOrEqual(
      Date.parse(clawedBackTo),
    );
    expect(
      Date.parse(after!.active_until!),
      "the cancellation restored time the failure handler had removed",
    ).toBeLessThan(Date.parse(stripePeriodEnd));
  }, 240_000);

  it("3. a DISPUTE deactivates immediately, and leaves the date alone", async () => {
    requireStripeBudget("the revocation writer");
    const a = await account("w8-dispute");

    // A card that pays and then disputes, so the charge is real and so is the
    // dispute. `tok_createDispute` charges successfully first.
    const pm = await stripe.paymentMethods.create({
      type: "card",
      card: { token: "tok_createDispute" },
    });
    await stripe.paymentMethods.attach(pm.id, { customer: a.customerId });
    await stripe.customers.update(a.customerId, {
      invoice_settings: { default_payment_method: pm.id },
    });

    const sub = await stripe.subscriptions.create({
      customer: a.customerId,
      items: [{ price: MONTHLY }],
      metadata: { user_id: a.userId },
    });
    const boughtUntil = new Date(
      sub.items.data[0].current_period_end * 1000,
    ).toISOString();
    const { error } = await admin.from("entitlements").insert({
      user_id: a.userId,
      product: "pro",
      source: "stripe",
      active_until: boughtUntil,
      is_active: true,
    });
    if (error) throw new Error(`seed: ${error.message}`);

    // Find the charge the subscription actually made.
    const charges = await stripe.charges.list({ customer: a.customerId, limit: 5 });
    const charge = charges.data.find((c) => c.paid);
    expect(charge, "no paid charge, so there is no dispute to raise").toBeDefined();
    console.log(`  charge ${charge!.id} disputed=${charge!.disputed}`);

    const outcome = await revokeForCustomer(charge!.id, "dispute", stripe, {
      // A real chargeback, not an inquiry — inquiries are deliberately ignored.
      status: "needs_response",
    } as Stripe.Dispute);
    const after = await entitlement(a.userId);
    console.log(`  handler=${outcome}  is_active=${after?.is_active}  until=${after?.active_until}`);

    expect(after).not.toBeNull();
    // ⚠️ THE KILL SWITCH FLIPS, IMMEDIATELY.
    expect(after!.is_active).toBe(false);
    /**
     * ⚠️ AND THE DATE IS UNTOUCHED. `is_active` is the switch, `active_until` is
     * the record of what was bought, and keeping the second readable is the whole
     * reason they are separate columns. It is also what standing rule 0 rests on
     * in `05` and `08`: a revoked row is a DECISION, not a gap.
     */
    // ⚠️ COMPARED AS INSTANTS. Postgres returns `+00:00` where JS writes `.000Z`,
    // so two identical moments are unequal as strings. The harness README lists
    // this as a trap that has already cost a run, and it has now cost this
    // session two — here and in `reconcile.scenario.ts`.
    expect(Date.parse(after!.active_until!)).toBe(Date.parse(boughtUntil));
  }, 240_000);

  it("4. a TRIALING subscription with no validated card entitles NOTHING", async () => {
    requireStripeBudget("the trial-without-a-card case");
    const a = await account("w8-notrial");

    /**
     * No payment method at all, `default_incomplete`, and a trial — which is
     * exactly what `01`'s checkout creates before the card is confirmed. Stripe
     * reports it `trialing`, and the invariant is that a trial entitles only once
     * a card has VALIDATED. Otherwise a trial is seven free days for anybody who
     * can type sixteen digits.
     */
    const sub = await stripe.subscriptions.create({
      customer: a.customerId,
      items: [{ price: MONTHLY }],
      trial_period_days: 7,
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      metadata: { user_id: a.userId },
    });
    console.log(`  stripe says: ${sub.status}, default_pm=${sub.default_payment_method ?? "none"}`);
    // ⚠️ ARRIVAL: it really is in the state the invariant is about.
    expect(sub.status).toBe("trialing");
    expect(sub.default_payment_method).toBeFalsy();

    // ⚠️ THE OBJECT, not the id — `syncSubscription(sub, { paymentConfirmed })`.
    // And `paymentConfirmed` is deliberately NOT set: it is set only by
    // `invoice.paid`, and a trial with no card has had no payment.
    const outcome = await syncSubscription(sub);
    const after = await entitlement(a.userId);
    console.log(`  handler=${outcome}  entitlement=${JSON.stringify(after)}`);

    expect(
      after,
      "a trial with no validated card was granted an entitlement",
    ).toBeNull();
  }, 240_000);

  it("5. a DELETION with no period end is refused rather than granting forever", async () => {
    requireStripeBudget("the null-period-end refusal");
    const a = await account("w8-nullend");
    await payingCard(a.customerId);

    const sub = await stripe.subscriptions.create({
      customer: a.customerId,
      items: [{ price: MONTHLY }],
      metadata: { user_id: a.userId },
    });
    const boughtUntil = new Date(
      sub.items.data[0].current_period_end * 1000,
    ).toISOString();
    const { error } = await admin.from("entitlements").insert({
      user_id: a.userId,
      product: "pro",
      source: "stripe",
      active_until: boughtUntil,
      is_active: true,
    });
    if (error) throw new Error(`seed: ${error.message}`);

    /**
     * ⚠️ A REAL OBJECT WITH THE PERIOD STRIPPED, not a hand-built fake. The
     * failure this guards is `isEntitlementActive` reading a null `active_until`
     * as NEVER EXPIRES — so a subscription arriving with no period end would turn
     * a cancellation into a grant of permanent access.
     */
    const cancelled = await stripe.subscriptions.cancel(sub.id);
    const withoutPeriod = JSON.parse(JSON.stringify(cancelled)) as Stripe.Subscription;
    for (const item of withoutPeriod.items?.data ?? []) {
      (item as { current_period_end?: number }).current_period_end = undefined;
    }
    (withoutPeriod as { current_period_end?: number }).current_period_end = undefined;
    (withoutPeriod as { ended_at?: number | null }).ended_at = null;
    (withoutPeriod as { canceled_at?: number | null }).canceled_at = null;

    const outcome = await endSubscription(withoutPeriod);
    const after = await entitlement(a.userId);
    console.log(`  handler=${outcome}  until=${after?.active_until}  is_active=${after?.is_active}`);

    expect(after).not.toBeNull();
    // Never null, and never later than what was actually bought.
    expect(after!.active_until).not.toBeNull();
    expect(Date.parse(after!.active_until!)).toBeLessThanOrEqual(
      Date.parse(boughtUntil),
    );
  }, 240_000);
});
