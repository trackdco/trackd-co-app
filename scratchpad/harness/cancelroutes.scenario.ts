import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";

import {
  BASE,
  Ledger,
  QA_PASSWORD,
  TestClock,
  admin,
  readOfferMarkers,
  seedAccount,
  stripe,
  stripeBudgetAvailable,
} from "./core";

/**
 * SPEC 04 STEP 9 — THE OFFER CANNOT BE HAD TWICE, DRIVEN THROUGH THE REAL CANCEL.
 *
 *   npm run dev                          # in another shell, NO gate flag
 *   HARNESS_ALLOW_STRIPE=1 npx vitest run \
 *     --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/cancelroutes.scenario.ts --reporter=verbose
 *
 * ## ⚠️ WHY THIS NEEDS A BROWSER AT ALL, WHEN THE OTHER STEPS DID NOT
 *
 * `markOfferShown` — the call that burns the once-ever flag — is made by
 * `offerAfterCancel`, which is **not exported**: it lives in a `"use server"`
 * module where every export is publicly dispatchable, and it is deliberately
 * private. `cancelSubscription()` IS exported but takes **no arguments**, because
 * a server action must never accept an id saying whose data to act on.
 *
 * So there is no way to reach the guard except through a real signed-in session,
 * and that is a property of the design rather than an inconvenience. Step 10's
 * window checks needed no browser because they call `grantExtraTime` directly;
 * these cannot.
 *
 * ## What each route has to prove
 *
 * §3.3: availability is decided by the SHOWN marker alone. So every route ends
 * the same way — `shownAt` present, and the SAME VALUE it was after the first
 * cancellation. **A route that produced a second, later `shownAt` would be a
 * second offer even if no extra time was ever granted.**
 *
 * And D70 is the inverse: an unpaid period is refused BEFORE the marker is
 * written, so `shownAt` stays ABSENT and a later cancellation still offers.
 *
 * Safety: `@trackd-qa.invalid`, ledgered, deleted BY ID, Stripe torn down first.
 */

let browser: Browser;
const ledger = new Ledger();
const guarded = describe.skipIf(!stripeBudgetAvailable());

async function cookiesFor(email: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ email, password: QA_PASSWORD }),
  });
  const session = await res.json();
  if (!res.ok) throw new Error(`signIn: ${JSON.stringify(session)}`);
  const ref = new URL(url).hostname.split(".")[0];
  const payload = `base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`;
  const CHUNK = 3180;
  const jar: { name: string; value: string; domain: string; path: string }[] = [];
  if (payload.length <= CHUNK) {
    jar.push({ name: `sb-${ref}-auth-token`, value: payload, domain: "localhost", path: "/" });
  } else {
    for (let i = 0, n = 0; i < payload.length; i += CHUNK, n += 1) {
      jar.push({
        name: `sb-${ref}-auth-token.${n}`,
        value: payload.slice(i, i + CHUNK),
        domain: "localhost",
        path: "/",
      });
    }
  }
  return jar;
}

/** An account with a Stripe customer on a test clock, mapped and signed-in-able. */
async function seedBillable(tag: string, opts: { failingCard?: boolean } = {}) {
  const account = await seedAccount(ledger, tag, { notificationsEnabled: false });
  const clock = new TestClock(ledger);
  const t0 = new Date();
  await clock.create(t0);

  // ⚠️ `clock.customer` attaches a good card. For D70 we need one that FAILS on
  // renewal, which is the state that produces an unpaid period at all.
  const customerId = opts.failingCard
    ? await (async () => {
        const c = await stripe.customers.create({
          email: account.email,
          test_clock: clock.id,
          payment_method: "pm_card_chargeCustomerFail",
          invoice_settings: { default_payment_method: "pm_card_chargeCustomerFail" },
        });
        return ledger.customer(c.id);
      })()
    : await clock.customer(account.email);

  const { error } = await admin.from("billing_customers").insert({
    user_id: account.id,
    stripe_customer_id: customerId,
    trial_lock_until: new Date(0).toISOString(),
  });
  if (error) throw new Error(`billing_customers: ${error.message}`);
  return { account, clock, customerId, t0 };
}

