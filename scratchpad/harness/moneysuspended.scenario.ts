/**
 * COLDCHAT-MONEY — IS THE SIGNED "suspended" SENTENCE REACHABLE AT ALL?
 *
 *   HARNESS_ALLOW_STRIPE=1 npx vitest run \
 *     --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/moneysuspended.scenario.ts --reporter=verbose
 *
 * ## The claim under test
 *
 * `08` §8 signed a sentence for "access revoked while the subscription is still
 * billing". `manageSummary.ts:238` reaches it only through `f.accessEndsEarly`,
 * which for an `active` subscription is TRUE ONLY IF the entitlement's date and
 * the mirror's date DISAGREE (`manage.ts:520`).
 *
 * But `syncSubscription` writes BOTH from the same `entitledUntil(sub)`
 * (`sync.ts:339` and `sync.ts:89`), and `revokeForCustomer` deliberately does not
 * touch `active_until` (`sync.ts:1114`). So in the state the sentence was signed
 * for, the two dates are THE SAME INSTANT and the branch cannot be reached.
 *
 * The build's own driver seeded `active_until = now+30d` beside
 * `current_period_end = now+365d` (`qa-08-step8-cohorts.mjs:253`) — a divergence
 * the revoke path does not produce — so the sentence passed on a state the app
 * cannot make.
 *
 * ## What this drives
 *
 *   REAL:    a real card, a real paid subscription, `syncSubscription` writing
 *            both rows, then `revokeForCustomer` on the real charge.
 *   CONTROL: the build driver's seeded divergence, on which the sentence MUST
 *            appear — otherwise this file is only measuring a broken selector.
 *
 * The control is a NAMED ARTEFACT: the signed sentence, character for character.
 *
 * Safety: `@trackd-qa.invalid`, `qa-money-` prefixed, ledgered, Stripe torn down
 * BEFORE the accounts.
 */
import { chromium, type Browser } from "playwright";
import { afterAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";

import { revokeForCustomer, syncSubscription } from "@/lib/billing/sync";

import { Ledger, admin, sameInstant, requireStripeBudget, stripe, stripeBudgetAvailable } from "./core";

const ledger = new Ledger();
const MONTHLY = process.env.STRIPE_PRICE_MONTHLY;
if (!MONTHLY) throw new Error("STRIPE_PRICE_MONTHLY is not set — absent is not a default");
const guarded = stripeBudgetAvailable() ? describe : describe.skip;

/** The sentence signed on 18 Aug 2026, character for character. */
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
    is_18_plus: true,
    tos_accepted_at: new Date().toISOString(),
    date_of_birth: "1990-01-01",
    timezone: "Australia/Sydney",
  }).eq("id", userId);
  return { userId, email, password };
}

async function stripeCustomer(userId: string, email: string) {
  const customer = await stripe.customers.create({ email });
  const customerId = ledger.customer(customer.id);
  const { error } = await admin.from("billing_customers").insert({ user_id: userId, stripe_customer_id: customerId });
  if (error) throw new Error(`link: ${error.message}`);
  return customerId;
}

/** ⚠️ pm_card_* only. Never a raw card number. */
async function attachCard(customerId: string, token: string) {
  const pm = await stripe.paymentMethods.create({ type: "card", card: { token } });
  await stripe.paymentMethods.attach(pm.id, { customer: customerId });
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm.id } });
  return pm.id;
}

async function rows(userId: string) {
  const { data: ent } = await admin
    .from("entitlements").select("active_until, is_active")
    .eq("user_id", userId).eq("product", "pro").eq("source", "stripe").maybeSingle();
  const { data: sub } = await admin
    .from("subscriptions").select("status, current_period_end, trial_ends_at, cancel_at_period_end")
    .eq("user_id", userId).maybeSingle();
  return { ent, sub };
}

