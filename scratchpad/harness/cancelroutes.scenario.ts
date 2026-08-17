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
});
