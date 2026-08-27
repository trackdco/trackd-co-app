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

  /**
   * ⚠️ STEP 6'S SECOND LEG: A PLAIN TRIAL ENDING AND CONVERTING.
   *
   * Step 6 asks for the lifecycle TWICE — "Once for a trial ending and
   * converting. Once for a courtesy period ending and charging." The first leg
   * above is the courtesy one. This is the other, and it is not a weaker copy of
   * it: no cancellation, no offer, no grant, no `courtesy_until`. A first-time
   * trialist converting is the ordinary path most users take, and the reminder
   * that precedes it is the one `07` §3.5 derives from the trial length.
   *
   * Kept as its own clock and its own customer so a failure in either leg cannot
   * be read as a failure of the other.
   */
  it("second leg — a plain trial converts, and the reminder precedes that charge too", async () => {
    expect(PRICE, "STRIPE_PRICE_WEEKLY is not set; nothing below can run").not.toBe("");

    const { syncSubscription } = await import("@/lib/billing/sync");

    const account = await seedAccount(ledger, "p2trial", { notificationsEnabled: true });
    const clock = new TestClock(ledger);
    const t0 = new Date();
    await clock.create(t0);
    const customerId = await clock.customer(account.email);

    const { error: mapErr } = await admin.from("billing_customers").insert({
      user_id: account.id,
      stripe_customer_id: customerId,
      trial_lock_until: new Date(0).toISOString(),
    });
    if (mapErr) throw new Error(`billing_customers: ${mapErr.message}`);

    const trialEndSec = Math.floor(t0.getTime() / 1000) + 7 * 86_400;
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: PRICE }],
      trial_end: trialEndSec,
      metadata: { user_id: account.id },
    });
    await syncSubscription(sub);

    const trialEnd = new Date(trialEndSec * 1000).toISOString();

    /* ── ⚠️ ARRIVAL: a real trial, and NOT a courtesy period ──────────── */
    const mirror = await admin
      .from("subscriptions")
      .select("status, trial_ends_at, courtesy_until, cancel_at_period_end")
      .eq("user_id", account.id)
      .maybeSingle();
    expect(mirror.data?.status).toBe("trialing");
    expect(sameInstant(mirror.data?.trial_ends_at as string, trialEnd)).toBe(true);
    expect(mirror.data?.cancel_at_period_end).toBe(false);
    /**
     * ⚠️ THE DISCRIMINATOR MUST BE ABSENT HERE, and that is the whole difference
     * between the two legs. Null means `resolveEnding` picks the TRIAL wording,
     * which is correct for this person and a lie to the one in the leg above.
     */
    expect(
      mirror.data?.courtesy_until,
      "a courtesy marker on a first trial would give this person the wrong wording",
    ).toBeNull();

    /* ── the reminder, two days before the trial ends ─────────────────── */
    await registerPush(account.id, sink.url);
    const reminderAt = atLocalTime(trialEnd, 2);
    const out = await fireReminder(account.id, reminderAt, sink);
    console.log(`  trial reminder at ${reminderAt.toISOString()}: ${JSON.stringify(out)}`);
    expect(out.delivered, "no reminder before a trial converted to a charge").toBeGreaterThan(0);
    expect(out.stampAfter).not.toBeNull();

    /* ── the conversion ──────────────────────────────────────────────── */
    await clock.advanceTo(new Date(Date.parse(trialEnd) + 2 * 3_600_000));

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

    expect(paid, "the trial never converted, so there is no charge to precede").not.toBeNull();
    console.log(`  conversion: invoice ${paid!.id} paid at ${paid!.paidAt}`);

    expect(
      earlierThan(reminderAt.toISOString(), paid!.paidAt),
      `the reminder did NOT precede the conversion (reminder ${reminderAt.toISOString()}, charge ${paid!.paidAt})`,
    ).toBe(true);
    expect(
      earlierThan(trialEnd, paid!.paidAt) || sameInstant(trialEnd, paid!.paidAt),
      `money moved BEFORE the trial ended (ends ${trialEnd}, charged ${paid!.paidAt})`,
    ).toBe(true);
  }, 900_000);
});

/* ══════════════════════════════════════════════════════════════════════════
   07 STEP 7 — Q79, BY OBSERVATION
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * `07` Step 7: "record whether Stripe's own trial-ending email fires for a moved
 * trial end, and what it does when the period is seven days or shorter", handed
 * to `12` for the dashboard decision (D34).
 *
 * ## ⚠️ WHAT IS AND IS NOT OBSERVABLE, STATED BEFORE THE RESULT
 *
 * **Stripe exposes no API for "was an email sent."** There is no endpoint listing
 * delivered customer emails, and test mode does not deliver them anywhere a
 * harness can read. So the literal question cannot be answered by driving, and
 * pretending otherwise would be the worst outcome here — `07` §3.6 already says
 * the email "is explicitly not the backstop", and a false reassurance about it is
 * exactly what would make somebody treat it as one.
 *
 * **What IS observable is the trigger.** Stripe's trial-ending email is scheduled
 * off the same internal deadline that raises
 * `customer.subscription.trial_will_end`, so the event's timing bounds the
 * email's. That is measurable on a test clock, per subscription, and it is what
 * `12`'s dashboard decision actually turns on: whether the lead time can land
 * BEFORE or AT the moment it is warning about.
 *
 * So this records the event, and reports the email as a dashboard check `12` must
 * make by eye. Named as a gap rather than left to look like an answer.
 */
