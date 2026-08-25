/**
 * ONE LIFETIME, PART THREE — the gate proof that was lost, and M1, measured.
 * GATE ON. Teardown lives here.
 *
 *   ./scratchpad/dev-gate-on.sh
 *   HARNESS_ALLOW_STRIPE=1 npx vitest run \
 *     --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/lifetimem1.scenario.ts --reporter=verbose
 *
 * ⚠️ STILL THE SAME LIFETIME. Same account, same customer, same clock. Leg 11 left
 * this person holding a live subscription bought after a lapse; this carries them
 * forward to ITS renewal and fails that one too, because M1 needs a past-due state
 * and the honest way to get one is to keep going rather than to seed it.
 *
 * ## Why M1 has to be re-measured at all
 *
 * The first attempt reported "NO — nothing was attempted within 180s". That answer
 * was VACUOUS and is discarded: its own ARRIVAL check recorded that the card was
 * never typed. Playwright had followed the portal's `payOpenInvoiceForSubscription`
 * branch, where the card form is behind another step, so nothing was updated and
 * "no retry happened" was a statement about a card that never changed.
 *
 * ⚠️ That is the exact failure this project already has a rule for — a control
 * that never fired reads as a passing measurement — and it is why the ARRIVAL is
 * asserted separately from the answer, and why the answer below is only allowed to
 * exist if the ARRIVAL held.
 *
 * Measured with `lifetime-portal-probe.mjs`: the portal's "Add payment method"
 * route lands on `/p/session/payment-methods`, where an
 * `elements-inner-payment-*` frame carries `[name="number"]`.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { afterAll, beforeAll, describe, it } from "vitest";

import { admin, Ledger, QA_PASSWORD, requireStripeBudget, seedAccount, stripe } from "./core";
import {
  BASE_URL,
  Checks,
  DAY_MS,
  drainEvents,
  dropRecordedUser,
  entitlementsFor,
  fillCardForm,
  loadState,
  readGateFromBilling,
  recordId,
  saveState,
  secondsToIso,
  waitForServer,
} from "./lifetime";

const TZ = "Australia/Sydney";
/** ⚠️ The PAN behind `pm_card_chargeCustomerFail`. Typed into Stripe's own page. */
const FAILING_PAN = "4000000000000341";

const c = new Checks();
const seenEvents = new Set<string>();
const observed: Record<string, unknown> = {};

let browser: Browser;
const state = loadState();
const run = {
  userId: state.userId ?? "",
  email: state.email ?? "",
  customerId: state.customerId ?? "",
  clockId: state.clockId ?? "",
  subId: state.resubId ?? "",
};

async function newContext(asEmail = run.email): Promise<{ context: BrowserContext; page: Page }> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: asEmail, password: QA_PASSWORD }),
    },
  );
  const session = await res.json();
  if (!res.ok) throw new Error(`sign in: ${JSON.stringify(session)}`);
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  const payload = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
  const CHUNK = 3180;
  const cookies: { name: string; value: string; domain: string; path: string }[] = [];
  if (payload.length <= CHUNK) {
    cookies.push({ name: `sb-${ref}-auth-token`, value: payload, domain: "localhost", path: "/" });
  } else {
    for (let i = 0, n = 0; i < payload.length; i += CHUNK, n += 1) {
      cookies.push({
        name: `sb-${ref}-auth-token.${n}`,
        value: payload.slice(i, i + CHUNK),
        domain: "localhost",
        path: "/",
      });
    }
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies(cookies);
  return { context, page: await context.newPage() };
}

