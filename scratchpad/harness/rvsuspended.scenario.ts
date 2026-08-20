import type Stripe from "stripe";
import { afterAll, describe, expect, it, vi } from "vitest";

import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";

import { Ledger, QA_PASSWORD, admin, requireStripeBudget, sameInstant, stripe } from "./core";

/**
 * ⚠️ 1.4 AND 2.4 — THE SIGNED SENTENCES, DRIVEN FROM A REAL REVOKED STATE.
 *
 *   HARNESS_ALLOW_STRIPE=1 npx vitest run \
 *     --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/rvsuspended.scenario.ts --reporter=verbose
 *
 * Three reviewers found that the `suspended` sentence could never fire: it keyed
 * on `accessEndsEarly`, whose date half asks whether the entitlement's date and
 * the mirror's disagree — and `sync.ts` writes BOTH from one `entitledUntil(sub)`
 * call, so on a real revocation they are equal by construction. The original
 * certification seeded a divergence, which is a state the app cannot produce.
 *
 * ⚠️ SO THE DATES ARE ASSERTED EQUAL BEFORE ANYTHING IS CLAIMED. If they diverge
 * the fixture is wrong and everything below is measuring the old defect's shape
 * rather than the new trigger.
 *
 * Every row here is written by the app's own writers — `syncSubscription` and
 * `revokeForCustomer` — never by a seed, and the CONTROL is one column apart:
 * the same shape revoked for a REFUND, which must get NO sentence at all.
 *
 * The sentence is compared BY CODEPOINT, not by eye.
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

/** Codepoints, so a look-alike character cannot pass for the signed one. */
const points = (s: string) => [...s].map((c) => c.codePointAt(0)!).join(",");