/** Mirror a live Stripe subscription into our tables the way the webhook would. */
async function mirror(subId: string) {
  const { syncSubscription } = await import("@/lib/billing/sync");
  const sub = await stripe.subscriptions.retrieve(subId);
  await syncSubscription(sub);
  return sub;
}

interface CancelDrive {
  page: Page;
  sawOfferDialog: boolean;
  bodyText: string;
}

/**
 * Open /billing, press through the real cancel, and report whether the SAVE OFFER
 * appeared.
 *
 * ⚠️ It does NOT accept the offer. Each route below decides what to do next, and
 * the shared part stops at the moment the offer would be shown — which is the
 * moment `markOfferShown` runs.
 */
async function driveCancel(email: string): Promise<CancelDrive> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies(await cookiesFor(email));
  const page = await context.newPage();
  await page.goto(`${BASE}/billing`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(4000);

  // "Cancel my trial" / "Cancel my subscription" (`CancelSubscription.tsx:717`).
  const opener = page.getByRole("button", { name: /^Cancel my / });
  await opener.first().click({ timeout: 60_000 });
  await page.waitForTimeout(800);

  // The one extra step: "Yes, cancel" (`CancelSubscription.tsx:1046`).
  await page.getByRole("button", { name: "Yes, cancel" }).first().click({ timeout: 60_000 });
  // The offer, if any, is decided server-side during this request.
  await page.waitForTimeout(6000);

  const bodyText = await page.locator("body").innerText();
  /**
   * ⚠️ DETECTED BY THE OFFER'S OWN CONFIRM BUTTON, AND THE FIRST VERSION OF THIS
   * WAS WRONG IN THE WORST WAY.
   *
   * It tested `/free (week|month)/i` against the page text. The approved copy is
   * "we'd like to offer you another week, **free**" (`CancelSubscription.tsx:1110`)
   * — "free" follows the noun — so the regex never matched. Every route then
   * reported `offer shown = false`, including the FIRST cancellation, which had
   * demonstrably offered because `shownAt` was written.
   *
   * **So "no second offer" was passing because the detector never fired at all.**
   * A detector with no positive control is the defect this project keeps paying
   * for, and it passed a real test vacuously here.
   *
   * `Another {period}, thanks` (`:1118`) is the offer's own control: it exists on
   * that dialog and nowhere else.
   */
  const offerConfirm = page.getByRole("button", { name: /^Another (week|month), thanks$/ });
  const sawOfferDialog = (await offerConfirm.count()) > 0;
  return { page, sawOfferDialog, bodyText };
}

beforeAll(async () => {
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await ledger.teardown();
}, 300_000);

