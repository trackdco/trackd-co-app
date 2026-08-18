/**
 * COLDCHAT-MONEY — THE SAME REVOKED CUSTOMER, WITH THE GATE ON (go-live).
 *
 *   # server started with the flag ON THE COMMAND LINE ONLY:
 *   #   BILLING_GATE_ENABLED=true npx next dev -p 3100 -H 127.0.0.1
 *   HARNESS_ALLOW_STRIPE=1 npx vitest run \
 *     --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/moneygateon.scenario.ts --reporter=verbose
 *
 * `manageSummary.ts:241` — `return f.gateEnabled ? "lapsed" : "paying";` — is the
 * only line separating the two worlds for an account with no LIVE entitlement.
 * With the gate off the real revoked customer reads a renewal claim (driven in
 * `moneysuspended.scenario.ts`). This drives the world that actually ships.
 *
 *   SUBJECT  real paid subscription + real `revokeForCustomer`.
 *   CONTROL  the identical real shape, NOT revoked. One branch across. It must
 *            read the paying sentence, or this file is measuring a broken page.
 *
 * Safety: `@trackd-qa.invalid`, `qa-money-` prefixed, ledgered, Stripe first.
 */
import { chromium, type Browser } from "playwright";
import { afterAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";

import { revokeForCustomer, syncSubscription } from "@/lib/billing/sync";

import { Ledger, admin, requireStripeBudget, sameInstant, stripe, stripeBudgetAvailable } from "./core";

const ledger = new Ledger();
const MONTHLY = process.env.STRIPE_PRICE_MONTHLY;
if (!MONTHLY) throw new Error("STRIPE_PRICE_MONTHLY is not set — absent is not a default");
const guarded = stripeBudgetAvailable() ? describe : describe.skip;

const SIGNED_SUSPENDED_HEAD = "Your access has been suspended while we look into a payment dispute";
const PAYING_HEAD = "You're on your Pro plan at";
const LAPSED = "You're not on a plan at the moment, so Trackd Co is read only.";

let browser: Browser | null = null;
afterAll(async () => {
  if (browser) await browser.close();
  await ledger.teardown();
}, 300_000);

async function account(tag: string) {
  const email = `qa-money-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@trackd-qa.invalid`;
  const password = process.env.QA_TEST_PASSWORD ?? "";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`account: ${error.message}`);
  const userId = ledger.user(data.user.id);
  await admin.from("profiles").update({
    is_18_plus: true, tos_accepted_at: new Date().toISOString(),
    date_of_birth: "1990-01-01", timezone: "Australia/Sydney",
  }).eq("id", userId);
  const customer = await stripe.customers.create({ email });
  const customerId = ledger.customer(customer.id);
  const { error: linkErr } = await admin
    .from("billing_customers").insert({ user_id: userId, stripe_customer_id: customerId });
  if (linkErr) throw new Error(`link: ${linkErr.message}`);
  return { userId, customerId, email, password };
}

async function paidSubscription(customerId: string, userId: string) {
  const pm = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } });
  await stripe.paymentMethods.attach(pm.id, { customer: customerId });
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm.id } });
  return stripe.subscriptions.create({
    customer: customerId, items: [{ price: MONTHLY }], metadata: { user_id: userId },
  });
}

async function manageScreen(email: string, password: string) {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(session));
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  const payload = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
  const CHUNK = 3180;
  const jar = new Map<string, string>();
  if (payload.length <= CHUNK) jar.set(`sb-${ref}-auth-token`, payload);
  else for (let i = 0, n = 0; i < payload.length; i += CHUNK, n += 1) jar.set(`sb-${ref}-auth-token.${n}`, payload.slice(i, i + CHUNK));
  browser ??= await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([...jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })));
  const page = await ctx.newPage();
  await page.goto("http://localhost:3100/billing", { waitUntil: "networkidle" });
  const billing = await page.locator("body").innerText();
  await page.goto("http://localhost:3100/billing/manage", { waitUntil: "networkidle" });
  const manage = await page.locator("body").innerText();
  await ctx.close();
  return { billing, manage };
}

guarded("the revoked customer at go-live", () => {
  it("CONTROL: an identical, UNREVOKED paid account reads the paying sentence", async () => {
    requireStripeBudget("the control's real paid subscription");
    const a = await account("gateon-healthy");
    const sub = await paidSubscription(a.customerId, a.userId);
    expect(await syncSubscription(sub)).toBe("handled");
    const s = await manageScreen(a.email, a.password);
    console.log(`\n--- GATE ON, healthy paying ---\n${s.manage}\n---`);
    expect(
      s.manage.includes(PAYING_HEAD),
      "the control did not read the paying sentence — the page or the gate is not in the state this file assumes",
    ).toBe(true);
    // And the gate really is ON: a healthy account is the wrong place to prove
    // that, so it is proven on the subject below by the label it produces.
  }, 300_000);

  it("SUBJECT: the revoked, still-billing customer is told they are not on a plan", async () => {
    requireStripeBudget("the subject's real paid subscription");
    const a = await account("gateon-revoked");
    const sub = await paidSubscription(a.customerId, a.userId);
    expect(await syncSubscription(sub)).toBe("handled");

    const { data: before } = await admin.from("entitlements")
      .select("active_until, is_active").eq("user_id", a.userId).maybeSingle();
    const { data: mirror } = await admin.from("subscriptions")
      .select("status, current_period_end").eq("user_id", a.userId).maybeSingle();
    expect(
      sameInstant(before?.active_until, mirror?.current_period_end),
      "the two dates diverge, which is not the state revokeForCustomer produces",
    ).toBe(true);

    const charges = await stripe.charges.list({ customer: a.customerId, limit: 5 });
    const charge = charges.data.find((c) => c.paid);
    expect(charge).toBeDefined();
    expect(
      await revokeForCustomer(charge!.id, "dispute", stripe, { status: "needs_response" } as Stripe.Dispute),
    ).toBe("handled");

    const { data: after } = await admin.from("entitlements")
      .select("is_active").eq("user_id", a.userId).maybeSingle();
    const fresh = await stripe.subscriptions.retrieve(sub.id);
    // ARRIVAL: no access, still billing.
    expect(after?.is_active).toBe(false);
    expect(fresh.status).toBe("active");

    const s = await manageScreen(a.email, a.password);
    console.log(`\n--- GATE ON, REVOKED and still billing ---\n/billing:\n${s.billing}\n\n/billing/manage:\n${s.manage}\n---`);
    console.log(`  signed=${s.manage.includes(SIGNED_SUSPENDED_HEAD)} paying=${s.manage.includes(PAYING_HEAD)} lapsed=${s.manage.includes(LAPSED)}`);
    console.log(`  /billing Access row: ${/Read only/.test(s.billing) ? "Read only" : /\bPro\b/.test(s.billing) ? "Pro" : "neither"}`);

    // The gate really is ON — a named artefact only the gate-on branch emits.
    expect(
      /Read only/.test(s.billing),
      "the /billing Access row does not read 'Read only' — THE GATE IS OFF and this file proves nothing",
    ).toBe(true);

    // THE ASSERTION: the signed sentence is what should be here.
    expect(
      s.manage.includes(SIGNED_SUSPENDED_HEAD),
      `instead the screen said: ${s.manage.includes(LAPSED) ? "'not on a plan ... read only'" : s.manage.includes(PAYING_HEAD) ? "the paying renewal claim" : "neither"}`,
    ).toBe(true);
  }, 300_000);
});
