import type Stripe from "stripe";
import { afterAll, describe, expect, it, vi } from "vitest";

import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";

import { Ledger, QA_PASSWORD, admin, requireStripeBudget, sameInstant, stripe } from "./core";

/**
 * ⚠️ 2.4 — THE SETTLED DISPUTE SENTENCE, AND THE RESURRECTION GUARD UNDER IT.
 *
 *   HARNESS_ALLOW_STRIPE=1 npx vitest run \
 *     --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/rvsettled.scenario.ts --reporter=verbose
 *
 * `rvsuspended.scenario.ts` drives the window BEFORE the cancel webhook lands.
 * This drives what happens WHEN IT LANDS, using the app's own writer rather than
 * a seeded mirror update: `syncSubscription` on the real, now-`canceled` Stripe
 * object is exactly what `customer.subscription.deleted` runs.
 *
 * Two questions, and the first is a money question:
 *
 *   1. does syncing the cancel RESURRECT the entitlement a dispute revoked?
 *   2. does the screen then read 2.4's settled sentence rather than 1.4's, which
 *      say OPPOSITE things about whether the plan is still active?
 */

const ledger = new Ledger();
const MONTHLY = process.env.STRIPE_PRICE_MONTHLY;
if (!MONTHLY) throw new Error("STRIPE_PRICE_MONTHLY is not set — absent is not a default");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

const wiring: { user: SupabaseClient | null } = { user: null };

vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3100" }),
  cookies: async () => ({ getAll: () => [], setAll: () => {} }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => wiring.user! }));

afterAll(async () => {
  await ledger.teardown();
  const left = ledger.outstanding();
  expect(left.users).toEqual([]);
  expect(left.customers).toEqual([]);
  expect(left.clocks).toEqual([]);
}, 300_000);

const CHARGEBACK = { status: "needs_response" } as Stripe.Dispute;
const points = (s: string) => [...s].map((c) => c.codePointAt(0)!).join(",");

/** ⚠️ 2.4's sentence, character for character. */
const SETTLED =
  "Your subscription was cancelled because a payment was disputed with your bank. " +
  "Email support@trackdco.app if that wasn't you, or choose a plan below whenever you're ready.";