async function paidSubscription(tag: string) {
  const email = `qa-rv-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@trackd-qa.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: QA_PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`account: ${error.message}`);
  const userId = ledger.user(data.user.id);
  const { data: pRows, error: pErr } = await admin
    .from("profiles")
    .update({
      is_18_plus: true,
      tos_accepted_at: new Date().toISOString(),
      date_of_birth: "1990-01-01",
      timezone: "Australia/Sydney",
    })
    .eq("id", userId)
    .select("id");
  if (pErr) throw new Error(`profile: ${pErr.message}`);
  expect(pRows?.length, "the profile update matched no rows").toBe(1);

  const customer = await stripe.customers.create({ email });
  const customerId = ledger.customer(customer.id);
  const { error: linkErr } = await admin
    .from("billing_customers")
    .insert({ user_id: userId, stripe_customer_id: customerId });
  if (linkErr) throw new Error(`link: ${linkErr.message}`);

  /** ⚠️ pm_card_/tok_ only. Never a raw card number. */
  const pm = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } });
  await stripe.paymentMethods.attach(pm.id, { customer: customerId });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: pm.id },
  });
  const sub = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: MONTHLY }],
    metadata: { user_id: userId },
  });
  const { syncSubscription } = await import("@/lib/billing/sync");
  expect(await syncSubscription(sub), "syncSubscription did not handle the real object").toBe(
    "handled",
  );
  const charges = await stripe.charges.list({ customer: customerId, limit: 5 });
  const charge = charges.data.find((c) => c.paid);
  expect(charge, "no paid charge, so there is nothing to dispute").toBeDefined();

  const signed = createSupabase(URL_, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await signed.auth.signInWithPassword({ email, password: QA_PASSWORD });
  if (signInError) throw new Error(`sign in: ${signInError.message}`);

  return { userId, email, customerId, subscriptionId: sub.id, chargeId: charge!.id, signed };
}

/** The rows, as the app wrote them. */
async function rows(userId: string) {
  const ent = await admin
    .from("entitlements")
    .select("is_active, active_until, revoked_reason")
    .eq("user_id", userId)
    .eq("product", "pro")
    .eq("source", "stripe")
    .maybeSingle();
  const mirror = await admin
    .from("subscriptions")
    .select("status, current_period_end, cancel_at_period_end, stripe_price_id")
    .eq("user_id", userId)
    .maybeSingle();
  expect(ent.error, "the entitlement read FAILED, so nothing below is verified").toBeNull();
  expect(mirror.error, "the mirror read FAILED, so nothing below is verified").toBeNull();
  return { ent: ent.data, mirror: mirror.data };
}

/** The manage screen's own sentence, built exactly as `page.tsx` builds it. */
async function manageSentence(userId: string, signed: SupabaseClient) {
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
    namesATrial:
      facts.action.kind === "cancel" || facts.action.kind === "resume"
        ? facts.action.namesATrial
        : false,
    endsOn:
      facts.action.kind === "cancel" || facts.action.kind === "resume"
        ? formatAccessDate(facts.action.endsOn, facts.tz)
        : null,
    graceEndsOn: facts.entitlement?.activeUntil
      ? formatAccessDate(facts.entitlement.activeUntil, facts.tz)
      : null,
    courtesyEndsOn: facts.subscription?.courtesyUntil
      ? formatAccessDate(facts.subscription.courtesyUntil, facts.tz)
      : null,
    price: facts.price
      ? `${formatPrice(facts.price.amount, facts.price.currency)} ${facts.price.currency.toUpperCase()}`
      : null,
    interval: facts.price?.interval ?? null,
    gateEnabled: facts.gateEnabled,
    accessLive: facts.accessLive,
    accessRevoked: facts.accessRevoked,
    accessRevokedReason: facts.accessRevokedReason,
  };
  return { facts, state: summaryStateFor(args), sentence: manageSummaryFor(args) };
}

describe("⚠️ 1.4 — the suspended sentence, from a REAL revocation", () => {
  it("fires on the revocation FLAG while the two dates are EQUAL, and a refund gets nothing", async () => {
    requireStripeBudget("two real paid subscriptions, a real dispute and a real full refund");

    /* ════════ SUBJECT: a real chargeback ════════════════════════════ */
    const a = await paidSubscription("suspend");
    const before = await rows(a.userId);
    expect(before.ent?.is_active, "the entitlement was never granted").toBe(true);
    expect(before.mirror?.status, "the mirror is not active").toBe("active");

    /**
     * ⚠️ ARRIVAL, AND THIS IS THE ONE THAT MATTERS. `sync.ts` writes the
     * entitlement's `active_until` and the mirror's `current_period_end` from the
     * same `entitledUntil(sub)` call. If they are equal, the OLD date-keyed
     * predicate answers "no" and the signed sentence could never have fired —
     * which is the defect three reviewers found. Asserted as INSTANTS.
     */
    console.log(`  entitlement.active_until      ${before.ent?.active_until}`);
    console.log(`  mirror.current_period_end     ${before.mirror?.current_period_end}`);
    expect(
      sameInstant(before.ent?.active_until as string, before.mirror?.current_period_end as string),
      "the two dates DIVERGE, so this fixture reproduces the old seeded state and proves nothing",
    ).toBe(true);

    const { revokeForCustomer } = await import("@/lib/billing/sync");
    expect(await revokeForCustomer(a.chargeId, "dispute", stripe, CHARGEBACK)).toBe("handled");

    const after = await rows(a.userId);
    expect(after.ent?.is_active, "the dispute did not revoke").toBe(false);
    expect(after.ent?.revoked_reason, "the reason was not persisted").toBe("dispute");
    /* ── the dates are STILL equal after the revoke, by construction ── */
    expect(
      sameInstant(after.ent?.active_until as string, after.mirror?.current_period_end as string),
      "the revoke moved a date; the old predicate would now fire for the wrong reason",
    ).toBe(true);
    /**
     * ⚠️ THE WINDOW THIS SENTENCE IS ABOUT. 2.1 cancels at Stripe; the mirror
     * catches up on `customer.subscription.deleted`, which has not arrived. That
     * gap — and the case where the subscription behind the charge cannot be
     * resolved and NOTHING is cancelled — is exactly when `suspended` is true.
     */
    expect(after.mirror?.status, "the mirror already moved, so this is 2.4's state, not 1.4's").toBe(
      "active",
    );

    const subject = await manageSentence(a.userId, a.signed);
    console.log(`  SUBJECT state=${subject.state}`);
    console.log(`  SUBJECT sentence: ${JSON.stringify(subject.sentence)}`);
    expect(subject.state, "the revoked cohort did not reach the suspended state").toBe("suspended");
    expect(subject.sentence, "the suspended sentence is withheld").not.toBeNull();

    /* ── ⚠️ COMPARED BY CODEPOINT, not by eye ───────────────────────── */
    const OPEN =
      "Your access has been suspended while we look into a payment dispute, and your Pro plan at ";
    const CLOSE = " is still active.";
    expect(
      points(subject.sentence!.slice(0, [...OPEN].length)),
      `unexpected opening: ${JSON.stringify(subject.sentence)}`,
    ).toBe(points(OPEN));
    expect(
      points(subject.sentence!.slice(-[...CLOSE].length)),
      `unexpected close: ${JSON.stringify(subject.sentence)}`,
    ).toBe(points(CLOSE));
    /** The middle is the price, which must name an amount AND an interval. */
    const middle = subject.sentence!.slice([...OPEN].length, -[...CLOSE].length);
    console.log(`  SUBJECT price clause: ${JSON.stringify(middle)}`);
    expect(middle, "the price clause is empty, so the sentence names no amount").not.toBe("");
    expect(middle, "the price clause names no currency").toMatch(/^\$[0-9]+\.[0-9]{2} [A-Z]{3} a (day|week|month|year)$/);
    /** ⚠️ No banned dash anywhere in it. */
    expect(/[‐-―−]/.test(subject.sentence!), "a banned dash is in the sentence").toBe(false);

    /* ── ⚠️ EVERY OTHER COHORT'S SENTENCE IS ABSENT FROM THIS PAGE ──── */
    for (const other of [
      "You've cancelled, so you keep your Pro plan until",
      "Your last payment didn't go through",
      "You have free access for life",
      "days on us until",
      "Your Pro plan is free until",
      "You're on a free trial of your Pro plan until",
      "and it renews on",
      "Your subscription was cancelled because a payment was disputed with your bank.",
      "You're not on a plan at the moment",
    ]) {
      expect(subject.sentence, `another cohort's sentence leaked in: ${other}`).not.toContain(other);
    }

    /* ════════ CONTROL: the SAME shape, revoked for a REFUND ═════════ */
    const b = await paidSubscription("refundctl");
    const bBefore = await rows(b.userId);
    expect(bBefore.ent?.is_active).toBe(true);
    const charge = await stripe.charges.retrieve(b.chargeId);
    await stripe.refunds.create({ charge: b.chargeId, amount: charge.amount });
    expect(await revokeForCustomer(b.chargeId, "refund", stripe)).toBe("handled");

    const bAfter = await rows(b.userId);
    expect(bAfter.ent?.is_active, "the full refund did not revoke").toBe(false);
    expect(bAfter.ent?.revoked_reason, "the refund was not recorded as a refund").toBe("refund");
    expect(bAfter.mirror?.status, "the control's mirror moved").toBe("active");
    console.log(
      `  CONTROL rows: is_active=${bAfter.ent?.is_active} reason=${bAfter.ent?.revoked_reason} mirror=${bAfter.mirror?.status}`,
    );

    const control = await manageSentence(b.userId, b.signed);
    console.log(`  CONTROL state=${control.state}`);
    console.log(`  CONTROL sentence: ${JSON.stringify(control.sentence)}`);
    /**
     * ⚠️ ONE COLUMN APART. If this ALSO read "suspended" the reason column is not
     * being consulted and a refunded customer is told their bank disputed a
     * payment — the exact defect D101 exists to close.
     */
    expect(control.state, "a REFUND selected a dispute sentence").not.toBe("suspended");
    expect(control.state, "a REFUND selected the settled-dispute sentence").not.toBe(
      "dispute-cancelled",
    );
    expect(control.sentence, "a refunded account was given a sentence about a dispute").toBeNull();

    /* ════════ RECONCILE: what the founder's report says about the refund ═══ */
    const { takeSnapshot } = await import("@/lib/billing/reconcile/fetch");
    const { runRules } = await import("@/lib/billing/reconcile/rules");
    const snapshot = await takeSnapshot(new Date());
    const findings = runRules(snapshot).filter((f) => f.account?.userId === b.userId);
    console.log(`  RECONCILE findings for the REFUNDED account:`);
    for (const f of findings) console.log(`    · ${f.rule}\n        ${f.evidence.join("\n        ")}`);
    expect(snapshot.completeness.failed, "the snapshot could not be taken").toEqual([]);

    /**
     * ⚠️ FIX 1, END TO END, ON A REAL FULL REFUND (20 Aug 2026).
     *
     * The finding used to end "a dispute cancels the subscription, so this means
     * the cancel failed or never ran" — on an account where NOTHING was disputed
     * and `stopDisputedBilling` deliberately cancels nothing. The reason now comes
     * from `revoked_reason`, read by `fetchRevokedReasons`, and the words follow.
     *
     * ⚠️ IT MUST STILL BE REPORTED. Withholding it would take parked finding P1
     * from caught back to silent.
     */
    const one = findings.find((f) => f.rule === "revoked-entitlement-beside-live-subscription");
    expect(one, "the refunded account is not reported at all — P1 is no longer caught").toBeDefined();
    const evidence = one!.evidence.join(" ");
    console.log(`  EVIDENCE: ${evidence}`);
    expect(
      evidence,
      "the report still tells the founder a dispute cancel failed on a hand-issued refund",
    ).not.toContain("the cancel failed or never ran");
    expect(evidence).toContain('revoked_reason is "refund"');
    expect(evidence).toContain("P1");
    expect(/dispute/i.test(evidence), "a refund is described as a dispute").toBe(false);
  }, 600_000);
});
