/**
 * SPEC 04 STEPS 9, 10 AND 11 — jobs A, B and C.
 *
 * Run (morning, once the tree is clear):
 *   HARNESS_ALLOW_STRIPE=1 npx vitest run \
 *     --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/steps.scenario.ts
 *
 * ⚠️ EVERY BLOCK HERE IS GUARDED. With `HARNESS_ALLOW_STRIPE` unset the suites
 * skip rather than half-run, because each needs a real Stripe customer: the
 * once-ever offer's marker lives in Stripe CUSTOMER METADATA (`saveOffer.ts`), not
 * in Postgres, so "has this person been offered it?" cannot be asked of the mirror.
 *
 * What is NOT guarded, and already runs, is in `monday.scenario.ts`: the entire
 * reminder half needs no Stripe at all.
 *
 * ## The shape every scenario shares
 *
 *   1. `seedAccount` for the database side, ledgered.
 *   2. `TestClock` + `clock.customer()` for the Stripe side, ledgered.
 *   3. drive or call, then assert.
 *   4. `ledger.teardown()` in `afterAll` — Stripe first, accounts by id.
 *
 * Step 11's REMINDER leg is deliberately separable: `fireReminder` already works
 * standalone, so when `07` lands, that leg runs without rebuilding anything here.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  Ledger,
  PushSink,
  TestClock,
  admin,
  atLocalTime,
  earlierThan,
  fireReminder,
  readOfferMarkers,
  sameInstant,
  seedAccount,
  stripe,
  stripeBudgetAvailable,
} from "./core";

const ledger = new Ledger();
const sink = new PushSink();
const guarded = describe.skipIf(!stripeBudgetAvailable());

beforeAll(async () => { await sink.start(); });
afterAll(async () => { await ledger.teardown(); await sink.stop(); });

/* ═══════════════════ A. Step 9 — one offer per customer, ever ═══════════════════ */

guarded("Step 9 — the offer cannot be had twice, by any of four routes", () => {
  /**
   * ⚠️ ALL FOUR ROUTES REDUCE TO ONE ASSERTION, and that is the point of §3.3:
   * availability is decided by the SHOWN marker alone. So each route ends the
   * same way — `shownAt` is present, and it is the SAME VALUE it was after the
   * first cancellation. A route that produced a second, later `shownAt` would be
   * a second offer even if no extra time was ever granted.
   *
   * The one case that must NOT burn it is D70's: an unpaid period is refused
   * before the marker is written, so `shownAt` stays absent. That is the fifth
   * assertion below and it is the one a regression is most likely to break.
   */

  it.todo("route 1 — decline, then cancel again: no second offer, same shownAt");
  it.todo("route 2 — let it expire, then cancel again: no second offer, same shownAt");
  it.todo("route 3 — take it, resume, cancel again: no second offer, same shownAt");
  it.todo("route 4 — take it on a trial, then pay, then cancel: no second offer");

  it.todo(
    "⚠️ D70 — an unpaid period is refused WITHOUT burning it: shownAt absent, " +
      "and a later cancellation once the invoice is settled still offers",
  );

  /** The assertion body every route above shares, kept here so they cannot drift. */
  async function expectOfferNotReoffered(customerId: string, firstShownAt: string) {
    const after = await readOfferMarkers(customerId);
    expect(after.shownAt).toBe(firstShownAt);
  }
  void expectOfferNotReoffered;
});

/* ═══════════════════ B. Step 10 — the ten minutes ═══════════════════ */

