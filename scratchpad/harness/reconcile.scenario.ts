import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { takeSnapshot } from "@/lib/billing/reconcile/fetch";
import { runRules } from "@/lib/billing/reconcile/rules";
import type { Finding, ReconcileSnapshot, RuleId } from "@/lib/billing/reconcile/types";

import { admin, Ledger, requireStripeBudget, seedAccount, stripe, stripeBudgetAvailable } from "./core";

/**
 * SPEC 11 STEPS 4 AND 5 — the rules meeting REAL seeded state.
 *
 *   Step 4: break each rule deliberately and confirm it is caught.
 *   Step 5: confirm the deliberate divergences do NOT fire.
 *
 *   HARNESS_ALLOW_STRIPE=1 npx vitest run \
 *     --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/reconcile.scenario.ts --reporter=verbose
 *
 * ## ⚠️ VERIFIED FROM THE COHORT, NOT FROM THE FUNCTION
 *
 * This runs the REAL fetch layer against the REAL Stripe test account — 964
 * subscriptions and 1210 invoices of QA history — and then asserts **only against
 * the objects this file created**. That matters in both directions:
 *
 *   - the fetch → rules wiring is exercised against real Stripe shapes, not
 *     against hand-written fixtures that agree with my assumptions;
 *   - months of unrelated QA residue cannot make a rule look like it fired.
 *
 * ## ⚠️ EVERY CASE ASSERTS IT REACHED THE STATE BEFORE ASSERTING ANYTHING ABOUT IT
 *
 * Five drives on this branch nearly passed without reaching the state they claimed
 * to test. So each case below first proves its object exists in the snapshot with
 * the shape it was meant to have — the right status, the right marker, on the
 * right object — and only then asserts what the rules said about it. A case whose
 * seeding silently failed now fails on arrival rather than passing vacuously.
 *
 * ## Safety
 *
 * Accounts are `@trackd-qa.invalid` with a timestamp, recorded in the `Ledger`,
 * deleted BY ID. Stripe objects are torn down BEFORE the accounts, because
 * `billing_customers` cascades with the profile and is the only mapping back.
 * Seeded webhook rows are deleted by their exact event ids. There is no `like`,
 * no domain match and no query that selects rows to delete.
 *
 * ⚠️ It never calls `/api/billing/beta-grace` or any other route that writes
 * billing tables. Every write here is a direct, ledgered seed.
 */

const ledger = new Ledger();
const TAG = `recon-${Date.now()}`;
const seededEventIds: string[] = [];

/** A price we really sell, so the archived-price rule stays quiet unless asked. */
const REAL_PRICE = process.env.STRIPE_PRICE_WEEKLY ?? "";

let snapshot: ReconcileSnapshot;
let findings: Finding[];

/** Everything this file created, so assertions can be scoped to the cohort. */
const seeded = {
  chargeInGrace: { customerId: "", subscriptionId: "" },
  chargeInCourtesy: { customerId: "", subscriptionId: "" },
  courtesyWhileUnpaid: { customerId: "", subscriptionId: "" },
  markerMissing: { customerId: "", subscriptionId: "" },
  twoBillable: { customerId: "", a: "", b: "" },
  payingNoAccess: { customerId: "", subscriptionId: "", userId: "" },
  accessNoSource: { userId: "" },
  archivedPrice: { customerId: "", subscriptionId: "", priceId: "" },
  zeroInvoice: { customerId: "", invoiceId: "" },
  webhooks: { unattributedId: "", unprocessedId: "", userId: "" },
  // Step 5 — the three correct states.
  okGrace: { customerId: "", subscriptionId: "" },
  okCourtesy: { customerId: "", subscriptionId: "" },
  okDispute: { customerId: "", subscriptionId: "", userId: "" },
};