async function billingTextFor(email = run.email): Promise<string> {
  const { context, page } = await newContext(email);
  try {
    await page.goto(`${BASE_URL}/billing`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=Access", { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    return await page.locator("body").innerText();
  } finally {
    await context.close();
  }
}

async function chargeIds(): Promise<string[]> {
  const list = await stripe.charges.list({ customer: run.customerId, limit: 100 });
  return list.data.map((ch) => ch.id);
}

async function openInvoice() {
  const list = await stripe.invoices.list({ customer: run.customerId, limit: 30 });
  return list.data.find((i) => i.status === "open") ?? null;
}

/** Advance to `target`, hopping if Stripe refuses the jump. */
async function advanceTo(target: number, hopDays = 14): Promise<void> {
  for (;;) {
    const clock = await stripe.testHelpers.testClocks.retrieve(run.clockId);
    if (clock.frozen_time >= target) return;
    const next = Math.min(target, clock.frozen_time + hopDays * 86_400);
    await stripe.testHelpers.testClocks.advance(run.clockId, { frozen_time: next });
    for (;;) {
      const ck = await stripe.testHelpers.testClocks.retrieve(run.clockId);
      if (ck.status === "ready") break;
      if (ck.status === "internal_failure") throw new Error("test clock failed");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

beforeAll(async () => {
  requireStripeBudget("the full-lifecycle run, part three");
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  saveState({ notes: { ...(state.notes ?? {}), ...(observed as Record<string, string>) } });
  // ⚠️ THROWS on any red, and on a run that recorded nothing. This used to
  // log the counts and return, so a leg could fail every assertion it made
  // and still be reported as a pass. See `Checks.assertAllPassed`.
  c.assertAllPassed("PART THREE");
  console.log(`\nM1: ${JSON.stringify(observed.M1, null, 2)}`);
});

describe("the gate proof, and M1", () => {
  it("PREFLIGHT: the gate is ON, proven on a control that holds no entitlement", async () => {
    c.at("PREFLIGHT (part three)");
    c.arrived("the dev server answers", await waitForServer(), BASE_URL);
    c.arrived("the lifetime handed over an account, a customer, a clock and a subscription",
      Boolean(run.userId && run.customerId && run.clockId && run.subId),
      `user=${run.userId} customer=${run.customerId} clock=${run.clockId} sub=${run.subId}`);

    /**
     * ⚠️ THE FLAG IS PROVEN ON A CONTROL, AND IT HAS TO BE.
     *
     * The lifetime account cannot prove it: it holds a live entitlement again after
     * leg 11, so its Access row reads "Pro" whether the gate is set or not. A
     * control holding NO entitlement is the shape part one measured reading "Pro"
     * with the gate OFF, so the same shape reading "Read only" here is the same
     * screen, the same row, the same cohort, the opposite server and the opposite
     * string. A restart is not evidence: `ps` shows argv, not env.
     *
     * ⚠️ LEDGERED IN THE SAME BREATH AS CREATED. The previous attempt put
     * `recordId` on the next line and `recordId` was not imported, so the throw
     * landed between the account existing and anything knowing about it, and it
     * survived the run with nothing to find it by. It had to be recovered from the
     * audit's own listing and deleted by id.
     */
    const control = await seedAccount(new Ledger(), "qa-life-gatecontrol", { timezone: TZ });
    recordId("users", control.id);
    let controlGate: boolean | null = null;
    try {
      const controlText = await billingTextFor(control.email);
      controlGate = readGateFromBilling(controlText);
      c.check("the control's billing screen rendered at all (its own 'Access' row)",
        controlGate !== null);
      c.check('⚠️ THE GATE IS ON: an account with NO entitlement reads "Read only"',
        controlGate === true,
        `control Access row says "${controlGate === true ? "Read only" : controlGate === false ? "Pro" : "?"}"; part one's same-shape account read "Pro" with the gate off`);
    } finally {
      const { error } = await admin.auth.admin.deleteUser(control.id);
      c.check("the gate control was dropped BY ID", !error, error?.message ?? control.id);
      if (!error) dropRecordedUser(control.id);
    }
    observed.gateOnProof = controlGate;
  }, 300_000);

  it("M1: does updating the card retry the outstanding invoice immediately?", async () => {
    c.at("M1 — CARD UPDATE AND THE OUTSTANDING INVOICE");
    if (!run.subId) return void c.arrived("leg 11 left a subscription to carry forward", false);

    let sub = await stripe.subscriptions.retrieve(run.subId, { expand: ["items"] });
    c.arrived("the subscription leg 11 bought is live",
      sub.status === "active", `status=${sub.status} id=${sub.id}`);

    /**
     * ⚠️ THE FAILING CARD GOES ON THE SUBSCRIPTION, not only the customer: a
     * subscription's own `default_payment_method` wins, and setting only the
     * customer's leaves the renewal PAID while the run reports "no failure".
     */
    const bad = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", {
      customer: run.customerId,
    });
    await stripe.customers.update(run.customerId, {
      invoice_settings: { default_payment_method: bad.id },
    });
    await stripe.subscriptions.update(run.subId, { default_payment_method: bad.id });
    sub = await stripe.subscriptions.retrieve(run.subId, { expand: ["items"] });
    c.arrived("the failing card is the SUBSCRIPTION's default",
      (sub.default_payment_method as string) === bad.id,
      `${sub.default_payment_method}`);

    const periodEnd =
      (sub.items.data[0] as unknown as { current_period_end?: number })?.current_period_end ?? 0;
    console.log(`  advancing to the renewal at ${secondsToIso(periodEnd)}…`);
    await advanceTo(periodEnd + 7200);
    await drainEvents(run.customerId, Date.now() - 600_000, seenEvents);

    sub = await stripe.subscriptions.retrieve(run.subId, { expand: ["items"] });
    c.arrived("⚠️ the renewal FAILED and the subscription is past_due again",
      sub.status === "past_due", `status=${sub.status}`);
    const invoice = await openInvoice();
    c.arrived("⚠️ there is an OPEN invoice, which is what M1 is about",
      Boolean(invoice), `${invoice?.id ?? "none"} attempts=${invoice?.attempt_count}`);
    if (!invoice) return;

    /**
     * ⚠️ THE GRACE, MEASURED A SECOND TIME ON A DIFFERENT INTERVAL. Leg 10 measured
     * zero days on a WEEKLY renewal. If it is zero here too, on a YEARLY one, the
     * cause is structural rather than anything to do with interval length.
     */
    const ent = await entitlementsFor(run.userId);
    const activeUntil = (ent.rows?.[0] as { active_until?: string })?.active_until ?? null;
    const lineStart = invoice.lines?.data?.[0]?.period?.start;
    const paidThrough = lineStart ? secondsToIso(lineStart) : null;
    const graceDays =
      activeUntil && paidThrough
        ? (Date.parse(activeUntil) - Date.parse(paidThrough)) / DAY_MS
        : null;
    observed.graceDaysYearly = graceDays;
    c.check("⚠️ the three-day grace is three days on a YEARLY renewal failure too",
      graceDays === 3,
      `measured ${graceDays} days: access ends ${activeUntil}, unpaid period began ${paidThrough}`);

    const attemptsBefore = invoice.attempt_count ?? 0;
    const chargesBefore = new Set(await chargeIds());
    const declaredBefore = invoice.next_payment_attempt
      ? secondsToIso(invoice.next_payment_attempt)
      : null;

    /* ── through the app's OWN portal path, with the clock HELD STILL ── */
    let reachedPortal = false;
    let cardUpdated = false;
    let portalPage: Page | null = null;
    const { context, page } = await newContext();
    try {
      await page.goto(`${BASE_URL}/billing/manage`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("text=Manage", { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const cardRow = page.locator("button", { hasText: /^Card$/ }).first();
      c.arrived('the "Card" row is on the Manage screen', (await cardRow.count()) > 0);
      if (await cardRow.count()) await cardRow.click().catch(() => {});
      await page.waitForTimeout(1200);
      const handoff = page.locator('[role="dialog"][aria-labelledby="handoff-title"]');
      c.arrived("D37: it routes through the handoff dialog, never straight to Stripe",
        (await handoff.count()) > 0);
      const go = handoff.locator("button", { hasText: /^Continue$/ }).first();
      if (await go.count()) {
        const popup = page.waitForEvent("popup", { timeout: 15_000 }).catch(() => null);
        await go.click().catch(() => {});
        const opened = await popup;
        if (opened) {
          await opened.waitForLoadState("domcontentloaded").catch(() => {});
          portalPage = opened;
        }
        await page.waitForTimeout(8000);
      }
      portalPage = portalPage ?? page;
      reachedPortal = /stripe\.com/.test(portalPage.url());
      c.arrived("the app's own portal path reached a Stripe-hosted page",
        reachedPortal, portalPage.url().slice(0, 100));

      if (reachedPortal) {
        /**
         * ⚠️ "Add payment method" IS THE ROUTE THAT HAS A CARD FORM ON IT.
         *
         * Measured with `lifetime-portal-probe.mjs`. The first attempt matched
         * /payment method|update|add/ and followed the portal's
         * `payOpenInvoiceForSubscription` branch instead, where the form sits
         * behind a further step — so nothing was typed and the measurement was
         * vacuous. The form is then an ordinary Elements frame carrying
         * `[name="number"]`, which `fillCardForm` finds by that field.
         */
        for (const attempt of [0, 1, 2]) {
          if (await fillCardForm(portalPage, FAILING_PAN, 8000)) {
            cardUpdated = true;
            break;
          }
          const add = portalPage
            .locator("a, button")
            .filter({ hasText: /add payment method|add a payment method|add card/i })
            .first();
          if (await add.count()) {
            console.log(`  clicking: "${(await add.textContent())?.trim()}" (attempt ${attempt + 1})`);
            await add.click().catch(() => {});
          } else {
            const anyUpdate = portalPage
              .locator("a, button")
              .filter({ hasText: /payment method|update card/i })
              .first();
            if (await anyUpdate.count()) await anyUpdate.click().catch(() => {});
          }
          await portalPage.waitForTimeout(4000);
        }
        c.arrived("⚠️ the new card was actually TYPED into Stripe's own hosted form",
          cardUpdated, cardUpdated ? "" : `stuck at ${portalPage.url().slice(0, 110)}`);
        if (cardUpdated) {
          const save = portalPage
            .locator("button")
            .filter({ hasText: /^(save|add|update|confirm)/i })
            .last();
          if (await save.count()) {
            console.log(`  saving: "${(await save.textContent())?.trim()}"`);
            await save.click().catch(() => {});
          }
          await portalPage.waitForTimeout(12_000);
          console.log(`  after saving: ${portalPage.url().slice(0, 110)}`);
        }
      }
    } finally {
      await context.close();
    }

    /**
     * ⚠️ THE CLOCK IS NOT TOUCHED FROM HERE TO THE END OF THE MEASUREMENT.
     * "Immediately" means without waiting for the next scheduled retry, so any
     * advance would make an immediate attempt indistinguishable from a due one.
     */
    /**
     * ⚠️ `attempt_count` CANNOT SEE AN EXPLICIT `invoices.pay`. RECORDED 20 Aug 2026.
     *
     * Stripe counts AUTOMATIC collection attempts in that field and does not
     * increment it for an explicit `invoices.pay` call. Measured on the Group B
     * drive (`scratchpad/final/drive-B-card.mjs`): an invoice moved `open -> paid`
     * with `amount_paid: 399` and a fourth charge on the customer, while
     * `attempt_count` read **1 -> 1** throughout.
     *
     * ⚠️ SO THE THIRD SIGNAL IN THE LOOP BELOW IS BLIND TO THE ONE THING THE APP
     * NOW DOES. Read alone it would report "no retry" on a retry that WORKED.
     *
     * ⚠️ AND M1'S CONCLUSION SURVIVES ANYWAY, ON TWO SIGNALS OUT OF THREE. Do not
     * re-open it as though it were unsound: the break condition below is
     * `fresh.length > 0 || attempts > attemptsBefore`, and `fresh` is the CHARGE
     * LIST, checked independently. `invoiceStatusAfter` is recorded separately
     * again. So M1's "NO" rested on no-new-charge AND invoice-still-open, both of
     * which are sound, and only the `attempts` half was reading a blind field.
     *
     * The rule for anything after this: count CHARGES and read the INVOICE STATUS.
     * Never `attempt_count` alone.
     */
    const started = Date.now();
    let sawAttempt: { fresh: string[]; attempts: number } | null = null;
    const deadline = started + 240_000;
    while (Date.now() < deadline) {
      const ids = await chargeIds();
      const fresh = ids.filter((id) => !chargesBefore.has(id));
      const inv = await stripe.invoices.retrieve(invoice.id!);
      const attempts = inv.attempt_count ?? attemptsBefore;
      if (fresh.length > 0 || attempts > attemptsBefore) {
        sawAttempt = { fresh, attempts };
        break;
      }
      await new Promise((r) => setTimeout(r, 10_000));
    }
    const elapsed = Math.round((Date.now() - started) / 1000);
    const invoiceAfter = await stripe.invoices.retrieve(invoice.id!);
    const subAfter = await stripe.subscriptions.retrieve(run.subId);
    const cardOnSub = await stripe.subscriptions.retrieve(run.subId);

    observed.M1 = {
      question: "does updating the card retry the outstanding invoice immediately?",
      method:
        "arrived at past_due on the same lifetime, updated the payment method through the app's OWN portal path (Manage > Card > handoff > Continue > Add payment method), then watched the open invoice's attempt_count and the customer's charge list for up to 240s of REAL time WITH THE TEST CLOCK HELD STILL, so nothing observed can be a scheduled retry",
      cardWasActuallyUpdated: cardUpdated,
      reachedPortal,
      attemptsBefore,
      attemptsAfter: invoiceAfter.attempt_count ?? null,
      newAttemptWithin240s: sawAttempt !== null,
      observedAfterSeconds: sawAttempt ? elapsed : null,
      invoiceStatusAfter: invoiceAfter.status,
      subscriptionStatusAfter: subAfter.status,
      subscriptionDefaultPmAfter: (cardOnSub.default_payment_method as string) ?? null,
      nextPaymentAttemptDeclaredBefore: declaredBefore,
      nextPaymentAttemptDeclaredAfter: invoiceAfter.next_payment_attempt
        ? secondsToIso(invoiceAfter.next_payment_attempt)
        : null,
      answer: !cardUpdated
        ? "NOT MEASURED — the card was never updated, so nothing below is an answer"
        : sawAttempt !== null
          ? `YES — the open invoice was attempted within ${elapsed}s of real time, with the clock held still`
          : "NO — no attempt in 240s of real time; the open invoice waits for Stripe's next scheduled retry",
    };
    console.log(`  M1: ${JSON.stringify(observed.M1, null, 2)}`);
    c.arrived("⚠️ M1 IS A MEASUREMENT: the card really was updated first",
      cardUpdated,
      cardUpdated ? "" : "without this the answer is vacuous and is reported as NOT MEASURED");
    c.check("M1 produced an answer either way", cardUpdated, String(observed.M1));
  }, 3_600_000);

  it("TEARDOWN: Stripe first, then the account, and the clock explicitly", async () => {
    c.at("TEARDOWN");
    /**
     * ⚠️ THE TEST CLOCK IS DELETED EXPLICITLY. Stripe KEEPS subscriptions and
     * invoices after a customer is deleted, so deleting only the customer leaves
     * this whole lifetime behind as permanent test-mode residue. Stripe is cleaned
     * BEFORE the account, because deleting the user cascades away
     * `billing_customers`, the only mapping back to the Stripe customer.
     *
     * Deletion is BY ID from the disk ledger, which is the same policy the rest of
     * this harness uses. Run out of process by `lifetimeteardown.mjs`, so a failure
     * here still leaves every id nameable.
     */
    const { execFileSync } = await import("node:child_process");
    let output = "";
    try {
      output = execFileSync("node", ["scratchpad/harness/lifetimeteardown.mjs"], {
        encoding: "utf8",
      });
      c.check("teardown deleted everything the ledger held", true, "");
    } catch (err) {
      output = String((err as { stdout?: string }).stdout ?? err);
      c.check("teardown deleted everything the ledger held", false, output.slice(-400));
    }
    console.log(output);
  }, 600_000);
});
