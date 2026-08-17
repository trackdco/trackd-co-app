import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  Ledger,
  PushSink,
  TestClock,
  admin,
  atLocalTime,
  earlierThan,
  fireReminder,
  registerPush,
  sameInstant,
  seedAccount,
  stripe,
  stripeBudgetAvailable,
} from "./core";

/**
 * ⚠️ PAIR 2'S RELEASE CONDITION — `07` STEP 6 AND `04` STEP 11'S REMINDER LEG.
 *
 *   HARNESS_ALLOW_STRIPE=1 npx vitest run \
 *     --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/promise.scenario.ts --reporter=verbose
 *
 * `07` §0: "The release condition is a reminder VERIFIABLY firing before a
 * courtesy charge, proven on a Stripe test clock. Not a code path that looks
 * right. Not a test that passes. **An observed notification, before an observed
 * charge, with time fast-forwarded.**"
 *
 * And `07` §5: "Until it is observed, the flag stays unset and both promise
 * strings stay withheld together." So this file is what releases
 * `REMINDER_PROMISE_ENABLED`, and nothing else is.
 *
 * ## Why this is a separate file from `steps.scenario.ts`
 *
 * `steps.scenario.ts` holds sixteen `it.todo`s across `04`'s Steps 9, 10 and 11.
 * This is the ONE of them that gates a shipping decision, so it is driven on its
 * own where a failure in the other fifteen cannot mask it and vice versa.
 *
 * ## What is REAL here and what is not
 *
 * Real: the Stripe customer, the card, the subscription, the test clock, the
 * cancellation, the save-offer grant through `grantExtraTime` (the same function
 * the server action calls), the invoice Stripe raises and pays, and the web-push
 * bytes leaving the server under a valid VAPID signature.
 *
 * Not real: the WEBHOOK. There is no tunnel from Stripe to this laptop, so
 * `syncSubscription` is called directly with the live Stripe object — which is
 * what the webhook does with it, and is also what `05` §3.7 records the offer
 * claim itself doing ("calls the sync directly rather than waiting for the
 * webhook"). The mirror is therefore written from a real Stripe object, which is
 * the property `07` §3.8 actually depends on.
 *
 * Safety: one `@trackd-qa.invalid` account, ledgered, deleted BY ID, Stripe torn
 * down FIRST.
 */

const ledger = new Ledger();
const sink = new PushSink();
const guarded = describe.skipIf(!stripeBudgetAvailable());

/** Weekly, so the courtesy grant is a WEEK and the clock has less to travel. */
const PRICE = process.env.STRIPE_PRICE_WEEKLY ?? "";

beforeAll(async () => {
  await sink.start();
}, 120_000);

afterAll(async () => {
  await ledger.teardown();
  await sink.stop();
}, 300_000);

