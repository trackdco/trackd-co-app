/**
 * COLDCHAT-MONEY — DOES SPEC 11 SEE THE CUSTOMER IT WAS HANDED?
 *
 *   HARNESS_ALLOW_STRIPE=1 npx vitest run \
 *     --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/moneyreconcile.scenario.ts --reporter=verbose
 *
 * `08` §9 raised, unnumbered: a dispute revokes the entitlement and leaves the
 * Stripe subscription billing — a real customer with no access, being charged.
 * It was not built, and what shipped instead was (a) a sentence describing the
 * state and (b) "the cancel control remains available so they have an exit".
 *
 * `11` is the net everything unbuilt was routed into. This asks whether the net
 * has a hole exactly where that customer sits.
 *
 * `rules.ts:562` — `if (revoked.length > 0) continue;` — skips them, correctly
 * for THAT rule (a revocation is a decision, not an absence). The question is
 * whether ANY of the fourteen picks them up afterwards.
 *
 *   SUBJECT  a real paid subscription + a REVOKED entitlement.
 *   CONTROL  the same real shape with NO entitlement row at all, which the same
 *            rule reports. One branch across. If the control is silent too, this
 *            file is measuring a reconcile that never saw my accounts.
 *
 * Safety: `@trackd-qa.invalid`, `qa-money-` prefixed, ledgered, Stripe first.
 */
import { afterAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";

import { reconcile } from "@/lib/billing/reconcile/run";
import { revokeForCustomer, syncSubscription } from "@/lib/billing/sync";

import { Ledger, admin, requireStripeBudget, stripe, stripeBudgetAvailable } from "./core";

const ledger = new Ledger();
const MONTHLY = process.env.STRIPE_PRICE_MONTHLY;
if (!MONTHLY) throw new Error("STRIPE_PRICE_MONTHLY is not set — absent is not a default");
const guarded = stripeBudgetAvailable() ? describe : describe.skip;

afterAll(async () => { await ledger.teardown(); }, 300_000);

async function account(tag: string) {
  const email = `qa-money-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@trackd-qa.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: process.env.QA_TEST_PASSWORD ?? "", email_confirm: true,
  });
  if (error) throw new Error(`account: ${error.message}`);
  const userId = ledger.user(data.user.id);
  const customer = await stripe.customers.create({ email });
  const customerId = ledger.customer(customer.id);
  const { error: linkErr } = await admin
    .from("billing_customers").insert({ user_id: userId, stripe_customer_id: customerId });
  if (linkErr) throw new Error(`link: ${linkErr.message}`);
  return { userId, customerId, email };
}

async function paidSubscription(customerId: string, userId: string) {
  const pm = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } });
  await stripe.paymentMethods.attach(pm.id, { customer: customerId });
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm.id } });
  return stripe.subscriptions.create({
    customer: customerId, items: [{ price: MONTHLY }], metadata: { user_id: userId },
  });
}

guarded("11's net, over the customer 08 §9 handed it", () => {
  it("a REVOKED entitlement beside a live billing subscription is reported by nothing", async () => {
    requireStripeBudget("two real paid subscriptions");

    /* ── SUBJECT: revoked, still billing ── */
    const subj = await account("recon-revoked");
    const sub = await paidSubscription(subj.customerId, subj.userId);
    expect(await syncSubscription(sub)).toBe("handled");

    const charges = await stripe.charges.list({ customer: subj.customerId, limit: 5 });
    const charge = charges.data.find((c) => c.paid);
    expect(charge, "no paid charge to revoke against").toBeDefined();
    expect(
      await revokeForCustomer(charge!.id, "dispute", stripe, { status: "needs_response" } as Stripe.Dispute),
    ).toBe("handled");

    const { data: sEnt } = await admin.from("entitlements")
      .select("is_active, active_until").eq("user_id", subj.userId).maybeSingle();
    const fresh = await stripe.subscriptions.retrieve(sub.id);
    // ARRIVAL: the state really is "no access, still billing".
    expect(sEnt?.is_active, "the subject is not actually revoked").toBe(false);
    expect(fresh.status, "the subject's subscription is not still live").toBe("active");
    console.log(`  SUBJECT ${subj.userId}: entitlement is_active=${sEnt?.is_active}, stripe status=${fresh.status}`);

    /* ── CONTROL: the same shape, one branch across — no entitlement row ── */
    const ctrl = await account("recon-noent");
    const csub = await paidSubscription(ctrl.customerId, ctrl.userId);
    // Deliberately NOT synced: the control is a live subscription with no row.
    const cfresh = await stripe.subscriptions.retrieve(csub.id);
    const { data: cEnt } = await admin.from("entitlements")
      .select("is_active").eq("user_id", ctrl.userId).maybeSingle();
    expect(cEnt, "the control accidentally has an entitlement row").toBeNull();
    expect(cfresh.status).toBe("active");
    console.log(`  CONTROL ${ctrl.userId}: no entitlement row, stripe status=${cfresh.status}`);

    /* ── the real script, over the real state ── */
    const { report, text } = await reconcile();
    const mine = report.findings.filter(
      (f) =>
        f.account?.userId === subj.userId ||
        f.account?.stripeCustomerId === subj.customerId ||
        JSON.stringify(f).includes(subj.userId) ||
        JSON.stringify(f).includes(subj.customerId),
    );
    const control = report.findings.filter(
      (f) =>
        f.account?.userId === ctrl.userId ||
        f.account?.stripeCustomerId === ctrl.customerId ||
        JSON.stringify(f).includes(ctrl.userId) ||
        JSON.stringify(f).includes(ctrl.customerId),
    );
    console.log(`\n  total findings in the run: ${report.findings.length}`);
    console.log(`  naming the SUBJECT (revoked, still billing): ${mine.length}`);
    for (const f of mine) console.log(`    - ${f.rule}: ${f.evidence?.join(" | ")}`);
    console.log(`  naming the CONTROL (no entitlement at all):  ${control.length}`);
    for (const f of control) console.log(`    - ${f.rule}: ${f.evidence?.join(" | ")}`);
    console.log(`\n--- report head ---\n${text.slice(0, 1200)}\n---`);

    /**
     * ⚠️ THE CONTROL FIRST. If the reconcile cannot see my accounts at all, the
     * subject's silence means nothing and this file must fail loudly rather than
     * report a hole it did not measure.
     */
    expect(
      control.some((f) => f.rule === "live-subscription-without-entitlement"),
      "the CONTROL was not reported — the reconcile never saw these accounts, so the subject's silence is meaningless",
    ).toBe(true);

    // THE ASSERTION. If this fails, something does catch them and I am wrong.
    expect(
      mine.length,
      `the subject WAS reported by ${mine.map((f) => f.rule).join(", ")} — the net has no hole here`,
    ).toBeGreaterThan(0);
  }, 300_000);
});