/** A customer with a working test card attached and set as default. */
async function payingCustomer(label: string): Promise<string> {
  const customer = await stripe.customers.create({
    email: `${TAG}-${label}@trackd-qa.invalid`,
    payment_method: "pm_card_visa",
    invoice_settings: { default_payment_method: "pm_card_visa" },
    metadata: { harness: TAG },
  });
  return ledger.customer(customer.id);
}

/** A customer with NO card, so its invoices stay open. */
async function unpaidCustomer(label: string): Promise<string> {
  const customer = await stripe.customers.create({
    email: `${TAG}-${label}@trackd-qa.invalid`,
    metadata: { harness: TAG },
  });
  return ledger.customer(customer.id);
}

beforeAll(async () => {
  requireStripeBudget("spec 11 Steps 4 and 5");
  if (!REAL_PRICE) throw new Error("STRIPE_PRICE_WEEKLY is not set");

  /* ── Step 4, case 1: a charge inside a promised grace ──────────── */
  {
    const customerId = await payingCustomer("grace");
    // Paid immediately by the attached card, then marked as though the whole
    // period had been promised free. The charge therefore sits inside it.
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: REAL_PRICE }],
      metadata: { trackd_grace_until: isoIn(30) },
    });
    seeded.chargeInGrace = { customerId, subscriptionId: sub.id };
  }

  /* ── case 2: a charge inside a courtesy period ─────────────────── */
  {
    const customerId = await payingCustomer("courtesy");
    // Claimed BEFORE the charge, so the charge lands inside the courtesy window.
    await stripe.customers.update(customerId, {
      metadata: { harness: TAG, trackd_save_offer_claimed_at: isoIn(-1) },
    });
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: REAL_PRICE }],
      metadata: { trackd_courtesy_until: isoIn(30) },
    });
    seeded.chargeInCourtesy = { customerId, subscriptionId: sub.id };
  }

  /* ── case 3: a courtesy granted while unpaid (D75) ─────────────── */
  {
    const customerId = await unpaidCustomer("unpaid");
    // An invoice raised and left OPEN, then a courtesy claimed afterwards.
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: REAL_PRICE }],
      collection_method: "send_invoice",
      days_until_due: 30,
      metadata: { trackd_courtesy_until: isoIn(30) },
    });
    /**
     * ⚠️ FINALISED EXPLICITLY. A `send_invoice` subscription's first invoice is
     * created as a DRAFT, and the rule skips drafts deliberately — `saveOffer.ts`
     * gives the reason: "a draft is the NEXT period being assembled". So without
     * this the seed produces an invoice that is unpaid but invisible to the rule,
     * and the case fails for a reason that has nothing to do with the rule.
     * Found by driving.
     */
    await finaliseOpenInvoiceFor(sub.id);
    await stripe.customers.update(customerId, {
      metadata: { harness: TAG, trackd_save_offer_claimed_at: isoIn(1) },
    });
    seeded.courtesyWhileUnpaid = { customerId, subscriptionId: sub.id };
  }

  /* ── case 4: a courtesy end with no claim instant ──────────────── */
  {
    const customerId = await unpaidCustomer("nomarker");
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: REAL_PRICE }],
      collection_method: "send_invoice",
      days_until_due: 30,
      metadata: { trackd_courtesy_until: isoIn(30) },
    });
    seeded.markerMissing = { customerId, subscriptionId: sub.id };
  }

  /* ── case 5: two billable subscriptions on one customer ────────── */
  {
    const customerId = await payingCustomer("double");
    const a = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: REAL_PRICE }],
    });
    const b = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: REAL_PRICE }],
    });
    seeded.twoBillable = { customerId, a: a.id, b: b.id };
  }

  /* ── case 6: paying, and the app gives them nothing ────────────── */
  {
    const account = await seedAccount(ledger, `${TAG}-noaccess`);
    const customerId = await payingCustomer("noaccess");
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: REAL_PRICE }],
      // Resolved through metadata rather than a `billing_customers` row, which is
      // the webhook's own documented fallback.
      metadata: { user_id: account.id },
    });
    seeded.payingNoAccess = { customerId, subscriptionId: sub.id, userId: account.id };
  }

  /* ── case 7: access with nothing paying for it ─────────────────── */
  {
    const account = await seedAccount(ledger, `${TAG}-nosource`);
    const { error } = await admin.from("entitlements").upsert(
      {
        user_id: account.id,
        product: "pro",
        source: "stripe",
        active_until: isoIn(30),
        is_active: true,
      },
      { onConflict: "user_id,product,source" },
    );
    if (error) throw new Error(`case 7 seed: ${error.message}`);
    seeded.accessNoSource = { userId: account.id };
  }

  /* ── case 8: a live subscription on a price we do not sell ─────── */
  {
    const customerId = await payingCustomer("archived");
    const price = await stripe.prices.create({
      currency: "aud",
      unit_amount: 500,
      recurring: { interval: "week" },
      product_data: { name: `${TAG} archived price` },
    });
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: price.id }],
    });
    seeded.archivedPrice = { customerId, subscriptionId: sub.id, priceId: price.id };
  }

  /* ── case 9: a zero-dollar invoice nobody granted ──────────────── */
  {
    const customerId = await unpaidCustomer("zero");
    await stripe.invoiceItems.create({ customer: customerId, amount: 0, currency: "aud" });
    const draft = await stripe.invoices.create({
      customer: customerId,
      collection_method: "send_invoice",
      days_until_due: 30,
    });
    // Finalised so it is a real invoice rather than a draft, which the rule skips.
    const finalised = await stripe.invoices.finalizeInvoice(draft.id as string);
    seeded.zeroInvoice = { customerId, invoiceId: finalised.id as string };
  }

  /* ── case 10: the two webhook states, held apart ───────────────── */
  {
    const account = await seedAccount(ledger, `${TAG}-webhook`);
    const linked = await unpaidCustomer("webhooklinked");
    const { error: linkErr } = await admin
      .from("billing_customers")
      .insert({ user_id: account.id, stripe_customer_id: linked });
    if (linkErr) throw new Error(`case 10 link: ${linkErr.message}`);

    const unattributedId = `evt_${TAG}_unattributed`;
    const unprocessedId = `evt_${TAG}_unprocessed`;
    const { error } = await admin.from("webhook_events").insert([
      {
        stripe_event_id: unattributedId,
        type: "invoice.paid",
        // livemode false so it is scoped INTO a test-mode run, and out of a live one.
        payload: {
          livemode: false,
          data: { object: { customer: `cus_${TAG}_nobody` } },
        },
        received_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        processed_at: null,
      },
      {
        stripe_event_id: unprocessedId,
        type: "invoice.paid",
        payload: { livemode: false, data: { object: { customer: linked } } },
        received_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        processed_at: null,
      },
    ]);
    if (error) throw new Error(`case 10 seed: ${error.message}`);
    seededEventIds.push(unattributedId, unprocessedId);
    seeded.webhooks = { unattributedId, unprocessedId, userId: account.id };
  }

  /* ── Step 5: the three deliberate divergences, all CORRECT ─────── */

  // A grace-aligned subscription: trialing to the promised end, marked, and the
  // account holds the matching dated comp. Nothing here is a defect.
  {
    const graceEnd = isoIn(14);
    const account = await seedAccount(ledger, `${TAG}-okgrace`, { graceUntil: graceEnd });
    const customerId = await payingCustomer("okgrace");
    const { error } = await admin
      .from("billing_customers")
      .insert({ user_id: account.id, stripe_customer_id: customerId });
    if (error) throw new Error(`ok-grace link: ${error.message}`);
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: REAL_PRICE }],
      trial_end: Math.floor(Date.parse(graceEnd) / 1000),
      metadata: { user_id: account.id, trackd_grace_until: graceEnd },
    });
    seeded.okGrace = { customerId, subscriptionId: sub.id };
  }

  // A courtesy month on a paying customer: claimed, marked, and the charge that
  // made them eligible sits BEFORE the claim.
  {
    /**
     * ⚠️ A REAL COURTESY ACCOUNT HAS AN ACCOUNT BEHIND IT.
     *
     * The first version created a bare Stripe customer with no user, no link row
     * and no entitlement, and Step 5 correctly reported it as a paying customer
     * with no access. That was a seeding gap, not a rule defect — but a Step 5
     * case that is not actually the state it names proves nothing either way, so
     * it is seeded properly rather than excused.
     */
    const courtesyEnd = isoIn(30);
    const account = await seedAccount(ledger, `${TAG}-okcourtesy`);
    const customerId = await payingCustomer("okcourtesy");
    const { error: linkErr } = await admin
      .from("billing_customers")
      .insert({ user_id: account.id, stripe_customer_id: customerId });
    if (linkErr) throw new Error(`ok-courtesy link: ${linkErr.message}`);

    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: REAL_PRICE }],
      metadata: { user_id: account.id },
    });
    // Claimed AFTER the first charge, which is the real ordering: the offer is
    // only available to somebody who has been paying.
    await stripe.customers.update(customerId, {
      metadata: { harness: TAG, trackd_save_offer_claimed_at: new Date().toISOString() },
    });
    const updated = await stripe.subscriptions.update(sub.id, {
      trial_end: Math.floor(Date.parse(courtesyEnd) / 1000),
      proration_behavior: "none",
      metadata: { user_id: account.id, trackd_courtesy_until: courtesyEnd },
    });
    // The entitlement follows the courtesy end, which is what `syncSubscription`
    // does on the real path.
    const { error } = await admin.from("entitlements").upsert(
      {
        user_id: account.id,
        product: "pro",
        source: "stripe",
        active_until: courtesyEnd,
        is_active: true,
      },
      { onConflict: "user_id,product,source" },
    );
    if (error) throw new Error(`ok-courtesy entitlement: ${error.message}`);
    seeded.okCourtesy = { customerId, subscriptionId: updated.id };
  }

  // A dispute: our rule deactivates the entitlement immediately while Stripe
  // leaves the subscription overdue. §3.4 — assert against OUR rule.
  {
    const account = await seedAccount(ledger, `${TAG}-okdispute`);
    const customerId = await payingCustomer("okdispute");
    const { error: linkErr } = await admin
      .from("billing_customers")
      .insert({ user_id: account.id, stripe_customer_id: customerId });
    if (linkErr) throw new Error(`ok-dispute link: ${linkErr.message}`);
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: REAL_PRICE }],
      metadata: { user_id: account.id },
    });
    const { error } = await admin.from("entitlements").upsert(
      {
        user_id: account.id,
        product: "pro",
        source: "stripe",
        active_until: isoIn(30),
        // REVOKED, which is what a dispute does in our system.
        is_active: false,
      },
      { onConflict: "user_id,product,source" },
    );
    if (error) throw new Error(`ok-dispute seed: ${error.message}`);
    seeded.okDispute = { customerId, subscriptionId: sub.id, userId: account.id };
  }

  // Stripe is eventually consistent on list endpoints; give it a moment before
  // the sweep, so a missing object is a real absence rather than a race.
  await new Promise((r) => setTimeout(r, 4000));

  snapshot = await takeSnapshot(new Date());
  findings = runRules(snapshot);
}, 600_000);