async function paid(tag: string) {
  const email = `qa-rv-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@trackd-qa.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: QA_PASSWORD, email_confirm: true });
  if (error) throw new Error(`account: ${error.message}`);
  const userId = ledger.user(data.user.id);
  const { data: pRows, error: pErr } = await admin
    .from("profiles")
    .update({ is_18_plus: true, tos_accepted_at: new Date().toISOString(), date_of_birth: "1990-01-01", timezone: "Australia/Sydney" })
    .eq("id", userId)
    .select("id");
  if (pErr) throw new Error(`profile: ${pErr.message}`);
  expect(pRows?.length).toBe(1);

  const customer = await stripe.customers.create({ email });
  const customerId = ledger.customer(customer.id);
  const { error: linkErr } = await admin.from("billing_customers").insert({ user_id: userId, stripe_customer_id: customerId });
  if (linkErr) throw new Error(`link: ${linkErr.message}`);

  /** ⚠️ pm_card_/tok_ only. */
  const pm = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } });
  await stripe.paymentMethods.attach(pm.id, { customer: customerId });
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm.id } });
  const sub = await stripe.subscriptions.create({ customer: customerId, items: [{ price: MONTHLY }], metadata: { user_id: userId } });

  const { syncSubscription } = await import("@/lib/billing/sync");
  expect(await syncSubscription(sub)).toBe("handled");
  const charges = await stripe.charges.list({ customer: customerId, limit: 5 });
  const charge = charges.data.find((c) => c.paid);
  expect(charge, "no paid charge, so there is nothing to dispute").toBeDefined();

  const signed = createSupabase(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: sErr } = await signed.auth.signInWithPassword({ email, password: QA_PASSWORD });
  if (sErr) throw new Error(`sign in: ${sErr.message}`);
  return { userId, email, customerId, subscriptionId: sub.id, chargeId: charge!.id, signed };
}

async function rows(userId: string) {
  const ent = await admin.from("entitlements").select("is_active, active_until, revoked_reason").eq("user_id", userId).eq("product", "pro").eq("source", "stripe").maybeSingle();
  const mirror = await admin.from("subscriptions").select("status, current_period_end").eq("user_id", userId).maybeSingle();
  expect(ent.error, "the entitlement read FAILED").toBeNull();
  expect(mirror.error, "the mirror read FAILED").toBeNull();
  return { ent: ent.data, mirror: mirror.data };
}

async function sentence(userId: string, signed: SupabaseClient) {
  wiring.user = signed;
  vi.resetModules();
  const { loadBillingFacts } = await import("@/lib/billing/screenFacts");
  const { manageSummaryFor, summaryStateFor } = await import("@/lib/billing/manageSummary");
  const { formatAccessDate } = await import("@/lib/billing/manage");
  const { formatPrice } = await import("@/lib/onboarding/pricing");
  const facts = await loadBillingFacts(userId);
  const args = {
    entitlement: facts.entitlement,
    subscription: facts.subscription,
    actionKind: facts.action.kind,
    namesATrial: facts.action.kind === "cancel" || facts.action.kind === "resume" ? facts.action.namesATrial : false,
    endsOn: facts.action.kind === "cancel" || facts.action.kind === "resume" ? formatAccessDate(facts.action.endsOn, facts.tz) : null,
    graceEndsOn: facts.entitlement?.activeUntil ? formatAccessDate(facts.entitlement.activeUntil, facts.tz) : null,
    courtesyEndsOn: facts.subscription?.courtesyUntil ? formatAccessDate(facts.subscription.courtesyUntil, facts.tz) : null,
    price: facts.price ? `${formatPrice(facts.price.amount, facts.price.currency)} ${facts.price.currency.toUpperCase()}` : null,
    interval: facts.price?.interval ?? null,
    gateEnabled: facts.gateEnabled,
    accessLive: facts.accessLive,
    accessRevoked: facts.accessRevoked,
    accessRevokedReason: facts.accessRevokedReason,
  };
  return { facts, state: summaryStateFor(args), sentence: manageSummaryFor(args) };
}

describe("⚠️ 2.4 — the settled dispute, after the cancel webhook lands", () => {
  it("does not resurrect the revoked entitlement, and swaps 1.4's sentence for 2.4's", async () => {
    requireStripeBudget("a real paid subscription and a real dispute");
    const a = await paid("settled");

    const before = await rows(a.userId);
    expect(before.ent?.is_active, "the entitlement was never granted").toBe(true);

    const { revokeForCustomer } = await import("@/lib/billing/sync");
    expect(await revokeForCustomer(a.chargeId, "dispute", stripe, CHARGEBACK)).toBe("handled");

    const mid = await rows(a.userId);
    expect(mid.ent?.is_active).toBe(false);
    expect(mid.ent?.revoked_reason).toBe("dispute");
    const midScreen = await sentence(a.userId, a.signed);
    console.log(`  BEFORE the webhook: state=${midScreen.state}`);
    expect(midScreen.state, "the pre-webhook window is not 1.4's suspended state").toBe("suspended");

    /* ── the webhook, run through the app's OWN writer ────────────────── */
    const cancelled = await stripe.subscriptions.retrieve(a.subscriptionId);
    expect(cancelled.status, "2.1 did not cancel at Stripe, so there is no webhook to run").toBe("canceled");
    const { syncSubscription } = await import("@/lib/billing/sync");
    expect(await syncSubscription(cancelled), "the cancel sync was not handled").toBe("handled");

    const after = await rows(a.userId);
    console.log(`  after the cancel sync: is_active=${after.ent?.is_active} reason=${after.ent?.revoked_reason} mirror=${after.mirror?.status}`);

    /* ── ⚠️ THE MONEY QUESTION FIRST: no resurrection ─────────────────── */
    expect(
      after.ent?.is_active,
      "⚠️ the cancel webhook RESURRECTED an entitlement a chargeback revoked",
    ).toBe(false);
    expect(after.ent?.revoked_reason, "the reason was lost, so both dispute sentences would misfire").toBe("dispute");
    expect(
      sameInstant(after.ent?.active_until as string, mid.ent?.active_until as string),
      "the cancel sync moved active_until on a revoked row",
    ).toBe(true);

    /* ── ARRIVAL: the mirror really did move, or the state below is stale ── */
    expect(after.mirror?.status, "the mirror did not take the cancel, so this is still 1.4's window").toBe("canceled");

    /* ── the settled sentence, by codepoint ──────────────────────────── */
    const screen = await sentence(a.userId, a.signed);
    console.log(`  AFTER the webhook: state=${screen.state}`);
    console.log(`  sentence: ${JSON.stringify(screen.sentence)}`);
    expect(screen.state, "the settled state was not reached").toBe("dispute-cancelled");
    expect(points(screen.sentence!)).toBe(points(SETTLED));

    /* ── ⚠️ AND 1.4's SENTENCE IS ABSENT — they say OPPOSITE things ──── */
    expect(screen.sentence).not.toContain("is still active");
    expect(screen.sentence).not.toContain("Your access has been suspended");
    for (const other of [
      "You've cancelled, so you keep your Pro plan until",
      "Your last payment didn't go through",
      "You have free access for life",
      "days on us until",
      "and it renews on",
      "You're not on a plan at the moment",
    ]) {
      expect(screen.sentence, `another cohort's sentence leaked in: ${other}`).not.toContain(other);
    }
    expect(/[‐-―−]/.test(screen.sentence!), "a banned dash is in the settled sentence").toBe(false);
  }, 600_000);
});
