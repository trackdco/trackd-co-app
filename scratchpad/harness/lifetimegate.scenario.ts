/**
 * ONE LIFETIME, PART TWO — legs 10 and 11, the two measurements, and teardown.
 * GATE ON.
 *
 *   ./scratchpad/dev-gate-on.sh                        # gate ON, proven below
 *   HARNESS_ALLOW_STRIPE=1 npx vitest run \
 *     --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/lifetimegate.scenario.ts --reporter=verbose
 *
 * ⚠️ THIS IS THE SAME LIFETIME, NOT A SECOND ONE. Nothing is reseeded. The
 * account, the customer, the clock and the subscription are the ones part one
 * created; they are RE-READ FROM STRIPE AND POSTGRES rather than carried in
 * memory, which is the more honest of the two, because the state under test lives
 * there and not in a variable.
 *
 * ## Why the process is split here and only here
 *
 * The read-only gate is a COMMAND-LINE flag (standing Law 4) and the tracked
 * launchers `export`-and-`exec` a fresh dev server to set it — `npx` re-execs and
 * LOSES the variable, which produced a fully green vacuous run once. Legs 1 to 9
 * must run with it OFF (that is today's world, and the brief holds both flags
 * unset unless a leg needs the gate); legs 10 and 11 are ABOUT the gate. A server
 * restart between them is unavoidable, and a restart is not something to do from
 * inside the process being measured.
 *
 * ⚠️ AND A RESTART IS NOT EVIDENCE. `ps` shows argv, not env, and
 * `pkill -f "next dev"` misses the worker holding the port. The flag is proven in
 * BOTH DIRECTIONS from a positive named artefact: part one recorded this same
 * account's Access row reading "Pro" with the gate off; PREFLIGHT here requires
 * the SAME account's row to read "Read only". One account, two servers, two
 * mutually exclusive strings from the screen's own furniture.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { afterAll, beforeAll, describe, it } from "vitest";

import {
  admin,
  earlierThan,
  Ledger,
  QA_PASSWORD,
  requireStripeBudget,
  sameInstant,
  seedAccount,
  stripe,
} from "./core";
import {
  BASE_URL,
  Checks,
  DAY_MS,
  day,
  drainEvents,
  entitlementsFor,
  fillCardForm,
  loadState,
  mirrorFor,
  pollFor,
  dropRecordedUser,
  readGateFromBilling,
  recordId,
  saveState,
  secondsToIso,
  waitForServer,
} from "./lifetime";

const TZ = "Australia/Sydney";
/**
 * ⚠️ THE PAN FOR `pm_card_chargeCustomerFail`, typed into STRIPE'S OWN hosted
 * portal. It attaches cleanly and fails every charge, which is what keeps the
 * account past-due through M1 so the rest of the arc survives the measurement.
 */
const FAILING_PAN = "4000000000000341";
const ONBOARDING_KEY = "trackd.onboarding.v1";

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
  subId: state.subId ?? "",
  t0: state.t0Ms ?? 0,
};
const notes = (state.notes ?? {}) as Record<string, string | null>;

const at = (days: number, extraHours = 0) =>
  new Date(run.t0 + days * DAY_MS + extraHours * 3_600_000);

async function subscription(id = run.subId) {
  return stripe.subscriptions.retrieve(id, { expand: ["items"] });
}

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