/** Both surfaces, from one sign-in. Drives localhost:3100 — never 127.0.0.1. */
async function screens(email: string, password: string) {
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

guarded("the signed suspended sentence, on the state it was signed for", () => {
  it("REAL revoke: syncSubscription + revokeForCustomer, then both screens", async () => {
    requireStripeBudget("a real paid subscription and a real revocation");
    const a = await account("realrevoke");
    const customerId = await stripeCustomer(a.userId, a.email);
    await attachCard(customerId, "tok_visa");

    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: MONTHLY }],
      metadata: { user_id: a.userId },
    });
    // The app's own writer, not a seed: both rows come from the real object.
    const synced = await syncSubscription(sub);
    expect(synced, "syncSubscription did not handle the real object").toBe("handled");

    const before = await rows(a.userId);
    console.log(`  mirror  status=${before.sub?.status} current_period_end=${before.sub?.current_period_end}`);
    console.log(`  entitle is_active=${before.ent?.is_active} active_until=${before.ent?.active_until}`);

    /**
     * ⚠️ ARRIVAL, AND IT IS THE WHOLE FINDING. Both dates are written from the
     * same `entitledUntil(sub)`, so they are the same instant — which is exactly
     * the condition under which `accessEndsEarly` is FALSE.
     */
    expect(
      sameInstant(before.ent?.active_until, before.sub?.current_period_end),
      "the two dates diverge in the real state, which would make this finding moot",
    ).toBe(true);

    const charges = await stripe.charges.list({ customer: customerId, limit: 5 });
    const charge = charges.data.find((c) => c.paid);
    expect(charge, "no paid charge, so there is nothing to revoke against").toBeDefined();

    const outcome = await revokeForCustomer(charge!.id, "dispute", stripe, {
      status: "needs_response",
    } as Stripe.Dispute);
    expect(outcome).toBe("handled");

    const after = await rows(a.userId);
    console.log(`  AFTER REVOKE is_active=${after.ent?.is_active} active_until=${after.ent?.active_until}`);
    // ARRIVAL: the state really is "revoked beside a live, billing subscription".
    expect(after.ent?.is_active).toBe(false);
    expect(sameInstant(after.ent?.active_until, before.ent?.active_until)).toBe(true);
    expect(after.sub?.status).toBe("active");

    const s = await screens(a.email, a.password);
    console.log(`\n--- REAL REVOKED /billing ---\n${s.billing}\n--- /billing/manage ---\n${s.manage}\n---`);

    const hasSigned = s.manage.includes(SIGNED_SUSPENDED_HEAD);
    const hasPaying = s.manage.includes(PAYING_HEAD);
    const hasLapsed = s.manage.includes(LAPSED);
    console.log(`  signed=${hasSigned} paying=${hasPaying} lapsed=${hasLapsed}`);
    console.log(`  billing verb: ${/Ends on/.test(s.billing) ? "Ends on" : /Renews on/.test(s.billing) ? "Renews on" : "neither"}`);

    // THE ASSERTION. If this fails, the sentence IS reachable and I am wrong.
    expect(
      hasSigned,
      "the signed sentence DID appear on the real revoked state — the finding is void",
    ).toBe(true);
  }, 300_000);

  it("CONTROL: the build driver's seeded divergence DOES produce the sentence", async () => {
    const a = await account("seeddiverge");
    const DAY = 24 * 3600_000;
    const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
    const { error: e1 } = await admin.from("entitlements").insert({
      user_id: a.userId, product: "pro", source: "stripe",
      active_until: iso(30 * DAY), is_active: false,
    });
    if (e1) throw new Error(`seed entitlement: ${e1.message}`);
    const { error: e2 } = await admin.from("subscriptions").insert({
      user_id: a.userId,
      stripe_subscription_id: `qamoney_${Date.now()}`,
      stripe_price_id: process.env.STRIPE_PRICE_YEARLY,
      status: "active",
      current_period_end: iso(365 * DAY),
      cancel_at_period_end: false,
    });
    if (e2) throw new Error(`seed subscription: ${e2.message}`);
    const { error: e3 } = await admin.from("billing_customers").insert({
      user_id: a.userId, stripe_customer_id: `cus_qamoney_${Date.now()}`,
    });
    if (e3) throw new Error(`seed customer: ${e3.message}`);

    const s = await screens(a.email, a.password);
    console.log(`\n--- SEEDED DIVERGENCE /billing/manage ---\n${s.manage}\n---`);
    // The named artefact. Proves the selector and the screen read work.
    expect(
      s.manage.includes(SIGNED_SUSPENDED_HEAD),
      "the control did not produce the sentence either — this file measures nothing",
    ).toBe(true);
  }, 300_000);
});