afterAll(async () => {
  if (seededEventIds.length > 0) {
    // BY ID ONLY. Never a domain match, never a `like`.
    await admin.from("webhook_events").delete().in("stripe_event_id", seededEventIds);
  }
  await ledger.teardown();
}, 300_000);

/* ── helpers ──────────────────────────────────────────────────────── */

function isoIn(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * ⚠️ INSTANTS, NOT STRINGS. Postgres returns `+00:00` where JS writes `.000Z`,
 * so `"2026-09-01T00:00:00+00:00" === "2026-09-01T00:00:00.000Z"` is false for
 * two identical moments. The harness README lists this as a trap that has already
 * cost a run, and it cost this file one too — Step 5's grace case failed its own
 * ARRIVAL assertion on a string compare of two equal instants.
 */
function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return Date.parse(a) === Date.parse(b);
}

/** Finalise a subscription's draft invoice so it becomes a real, open one. */
async function finaliseOpenInvoiceFor(subscriptionId: string): Promise<void> {
  const invoices = await stripe.invoices.list({ subscription: subscriptionId, limit: 10 });
  for (const invoice of invoices.data) {
    if (invoice.status === "draft" && invoice.id) {
      await stripe.invoices.finalizeInvoice(invoice.id);
    }
  }
}

/** Findings about ONE seeded Stripe customer. The cohort, not the account. */
function forCustomer(customerId: string): Finding[] {
  return findings.filter((f) => f.account?.stripeCustomerId === customerId);
}