guarded("Step 10 — the window is the server's, and the countdown only displays it", () => {
  /**
   * ⚠️ THE SERVER'S ANSWER GOVERNS IN EVERY CASE. The countdown anchors on the
   * server's `shownAt` and cursors on client time, so a skewed device shows a
   * wrong countdown and the server still enforces the real window: skew fast and
   * the button vanishes early, skew slow and the claim comes back refused. Both
   * are acceptable; the reverse would not be.
   *
   * Clock skew is applied in the BROWSER, not by moving the server, because that
   * is the actual failure being modelled. Playwright's `Clock` API installs a
   * fake clock before any script runs:
   *
   *     await context.clock.install({ time: new Date(Date.now() + 12 * 60_000) })
   *
   * The nine/eleven minute claims do NOT need a browser: they are the server
   * refusing, so they call the action's own path with a `shownAt` aged in Stripe
   * metadata. Cheaper, deterministic, and it tests the guard rather than the UI.
   */

  /**
   * ⚠️ THE WINDOW IS ENFORCED AGAINST THE REAL CLOCK, SO IT IS AGED IN METADATA.
   *
   * `offerStillOpen(shownAt)` compares against `Date.now()`
   * (`saveOffer.ts:295`), NOT against a Stripe test clock — a test clock moves
   * Stripe's time and this guard never asks Stripe what time it is. So the way
   * to sit at nine or eleven minutes is to write a `shownAt` that is already
   * nine or eleven minutes old, which needs no clock and no waiting.
   *
   * These two go through `grantExtraTime` — the same function the server action
   * calls — rather than through a browser, exactly as this file's header says
   * they should: "it tests the guard rather than the UI".
   */
  async function offerAgedBy(minutes: number) {
    const { grantExtraTime, markOfferShown } = await import("@/lib/billing/saveOffer");
    const account = await seedAccount(ledger, `s10-${minutes}m`, { notificationsEnabled: false });
    const clock = new TestClock(ledger);
    const t0 = new Date();
    await clock.create(t0);
    const customerId = await clock.customer(account.email);
    const { error } = await admin.from("billing_customers").insert({
      user_id: account.id,
      stripe_customer_id: customerId,
      trial_lock_until: new Date(0).toISOString(),
    });
    if (error) throw new Error(`billing_customers: ${error.message}`);

    let sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: process.env.STRIPE_PRICE_WEEKLY ?? "" }],
      trial_end: Math.floor(t0.getTime() / 1000) + 7 * 86_400,
      metadata: { user_id: account.id },
    });
    // ⚠️ The offer requires a LIVE cancellation (`saveOffer.ts:388`), so this is
    // a real one rather than a flag.
    sub = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });

    const shownAt = new Date(Date.now() - minutes * 60_000).toISOString();
    await markOfferShown(customerId, shownAt);
    sub = await stripe.subscriptions.retrieve(sub.id);

    /* ── ⚠️ ARRIVAL: cancelled, and the marker really holds the aged instant ── */
    expect(sub.cancel_at_period_end, "not cancelled, so the grant refuses for the WRONG reason").toBe(true);
    const marker = await readOfferMarkers(customerId);
    expect(marker.shownAt, "the aged shownAt did not persist to Stripe").toBe(shownAt);

    const result = await grantExtraTime(account.id, customerId, sub);
    return { result, customerId, shownAt, subId: sub.id };
  }

  it("claim at nine minutes is granted", async () => {
    const { result } = await offerAgedBy(9);
    console.log(`  9 minutes: ${JSON.stringify(result)}`);
    /**
     * ⚠️ THE CONTROL FOR THE ELEVEN-MINUTE TEST BELOW. A guard that refused
     * everything would pass that one perfectly, so the inside of the window has
     * to be shown to work first.
     */
    expect(result.ok, `nine minutes is INSIDE the window and was refused: ${JSON.stringify(result)}`).toBe(true);
  }, 600_000);

  it("claim at eleven minutes is refused as expired, and does not grant time", async () => {
    const { result, subId } = await offerAgedBy(11);
    console.log(`  11 minutes: ${JSON.stringify(result)}`);
    expect(result.ok).toBe(false);
    /**
     * ⚠️ THE REASON MATTERS, not just the refusal. `not-offered`, `not-cancelled`
     * and `already-claimed` are all refusals for reasons that have nothing to do
     * with the ten minutes — a scenario that accepted any of them would pass
     * while the window guard was broken.
     */
    expect(result.ok === false && result.reason, "refused, but not for being expired").toBe("expired");

    /**
     * ⚠️ AND ASSERT ON THE OBJECT, NOT THE RETURN VALUE. A refusal that still
     * moved `trial_end` is the failure worth catching, and `{ok:false}` says
     * nothing about it.
     */
    const after = await stripe.subscriptions.retrieve(subId);
    const original = Math.floor(Date.now() / 1000) + 7 * 86_400;
    expect(
      Math.abs((after.trial_end ?? 0) - original) < 600,
      `a refused claim still moved trial_end to ${after.trial_end}`,
    ).toBe(true);
    expect(after.cancel_at_period_end, "a refused claim lifted the cancellation").toBe(true);
  }, 600_000);

  it.todo("dismiss at two minutes, reopen at eight: the countdown CONTINUES, never restarts");
  it.todo("a tab left open past the window claims and is refused by the server");
  it.todo("a device clock skewed fast hides the button early; the server is unmoved");
  it.todo("a device clock skewed slow lets the claim through and the server refuses it");
});