guarded("07 Step 7 — Q79: what Stripe's own trial reminder does to a short and a moved trial", () => {
  it("records the trial_will_end timing for a 7-day trial, and after the end is moved", async () => {
    expect(PRICE, "STRIPE_PRICE_WEEKLY is not set; nothing below can run").not.toBe("");

    const account = await seedAccount(ledger, "q79", { notificationsEnabled: false });
    const clock = new TestClock(ledger);
    const t0 = new Date();
    await clock.create(t0);
    const customerId = await clock.customer(account.email);

    /** Every `trial_will_end` Stripe has raised for this subscription, in order. */
    const trialWillEnd = async (subId: string) => {
      const events = await stripe.events.list({
        type: "customer.subscription.trial_will_end",
        limit: 100,
      });
      return events.data
        .filter((e) => (e.data.object as { id?: string }).id === subId)
        .map((e) => new Date(e.created * 1000).toISOString())
        .sort();
    };

    /* ── a SEVEN-DAY trial, which is the case Q79 is about ────────────── */
    const trialEndSec = Math.floor(t0.getTime() / 1000) + 7 * 86_400;
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: PRICE }],
      trial_end: trialEndSec,
      metadata: { user_id: account.id },
    });
    const originalEnd = new Date(trialEndSec * 1000).toISOString();

    /* ── ⚠️ ARRIVAL: nothing has fired yet, so anything later is caused ── */
    const before = await trialWillEnd(sub.id);
    expect(before, "trial_will_end had already fired before the clock moved").toEqual([]);

    /**
     * ⚠️ THE LEAD TIME IS MEASURED BY WALKING THE CLOCK, NOT BY READING
     * `event.created`. THE FIRST VERSION OF THIS TEST GOT IT WRONG.
     *
     * It advanced straight to the ending and then computed
     * `trial_end - event.created`, reporting a 7-day trial as a 168-hour lead and
     * a moved one as 336 hours. Both numbers were artifacts: the two events were
     * stamped SIX SECONDS APART in real time while their simulated positions were
     * a week apart, so `created` is wall-clock and the subtraction was measuring
     * "the ending minus the moment the test ran".
     *
     * A number that looks like an answer and is not one is worse here than no
     * number, because `12`'s dashboard decision would have been made on it.
     *
     * So the clock is walked a DAY AT A TIME and the event is looked for after
     * each step. The first step at which it appears IS the simulated firing
     * moment, to within a day, and it needs no interpretation of any timestamp.
     */
    const DAY = 86_400_000;
    async function firstDayItFires(endIso: string, alreadySeen: string[]): Promise<number | null> {
      const endMs = Date.parse(endIso);
      for (let day = 1; day <= 7; day += 1) {
        const at = new Date(Date.parse(t0.toISOString()) + day * DAY);
        if (at.getTime() >= endMs) break; // do not cross the ending itself
        await clock.advanceTo(at);
        const seen = (await trialWillEnd(sub.id)).filter((e) => !alreadySeen.includes(e));
        if (seen.length > 0) {
          return Math.round((endMs - at.getTime()) / DAY);
        }
      }
      return null;
    }

    console.log(`  Q79 / 7-day trial, created ${t0.toISOString()}, ends ${originalEnd}`);
    const firstLeadDays = await firstDayItFires(originalEnd, []);
    console.log(
      `  Q79 / trial_will_end first observed with ~${firstLeadDays ?? "never (inside 1 day of the end)"} DAYS left`,
    );

    // Finish the trial window so nothing is left pending, then move the end.
    await clock.advanceTo(new Date(Date.parse(originalEnd) - 3_600_000));
    const seenBeforeMove = await trialWillEnd(sub.id);
    console.log(`  Q79 / firings during the original trial: ${seenBeforeMove.length}`);

    /* ── then MOVE the end forward and see whether it fires AGAIN ─────── */
    const movedEndSec = trialEndSec + 7 * 86_400;
    await stripe.subscriptions.update(sub.id, { trial_end: movedEndSec });
    const movedEnd = new Date(movedEndSec * 1000).toISOString();
    await clock.advanceTo(new Date(Date.parse(movedEnd) - 3_600_000));

    const afterMove = await trialWillEnd(sub.id);
    const fresh = afterMove.filter((e) => !seenBeforeMove.includes(e));
    console.log(`  Q79 / moved end ${movedEnd}`);
    console.log(`  Q79 / NEW firings after the move: ${fresh.length}`);

    /**
     * ⚠️ ONE ASSERTION ONLY, AND IT IS ABOUT THE OBSERVATION HAVING HAPPENED.
     *
     * Stripe's internal scheduling is not our property to pin — asserting a lead
     * time would fail on a Stripe change that is none of our business. What must
     * be asserted is that the clock really crossed both deadlines, so an empty
     * result cannot be misread as "Stripe fires nothing".
     */
    const finalClock = await stripe.testHelpers.testClocks.retrieve(clock.id);
    expect(
      finalClock.frozen_time,
      "the clock never reached the moved ending, so an empty result means nothing",
    ).toBeGreaterThan(movedEndSec - 7200);

    /**
     * ⚠️ THE FINDING THAT DOES NOT DEPEND ON ANY TIMESTAMP, and the one Q79
     * actually needs: a moved trial end raises the event again. That is what
     * decides whether Stripe's own email can arrive AFTER the thing it warns
     * about, which is D34's question.
     */
    console.log(
      `  Q79 / a moved trial end ${fresh.length > 0 ? "DOES" : "does NOT"} raise trial_will_end again`,
    );

    console.log(
      `  Q79 / ⚠️ THE EMAIL ITSELF IS NOT API-OBSERVABLE. Stripe exposes no ` +
        `endpoint for sent customer emails, so whether the dashboard's ` +
        `"7 days before trial end" reminder actually goes out — and what it does ` +
        `when the trial is 7 days or shorter — is a DASHBOARD CHECK for 12/D34. ` +
        `The event timings above bound when it could fire.`,
    );
  }, 900_000);
});