function forUser(userId: string): Finding[] {
  return findings.filter((f) => f.account?.userId === userId);
}

function rulesFor(list: Finding[]): RuleId[] {
  return [...new Set(list.map((f) => f.rule))].sort();
}

/** The seeded subscription, as the REAL fetch layer saw it. */
function seenSubscription(id: string) {
  return snapshot.subscriptions.find((s) => s.id === id);
}

const guarded = stripeBudgetAvailable() ? describe : describe.skip;

/* ── Step 4 ───────────────────────────────────────────────────────── */

guarded("Step 4 — each rule broken deliberately, and caught", () => {
  it("the sweep actually saw the objects this file created", () => {
    // ⚠️ ARRIVAL FIRST. If the fetch layer did not see the seeded objects, every
    // assertion below would be measuring nothing, and would pass while doing so.
    expect(snapshot.mode).toBe("test");
    expect(snapshot.completeness.truncated).toEqual([]);
    expect(snapshot.completeness.failed).toEqual([]);
    for (const id of [
      seeded.chargeInGrace.subscriptionId,
      seeded.chargeInCourtesy.subscriptionId,
      seeded.courtesyWhileUnpaid.subscriptionId,
      seeded.markerMissing.subscriptionId,
      seeded.twoBillable.a,
      seeded.twoBillable.b,
      seeded.payingNoAccess.subscriptionId,
      seeded.archivedPrice.subscriptionId,
      seeded.okGrace.subscriptionId,
      seeded.okCourtesy.subscriptionId,
      seeded.okDispute.subscriptionId,
    ]) {
      expect(seenSubscription(id), `subscription ${id} missing from the sweep`).toBeDefined();
    }
  });

  it("1. a charge inside a promised grace is caught", () => {
    const sub = seenSubscription(seeded.chargeInGrace.subscriptionId);
    // Arrived: the marker really is on the subscription, and money really moved.
    expect(sub?.graceUntil).toBeTruthy();
    const paid = snapshot.invoices.filter(
      (i) => i.subscriptionId === sub?.id && i.paidAt !== null && i.amountPaid > 0,
    );
    expect(paid.length, "no paid invoice was created, so nothing could be inside the grace").toBeGreaterThan(0);

    expect(rulesFor(forCustomer(seeded.chargeInGrace.customerId))).toContain(
      "charge-inside-grace",
    );
  });

  it("2. a charge inside a courtesy period is caught", () => {
    const claim = snapshot.stripeCustomers.find(
      (c) => c.id === seeded.chargeInCourtesy.customerId,
    );
    // Arrived: the claim instant is on the CUSTOMER, which is the thing the first
    // draft of the fetch layer got wrong.
    expect(claim?.offerClaimedAt).toBeTruthy();
    expect(seenSubscription(seeded.chargeInCourtesy.subscriptionId)?.courtesyUntil).toBeTruthy();

    expect(rulesFor(forCustomer(seeded.chargeInCourtesy.customerId))).toContain(
      "charge-inside-courtesy",
    );
  });

  it("3. D75 — a courtesy granted while an invoice was outstanding is caught", () => {
    const sub = seenSubscription(seeded.courtesyWhileUnpaid.subscriptionId);
    expect(sub?.courtesyUntil).toBeTruthy();
    const owed = snapshot.invoices.filter(
      (i) => i.subscriptionId === sub?.id && i.total > 0 && i.paidAt === null,
    );
    expect(owed.length, "no unpaid invoice existed, so the grant could not have been made while unpaid").toBeGreaterThan(0);
    /**
     * ⚠️ AND IT MUST NOT BE A DRAFT. The rule skips drafts deliberately, so an
     * unpaid DRAFT would make this case fail for a reason unrelated to the rule.
     * Asserting the status here means a seeding failure fails on arrival rather
     * than looking like the rule not firing — which is what happened first time.
     */
    expect(owed.some((i) => i.status !== "draft"), "the unpaid invoice is still a draft").toBe(true);

    expect(rulesFor(forCustomer(seeded.courtesyWhileUnpaid.customerId))).toContain(
      "courtesy-granted-while-unpaid",
    );
  });

  it("4. a courtesy end with no claim instant is caught, loudly", () => {
    const claim = snapshot.stripeCustomers.find(
      (c) => c.id === seeded.markerMissing.customerId,
    );
    expect(claim?.offerClaimedAt).toBeNull();
    expect(seenSubscription(seeded.markerMissing.subscriptionId)?.courtesyUntil).toBeTruthy();

    expect(rulesFor(forCustomer(seeded.markerMissing.customerId))).toContain(
      "free-period-marker-missing",
    );
  });

  it("5. two billable subscriptions on one customer is caught", () => {
    const both = snapshot.subscriptions.filter(
      (s) => s.customerId === seeded.twoBillable.customerId,
    );
    expect(both.length).toBe(2);

    const found = forCustomer(seeded.twoBillable.customerId).filter(
      (f) => f.rule === "two-billable-subscriptions",
    );
    // Exactly ONE finding, not one per subscription.
    expect(found).toHaveLength(1);
  });

  it("6. a paying customer with no entitlement is caught", () => {
    const sub = seenSubscription(seeded.payingNoAccess.subscriptionId);
    expect(sub?.metadataUserId).toBe(seeded.payingNoAccess.userId);
    expect(
      snapshot.entitlements.filter((e) => e.userId === seeded.payingNoAccess.userId),
    ).toHaveLength(0);

    expect(rulesFor(forUser(seeded.payingNoAccess.userId))).toContain(
      "live-subscription-without-entitlement",
    );
  });

  it("7. access with nothing paying for it is caught", () => {
    const row = snapshot.entitlements.find(
      (e) => e.userId === seeded.accessNoSource.userId && e.source === "stripe",
    );
    expect(row?.isActive).toBe(true);

    expect(rulesFor(forUser(seeded.accessNoSource.userId))).toContain(
      "entitlement-without-source",
    );
  });

  it("8. a subscription on a price we no longer sell is caught", () => {
    const sub = seenSubscription(seeded.archivedPrice.subscriptionId);
    expect(sub?.priceIds).toContain(seeded.archivedPrice.priceId);
    expect(snapshot.activePriceIds).not.toContain(seeded.archivedPrice.priceId);

    expect(rulesFor(forCustomer(seeded.archivedPrice.customerId))).toContain(
      "subscription-on-archived-price",
    );
  });

  it("9. a zero-dollar invoice nobody granted is caught", () => {
    const invoice = snapshot.invoices.find((i) => i.id === seeded.zeroInvoice.invoiceId);
    expect(invoice, "the zero invoice never reached the sweep").toBeDefined();
    expect(invoice?.total).toBe(0);
    // Positively NOT a first trial: no subscription behind it at all.
    expect(invoice?.billingReason).not.toBe("subscription_create");

    expect(rulesFor(forCustomer(seeded.zeroInvoice.customerId))).toContain(
      "unexplained-zero-invoice",
    );
  });

  it("10. the two webhook states are caught SEPARATELY (§3.3)", () => {
    const seen = snapshot.unstampedWebhooks.filter((w) =>
      seededEventIds.includes(w.eventId),
    );
    expect(seen, "the seeded webhook rows were not read").toHaveLength(2);

    const unattributed = seen.find((w) => w.eventId === seeded.webhooks.unattributedId);
    const unprocessed = seen.find((w) => w.eventId === seeded.webhooks.unprocessedId);
    // Arrived: one really is unresolvable and the other really does resolve.
    expect(unattributed?.attributableToUserId).toBeNull();
    expect(unprocessed?.attributableToUserId).toBe(seeded.webhooks.userId);

    const rules = findings
      .filter((f) => f.evidence.some((e) => e.includes(TAG)))
      .map((f) => f.rule);
    expect(rules).toContain("webhook-unattributed");
    expect(rules).toContain("webhook-unprocessed");
  });
});