/* ═══════════════════ C. Step 11 — the full lifecycle ═══════════════════ */

guarded("Step 11 — trial lifecycle on a test clock", () => {
  /**
   * Trial cancel, offer, accept, courtesy period, THE REMINDER, the charge, then
   * cancel again with no offer.
   *
   * ⚠️ THE REMINDER LEG IS SEPARABLE ON PURPOSE. It cannot complete until `07` is
   * built, and it must not block the rest. `fireReminder` needs only a mirror row
   * and an instant, so this leg is a call rather than a rebuild: when `07` lands,
   * un-skip it and the surrounding lifecycle is untouched.
   *
   * ⚠️ AND THE COURTESY PERIOD IS VERIFIED WITH `003` BOTH WAYS. The column now
   * exists, so the unapplied case can no longer be produced by driving. §5's box
   * is answered from spec 03's evidence instead — 42703 was probed throughout that
   * work — and NOT by faking it here. See the README.
   */

  /**
   * A trial, cancelled, offered and accepted — returning both the date the GRANT
   * reported and the Stripe objects, so the two can be compared.
   */
  async function trialOfferAccepted(tag: string) {
    const { grantExtraTime, markOfferShown } = await import("@/lib/billing/saveOffer");
    const account = await seedAccount(ledger, tag, { notificationsEnabled: false });
    const clock = new TestClock(ledger);
    const t0 = new Date();
    await clock.create(t0);
    const customerId = await clock.customer(account.email);
    const { error } = await admin.from("billing_customers").insert({
      user_id: account.id,
      stripe_customer_id: customerId,
      trial_lock_until: new Date(0).toISOString(),
    });
    if (error) throw new Error(`billing_customers: ${error.message}`);

    let sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: process.env.STRIPE_PRICE_WEEKLY ?? "" }],
      trial_end: Math.floor(t0.getTime() / 1000) + 7 * 86_400,
      metadata: { user_id: account.id },
    });
    sub = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
    expect(sub.cancel_at_period_end, "the cancellation did not take").toBe(true);

    await markOfferShown(customerId, new Date().toISOString());
    sub = await stripe.subscriptions.retrieve(sub.id);
    const result = await grantExtraTime(account.id, customerId, sub);
    expect(result.ok, `the grant was refused: ${JSON.stringify(result)}`).toBe(true);

    const after = await stripe.subscriptions.retrieve(sub.id);
    return { account, clock, customerId, sub: after, result, subId: sub.id };
  }

  it("trial: cancel -> offer -> accept -> the cancellation is LIFTED", async () => {
    const { sub, result } = await trialOfferAccepted("s11-lift");
    console.log(`  grant: ${JSON.stringify(result)}  cancel_at_period_end=${sub.cancel_at_period_end}`);
    /**
     * 04's cancel-first ordering, asserted on the retrieved object rather than on
     * the return value: the cancellation is REAL first, and accepting lifts it.
     */
    expect(sub.cancel_at_period_end, "the cancellation was not lifted by accepting").toBe(false);
    expect(sub.status).toBe("trialing");
  }, 600_000);

  it("the granted date the dialog named is the date Stripe actually charges on", async () => {
    const { clock, customerId, result, sub } = await trialOfferAccepted("s11-date");
    const named = result.ok === true ? result.endsOn : "";
    console.log(`  the grant NAMED: ${named}`);

    /* ── ⚠️ ARRIVAL: the named date is the subscription's own trial_end ─── */
    expect(
      sameInstant(named, new Date((sub.trial_end ?? 0) * 1000).toISOString()),
      `the named date ${named} is not the object's trial_end`,
    ).toBe(true);

    /* ── then let time run past it and see when money actually moves ───── */
    await clock.advanceTo(new Date(Date.parse(named) + 2 * 3_600_000));
    let paidAt: string | null = null;
    for (let i = 0; i < 30 && !paidAt; i += 1) {
      const invoices = await stripe.invoices.list({ customer: customerId, status: "paid", limit: 10 });
      const inv = invoices.data.find((x) => (x.status_transitions?.paid_at ?? 0) > 0);
      if (inv) paidAt = new Date((inv.status_transitions!.paid_at as number) * 1000).toISOString();
      else await new Promise((r) => setTimeout(r, 3000));
    }
    expect(paidAt, "nothing was ever charged, so there is no date to compare").not.toBeNull();
    console.log(`  Stripe CHARGED at: ${paidAt}`);

    /**
     * ⚠️ THE INVARIANT: "a screen never states a price, date or promise the
     * server would contradict." The dialog told somebody a date; this is the day
     * the money actually moved. Compared as INSTANTS, and allowed to be LATER but
     * never EARLIER — a charge before the named date is money taken after being
     * told it would not be, which is standing law 1.
     */
    expect(
      earlierThan(paidAt, named),
      `⚠️ CHARGED BEFORE THE DATE THE DIALOG NAMED (named ${named}, charged ${paidAt})`,
    ).toBe(false);
    const driftHours = Math.round((Date.parse(paidAt!) - Date.parse(named)) / 3_600_000);
    console.log(`  drift: +${driftHours}h (later is acceptable, earlier is not)`);
    expect(driftHours, `the charge landed ${driftHours}h after the named date`).toBeLessThan(49);
  }, 900_000);

  it.todo("[needs 07] a reminder fires before the courtesy charge, against the MOVED end — DONE in promise.scenario.ts");

  it("after the courtesy charge, cancelling again offers nothing", async () => {
    const { readSaveOffer } = await import("@/lib/billing/saveOffer");
    const { customerId } = await trialOfferAccepted("s11-once");

    /* ── ⚠️ ARRIVAL: the offer really was claimed ─────────────────────── */
    const markers = await readOfferMarkers(customerId);
    console.log(`  markers after the claim: ${JSON.stringify(markers)}`);
    expect(markers.shownAt, "no shown marker, so 'offered once' is untested").toBeTruthy();

    /**
     * ⚠️ ONCE EVER, AND IT IS THE *SHOWN* MARKER THAT DECIDES (§3.3). Availability
     * is not derived from whether time was granted — a customer who was shown the
     * offer and declined is equally out of offers. So this asserts the read the
     * cancel path actually performs.
     */
    const trialAgain = await readSaveOffer(customerId, "trial");
    const paidAgain = await readSaveOffer(customerId, "paid");
    console.log(`  readSaveOffer trial=${JSON.stringify(trialAgain)} paid=${JSON.stringify(paidAgain)}`);
    expect(trialAgain.available, "a second offer is available on the trial path").toBe(false);
    expect(paidAgain.available, "a second offer is available on the paid path").toBe(false);
    expect(trialAgain.kind, "a kind is still being handed out with no offer").toBeNull();
  }, 600_000);
});