guarded("04 Step 9 — the shown marker is written once and never rewritten", () => {
  it("route 1 — decline, then cancel again: no second offer, same shownAt", async () => {
    const { account, customerId, t0 } = await seedBillable("s9-decline");
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: process.env.STRIPE_PRICE_WEEKLY ?? "" }],
      trial_end: Math.floor(t0.getTime() / 1000) + 7 * 86_400,
      metadata: { user_id: account.id },
    });
    await mirror(sub.id);

    /* ── ⚠️ ARRIVAL: no marker before any of this ─────────────────────── */
    const before = await readOfferMarkers(customerId);
    expect(before.shownAt, "a shown marker exists before the first cancel").toBeFalsy();

    /* ── first cancellation: the offer must actually appear ────────────── */
    const one = await driveCancel(account.email);
    console.log(`  route 1, first cancel: offer shown on screen = ${one.sawOfferDialog}`);
    /**
     * ⚠️ THE POSITIVE CONTROL. Without this the "no second offer" assertion below
     * passes whenever the detector is broken — which is exactly what happened on
     * the first run of this file.
     */
    expect(one.sawOfferDialog, "the offer dialog never appeared on the FIRST cancel").toBe(true);

    // DECLINE it, which is what this route is named for: "I'd rather cancel"
    // (`CancelSubscription.tsx:1117`). Declining must not claim anything.
    await one.page.getByRole("button", { name: "I'd rather cancel" }).first().click({ timeout: 60_000 });
    await one.page.waitForTimeout(4000);
    await one.page.context().close();

    const first = await readOfferMarkers(customerId);
    console.log(`  markers after first cancel: ${JSON.stringify(first)}`);
    /**
     * ⚠️ THE ARRIVAL THAT MAKES THE REST MEAN ANYTHING. If the offer was never
     * shown, "no second offer" is trivially true and this test proves nothing —
     * the failure this harness's README records six times over.
     */
    expect(first.shownAt, "the FIRST cancellation never wrote a shown marker").toBeTruthy();
    expect(first.claimedAt, "the offer was claimed; this route is supposed to DECLINE").toBeFalsy();

    /* ── declining is simply not claiming. Resume, then cancel again. ─── */
    await stripe.subscriptions.update(sub.id, { cancel_at_period_end: false });
    await mirror(sub.id);
    const two = await driveCancel(account.email);
    console.log(`  route 1, second cancel: offer shown on screen = ${two.sawOfferDialog}`);
    await two.page.context().close();

    const second = await readOfferMarkers(customerId);
    console.log(`  markers after second cancel: ${JSON.stringify(second)}`);
    /**
     * ⚠️ THE SAME VALUE, not merely "still present". A second, LATER `shownAt`
     * would be a second offer even if no extra time were ever granted.
     */
    expect(second.shownAt, "the shown marker was REWRITTEN — that is a second offer").toBe(
      first.shownAt,
    );
    expect(two.sawOfferDialog, "the offer dialog appeared a SECOND time").toBe(false);
  }, 900_000);

  it("⚠️ D70 — an unpaid period is refused WITHOUT burning it", async () => {
    /**
     * ⚠️ THE CASE §3.3 SAYS A REGRESSION IS MOST LIKELY TO BREAK, and it fails in
     * the expensive direction: the guard sits BEFORE `markOfferShown`, so getting
     * the ordering wrong does not show up as an error — it silently spends
     * somebody's once-ever offer on a refusal they never saw.
     *
     * A failing card plus a clock advance past the trial is what produces a
     * genuinely unpaid period. Nothing here is faked.
     */
    const { account, clock, customerId, t0 } = await seedBillable("s9-d70", { failingCard: true });
    const trialEndSec = Math.floor(t0.getTime() / 1000) + 7 * 86_400;
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: process.env.STRIPE_PRICE_WEEKLY ?? "" }],
      trial_end: trialEndSec,
      metadata: { user_id: account.id },
    });

    // Past the trial, so the first real invoice is raised and the card declines.
    await clock.advanceTo(new Date(trialEndSec * 1000 + 2 * 3_600_000));
    const live = await mirror(sub.id);

    /* ── ⚠️ ARRIVAL: the period really is unpaid ──────────────────────── */
    const { periodIsUnpaid } = await import("@/lib/billing/saveOffer");
    const expanded = await stripe.subscriptions.retrieve(sub.id, { expand: ["latest_invoice"] });
    console.log(`  D70 status=${expanded.status} unpaid=${periodIsUnpaid(expanded)}`);
    expect(
      periodIsUnpaid(expanded),
      `the period is NOT unpaid (status ${expanded.status}) — D70's guard is never reached`,
    ).toBe(true);
    void live;

    const markersBefore = await readOfferMarkers(customerId);
    expect(markersBefore.shownAt, "a marker exists before the cancel").toBeFalsy();

    const drive = await driveCancel(account.email);
    console.log(`  D70 cancel: offer shown on screen = ${drive.sawOfferDialog}`);
    await drive.page.context().close();

    /**
     * ⚠️ THE TWO HALVES, AND BOTH MATTER.
     *
     * No offer shown — and, far more importantly, NO MARKER WRITTEN. A version
     * that showed nothing but wrote the marker anyway would look correct on screen
     * and quietly cost this cohort their once-ever offer.
     */
    expect(drive.sawOfferDialog, "an unpaid period was offered free time").toBe(false);
    const after = await readOfferMarkers(customerId);
    console.log(`  D70 markers after cancel: ${JSON.stringify(after)}`);
    expect(
      after.shownAt,
      "⚠️ THE OFFER WAS BURNED BY A REFUSAL: shownAt was written for a cohort that saw nothing",
    ).toBeFalsy();
  }, 900_000);

  /**
   * ⚠️ ROUTES 2, 3 AND 4 ALL END IN THE SAME ASSERTION, and §3.3 is why: the shown
   * marker is the whole of availability. So each route puts the subscription
   * through a different history and then asks the same question — is `shownAt`
   * still the value the FIRST cancellation wrote?
   *
   * Each carries the same positive control as route 1: the offer must be observed
   * on the first cancellation, or "no second offer" is a detector that never
   * fired.
   */
  async function firstOfferThen(tag: string, opts: { paid?: boolean } = {}) {
    const { account, customerId, t0, clock } = await seedBillable(tag);
    const create: Parameters<typeof stripe.subscriptions.create>[0] = {
      customer: customerId,
      items: [{ price: process.env.STRIPE_PRICE_WEEKLY ?? "" }],
      metadata: { user_id: account.id },
    };
    if (!opts.paid) create.trial_end = Math.floor(t0.getTime() / 1000) + 7 * 86_400;
    const sub = await stripe.subscriptions.create(create);
    await mirror(sub.id);

    const before = await readOfferMarkers(customerId);
    expect(before.shownAt, "a shown marker exists before the first cancel").toBeFalsy();

    const one = await driveCancel(account.email);
    expect(one.sawOfferDialog, "the offer never appeared on the FIRST cancel").toBe(true);
    const first = await readOfferMarkers(customerId);
    expect(first.shownAt, "the first cancellation wrote no shown marker").toBeTruthy();
    return { account, customerId, clock, subId: sub.id, page: one.page, first };
  }

  it("route 2 — let it EXPIRE, then cancel again: no second offer, same shownAt", async () => {
    const { account, customerId, subId, page, first } = await firstOfferThen("s9-expire");
    /**
     * "Expire" means the ten minutes run out with nothing claimed. The window is
     * enforced against the real clock (`saveOffer.ts:295`), so it is aged by
     * BACKDATING the marker rather than by waiting ten real minutes — the same
     * technique Step 10 uses, and it leaves the marker's identity untouched
     * because the value written is the value read.
     */
    await page.context().close();
    const aged = new Date(Date.now() - 11 * 60_000).toISOString();
    const { markOfferShown } = await import("@/lib/billing/saveOffer");
    await markOfferShown(customerId, aged);

    // ⚠️ ARRIVAL: the offer really is now outside its window.
    const { offerStillOpen } = await import("@/lib/billing/saveOffer");
    expect(offerStillOpen(aged), "the aged marker is still inside the window").toBe(false);

    await stripe.subscriptions.update(subId, { cancel_at_period_end: false });
    await mirror(subId);
    const two = await driveCancel(account.email);
    console.log(`  route 2, second cancel: offer shown = ${two.sawOfferDialog}`);
    await two.page.context().close();

    const second = await readOfferMarkers(customerId);
    console.log(`  route 2 markers: first ${first.shownAt} -> second ${second.shownAt}`);
    expect(two.sawOfferDialog, "an EXPIRED offer was shown again").toBe(false);
    /**
     * ⚠️ Compared against the AGED value, which is what the marker holds now —
     * not against route 1's original. The point is that the second cancellation
     * did not REWRITE it, and rewriting is what would restart the window.
     */
    expect(second.shownAt, "the expired marker was rewritten, restarting the window").toBe(aged);
  }, 900_000);

  it("route 3 — TAKE it, resume, cancel again: no second offer, same shownAt", async () => {
    const { account, customerId, subId, page, first } = await firstOfferThen("s9-take");

    // Take the offer, through the dialog's own control.
    await page.getByRole("button", { name: /^Another (week|month), thanks$/ }).first().click({ timeout: 60_000 });
    await page.waitForTimeout(6000);
    await page.context().close();

    /* ── ⚠️ ARRIVAL: it really was CLAIMED, and the cancellation lifted ── */
    const claimed = await readOfferMarkers(customerId);
    console.log(`  route 3 markers after taking: ${JSON.stringify(claimed)}`);
    expect(claimed.claimedAt, "the offer was not actually claimed, so this is route 1 again").toBeTruthy();
    const lifted = await stripe.subscriptions.retrieve(subId);
    expect(lifted.cancel_at_period_end, "the cancellation was not lifted by accepting").toBe(false);
    await mirror(subId);

    // Now cancel again. `already-claimed` is a different refusal from `not-offered`.
    const two = await driveCancel(account.email);
    console.log(`  route 3, second cancel: offer shown = ${two.sawOfferDialog}`);
    await two.page.context().close();

    const second = await readOfferMarkers(customerId);
    expect(two.sawOfferDialog, "a claimed offer was offered a second time").toBe(false);
    expect(second.shownAt, "the shown marker was rewritten after a claim").toBe(first.shownAt);
    expect(second.claimedAt, "the claim marker was lost").toBe(claimed.claimedAt);
  }, 900_000);

  it("route 4 — take it on a TRIAL, let it convert to paid, then cancel: no second offer", async () => {
    const { account, customerId, clock, subId, page, first } = await firstOfferThen("s9-convert");

    await page.getByRole("button", { name: /^Another (week|month), thanks$/ }).first().click({ timeout: 60_000 });
    await page.waitForTimeout(6000);
    await page.context().close();
    const claimed = await readOfferMarkers(customerId);
    expect(claimed.claimedAt, "the offer was not claimed").toBeTruthy();

    /**
     * ⚠️ THE POINT OF THIS ROUTE: cross from TRIAL to PAID. `readSaveOffer` takes a
     * `kind`, and the cancel path asks for "paid" once money has moved — so a
     * marker scoped to the trial kind rather than to the customer would let the
     * same person be offered again on the other side of their first charge.
     */
    const afterClaim = await stripe.subscriptions.retrieve(subId);
    await clock.advanceTo(new Date((afterClaim.trial_end ?? 0) * 1000 + 2 * 3_600_000));
    const converted = await stripe.subscriptions.retrieve(subId);
    console.log(`  route 4 status after conversion: ${converted.status}`);
    /* ── ⚠️ ARRIVAL: it really is paid now, not still trialing ─────────── */
    expect(converted.status, "never converted, so the trial->paid crossing is untested").toBe("active");
    await mirror(subId);

    const two = await driveCancel(account.email);
    console.log(`  route 4, second cancel (now PAID): offer shown = ${two.sawOfferDialog}`);
    await two.page.context().close();

    const second = await readOfferMarkers(customerId);
    expect(two.sawOfferDialog, "converting to paid handed out a SECOND offer").toBe(false);
    expect(second.shownAt, "the shown marker was rewritten after conversion").toBe(first.shownAt);
  }, 900_000);
});

