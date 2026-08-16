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
  atLocalTime,
  fireReminder,
  readOfferMarkers,
  seedAccount,
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

  it.todo("claim at nine minutes is granted");
  it.todo("claim at eleven minutes is refused, with D23's expired string and no retry invitation");
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

  it.todo("trial: cancel -> offer -> accept -> the cancellation is LIFTED");
  it.todo("the granted date the dialog named is the date Stripe actually charges on");
  it.todo("[needs 07] a reminder fires before the courtesy charge, against the MOVED end");
  it.todo("after the courtesy charge, cancelling again offers nothing");
});

guarded("Step 11 — paid lifecycle, and the yearly plan specifically", () => {
  /**
   * ⚠️ A YEARLY SUBSCRIBER NEVER GETS A FREE YEAR. There is no arithmetic that
   * could produce one — yearly maps to MONTH — and this is the assertion that
   * pins the $69.99 giveaway shut. It is checked on the granted `trial_end`, not
   * on the copy: the words could be right while the grant is wrong.
   */
  it.todo("paid: cancel -> offer -> accept -> one period, capped at a month");
  it.todo("⚠️ yearly grants a MONTH and never a year, asserted on the granted trial_end");
  it.todo("a month is a calendar month in UTC, clamped to the target month's last day");
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