/* ── Step 5 ───────────────────────────────────────────────────────── */

guarded("Step 5 — the deliberate divergences produce NO finding", () => {
  /**
   * §3.4: "A disputed subscription with a deactivated entitlement is correct and
   * must not be reported. Asserting against Stripe's status instead would report a
   * false positive on every dispute."
   */
  it("a dispute with a deactivated entitlement produces nothing", () => {
    const row = snapshot.entitlements.find(
      (e) => e.userId === seeded.okDispute.userId && e.source === "stripe",
    );
    // Arrived: the entitlement really is revoked, not merely absent.
    expect(row).toBeDefined();
    expect(row?.isActive).toBe(false);

    expect(rulesFor(forUser(seeded.okDispute.userId))).toEqual([]);
    expect(rulesFor(forCustomer(seeded.okDispute.customerId))).toEqual([]);
  });

  it("a correctly marked grace-aligned subscription produces nothing", () => {
    const sub = seenSubscription(seeded.okGrace.subscriptionId);
    // Arrived: it really is trialing, really is marked, and the account really
    // holds the matching dated comp.
    expect(sub?.status).toBe("trialing");
    expect(sub?.graceUntil).toBeTruthy();
    expect(
      snapshot.entitlements.filter(
        (e) => e.source === "comp" && sameInstant(e.activeUntil, sub?.graceUntil),
      ).length,
      "no comp entitlement matches the grace marker — compare INSTANTS, not strings",
    ).toBeGreaterThan(0);

    expect(rulesFor(forCustomer(seeded.okGrace.customerId))).toEqual([]);
  });

  it("a courtesy month on a paid-up customer produces nothing", () => {
    const sub = seenSubscription(seeded.okCourtesy.subscriptionId);
    const claim = snapshot.stripeCustomers.find((c) => c.id === seeded.okCourtesy.customerId);
    // Arrived: Stripe reports it as `trialing` — which is exactly the collision
    // §3.4 is about — and both markers are present on the right objects.
    expect(sub?.status).toBe("trialing");
    expect(sub?.courtesyUntil).toBeTruthy();
    expect(claim?.offerClaimedAt).toBeTruthy();

    expect(rulesFor(forCustomer(seeded.okCourtesy.customerId))).toEqual([]);
  });

  it("all three wear `trialing` or its aftermath, and are held apart", () => {
    // The three-way case from §3.4, proven on REAL Stripe objects rather than
    // hand-written ones: a grace, a courtesy, and a dispute.
    const grace = seenSubscription(seeded.okGrace.subscriptionId);
    const courtesy = seenSubscription(seeded.okCourtesy.subscriptionId);
    expect(grace?.graceUntil).toBeTruthy();
    expect(grace?.courtesyUntil).toBeNull();
    expect(courtesy?.courtesyUntil).toBeTruthy();
    expect(courtesy?.graceUntil).toBeNull();
  });
});