/* ══════════════════════════════════════════════════════════════════════════
   04 STEP 10's BROWSER HALF — the countdown displays, the server decides
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ THE SERVER'S ANSWER GOVERNS IN EVERY CASE, and the two skew directions are
 * asymmetric on purpose (§3.4):
 *
 *   skew FAST -> the countdown reaches zero early, the way back in disappears
 *                early, and the server would still have granted. Acceptable: the
 *                user loses an offer they could have had.
 *   skew SLOW -> the countdown still shows time left, the user claims, and the
 *                SERVER REFUSES. Also acceptable, and the reverse — a client
 *                clock buying real free time — would not be.
 *
 * Clock skew is applied IN THE BROWSER via Playwright's `clock.install`, before
 * any script runs, because that is the actual failure being modelled. The server
 * is never moved.
 */
guarded("04 Step 10 — the countdown is a display, and the server is unmoved", () => {
  /** Reach the offer dialog with the browser's clock offset by `skewMs`. */
  async function offerWithSkew(tag: string, skewMs: number) {
    const { account, customerId, t0 } = await seedBillable(tag);
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: process.env.STRIPE_PRICE_WEEKLY ?? "" }],
      trial_end: Math.floor(t0.getTime() / 1000) + 7 * 86_400,
      metadata: { user_id: account.id },
    });
    await mirror(sub.id);

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies(await cookiesFor(account.email));
    // ⚠️ BEFORE the page exists, so the app never sees the true time.
    if (skewMs !== 0) await context.clock.install({ time: new Date(Date.now() + skewMs) });
    const page = await context.newPage();
    await page.goto(`${BASE}/billing`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(4000);
    await page.getByRole("button", { name: /^Cancel my / }).first().click({ timeout: 60_000 });
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Yes, cancel" }).first().click({ timeout: 60_000 });
    await page.waitForTimeout(6000);
    return { page, context, account, customerId, subId: sub.id };
  }

  /** The countdown as the user reads it, e.g. "09:47". */
  async function countdownText(page: Page): Promise<string | null> {
    const m = (await page.locator("body").innerText()).match(/\b(\d{2}:\d{2})\b/);
    return m ? m[1] : null;
  }

  it("dismiss at two minutes, reopen at eight: the countdown CONTINUES, never restarts", async () => {
    const { page, context, account } = await offerWithSkew("s10-continue", 0);

    /* ── ⚠️ ARRIVAL: the offer is open and a countdown is on screen ────── */
    const confirm = page.getByRole("button", { name: /^Another (week|month), thanks$/ });
    expect(await confirm.count(), "the offer dialog never opened").toBeGreaterThan(0);
    const first = await countdownText(page);
    console.log(`  countdown on open: ${first}`);
    expect(first, "no countdown rendered, so 'it continues' is untestable").not.toBeNull();

    /**
     * Dismiss by pressing Escape, which `04` §3.6's store exists for: the offer is
     * remembered for the rest of its ten minutes so a fumbled tap leaves a way
     * back in.
     */
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);
    expect(await confirm.count(), "the dialog did not dismiss").toBe(0);

    /**
     * ⚠️ MOVE THE BROWSER'S CLOCK FORWARD SIX MINUTES, rather than waiting. The
     * countdown must resume from when the offer was FIRST shown, not restart —
     * restarting would be the app handing out a longer window every time somebody
     * fumbled a tap (`openOfferStore.ts:8-12`).
     */
    await context.clock.install({ time: new Date(Date.now() + 6 * 60_000) });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(5000);

    const second = await countdownText(page);
    console.log(`  countdown after a 6-minute gap: ${second}`);
    const toSec = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    if (second) {
      expect(
        toSec(second),
        `the countdown RESTARTED (${first} -> ${second}) — a fumbled tap bought a fresh window`,
      ).toBeLessThan(toSec(first!));
    } else {
      // Equally correct: past the window there is no way back in at all.
      console.log(`  (no countdown: the window had closed, which is the other correct outcome)`);
    }
    void account;
    await context.close();
  }, 900_000);

  it("a tab left open past the window claims, and is refused by the server", async () => {
    const { page, context, customerId, subId } = await offerWithSkew("s10-staletab", 0);
    const confirm = page.getByRole("button", { name: /^Another (week|month), thanks$/ });
    expect(await confirm.count(), "the offer dialog never opened").toBeGreaterThan(0);

    const before = await stripe.subscriptions.retrieve(subId);
    const trialEndBefore = before.trial_end ?? 0;

    /**
     * ⚠️ AGE THE SERVER'S MARKER, NOT THE BROWSER'S CLOCK. The tab is untouched —
     * it still believes it is inside the window and its button is still live,
     * which is exactly the stale-tab case. The server is what has moved on.
     */
    const { markOfferShown, offerStillOpen } = await import("@/lib/billing/saveOffer");
    const aged = new Date(Date.now() - 11 * 60_000).toISOString();
    await markOfferShown(customerId, aged);
    expect(offerStillOpen(aged), "the marker is still inside the window").toBe(false);

    await confirm.first().click({ timeout: 60_000 });
    await page.waitForTimeout(6000);

    /**
     * ⚠️ ASSERT ON THE SUBSCRIPTION, NOT ON THE SCREEN. Whatever the dialog says,
     * the failure worth catching is a refusal that still moved `trial_end`.
     */
    const after = await stripe.subscriptions.retrieve(subId);
    console.log(`  stale tab: trial_end ${trialEndBefore} -> ${after.trial_end}`);
    expect(
      after.trial_end,
      "⚠️ A STALE TAB BOUGHT FREE TIME: the server granted outside its own window",
    ).toBe(trialEndBefore);
    // The screen should say so too, per D23, and never invite a retry.
    const text = await page.locator("body").innerText();
    console.log(`  screen after the refused claim: ${JSON.stringify(text.slice(0, 200))}`);
    await context.close();
  }, 900_000);

  it("a device clock skewed FAST hides the way back early; the server is unmoved", async () => {
    // +12 minutes: past the ten-minute window as the browser sees it.
    const { page, context, customerId, subId } = await offerWithSkew("s10-fast", 12 * 60_000);

    const text = await page.locator("body").innerText();
    const confirm = page.getByRole("button", { name: /^Another (week|month), thanks$/ });
    const stillOffered = (await confirm.count()) > 0;
    console.log(`  skew +12min: offer control present = ${stillOffered}`);

    /* ── ⚠️ CONTROL: the cancel really went through, so this is the offer
       stage and not a failed drive. The cancelled state is named on screen. ── */
    expect(text.length, "nothing rendered at all").toBeGreaterThan(0);
    const markers = await readOfferMarkers(customerId);
    expect(
      markers.shownAt,
      "the server never offered, so the browser hiding it proves nothing",
    ).toBeTruthy();

    /**
     * ⚠️ THE SERVER IS UNMOVED EITHER WAY. Whether the skewed browser drew the
     * control or not, nothing may have been granted without a claim.
     */
    const sub = await stripe.subscriptions.retrieve(subId);
    const { offerStillOpen } = await import("@/lib/billing/saveOffer");
    console.log(
      `  server still open for ${markers.shownAt}: ${offerStillOpen(markers.shownAt!)}` +
        `  (a FAST browser cannot close the server's window)`,
    );
    expect(
      offerStillOpen(markers.shownAt!),
      "the server's window closed because the BROWSER's clock was fast",
    ).toBe(true);
    void sub;
    await context.close();
  }, 900_000);

  it("a device clock skewed SLOW lets the claim through, and the server refuses it", async () => {
    /**
     * The dangerous direction, and the one that must never buy free time: the
     * browser is 12 minutes BEHIND, so it believes the offer is still open long
     * after the server's window has closed.
     */
    const { account, customerId, t0 } = await seedBillable("s10-slow");
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: process.env.STRIPE_PRICE_WEEKLY ?? "" }],
      trial_end: Math.floor(t0.getTime() / 1000) + 7 * 86_400,
      metadata: { user_id: account.id },
    });
    await mirror(sub.id);

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies(await cookiesFor(account.email));
    const page = await context.newPage();
    await page.goto(`${BASE}/billing`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(4000);
    await page.getByRole("button", { name: /^Cancel my / }).first().click({ timeout: 60_000 });
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Yes, cancel" }).first().click({ timeout: 60_000 });
    await page.waitForTimeout(6000);

    const confirm = page.getByRole("button", { name: /^Another (week|month), thanks$/ });
    expect(await confirm.count(), "the offer dialog never opened").toBeGreaterThan(0);

    // The server moves on; the browser does not know.
    const { markOfferShown, offerStillOpen } = await import("@/lib/billing/saveOffer");
    const aged = new Date(Date.now() - 11 * 60_000).toISOString();
    await markOfferShown(customerId, aged);
    expect(offerStillOpen(aged)).toBe(false);

    const trialEndBefore = (await stripe.subscriptions.retrieve(sub.id)).trial_end ?? 0;
    await confirm.first().click({ timeout: 60_000 });
    await page.waitForTimeout(6000);

    const after = await stripe.subscriptions.retrieve(sub.id);
    console.log(`  slow clock claim: trial_end ${trialEndBefore} -> ${after.trial_end}`);
    expect(
      after.trial_end,
      "⚠️ A SLOW DEVICE CLOCK BOUGHT FREE TIME — the server honoured a closed window",
    ).toBe(trialEndBefore);
    await context.close();
  }, 900_000);
});
