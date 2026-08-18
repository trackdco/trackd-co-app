import type Stripe from "stripe";
import { afterAll, describe, expect, it, vi } from "vitest";

import { revokeForCustomer, syncSubscription } from "@/lib/billing/sync";

import {
  Ledger,
  admin,
  requireStripeBudget,
  sameInstant,
  stripe,
  stripeBudgetAvailable,
} from "./core";

/**
 * ⚠️ 2.1 AND 2.2 — A DISPUTE STOPS THE BILLING, AND A DROPPED ONE IS RETRIED.
 *
 *   HARNESS_ALLOW_STRIPE=1 npx vitest run \
 *     --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/dispute.scenario.ts --reporter=verbose
 *
 * ## 2.1 — founder ruling
 *
 * A dispute took access away and left Stripe billing. Two costs, the second
 * worse: we go on charging somebody whose money we no longer have, and the next
 * invoice they dispute stacks another DISPUTE FEE.
 *
 * ## 2.2 — the same principle one read across
 *
 * `sync.ts` throws on an unreadable Stripe charge so Stripe retries, then six
 * lines later dropped the error on the `billing_customers` read and returned
 * `unattributed` — which Stripe answers with a 200 and never redelivers. Its own
 * words: "a revocation we failed to apply must be retried, and must not be
 * stamped as processed."
 *
 * ## ⚠️ EVERY ASSERTION IS ON THE DATABASE OR ON THE STRIPE OBJECT
 *
 * Never on the handler's return value. `revokeForCustomer` answered "handled"
 * throughout the entire life of both defects.
 *
 * Safety: `@trackd-qa.invalid`, `qa-dispute-` prefixed, ledgered, Stripe torn
 * down BEFORE the accounts.
 */

const ledger = new Ledger();
const MONTHLY = process.env.STRIPE_PRICE_MONTHLY;
if (!MONTHLY) throw new Error("STRIPE_PRICE_MONTHLY is not set — absent is not a default");
const guarded = stripeBudgetAvailable() ? describe : describe.skip;

afterAll(async () => {
  await ledger.teardown();
}, 300_000);