guarded("07 Step 6 / 04 Step 11 — the reminder fires BEFORE the courtesy charge", () => {
  it("observed, on a test clock, in that order", async () => {
    expect(PRICE, "STRIPE_PRICE_WEEKLY is not set; nothing below can run").not.toBe("");

    const { grantExtraTime, markOfferShown } = await import("@/lib/billing/saveOffer");
    const { syncSubscription } = await import("@/lib/billing/sync");

    /* ── the account, and the Stripe side pinned to a clock ─────────────── */
    const account = await seedAccount(ledger, "p2release", { notificationsEnabled: true });
    const clock = new TestClock(ledger);
    const t0 = new Date();
    await clock.create(t0);
    const customerId = await clock.customer(account.email);

    // `resolveUserId` reads this mapping. The real app writes it at checkout.
    const { error: mapErr } = await admin.from("billing_customers").insert({
      user_id: account.id,
      stripe_customer_id: customerId,
      trial_lock_until: new Date(0).toISOString(),
    });
    if (mapErr) throw new Error(`billing_customers: ${mapErr.message}`);

    /* ── a trialing subscription, the way checkout makes one ────────────── */
    const trialEndSec = Math.floor(t0.getTime() / 1000) + 7 * 86_400;
    let sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: PRICE }],
      trial_end: trialEndSec,
      metadata: { user_id: account.id },
    });
    await syncSubscription(sub);

    /* ── ⚠️ ARRIVAL 1: the mirror holds the ORIGINAL trial end ──────────── */
    const originalEnd = new Date(trialEndSec * 1000).toISOString();
    const mirror0 = await admin
      .from("subscriptions")
      .select("status, trial_ends_at, courtesy_until")
      .eq("user_id", account.id)
      .maybeSingle();
    expect(mirror0.data?.status, "the mirror was not written from the live object").toBe("trialing");
    expect(sameInstant(mirror0.data?.trial_ends_at as string, originalEnd)).toBe(true);
    expect(
      mirror0.data?.courtesy_until,
      "a courtesy marker exists before any courtesy was granted",
    ).toBeNull();

    /* ── cancel, then the offer, then the grant ─────────────────────────── */
    sub = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
    expect(sub.cancel_at_period_end, "the cancellation did not take").toBe(true);

    await markOfferShown(customerId, new Date().toISOString());
    sub = await stripe.subscriptions.retrieve(sub.id);

    const grant = await grantExtraTime(account.id, customerId, sub);
    console.log(`  grant: ${JSON.stringify(grant)}`);
    /* ── ⚠️ ARRIVAL 2: the courtesy period really was granted ───────────── */
    expect(grant.ok, `the grant was refused (${JSON.stringify(grant)}) — nothing below is reachable`).toBe(true);

    sub = await stripe.subscriptions.retrieve(sub.id);
    await syncSubscription(sub);

    const movedEnd = new Date((sub.trial_end ?? 0) * 1000).toISOString();
    console.log(`  original end: ${originalEnd}\n  moved end:    ${movedEnd}`);
    expect(
      earlierThan(originalEnd, movedEnd),
      "the grant did not move the end date, so there is no courtesy period",
    ).toBe(true);

    /* ── ⚠️ ARRIVAL 3: the mirror moved with it, and knows it is courtesy ── */
    const mirror1 = await admin
      .from("subscriptions")
      .select("trial_ends_at, courtesy_until, cancel_at_period_end")
      .eq("user_id", account.id)
      .maybeSingle();
    expect(sameInstant(mirror1.data?.trial_ends_at as string, movedEnd)).toBe(true);
    /**
     * ⚠️ THE DISCRIMINATOR THE COPY BRANCHES ON. Without it, `resolveEnding`
     * cannot tell a courtesy month from a first trial and a two-year customer
     * reads "Your free trial ends" — which is what `003` exists to prevent.
     */
    expect(
      mirror1.data?.courtesy_until,
      "courtesy_until did not mirror, so the reminder would use TRIAL wording",
    ).not.toBeNull();
    /** `04`'s cancel-first ordering: the grant LIFTS the cancellation. */
    expect(mirror1.data?.cancel_at_period_end, "the cancellation was not lifted").toBe(false);

    /* ── THE REMINDER, at the promised day before the moved ending ──────── */
    await registerPush(account.id, sink.url);
    const reminderAt = atLocalTime(movedEnd, 2);
    const out = await fireReminder(account.id, reminderAt, sink);
    console.log(`  reminder at ${reminderAt.toISOString()}: ${JSON.stringify(out)}`);

    expect(out.delivered, "NO REMINDER FIRED — the promise on the offer screen is unkept").toBeGreaterThan(0);
    expect(out.stampAfter).not.toBeNull();

    /* ── THE CHARGE. Fast-forward past the courtesy period. ─────────────── */
    const afterEnd = new Date(Date.parse(movedEnd) + 2 * 3_600_000);
    await clock.advanceTo(afterEnd);

    // Poll for the paid invoice rather than trusting one settle. `networkidle`
    // has no equivalent here and Stripe finalises asynchronously.
    let paid: { id: string; paidAt: string } | null = null;
    for (let i = 0; i < 30 && !paid; i += 1) {
      const invoices = await stripe.invoices.list({ customer: customerId, status: "paid", limit: 10 });
      const inv = invoices.data.find((x) => (x.status_transitions?.paid_at ?? 0) > 0);
      if (inv) {
        paid = {
          id: inv.id as string,
          paidAt: new Date((inv.status_transitions!.paid_at as number) * 1000).toISOString(),
        };
        break;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }

    /* ── ⚠️ ARRIVAL 4: a charge actually happened ───────────────────────── */
    expect(paid, "no invoice was ever paid, so 'before the charge' compares against nothing").not.toBeNull();
    console.log(`  charge: invoice ${paid!.id} paid at ${paid!.paidAt}`);

    /**
     * ⚠️ THE RELEASE CONDITION, AND THE WHOLE POINT OF THE FILE.
     *
     * An observed notification, before an observed charge, with time fast
     * forwarded. Compared as INSTANTS, because Postgres and Stripe and JS all
     * spell the same moment differently.
     */
    expect(
      earlierThan(reminderAt.toISOString(), paid!.paidAt),
      `the reminder did NOT precede the charge (reminder ${reminderAt.toISOString()}, charge ${paid!.paidAt})`,
    ).toBe(true);

    /**
     * ⚠️ AND NOTHING WAS TAKEN INSIDE THE COURTESY PERIOD. "We'll remind you
     * first" is broken just as badly by a charge that lands early as by a
     * reminder that never fires.
     */
    expect(
      earlierThan(movedEnd, paid!.paidAt) || sameInstant(movedEnd, paid!.paidAt),
      `money moved BEFORE the courtesy period ended (ends ${movedEnd}, charged ${paid!.paidAt})`,
    ).toBe(true);
  }, 900_000);
});
