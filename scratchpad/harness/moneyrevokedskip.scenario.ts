/**
 * COLDCHAT-MONEY — DOES ANY REVOKED ROW SILENCE THE LOCKOUT RULE?
 *
 *   HARNESS_ALLOW_STRIPE=1 npx vitest run \
 *     --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/moneyrevokedskip.scenario.ts --reporter=verbose
 *
 * `rules.ts:559-562`:
 *
 *     const revoked = (ix.entitlementsByUser.get(user) ?? [])
 *       .filter((e) => e.isActive === false);
 *     if (revoked.length > 0) continue;
 *
 * The filter is over EVERY entitlement the user holds — any product, any source
 * — not over the one the live subscription should have written. §3.4's exemption
 * is about a DISPUTED STRIPE row; this implements "this user has ever had
 * anything revoked".
 *
 * So the question is whether an unrelated withdrawn `comp` — `001` calls
 * `is_active = false` the way a comp is withdrawn, and D81 is about exactly
 * those rows — makes a genuinely locked-out paying customer invisible to the one
 * rule written to find them.
 *
 *   SUBJECT  live paid subscription, NO stripe entitlement, plus a REVOKED COMP.
 *   CONTROL  the same, without the comp row. One row across.
 *
 * Safety: `@trackd-qa.invalid`, `qa-money-` prefixed, ledgered, Stripe first.
 */
import { afterAll, describe, expect, it } from "vitest";

import { reconcile } from "@/lib/billing/reconcile/run";

import { Ledger, admin, requireStripeBudget, stripe, stripeBudgetAvailable } from "./core";

const ledger = new Ledger();
const MONTHLY = process.env.STRIPE_PRICE_MONTHLY;
if (!MONTHLY) throw new Error("STRIPE_PRICE_MONTHLY is not set — absent is not a default");
const guarded = stripeBudgetAvailable() ? describe : describe.skip;

afterAll(async () => { await ledger.teardown(); }, 300_000);

async function lockedOutPayer(tag: string) {
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

  const pm = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } });
  await stripe.paymentMethods.attach(pm.id, { customer: customerId });
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm.id } });
  const sub = await stripe.subscriptions.create({
    customer: customerId, items: [{ price: MONTHLY }], metadata: { user_id: userId },
  });
  // Deliberately NOT synced: this is the lost-webhook shape the rule exists for.
  return { userId, customerId, subId: sub.id, email };
}

guarded("the lockout rule, and what silences it", () => {
  it("an unrelated WITHDRAWN COMP hides a paying customer who has no access", async () => {
    requireStripeBudget("two real paid subscriptions");

    const control = await lockedOutPayer("skip-control");
    const subject = await lockedOutPayer("skip-subject");

    /**
     * The only difference between the two accounts: a withdrawn comp.
     * `001_billing_tables.sql` documents `is_active = false` as how a comp is
     * withdrawn, and D81 is a whole decision about rows in exactly this state,
     * so this is a row the product really makes.
     */
    const { error } = await admin.from("entitlements").insert({
      user_id: subject.userId,
      product: "pro",
      source: "comp",
      active_until: new Date(Date.now() - 30 * 24 * 3600_000).toISOString(),
      is_active: false,
    });
    if (error) throw new Error(`comp seed: ${error.message}`);

    // ARRIVAL: both really are paying, and neither holds a live entitlement.
    for (const a of [control, subject]) {
      const fresh = await stripe.subscriptions.retrieve(a.subId);
      expect(fresh.status, `${a.userId} is not actually live at Stripe`).toBe("active");
      const { data: live } = await admin.from("entitlements")
        .select("id").eq("user_id", a.userId).eq("is_active", true);
      expect(live?.length ?? 0, `${a.userId} holds a LIVE entitlement, so it is not locked out`).toBe(0);
    }
    const { data: comp } = await admin.from("entitlements")
      .select("source, is_active").eq("user_id", subject.userId);
    console.log(`  SUBJECT rows: ${JSON.stringify(comp)}`);
    console.log(`  CONTROL rows: none`);

    const { report } = await reconcile();
    const named = (id: string, cus: string) =>
      report.findings.filter((f) => JSON.stringify(f).includes(id) || JSON.stringify(f).includes(cus));
    const c = named(control.userId, control.customerId);
    const s = named(subject.userId, subject.customerId);
    console.log(`  CONTROL findings: ${c.map((f) => f.rule).join(", ") || "NONE"}`);
    console.log(`  SUBJECT findings: ${s.map((f) => f.rule).join(", ") || "NONE"}`);

    // The control must fire, or the run saw nothing and this proves nothing.
    expect(
      c.some((f) => f.rule === "live-subscription-without-entitlement"),
      "the CONTROL was not reported — the reconcile never saw these accounts",
    ).toBe(true);

    // THE ASSERTION: the same lockout, with an unrelated comp beside it.
    expect(
      s.some((f) => f.rule === "live-subscription-without-entitlement"),
      "a withdrawn comp silenced the lockout rule for a paying customer with no access",
    ).toBe(true);
  }, 300_000);
});