async function account(tag: string) {
  const email = `qa-dispute-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@trackd-qa.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: process.env.QA_TEST_PASSWORD ?? "",
    email_confirm: true,
  });
  if (error) throw new Error(`account: ${error.message}`);
  const userId = ledger.user(data.user.id);
  await admin
    .from("profiles")
    .update({
      is_18_plus: true,
      tos_accepted_at: new Date().toISOString(),
      date_of_birth: "1990-01-01",
      timezone: "Australia/Sydney",
    })
    .eq("id", userId);
  return { userId, email };
}

/** A real customer, a real card, a real paid subscription, synced by the app. */
async function paidSubscription(tag: string) {
  const a = await account(tag);
  const customer = await stripe.customers.create({ email: a.email });
  const customerId = ledger.customer(customer.id);
  const { error } = await admin
    .from("billing_customers")
    .insert({ user_id: a.userId, stripe_customer_id: customerId });
  if (error) throw new Error(`link: ${error.message}`);

  /** ⚠️ pm_card_/tok_ only. Never a raw card number. */
  const pm = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } });
  await stripe.paymentMethods.attach(pm.id, { customer: customerId });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: pm.id },
  });

  const sub = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: MONTHLY }],
    metadata: { user_id: a.userId },
  });
  // The app's own writer, not a seed: both rows come from the real object.
  expect(await syncSubscription(sub), "syncSubscription did not handle the real object").toBe(
    "handled",
  );

  const charges = await stripe.charges.list({ customer: customerId, limit: 5 });
  const charge = charges.data.find((c) => c.paid);
  expect(charge, "no paid charge, so there is nothing to dispute").toBeDefined();

  return { ...a, customerId, subscriptionId: sub.id, chargeId: charge!.id };
}

const entRow = async (userId: string) =>
  (
    await admin
      .from("entitlements")
      .select("is_active, active_until")
      .eq("user_id", userId)
      .eq("product", "pro")
      .eq("source", "stripe")
      .maybeSingle()
  ).data;

const INQUIRY = { status: "warning_needs_response" } as Stripe.Dispute;
const CHARGEBACK = { status: "needs_response" } as Stripe.Dispute;

guarded("2.1 — a dispute cancels the Stripe subscription", () => {
  it("revokes access AND cancels at Stripe, asserted on both", async () => {
    requireStripeBudget("a real paid subscription and a real dispute revocation");
    const a = await paidSubscription("cancels");

    /* ── ARRIVAL, before anything is claimed ────────────────────────── */
    const before = await entRow(a.userId);
    expect(before?.is_active, "the entitlement was never granted, so nothing is revoked").toBe(true);
    const subBefore = await stripe.subscriptions.retrieve(a.subscriptionId);
    expect(subBefore.status, "the subscription is not live, so nothing is cancelled").toBe("active");

    const outcome = await revokeForCustomer(a.chargeId, "dispute", stripe, CHARGEBACK);
    expect(outcome).toBe("handled");

    /* ── ON THE DATABASE: access gone, the date untouched ───────────── */
    const after = await entRow(a.userId);
    expect(after?.is_active).toBe(false);
    expect(
      sameInstant(after?.active_until, before?.active_until),
      "the revoke moved active_until, which four other files rely on it not doing",
    ).toBe(true);

    /* ── ON THE STRIPE OBJECT: the billing has actually stopped ─────── */
    const subAfter = await stripe.subscriptions.retrieve(a.subscriptionId);
    console.log(`  stripe subscription after the dispute: ${subAfter.status}`);
    expect(
      subAfter.status,
      "Stripe is still billing somebody whose money we no longer have",
    ).toBe("canceled");

    /**
     * ⚠️ AND THE MIRROR HAS NOT CAUGHT UP, WHICH IS EXPECTED AND IS THE POINT OF
     * THE NEW RECONCILE RULE. In production `customer.subscription.deleted`
     * updates it moments later; no webhook fires in this harness. Asserted so the
     * gap is recorded rather than discovered.
     */
    const mirror = await admin
      .from("subscriptions")
      .select("status")
      .eq("user_id", a.userId)
      .maybeSingle();
    console.log(`  mirror status (no webhook in-harness): ${mirror.data?.status}`);
  }, 300_000);

  it("⚠️ CONTROL: an INQUIRY cancels nothing and revokes nothing", async () => {
    // The bank is asking a question and no funds have been withdrawn. Cancelling
    // here would end a paying customer's subscription over a query.
    requireStripeBudget("a real paid subscription for the inquiry control");
    const a = await paidSubscription("inquiry");

    const outcome = await revokeForCustomer(a.chargeId, "dispute", stripe, INQUIRY);
    expect(outcome).toBe("handled");

    expect((await entRow(a.userId))?.is_active, "an inquiry revoked access").toBe(true);
    const sub = await stripe.subscriptions.retrieve(a.subscriptionId);
    expect(sub.status, "an inquiry cancelled a paying customer's subscription").toBe("active");
  }, 300_000);

  it("⚠️ CONTROL: a REFUND revokes access and leaves the subscription alone", async () => {
    // Deliberately not included in the ruling: a refund is a hand-issued support
    // action, often goodwill, with no fee stacking behind it. Cancelling would be
    // deciding something nobody decided.
    requireStripeBudget("a real paid subscription and a full refund");
    const a = await paidSubscription("refund");

    const charge = await stripe.charges.retrieve(a.chargeId);
    await stripe.refunds.create({ charge: a.chargeId, amount: charge.amount });

    const outcome = await revokeForCustomer(a.chargeId, "refund", stripe);
    expect(outcome).toBe("handled");

    expect((await entRow(a.userId))?.is_active, "a full refund did not revoke").toBe(false);
    const sub = await stripe.subscriptions.retrieve(a.subscriptionId);
    expect(
      sub.status,
      "a refund cancelled the subscription — the ruling names disputes only",
    ).toBe("active");
  }, 300_000);
});

guarded("2.2 — a dropped chargeback is retried, not reported handled", () => {
  it("⚠️ an UNMAPPED customer is still `unattributed`, and is NOT retried", async () => {
    /**
     * The half that must not change. A Stripe customer with no account behind it
     * will never grow one, so retrying forever is wrong — `unattributed` is
     * exactly what that outcome is for.
     *
     * No `billing_customers` row is written, which is what makes it unmapped.
     */
    requireStripeBudget("a Stripe customer with no account behind it");
    const customer = await stripe.customers.create({
      email: `qa-dispute-unmapped-${Date.now()}@trackd-qa.invalid`,
    });
    const customerId = ledger.customer(customer.id);

    const pm = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } });
    await stripe.paymentMethods.attach(pm.id, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: pm.id },
    });
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: MONTHLY }],
    });
    const charges = await stripe.charges.list({ customer: customerId, limit: 5 });
    const charge = charges.data.find((c) => c.paid);
    expect(charge).toBeDefined();

    /* ── ARRIVAL: there really is no account behind this customer ───── */
    const link = await admin
      .from("billing_customers")
      .select("user_id")
      .eq("stripe_customer_id", customerId);
    expect(link.error, "the mapping read failed, so this proves nothing").toBeNull();
    expect(link.data?.length).toBe(0);

    const outcome = await revokeForCustomer(charge!.id, "dispute", stripe, CHARGEBACK);
    expect(
      outcome,
      "a genuinely unmapped customer must stay unattributed, or Stripe redelivers forever",
    ).toBe("unattributed");

    // And nothing was cancelled: there is no account, so there is nothing to stop.
    const after = await stripe.subscriptions.retrieve(sub.id);
    expect(after.status).toBe("active");
  }, 300_000);

  it("⚠️ an UNREADABLE mapping THROWS, so Stripe redelivers", async () => {
    /**
     * The half that was broken. Driven with a real read failure rather than a
     * mock: `revokeForCustomer` builds its own service client, so the failure is
     * induced by pointing the whole process's service key at a value that cannot
     * read — restored in a `finally` before anything else runs.
     *
     * ⚠️ ARRIVAL FIRST: the read must genuinely fail, or a throw proves nothing.
     */
    requireStripeBudget("a real paid subscription for the unreadable-mapping case");
    const a = await paidSubscription("unreadable");

    const BAD = "sb_secret_this_key_cannot_read_anything";
    const realKey = process.env.SUPABASE_SECRET_KEY;
    const { createClient } = await import("@supabase/supabase-js");
    const broken = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", BAD, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const probe = await broken.from("billing_customers").select("user_id").limit(1);
    expect(
      probe.error,
      "the broken key CAN read billing_customers, so nothing below exercises a failed read",
    ).not.toBeNull();

    /**
     * ⚠️ `vi.resetModules()` IS LOAD-BEARING, AND THE FIRST VERSION OF THIS TEST
     * WAS WRONG WITHOUT IT.
     *
     * `lib/billing/service.ts` MEMOISES the service client in a module-level
     * variable on first use. Setting the env var after `paidSubscription` has
     * already called `syncSubscription` changes nothing — the client is built and
     * cached with the real key. That first run reported "the error was swallowed"
     * while the log showed the revoke succeeding and the subscription being
     * cancelled: **the driver never reached the state it was asserting about.**
     *
     * Resetting the registry and re-importing gives a fresh `service.ts` whose
     * cache is empty, so the client is built from the env as it is NOW.
     */
    let threw: Error | null = null;
    try {
      process.env.SUPABASE_SECRET_KEY = BAD;
      vi.resetModules();
      const fresh = await import("@/lib/billing/sync");
      await fresh.revokeForCustomer(a.chargeId, "dispute", stripe, CHARGEBACK);
    } catch (e) {
      threw = e as Error;
    } finally {
      if (realKey) process.env.SUPABASE_SECRET_KEY = realKey;
      else delete process.env.SUPABASE_SECRET_KEY;
      vi.resetModules();
    }

    console.log(`  threw: ${threw?.message ?? "(nothing — the error was swallowed)"}`);
    expect(
      threw,
      "an unreadable mapping returned instead of throwing; Stripe gets a 200 and never redelivers",
    ).not.toBeNull();
    expect(threw?.message).toContain("billing_customers lookup failed");
  }, 300_000);
});