async function billingTextFor(email: string): Promise<string> {
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

async function billingText(): Promise<string> {
  const { context, page } = await newContext();
  try {
    await page.goto(`${BASE_URL}/billing`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=Access", { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    return await page.locator("body").innerText();
  } finally {
    await context.close();
  }
}

/** Every charge id Stripe holds for this customer, newest first. */
async function chargeIds(): Promise<string[]> {
  const list = await stripe.charges.list({ customer: run.customerId, limit: 100 });
  return list.data.map((ch) => ch.id);
}

async function openInvoice() {
  const list = await stripe.invoices.list({ customer: run.customerId, limit: 20 });
  return list.data.find((i) => i.status === "open") ?? null;
}

beforeAll(async () => {
  requireStripeBudget("the full-lifecycle run, part two");
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
  saveState({ notes: { ...notes, ...(observed as Record<string, string>) } });
  const { passed, failed } = c.summary();
  console.log(`\n════ PART TWO: ${passed} passed, ${failed} failed ════`);
  for (const check of c.all.filter((x) => !x.pass)) {
    console.log(`  ❌ [${check.leg}] ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
  }
  console.log(`\nMEASUREMENTS: ${JSON.stringify({ M1: observed.M1, M2: observed.M2 }, null, 2)}`);
});

describe("one lifetime, legs 10 and 11", () => {
  it("PREFLIGHT: the same account, the same clock, and the gate is now ON", async () => {
    c.at("PREFLIGHT (part two)");
    c.arrived("the dev server answers", await waitForServer(), BASE_URL);
    c.arrived("part one handed over an account, a customer, a clock and a subscription",
      Boolean(run.userId && run.customerId && run.clockId && run.subId),
      `user=${run.userId} customer=${run.customerId} clock=${run.clockId} sub=${run.subId}`);
    if (!run.subId) return;

    /**
     * ⚠️ THE STATE IS RE-READ FROM STRIPE, not trusted from the file. This is the
     * arrival that makes "the same lifetime" a measurement rather than a claim.
     */
    const sub = await subscription();
    c.arrived("⚠️ the SAME subscription is still where leg 9 left it: past_due",
      sub.status === "past_due", `status=${sub.status} id=${sub.id}`);
    const clock = await stripe.testHelpers.testClocks.retrieve(run.clockId);
    c.arrived("the SAME clock is still standing where leg 9 left it",
      clock.status === "ready",
      `frozen at ${new Date(clock.frozen_time * 1000).toISOString()} = t0+${((clock.frozen_time * 1000 - run.t0) / DAY_MS).toFixed(2)}d`);
    observed.clockAtHandover = new Date(clock.frozen_time * 1000).toISOString();

    /**
     * ⚠️ THE GATE, THE OTHER DIRECTION — AND IT CANNOT BE PROVEN ON THE LIFETIME
     * ACCOUNT AT THIS MOMENT, WHICH IS WHY THERE IS A CONTROL.
     *
     * The obvious proof — this account's own Access row — does not work HERE and
     * would have passed vacuously if it had been left in. The lifetime account is
     * past_due but its three-day grace has NOT yet expired in wall-clock terms, so
     * it still holds live access and reads "Pro" with the gate either way. Later in
     * leg 10 it reads "Read only", but by then the reading is doing double duty as
     * both the gate proof and the thing being tested, and a screen that stayed on
     * "Pro" could not be told apart from a gate that was never set.
     *
     * So the flag is proven on a CONTROL: a throwaway account holding NO
     * entitlement, which is the exact shape part one measured reading "Pro" with
     * the gate OFF. Same screen, same row, same cohort, opposite server, opposite
     * string. It is the instrument's control and touches nothing in the arc; it is
     * ledgered on creation and dropped by id below.
     */
    /**
     * ⚠️ LEDGERED IN THE SAME BREATH AS BEING CREATED. The first attempt called
     * `recordId` on the line after `seedAccount` and `recordId` was not imported —
     * so the throw landed BETWEEN the account existing and anything knowing about
     * it, and it survived the run with nothing to find it by. `seedAccount` takes a
     * `Ledger`, but that one is in-process and dies with the process; the disk
     * ledger is the one teardown reads.
     */
    const control = await seedAccount(new Ledger(), "qa-life-gatecontrol", { timezone: TZ });
    recordId("users", control.id);
    let controlGate: boolean | null = null;
    try {
      const controlText = await billingTextFor(control.email);
      controlGate = readGateFromBilling(controlText);
      c.check("the control's billing screen rendered at all (its own 'Access' row)",
        controlGate !== null);
      c.check("⚠️ THE GATE IS ON: an account with NO entitlement reads \"Read only\"",
        controlGate === true,
        `control Access row says "${controlGate === true ? "Read only" : controlGate === false ? "Pro" : "?"}" (part one's same-shape account read "Pro" with the gate off)`);
    } finally {
      const { error } = await admin.auth.admin.deleteUser(control.id);
      c.check("the gate control was dropped BY ID", !error, error?.message ?? control.id);
      if (!error) dropRecordedUser(control.id);
    }
    observed.gateOnProof = controlGate;
  }, 300_000);

  it("LEG 10 + M2: dunning, the first retry, and the lapse", async () => {
    c.at("LEG 10 — DUNNING AND THE LAPSE");
    if (!run.subId) return void c.arrived("there is a past-due subscription", false);

    const graceEndsIso = notes.graceEndsIso ?? null;
    c.arrived("leg 9 left an entitlement end to cross", Boolean(graceEndsIso), `access ends ${graceEndsIso}`);

    /**
     * ══ HOW LONG IS THE THREE-DAY GRACE, ACTUALLY? ══
     *
     * ⚠️ MEASURED, NOT ASSUMED, AND THE ANSWER CHANGES WHAT THIS LEG CAN OBSERVE.
     *
     * Leg 9 read the entitlement the app's OWN webhook wrote from the real failed
     * invoice, and it ends at the SAME INSTANT the last paid period did. So the
     * grace is zero days, and the "inside the three days" window this leg was
     * written to walk through does not exist on this path.
     *
     * `markPastDue` computes `min(current entitlement, unpaid period start + 3
     * days)` and then returns early if that is not shorter than what is stored. On
     * an ordinary renewal failure the entitlement ALREADY ends exactly at the
     * unpaid period's start, so the minimum is the stored value, nothing is
     * written, and the handler answers "handled". It can only ever CLAW BACK a
     * longer-dated entitlement; it can never GRANT the three days.
     *
     * This is asserted here rather than inferred, from the two dates alone.
     */
    const paidThroughIso = notes.period8 ?? null;
    const graceDays =
      graceEndsIso && paidThroughIso
        ? (Date.parse(graceEndsIso) - Date.parse(paidThroughIso)) / DAY_MS
        : null;
    observed.measuredGraceDays = graceDays;
    c.arrived("both dates needed to measure the grace are present",
      graceDays !== null, `paid through ${paidThroughIso}, access to ${graceEndsIso}`);
    c.check("⚠️ THE THREE-DAY GRACE IS ACTUALLY THREE DAYS",
      graceDays === 3,
      `measured ${graceDays} days: access ends ${graceEndsIso}, last paid period ended ${paidThroughIso}`);

    /* ── the pre-lapse sentence: is its window reachable at all? ── */
    const stillLive = graceEndsIso ? Date.parse(graceEndsIso) > Date.now() : false;
    const text = await billingText();
    observed.preLapseScreen = text.split("\n").filter((l) => /stays as it is|read only/i.test(l)).join(" | ");
    c.check("⚠️ INSIDE the three days, the PRE-LAPSE sentence renders with its date",
      stillLive &&
        text.includes(`Your account stays as it is until ${day(graceEndsIso!)}, and goes read only after that until a payment goes through.`),
      stillLive
        ? (text.split("\n").find((l) => /stays as it is until/.test(l)) ?? "absent")
        : `UNREACHABLE: access ended at ${graceEndsIso}, which is the instant the renewal failed, so there is no window in which this sentence can render`);
    c.check("⚠️ and the account still has access while inside the grace",
      stillLive, `access ${stillLive ? "live" : "already ended"} at ${graceEndsIso}`);

    /**
     * ══ M2 — WHEN DOES STRIPE'S FIRST SMART RETRY ACTUALLY LAND? ══
     *
     * ⚠️ MEASURED BY WALKING THE CLOCK ONE STEP AT A TIME AND TAKING THE FIRST STEP
     * THE ATTEMPT APPEARS AT. It interprets NO timestamp.
     *
     * A Stripe event's `created` is WALL CLOCK, not simulated time. Answering Q79
     * that way once produced a lead of exactly 168 hours — exactly 7 days, exactly
     * the number the dashboard's own setting uses — so it READ AS A CONFIRMATION of
     * the thing under test. The tell was that the two events were stamped six
     * seconds apart in real time while their simulated positions were a week apart.
     *
     * So the signal here is the EXISTENCE of a new charge, and the answer is the
     * step at which it first exists, to within the step size of one day.
     */
    const before = new Set(await chargeIds());
    const invoiceBefore = await openInvoice();
    observed.M2_baseline = {
      charges: before.size,
      attemptCount: invoiceBefore?.attempt_count ?? null,
      /**
       * Stripe's OWN declaration of when it will try next. Recorded beside the
       * measurement and never in place of it: a schedule Stripe publishes is a
       * statement of intent, and the measurement is what actually happened.
       */
      nextPaymentAttemptDeclared: invoiceBefore?.next_payment_attempt
        ? secondsToIso(invoiceBefore.next_payment_attempt)
        : null,
      declaredDaysAfterFailure: invoiceBefore?.next_payment_attempt
        ? ((invoiceBefore.next_payment_attempt * 1000 - (run.t0 + 35 * DAY_MS)) / DAY_MS).toFixed(2)
        : null,
    };
    console.log(`  M2 baseline: ${JSON.stringify(observed.M2_baseline)}`);

    let firstRetryDay: number | null = null;
    const walk: { day: number; charges: number; attemptCount: number | null; status: string }[] = [];
    for (let d = 1; d <= 10 && firstRetryDay === null; d += 1) {
      await stripe.testHelpers.testClocks.advance(run.clockId, {
        frozen_time: Math.floor(at(35, 2).getTime() / 1000) + d * 86_400,
      });
      for (;;) {
        const clock = await stripe.testHelpers.testClocks.retrieve(run.clockId);
        if (clock.status === "ready") break;
        if (clock.status === "internal_failure") throw new Error("test clock failed mid-walk");
        await new Promise((r) => setTimeout(r, 2000));
      }
      const now = await chargeIds();
      const fresh = now.filter((id) => !before.has(id));
      const invoice = await openInvoice();
      const sub = await subscription();
      walk.push({
        day: d,
        charges: fresh.length,
        attemptCount: invoice?.attempt_count ?? null,
        status: sub.status,
      });
      console.log(`  day +${d}: ${fresh.length} new charge(s), attempt_count=${invoice?.attempt_count ?? "-"}, status=${sub.status}`);
      if (fresh.length > 0) firstRetryDay = d;
      await drainEvents(run.customerId, Date.now() - 600_000, seenEvents);
    }
    observed.M2 = {
      firstRetryLandsAtSimulatedDay: firstRetryDay,
      method:
        "walked the clock in 1-day steps from the failed renewal and took the first step at which a NEW charge object existed; no timestamp was interpreted",
      stepSizeDays: 1,
      walk,
      graceDays: 3,
      landsInsideTheThreeDayGrace: firstRetryDay === null ? null : firstRetryDay <= 3,
      ...(observed.M2_baseline as object),
    };
    c.arrived("⚠️ M2: a first retry was observed at all", firstRetryDay !== null,
      firstRetryDay === null ? "no new charge within 10 simulated days" : `day +${firstRetryDay}`);
    c.check("⚠️ M2: the first retry lands INSIDE the three-day grace, which is what the pre-lapse sentence assumes",
      firstRetryDay !== null && firstRetryDay <= 3,
      `first retry at day +${firstRetryDay}, grace is 3 days`);

    /* ── AFTER THE THREE DAYS: the after-lapse sentences, naming no date ── */
    const lapsed = await pollFor(
      async () => Date.now(),
      () => (graceEndsIso ? Date.now() > Date.parse(graceEndsIso) : false),
      { timeoutMs: 45 * 60_000, everyMs: 15_000 },
    );
    c.arrived("the run outlived the three-day grace, so the after-lapse window is real",
      lapsed !== null,
      graceEndsIso ? `access ended ${graceEndsIso}` : "no grace end recorded");

    const after = await billingText();
    observed.afterLapseScreen = after.split("\n").filter((l) => /read only|stays as it is/i.test(l)).join(" | ");
    c.check("⚠️ AFTER the three days, the AFTER-LAPSE sentence renders instead",
      after.includes("Your account is read only for now. We'll keep trying your card, and access comes back as soon as a payment goes through."),
      after.split("\n").find((l) => /read only for now/.test(l)) ?? "absent");
    c.check("⚠️ and the pre-lapse sentence is GONE — it is false in both halves now",
      !after.includes("stays as it is until"),
      after.split("\n").find((l) => /stays as it is until/.test(l)) ?? "absent");
    /**
     * ⚠️ "NAMES NO DATE" IS ASSERTED AGAINST THE DATES THAT COULD ACTUALLY APPEAR,
     * never against a date SHAPE. `/\d{1,2}\s\w{3}\s\d{4}/` is satisfied by any
     * date, and en-AU writes September with four letters, which made two controls
     * vacuous for a quarter of the year. The declined date legitimately still
     * renders in the first sentence, so this checks the one sentence at issue.
     */
    const afterLapseLine =
      after.split("\n").find((l) => /read only for now/.test(l)) ?? "";
    const forbidden = [graceEndsIso, notes.period8, notes.declinedIso].filter(Boolean) as string[];
    c.check("⚠️ the after-lapse sentence names NO date — nobody knows when Stripe retries next",
      forbidden.every((iso) => !afterLapseLine.includes(day(iso))),
      `line: "${afterLapseLine}"; dates it must not carry: ${forbidden.map((i) => day(i)).join(", ")}`);
    c.check("the plan card now says the account is read only",
      after.includes("Read only"),
      after.split("\n").find((l) => /Access/.test(l)) ?? "?");

    /* ── THE ACCOUNT IS ACTUALLY READ-ONLY, AND THE POP-UP'S BODY ── */
    const { context, page } = await newContext();
    try {
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      const dialog = page.locator('[role="dialog"][aria-labelledby="readonly-title"]');
      /**
       * ⚠️ THE FAB OPENS A MENU FIRST, so a driver that taps once and looks for the
       * dialog finds nothing and reports the gate as broken. Tap, look, then tap
       * the write action inside.
       */
      for (const attempt of [0, 1]) {
        if ((await dialog.count()) > 0) break;
        const fab = page
          .locator('button[aria-label*="Quick" i], button[aria-label*="add" i]')
          .first();
        if (await fab.count()) await fab.click().catch(() => {});
        await page.waitForTimeout(1200);
        if ((await dialog.count()) > 0) break;
        const write = page
          .locator("button", { hasText: /log a dose|log weight|add|journal/i })
          .first();
        if (await write.count()) await write.click().catch(() => {});
        await page.waitForTimeout(1500);
        if (attempt === 1 && (await dialog.count()) === 0) {
          console.log(`  dashboard text:\n${(await page.locator("body").innerText()).slice(0, 800)}`);
        }
      }
      const opened = (await dialog.count()) > 0;
      c.arrived("⚠️ the account is READ-ONLY: a write attempt raises the pop-up",
        opened, `${await dialog.count()} dialog(s)`);
      if (opened) {
        const body = await dialog.innerText();
        console.log(`  read-only pop-up:\n${body}`);
        observed.readOnlyPopup = body;
        c.check("⚠️ the pop-up's BODY is the one signed clause, character for character",
          body.includes(
            "You don't have access at the moment, so Trackd Co is read only. You can still view everything you've logged, you just can't add to it.",
          ),
          body.replace(/\n/g, " / "));
        c.check('and it carries the D98 clause "Nothing has been deleted."',
          body.includes("Nothing has been deleted."), body.replace(/\n/g, " / "));
        c.check("its title is the signed one", body.includes("Your account is read only"));
        c.check("⚠️ the body is UNBRANCHED — it names no date and no plan",
          !/\d{4}/.test(body), body.replace(/\n/g, " / "));
      }
    } finally {
      await context.close();
    }
  }, 3_600_000);

  it("M1: does updating the card retry the outstanding invoice immediately?", async () => {
    c.at("M1 — CARD UPDATE AND THE OUTSTANDING INVOICE");
    if (!run.subId) return void c.arrived("there is a past-due subscription", false);

    const sub = await subscription();
    const invoice = await openInvoice();
    c.arrived("⚠️ still past_due with an OPEN invoice, which is what M1 is about",
      sub.status === "past_due" && Boolean(invoice),
      `status=${sub.status} invoice=${invoice?.id ?? "none"} attempts=${invoice?.attempt_count}`);
    if (!invoice) return;

    const attemptsBefore = invoice.attempt_count ?? 0;
    const chargesBefore = new Set(await chargeIds());
    const nextDeclaredBefore = invoice.next_payment_attempt
      ? secondsToIso(invoice.next_payment_attempt)
      : null;

    /**
     * ⚠️ THROUGH THE PORTAL PATH THE APP ACTUALLY USES — `openBillingPortal`, driven
     * from the screen rather than called directly, because the question is what a
     * real customer's card update does and the portal CONFIGURATION is part of the
     * answer.
     *
     * ⚠️ THE NEW CARD ALSO FAILS ON CHARGE (`4000 0000 0000 0341`, the PAN behind
     * `pm_card_chargeCustomerFail`). That is deliberate: M1 asks whether the open
     * invoice is ATTEMPTED, not whether it succeeds, and the trigger is the same
     * either way — while a card that WORKED would end the past-due state and take
     * leg 11's "from read-only" with it. The PAN is typed into Stripe's own hosted
     * page and never reaches this script or the app's server.
     */
    let reachedPortal = false;
    let portalUrl = "";
    let portalPage: Page | null = null;
    const { context, page } = await newContext();
    try {
      /**
       * ⚠️ THE APP'S OWN ROWS, BY THEIR SIGNED LABELS. `/billing/manage` draws a
       * `StripeHandoff` with rows "Card" and "Receipts", and D37 makes the handoff
       * dialog the ONLY way through: "it is not reachable without passing through"
       * it. So the path is Card -> "You're off to Stripe" -> Continue, and each
       * step is asserted rather than assumed, because a row that silently did
       * nothing would look exactly like a portal that answered nothing.
       */
      await page.goto(`${BASE_URL}/billing/manage`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("text=Manage", { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const cardRow = page.locator("button", { hasText: /^Card$/ }).first();
      c.arrived('the "Card" row is on the Manage screen',
        (await cardRow.count()) > 0,
        (await page.locator("body").innerText()).split("\n").slice(0, 12).join(" / "));
      if (await cardRow.count()) await cardRow.click().catch(() => {});
      await page.waitForTimeout(1200);

      const handoff = page.locator('[role="dialog"][aria-labelledby="handoff-title"]');
      c.arrived("D37: it routes through the handoff dialog, never straight to Stripe",
        (await handoff.count()) > 0, `${await handoff.count()} dialog(s)`);
      const go = handoff.locator("button", { hasText: /^Continue$/ }).first();
      if (await go.count()) {
        // The portal may open in this tab or a new one; take whichever appears.
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
      portalUrl = portalPage.url();
      reachedPortal = /stripe\.com/.test(portalUrl);
      c.arrived("the app's own portal path reached a Stripe-hosted page",
        reachedPortal, portalUrl.slice(0, 120));

      if (reachedPortal) {
        const updateCard = portalPage
          .locator("a, button", { hasText: /payment method|update|add/i })
          .first();
        if (await updateCard.count()) await updateCard.click().catch(() => {});
        await portalPage.waitForTimeout(4000);
        const filled = await fillCardForm(portalPage, FAILING_PAN, 45_000);
        c.arrived("the new card was typed into Stripe's own hosted form", filled,
          filled ? "" : `url=${portalPage.url().slice(0, 120)}`);
        if (filled) {
          const save = portalPage.locator("button", { hasText: /save|add|update|confirm/i }).last();
          if (await save.count()) await save.click().catch(() => {});
          await portalPage.waitForTimeout(10_000);
          console.log(`  after saving the card: ${portalPage.url().slice(0, 120)}`);
        }
        observed.M1_cardUpdated = filled;
      }
    } finally {
      await context.close();
    }

    /**
     * ⚠️ THE MEASUREMENT ITSELF: WATCH IN REAL TIME, WITH THE CLOCK HELD STILL.
     *
     * "Immediately" means without waiting for Stripe's next scheduled retry, so the
     * clock must NOT move during this window — any advance would conflate "the card
     * update triggered it" with "the schedule came round". Three minutes of real
     * time is far longer than an immediate retry needs and far shorter than any
     * retry interval Stripe publishes.
     */
    const watchStart = Date.now();
    const retried = await pollFor(
      async () => {
        const ids = await chargeIds();
        const inv = await openInvoice();
        return {
          fresh: ids.filter((id) => !chargesBefore.has(id)),
          attempts: inv?.attempt_count ?? attemptsBefore,
          status: (await subscription()).status,
        };
      },
      (v) => v.fresh.length > 0 || v.attempts > attemptsBefore,
      { timeoutMs: 180_000, everyMs: 10_000 },
    );
    const elapsedSeconds = Math.round((Date.now() - watchStart) / 1000);
    const invoiceAfter = await openInvoice();
    const subAfter = await subscription();

    observed.M1 = {
      question: "does updating the card retry the outstanding invoice immediately?",
      method:
        "updated the payment method through the app's own portal path with the clock HELD STILL, then watched the open invoice's attempt_count and the customer's charge list for 180s of REAL time; no clock advance, so nothing can be confused with a scheduled retry",
      reachedPortal,
      attemptsBefore,
      attemptsAfter: invoiceAfter?.attempt_count ?? null,
      newChargeWithin180s: retried !== null,
      observedAfterSeconds: retried !== null ? elapsedSeconds : null,
      statusAfter: subAfter.status,
      nextPaymentAttemptDeclaredBefore: nextDeclaredBefore,
      nextPaymentAttemptDeclaredAfter: invoiceAfter?.next_payment_attempt
        ? secondsToIso(invoiceAfter.next_payment_attempt)
        : null,
      answer:
        retried !== null
          ? "YES — the open invoice was attempted immediately on the card update"
          : "NO — nothing was attempted within 180s of real time; recovery waits for Stripe's next scheduled retry",
    };
    console.log(`  M1: ${JSON.stringify(observed.M1, null, 2)}`);
    c.check("⚠️ M1 was measured (either answer is a result; only 'could not measure' is not)",
      reachedPortal, `reached the portal=${reachedPortal}`);
    c.check("the account is still past_due, so the measurement did not cost the rest of the arc",
      subAfter.status === "past_due", `status=${subAfter.status}`);
  }, 1_800_000);

  it("LEG 11: resubscribe from read-only, and be refused a second trial", async () => {
    c.at("LEG 11 — RESUBSCRIBE AND BE REFUSED A SECOND TRIAL");
    if (!run.subId) return void c.arrived("there is an account to resubscribe", false);

    /**
     * ⚠️ WALK THE CLOCK UNTIL STRIPE FINISHES DUNNING, rather than cancelling the
     * subscription by hand. The state leg 11 starts from is "the retries ran out",
     * and seeding it would be seeding the very thing under test.
     */
    let sub = await subscription();
    for (let hop = 0; hop < 6 && sub.status === "past_due"; hop += 1) {
      const clock = await stripe.testHelpers.testClocks.retrieve(run.clockId);
      await stripe.testHelpers.testClocks.advance(run.clockId, {
        frozen_time: clock.frozen_time + 7 * 86_400,
      });
      for (;;) {
        const ck = await stripe.testHelpers.testClocks.retrieve(run.clockId);
        if (ck.status === "ready") break;
        if (ck.status === "internal_failure") throw new Error("test clock failed");
        await new Promise((r) => setTimeout(r, 2000));
      }
      await drainEvents(run.customerId, Date.now() - 600_000, seenEvents);
      sub = await subscription();
      console.log(`  hop ${hop + 1}: status=${sub.status}`);
    }
    c.arrived("⚠️ Stripe finished dunning and the old subscription is terminal",
      ["canceled", "unpaid", "incomplete_expired"].includes(sub.status), `status=${sub.status}`);
    observed.dunningEndedAs = sub.status;

    const entBefore = await entitlementsFor(run.userId);
    const liveBefore = (entBefore.rows ?? []).filter(
      (r) => (r as { is_active?: boolean }).is_active &&
        (!(r as { active_until?: string }).active_until ||
          Date.parse((r as { active_until: string }).active_until) > Date.now()),
    );
    c.arrived("⚠️ the account starts this leg with NO live access", liveBefore.length === 0,
      `${liveBefore.length} live entitlement(s) of ${entBefore.rows?.length ?? 0}`);

    /* ── the paywall must say they are charged today, with no trial ── */
    const { context, page } = await newContext();
    let paywall = "";
    try {
      await page.goto(`${BASE_URL}/onboarding?step=hook`, { waitUntil: "domcontentloaded" });
      await page.evaluate(
        ([key, value]) => localStorage.setItem(key, value),
        [ONBOARDING_KEY, JSON.stringify({ plan: "weekly" })] as [string, string],
      );
      await page.goto(`${BASE_URL}/onboarding?step=plans`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);
      paywall = await page.locator("body").innerText();
      console.log(`  paywall:\n${paywall.slice(0, 700)}`);
    } finally {
      await context.close();
    }
    observed.paywall = paywall.slice(0, 600);
    c.arrived("the plan screen rendered", paywall.length > 0);
    c.check("⚠️ the paywall does NOT offer a second free trial",
      !/7 days free|free for 7|7 day free|start your free/i.test(paywall),
      paywall.split("\n").filter((l) => /free|trial/i.test(l)).join(" | ") || "no free/trial line");

    /* ── through checkout again ── */
    const since = Date.now();
    const second = await newContext();
    try {
      await second.page.goto(`${BASE_URL}/onboarding?step=start`, { waitUntil: "domcontentloaded" });
      await second.page.waitForTimeout(2000);
      const filled = await fillCardForm(second.page, "4242424242424242");
      c.arrived("the checkout card form was reachable", filled);
      if (filled) {
        const cta = second.page
          .getByRole("button", { name: /start|subscribe|continue|plan|pay/i })
          .last();
        console.log(`  tapping: "${(await cta.textContent())?.trim()}"`);
        await cta.click();
        await second.page.waitForTimeout(15_000);
        console.log(`  after checkout:\n${(await second.page.locator("body").innerText()).slice(0, 400)}`);
      }
    } finally {
      await second.context.close();
    }

    const subs = await stripe.subscriptions.list({ customer: run.customerId, status: "all", limit: 20 });
    const fresh = subs.data.find((s) => s.id !== run.subId && !["canceled", "incomplete_expired"].includes(s.status));
    c.arrived("⚠️ a NEW subscription exists", Boolean(fresh),
      subs.data.map((s) => `${s.id}:${s.status}`).join(", "));
    if (!fresh) return;
    observed.resubId = fresh.id;
    saveState({ resubId: fresh.id });

    c.check("⚠️ THEY ARE REFUSED A SECOND TRIAL — Stripe carries no trial on it",
      fresh.trial_end === null || fresh.trial_end === undefined,
      `trial_end=${fresh.trial_end ? secondsToIso(fresh.trial_end) : "null"} status=${fresh.status}`);

    /**
     * ⚠️ THE ENTITLEMENT IS RESTORED ON `invoice.paid`, NOT OPTIMISTICALLY, AND THE
     * ONLY WAY TO TELL IS TO LOOK BEFORE THE WEBHOOK ARRIVES.
     *
     * This run controls webhook delivery, so the browser has finished and NOTHING
     * has been delivered yet. If access is already back at this instant, something
     * other than the webhook granted it — which is the defect this asserts against.
     */
    const entMid = await entitlementsFor(run.userId);
    const liveMid = (entMid.rows ?? []).filter(
      (r) => (r as { is_active?: boolean }).is_active &&
        (!(r as { active_until?: string }).active_until ||
          Date.parse((r as { active_until: string }).active_until) > Date.now()),
    );
    c.check("⚠️ access is NOT restored optimistically by the client's success",
      liveMid.length === 0,
      `${liveMid.length} live entitlement(s) BEFORE any webhook was delivered: ${JSON.stringify(entMid.rows)}`);

    const sent = await drainEvents(run.customerId, since, seenEvents);
    console.log(`  delivered ${sent.length} event(s): ${sent.map((s) => s.type).join(", ")}`);
    c.check("an invoice.paid was among the events the app received",
      sent.some((s) => s.type === "invoice.paid"),
      sent.map((s) => s.type).join(", "));

    /**
     * ⚠️ THE NEW SUBSCRIPTION'S OWN INVOICE, NOT "SOME PAID INVOICE ON THE ACCOUNT".
     *
     * The first version asked whether any paid invoice matched `fresh.id` OR cost
     * $3.99 — and `invoice.subscription` DOES NOT EXIST in this API version, so the
     * id half was always undefined and the check passed on a $3.99 invoice from
     * leg 4, a month of simulated time before this leg. It was green for a charge
     * that had nothing to do with resubscribing. Caught only by typechecking the
     * harness, which nothing was doing.
     *
     * `latest_invoice` is the subscription's own pointer, so there is no matching
     * to get wrong.
     */
    const latest = fresh.latest_invoice;
    const freshInvoice = latest
      ? await stripe.invoices.retrieve(typeof latest === "string" ? latest : latest.id!)
      : null;
    c.check("⚠️ they were CHARGED IMMEDIATELY — the NEW subscription's own invoice is paid, for real money",
      freshInvoice?.status === "paid" && (freshInvoice?.amount_paid ?? 0) > 0,
      `${freshInvoice?.id}:${freshInvoice?.status}:${freshInvoice?.amount_paid} ${freshInvoice?.currency}`);
    c.check("and nothing was left owing on it",
      (freshInvoice?.amount_remaining ?? 0) === 0,
      `amount_remaining=${freshInvoice?.amount_remaining}`);

    const entAfter = await pollFor(
      () => entitlementsFor(run.userId),
      (e) =>
        (e.rows ?? []).some(
          (r) =>
            (r as { is_active?: boolean }).is_active &&
            Date.parse((r as { active_until: string }).active_until ?? "") > Date.now(),
        ),
      { timeoutMs: 30_000 },
    );
    c.check("⚠️ and access IS restored once invoice.paid is processed",
      entAfter !== null,
      JSON.stringify(entAfter?.rows ?? (await entitlementsFor(run.userId)).rows));

    const text = await billingText();
    c.check("the screen no longer says the account is read only",
      !text.includes("Read only"),
      text.split("\n").find((l) => /Access/.test(l)) ?? "?");
    observed.leg11Screen = text.split("\n").filter((l) => /Access|Renews|Ends on|Trial/.test(l)).join(" | ");
  }, 3_600_000);
});