guarded("Step 11 — paid lifecycle, and the yearly plan specifically", () => {
  /**
   * ⚠️ A YEARLY SUBSCRIBER NEVER GETS A FREE YEAR. There is no arithmetic that
   * could produce one — yearly maps to MONTH — and this is the assertion that
   * pins the $69.99 giveaway shut. It is checked on the granted `trial_end`, not
   * on the copy: the words could be right while the grant is wrong.
   */
  /**
   * Set up a PAID (not trialing) subscription on a plan, cancelled, offered, and
   * return what the grant did to it.
   *
   * ⚠️ IT MUST NOT BE `trialing`. `offerPeriodToGrant` short-circuits on
   * `status === "trialing"` and returns "week" (`saveOffer.ts:255`), so a trialing
   * yearly subscription would be granted a week and the yearly assertion below
   * would pass without ever exercising the yearly path. The clock is advanced past
   * the trial so the subscription is genuinely `active` and has genuinely paid.
   */
  async function paidOfferOn(priceEnv: string, tag: string) {
    const { grantExtraTime, markOfferShown } = await import("@/lib/billing/saveOffer");
    const price = process.env[priceEnv] ?? "";
    expect(price, `${priceEnv} is not set`).not.toBe("");

    const account = await seedAccount(ledger, tag, { notificationsEnabled: false });
    const clock = new TestClock(ledger);
    const t0 = new Date();
    await clock.create(t0);
    const customerId = await clock.customer(account.email);
    const { error } = await admin.from("billing_customers").insert({
      user_id: account.id,
      stripe_customer_id: customerId,
      trial_lock_until: new Date(0).toISOString(),
    });
    if (error) throw new Error(`billing_customers: ${error.message}`);

    // No trial at all: it charges immediately, so it is `active` and PAID.
    let sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price }],
      metadata: { user_id: account.id },
    });

    /* ── ⚠️ ARRIVAL: genuinely active and genuinely paid ──────────────── */
    sub = await stripe.subscriptions.retrieve(sub.id);
    expect(
      sub.status,
      `not active (${sub.status}) — a trialing sub is granted a WEEK and this test would pass vacuously`,
    ).toBe("active");

    const periodEndBefore = sub.items.data[0]?.current_period_end ?? 0;
    sub = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
    await markOfferShown(customerId, new Date().toISOString());
    sub = await stripe.subscriptions.retrieve(sub.id);

    const result = await grantExtraTime(account.id, customerId, sub);
    const after = await stripe.subscriptions.retrieve(sub.id);
    return { result, after, periodEndBefore, customerId, accountId: account.id };
  }

  it("paid: cancel -> offer -> accept -> one period, and the cancellation is LIFTED", async () => {
    const { result, after } = await paidOfferOn("STRIPE_PRICE_MONTHLY", "s11-paid");
    console.log(`  monthly paid grant: ${JSON.stringify(result)}`);
    expect(result.ok, `the grant was refused: ${JSON.stringify(result)}`).toBe(true);
    expect(result.ok === true && result.kind, "a paid subscription was treated as a trial").toBe("paid");
    // 04's cancel-first ordering: taking the offer LIFTS the cancellation.
    expect(after.cancel_at_period_end, "the cancellation was not lifted").toBe(false);
  }, 600_000);

  it("⚠️ yearly grants a MONTH and never a year, asserted on the granted trial_end", async () => {
    const { result, after, periodEndBefore } = await paidOfferOn("STRIPE_PRICE_YEARLY", "s11-yearly");
    console.log(`  YEARLY paid grant: ${JSON.stringify(result)}`);
    expect(result.ok, `the grant was refused: ${JSON.stringify(result)}`).toBe(true);

    /**
     * ⚠️ THIS IS THE ASSERTION THAT PINS THE $69.99 GIVEAWAY SHUT, and it is
     * checked on the GRANTED DATE rather than on the copy: the words could be
     * right while the grant is wrong, which is the only combination that costs
     * money.
     */
    const granted = after.trial_end ?? 0;
    const addedDays = Math.round((granted - periodEndBefore) / 86_400);
    console.log(
      `  period end ${new Date(periodEndBefore * 1000).toISOString()} -> trial_end ` +
        `${new Date(granted * 1000).toISOString()}  = +${addedDays} days`,
    );

    expect(addedDays, `a yearly subscriber was granted ${addedDays} days`).toBeGreaterThan(26);
    expect(
      addedDays,
      `⚠️ A YEARLY SUBSCRIBER WAS GRANTED ${addedDays} DAYS — this is the $69.99 giveaway`,
    ).toBeLessThan(32);
  }, 600_000);

  it("a month is a calendar month in UTC, clamped to the target month's last day", async () => {
    /**
     * ⚠️ THE PURE CLAMP IS ALREADY UNIT-TESTED (`saveOffer.test.ts:132`: 31 Jan ->
     * 28 Feb). What this adds is that the clamp REACHES STRIPE — a correct
     * `addOffer` whose result never lands on the subscription is a correct
     * function and a wrong charge date.
     *
     * The clock is frozen on **31 December** so the monthly period end falls on
     * **31 January**, which is the only anchor that can expose the rollover: plain
     * arithmetic turns 31 Jan into 3 March, and every other date on the account
     * falls on the 31st.
     */
    const { grantExtraTime, markOfferShown } = await import("@/lib/billing/saveOffer");
    const account = await seedAccount(ledger, "s11-clamp", { notificationsEnabled: false });
    const clock = new TestClock(ledger);
    const frozen = new Date("2026-12-31T09:00:00.000Z");
    await clock.create(frozen);
    const customerId = await clock.customer(account.email);
    const { error } = await admin.from("billing_customers").insert({
      user_id: account.id,
      stripe_customer_id: customerId,
      trial_lock_until: new Date(0).toISOString(),
    });
    if (error) throw new Error(`billing_customers: ${error.message}`);

    // Monthly, no trial, so it charges now and is genuinely `active` — which is
    // what makes `offerPeriodToGrant` answer "month" rather than "week".
    let sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: process.env.STRIPE_PRICE_MONTHLY ?? "" }],
      metadata: { user_id: account.id },
    });
    sub = await stripe.subscriptions.retrieve(sub.id);
    expect(sub.status, "not active, so this would be granted a WEEK and prove nothing").toBe("active");

    /* ── ⚠️ ARRIVAL: the period really ends on the 31st ───────────────── */
    const periodEnd = sub.items.data[0]?.current_period_end ?? 0;
    const periodEndIso = new Date(periodEnd * 1000).toISOString();
    console.log(`  frozen ${frozen.toISOString()} -> period end ${periodEndIso}`);
    expect(
      new Date(periodEnd * 1000).getUTCDate(),
      `the period ends on the ${new Date(periodEnd * 1000).getUTCDate()}, not the 31st — the clamp is not exercised`,
    ).toBe(31);

    sub = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
    await markOfferShown(customerId, new Date().toISOString());
    sub = await stripe.subscriptions.retrieve(sub.id);
    const result = await grantExtraTime(account.id, customerId, sub);
    expect(result.ok, `refused: ${JSON.stringify(result)}`).toBe(true);

    const after = await stripe.subscriptions.retrieve(sub.id);
    const granted = new Date((after.trial_end ?? 0) * 1000);
    console.log(`  GRANTED trial_end: ${granted.toISOString()}`);

    /**
     * ⚠️ 31 January + one month = 28 FEBRUARY, not 3 March. February 2027 has 28
     * days, so the clamp has to pull the date back to the month's last day.
     */
    expect(granted.getUTCFullYear()).toBe(2027);
    expect(granted.getUTCMonth(), `landed in month ${granted.getUTCMonth()} (0-based), not February`).toBe(1);
    expect(
      granted.getUTCDate(),
      `⚠️ ROLLED OVER: 31 Jan + a month became ${granted.toISOString()} instead of 28 Feb`,
    ).toBe(28);
    // The time of day survives; only the day number is clamped.
    expect(granted.getUTCHours()).toBe(9);
  }, 900_000);
});

/* ═══════════════════ a live, unguarded smoke check ═══════════════════ */

describe("harness self-check", () => {
  it("the push sink captures a real web-push delivery", async () => {
    // Proves the sink, the certificate, the VAPID keys and the runner's send path
    // are all wired, without which every reminder assertion above is meaningless.
    const trialEnd = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const user = await seedAccount(ledger, "selfcheck", { trialEndsAt: trialEnd, status: "trialing" });
    const { registerPush } = await import("./core");
    await registerPush(user.id, sink.url);

    const out = await fireReminder(user.id, atLocalTime(trialEnd, 2), sink);
    expect(out.delivered).toBeGreaterThan(0);
    expect(out.stampAfter).not.toBeNull();
  });

  it("refuses to touch Stripe when the budget guard is unset", async () => {
    if (stripeBudgetAvailable()) return; // the guard is deliberately open; nothing to assert
    await expect(readOfferMarkers("cus_nonexistent")).rejects.toThrow(/HARNESS_ALLOW_STRIPE/);
    await expect(new TestClock(ledger).create(new Date())).rejects.toThrow(/HARNESS_ALLOW_STRIPE/);
  });
});
