/**
 * ONE LIFETIME, PART ONE — legs 1 to 9, on ONE test clock, GATE OFF.
 *
 *   ./scratchpad/dev-gate-off.sh                       # gate OFF, proven below
 *   HARNESS_ALLOW_STRIPE=1 npx vitest run \
 *     --config scratchpad/harness/vitest.harness.config.ts \
 *     scratchpad/harness/lifetime.scenario.ts --reporter=verbose
 *
 * §9b ranks a full-lifecycle clock run above cold agent review, because agents
 * cannot experience time and two of this project's worst payment defects were
 * found only this way. Every previous clock run here has been a FRAGMENT — one
 * leg, seeded fresh. This is one account carried from signup to past-due with
 * state carried forward the whole way.
 *
 * ⚠️ NOTHING IS RESEEDED BETWEEN LEGS. If a leg needs a state the previous leg did
 * not produce, that is a FINDING and it is recorded as one. The only rows written
 * by hand are the ones a test clock makes impossible to obtain otherwise, and each
 * is named where it happens.
 *
 * ⚠️ EVERY ASSERTION IS ON THE DATABASE ROW OR THE STRIPE OBJECT, NEVER ON A
 * HANDLER'S RETURN VALUE. Handlers on this project have answered "handled"
 * throughout the entire life of two separate defects.
 *
 * Teardown is in `lifetimegate.scenario.ts`, which owns the end of the arc. The
 * disk ledger (`lifetime.ts`) means the ids survive this process dying, and
 * `lifetimeteardown.mjs` can delete them BY ID at any later moment.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  admin,
  earlierThan,
  fireReminder,
  PushSink,
  QA_PASSWORD,
  registerPush,
  requireStripeBudget,
  sameInstant,
  seedAccount,
  stripe,
  TestClock,
  Ledger,
  atLocalTime,
} from "./core";
import {
  BASE_URL,
  Checks,
  DAY_MS,
  day,
  drainEvents,
  fillCardForm,
  entitlementsFor,
  mirrorFor,
  plannedT0,
  pollFor,
  readGateFromBilling,
  recordId,
  saveState,
  secondsToIso,
  waitForServer,
} from "./lifetime";

const PRICE = process.env.STRIPE_PRICE_WEEKLY!;
const TZ = "Australia/Sydney";
/** ⚠️ Typed into the REAL Elements form. No script may send a PAN to the API. */
const CARD = "4242424242424242";
const ONBOARDING_KEY = "trackd.onboarding.v1";

const c = new Checks();
const ledger = new Ledger();
const seenEvents = new Set<string>();

let browser: Browser;
let sink: PushSink;

/** The one account, the one customer, the one clock. Carried across every leg. */
const run: {
  userId: string;
  email: string;
  password: string;
  customerId: string;
  clockId: string;
  subId: string;
  t0: number;
} = {
  userId: "",
  email: "",
  password: "",
  customerId: "",
  clockId: "",
  subId: "",
  t0: 0,
};

/** What each leg observed, carried forward so later legs can compare against it. */
const observed: Record<string, unknown> = {};

const clock = () => new TestClock(ledger);
let theClock: TestClock;

/**
 * ⚠️ LEGS 5 AND 6 SHARE ONE PAGE, AND THAT IS A CORRECTNESS REQUIREMENT.
 *
 * Measured: reloading `/billing` in a FRESH context after cancelling found ZERO
 * offer controls, and every leg-6 assertion downstream went vacuous — including
 * the server-side window check, which "passed" without a request ever being sent.
 * The offer's way back in is remembered in the BROWSER (`CancelSubscription.tsx`
 * keys it to the account so a remembered offer cannot cross accounts on a shared
 * device), so a new context has no memory of it and the row is not drawn.
 *
 * Keeping the page alive is also the honest path: a real person who cancels is
 * looking at the dialog that just opened, not at a fresh tab.
 */
let livePage: { context: BrowserContext; page: Page } | null = null;

/** `t0 + n days`, the arc's only way of naming a moment. */
const at = (days: number, extraHours = 0) =>
  new Date(run.t0 + days * DAY_MS + extraHours * 3_600_000);

async function subscription() {
  return stripe.subscriptions.retrieve(run.subId, { expand: ["items"] });
}

/** ⚠️ The period end lives on the ITEM in this API version, not the subscription. */
function periodEnd(sub: Awaited<ReturnType<typeof subscription>>): number {
  return (
    (sub.items.data[0] as unknown as { current_period_end?: number })
      ?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    0
  );
}

/**
 * ⚠️ PAID INVOICES THAT ACTUALLY MOVED MONEY.
 *
 * Measured on the first full run: Stripe issues a **$0 invoice at trial start**
 * and marks it `paid`, and the app's webhook processes its `invoice.paid`
 * normally (correctly — it wrote the entitlement to the trial end). So a bare
 * `status === "paid"` count is off by one from the first leg onward, and an
 * assertion built on it reads as "you were charged during your free trial" when
 * nobody was charged anything.
 *
 * The zero-amount invoices are counted separately rather than discarded, because
 * "a $0 invoice exists and was processed" is a real fact about this path.
 */
async function invoicesPaid() {
  const list = await stripe.invoices.list({ customer: run.customerId, limit: 100 });
  return list.data.filter((i) => i.status === "paid" && (i.amount_paid ?? 0) > 0);
}

async function invoicesZeroPaid() {
  const list = await stripe.invoices.list({ customer: run.customerId, limit: 100 });
  return list.data.filter((i) => i.status === "paid" && (i.amount_paid ?? 0) === 0);
}

async function newContext(): Promise<{ context: BrowserContext; page: Page }> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: run.email, password: run.password }),
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

/** ⚠️ `networkidle` never settles here. Load, then poll for what you came for. */
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

beforeAll(async () => {
  requireStripeBudget("the full-lifecycle run");
  browser = await chromium.launch();
  sink = new PushSink();
  await sink.start();
}, 120_000);

afterAll(async () => {
  await sink?.stop();
  await browser?.close();
  saveState({ legs: { ...(observed as Record<string, unknown>) } });
  const { passed, failed } = c.summary();
  console.log(`\n════ PART ONE: ${passed} passed, ${failed} failed ════`);
  for (const check of c.all.filter((x) => !x.pass)) {
    console.log(`  ❌ [${check.leg}] ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
  }
});

describe("one lifetime, legs 1 to 9", () => {
  it("PREFLIGHT: the server is up, the gate is OFF, and the account is genuinely fresh", async () => {
    c.at("PREFLIGHT");
    c.arrived("the dev server answers", await waitForServer(), BASE_URL);

    const account = await seedAccount(ledger, "qa-life", { timezone: TZ });
    run.userId = recordId("users", account.id);
    run.email = account.email;
    run.password = QA_PASSWORD || account.password;
    saveState({ userId: run.userId, email: run.email });
    console.log(`  account: ${run.email} (${run.userId})`);

    /**
     * ⚠️ LEG 1's PRECONDITION, ASSERTED RATHER THAN ASSUMED. "A fresh account with
     * NO ENTITLEMENT ROW." `seedAccount` with no billing options writes neither a
     * mirror row nor an entitlement, and this proves it for THIS account rather
     * than trusting the helper's documentation.
     */
    const ent = await entitlementsFor(run.userId);
    const mir = await mirrorFor(run.userId);
    c.arrived("both reads WORKED", ent.error === null && mir.error === null,
      `${ent.error?.message ?? "ok"} / ${mir.error?.message ?? "ok"}`);
    c.arrived("the account holds NO entitlement row and NO subscription row",
      ent.rows?.length === 0 && mir.rows?.length === 0,
      `entitlements=${ent.rows?.length} subscriptions=${mir.rows?.length}`);

    /**
     * ⚠️ THE GATE, PROVEN FROM A POSITIVE NAMED ARTEFACT — not from a restart and
     * not from `ps`, which shows argv and not env. This account holds no
     * entitlement, so `/billing`'s Access row reads "Pro" with the gate OFF and
     * "Read only" with it ON. Both are the screen's own furniture and mutually
     * exclusive, so neither can pass vacuously.
     */
    const text = await billingText();
    const gateOn = readGateFromBilling(text);
    c.check("the billing screen rendered at all (its own 'Access' row)", gateOn !== null);
    c.check("⚠️ THE GATE IS OFF, from the Access row of an unentitled account",
      gateOn === false, `Access row says "${gateOn === true ? "Read only" : gateOn === false ? "Pro" : "?"}"`);
    observed.gateOffProof = { gateOn, sample: text.slice(0, 160) };
    expect(gateOn, "refusing to run the arc without knowing the gate state").not.toBeNull();
  }, 300_000);

  it("LEG 1: signup and trial start", async () => {
    c.at("LEG 1 — SIGNUP AND TRIAL START");

    /**
     * ⚠️ THE ONE THING A TEST CLOCK MAKES IMPOSSIBLE TO DO THE APP'S WAY.
     *
     * `test_clock` can only be set when a customer is CREATED, so the customer has
     * to exist on the clock before the app looks for one. `findOrCreateCustomer`
     * reads `billing_customers` first and reuses whatever it finds, so writing that
     * mapping row here hands the app a clock-pinned customer and changes nothing
     * else: the app still decides eligibility, still chooses the free time, still
     * creates the subscription, still attaches the card through its own Elements
     * form, and the entitlement is still written by its own webhook.
     *
     * NO BILLING STATE IS SEEDED. No subscription, no entitlement, no marker.
     */
    run.t0 = plannedT0(Date.now());
    theClock = clock();
    run.clockId = recordId("clocks", await theClock.create(new Date(run.t0)));
    console.log(`  clock ${run.clockId} frozen at ${new Date(run.t0).toISOString()} (simulated t0)`);

    const customer = await stripe.customers.create({
      email: run.email,
      test_clock: run.clockId,
      metadata: { user_id: run.userId, purpose: "lifetime-run" },
    });
    run.customerId = recordId("customers", customer.id);
    ledger.customer(customer.id);
    const { error: mapError } = await admin
      .from("billing_customers")
      .insert({ user_id: run.userId, stripe_customer_id: customer.id });
    c.arrived("the clock-pinned customer is mapped to the account", !mapError,
      mapError?.message ?? customer.id);
    saveState({ customerId: run.customerId, clockId: run.clockId, t0Ms: run.t0 });

    /* ── the app's own checkout, through the real Elements form ── */
    const since = Date.now();
    const { context, page } = await newContext();
    try {
      await page.goto(`${BASE_URL}/onboarding?step=hook`, { waitUntil: "domcontentloaded" });
      await page.evaluate(
        ([key, value]) => localStorage.setItem(key, value),
        [ONBOARDING_KEY, JSON.stringify({ plan: "weekly" })] as [string, string],
      );
      await page.goto(`${BASE_URL}/onboarding?step=start`, { waitUntil: "domcontentloaded" });
      /**
       * ⚠️ THE FRAME IS FOUND BY THE FIELD IT CONTAINS. See `fillCardForm`: the
       * tracked "target by title" advice has gone stale — Stripe now mounts THREE
       * frames with that title and only one holds the card fields.
       */
      const filled = await fillCardForm(page, CARD);
      c.arrived("the real Elements card form was reachable and filled", filled,
        filled ? "" : `frames: ${page.frames().length}`);
      if (!filled) return;
      const cta = page.getByRole("button", { name: /start|subscribe|continue|plan/i }).last();
      console.log(`  tapping: "${(await cta.textContent())?.trim()}"`);
      await cta.click();
      await page.waitForTimeout(12_000);
    } finally {
      await context.close();
    }

    /* ── what STRIPE actually holds ── */
    const found = await pollFor(
      () => stripe.subscriptions.list({ customer: run.customerId, status: "all", limit: 10 }),
      (list) => list.data.length > 0,
      { timeoutMs: 60_000 },
    );
    c.arrived("the app created a subscription on the clock-pinned customer",
      (found?.data.length ?? 0) === 1, `${found?.data.length ?? 0} subscription(s)`);
    if (!found?.data.length) return;
    run.subId = found.data[0].id;
    saveState({ subId: run.subId });

    const sub = await pollFor(
      () => subscription(),
      (s) => s.status === "trialing",
      { timeoutMs: 60_000 },
    );
    c.arrived("⚠️ Stripe says the subscription is TRIALING", sub?.status === "trialing",
      `status=${sub?.status ?? "?"} id=${run.subId}`);
    if (!sub) return;

    const trialEndIso = sub.trial_end ? secondsToIso(sub.trial_end) : null;
    observed.trialEndIso = trialEndIso;
    c.check("the trial is 7 days, measured from the clock rather than assumed",
      Math.round(((sub.trial_end ?? 0) * 1000 - run.t0) / DAY_MS) === 7,
      `${((sub.trial_end ?? 0) * 1000 - run.t0) / DAY_MS} days; ends ${trialEndIso}`);
    c.check("no coupon or discount was used to make the trial free",
      !(sub as unknown as { discounts?: unknown[] }).discounts?.length,
      JSON.stringify((sub as unknown as { discounts?: unknown[] }).discounts ?? []));

    /* ── the app's OWN webhook writes the mirror and the entitlement ── */
    const sent = await drainEvents(run.customerId, since, seenEvents);
    console.log(`  delivered ${sent.length} real Stripe event(s): ${sent.map((s) => `${s.type}=${s.status}`).join(", ")}`);
    c.arrived("real Stripe events were found and accepted by the app's own webhook",
      sent.length > 0 && sent.every((s) => s.status === 200),
      sent.map((s) => `${s.type}:${s.status}`).join(" "));

    const mirror = await pollFor(
      () => mirrorFor(run.userId),
      (m) => (m.rows?.length ?? 0) === 1,
      { timeoutMs: 30_000 },
    );
    c.arrived("the mirror carries exactly one row for this subscription",
      mirror?.rows?.length === 1, `${mirror?.rows?.length ?? 0} row(s)`);
    const row = mirror?.rows?.[0] as Record<string, string | null> | undefined;
    c.check("the mirror's status is trialing", row?.status === "trialing", `status=${row?.status}`);
    /**
     * ⚠️ COMPARED AS INSTANTS. PostgREST returns microseconds and `+00:00`; an
     * entitlement date round trips to milliseconds and `Z`. The same instant is a
     * DIFFERENT STRING, and that has cost this project three runs.
     */
    c.check("⚠️ the mirror's trial end IS Stripe's trial_end, as instants",
      sameInstant(row?.trial_ends_at ?? null, trialEndIso),
      `mirror=${row?.trial_ends_at} stripe=${trialEndIso}`);

    const ent = await pollFor(
      () => entitlementsFor(run.userId),
      (e) => (e.rows?.length ?? 0) === 1,
      { timeoutMs: 30_000 },
    );
    const entRow = ent?.rows?.[0] as Record<string, string | boolean | null> | undefined;
    c.arrived("the app granted exactly one entitlement", ent?.rows?.length === 1,
      `${ent?.rows?.length ?? 0} row(s)`);
    c.check("the entitlement grants access (source stripe, active)",
      entRow?.source === "stripe" && entRow?.is_active === true,
      `source=${entRow?.source} is_active=${entRow?.is_active}`);
    c.check("the entitlement runs to the trial end, as instants",
      sameInstant(entRow?.active_until as string | null, trialEndIso),
      `entitlement=${entRow?.active_until} stripe=${trialEndIso}`);

    /* ── the SCREEN names the charge date, and it comes from Stripe ── */
    const text = await billingText();
    c.arrived("the billing screen rendered", text.includes("Access") && text.includes("Price"));
    c.check('⚠️ the screen names the charge date as "Trial ends {date from Stripe}"',
      text.includes(`Trial ends`) && text.includes(day(trialEndIso!)),
      `expected "${day(trialEndIso!)}"; rows: ${text.split("\n").filter((l) => /Trial ends|Renews|Ends on|Free until/.test(l)).join(" | ")}`);
    c.check("the price row names the real weekly price from Stripe",
      text.includes("$3.99") && /week/i.test(text),
      text.split("\n").find((l) => l.includes("$")) ?? "no price row");
    observed.leg1 = { trialEndIso, subId: run.subId, mirror: row, entitlement: entRow };
  }, 600_000);

  it("LEG 2: the day-5 reminder is DELIVERED, and before the charge", async () => {
    c.at("LEG 2 — THE DAY-5 REMINDER");
    const trialEndIso = observed.trialEndIso as string | null;
    if (!trialEndIso) return void c.arrived("leg 1 produced a trial end to count back from", false);

    await registerPush(run.userId, sink.url);
    sink.clear();

    /**
     * ⚠️ THE RUNNER TAKES AN INJECTABLE `now`, WHICH IS THE WHOLE ANSWER TO THE
     * CLOCK PROBLEM. A Stripe test clock moves STRIPE's clock; the runner counts
     * back two days from the stored end using the SERVER's. Injecting the instant
     * removes the need for the two to agree: the mirror supplies the end date, this
     * supplies the moment, and the pure verdict does the rest.
     *
     * 09:05 local, and `atLocalTime` resolves the REAL offset for that day rather
     * than assuming +10 — AEDT starts in October and these dates are weeks out.
     */
    const tooEarly = atLocalTime(trialEndIso, 5, "09:05", TZ);
    const before = await fireReminder(run.userId, tooEarly, sink);
    c.check("CONTROL: nothing fires five days out (the promised day is two)",
      before.delivered === 0 && before.trialReminder !== undefined,
      `verdict=${before.trialReminder} delivered=${before.delivered}`);

    const promised = atLocalTime(trialEndIso, 2, "09:05", TZ);
    const outcome = await fireReminder(run.userId, promised, sink);
    c.arrived("⚠️ the reminder was DELIVERED — real bytes to a real endpoint",
      outcome.delivered === 1, `delivered=${outcome.delivered} verdict=${outcome.trialReminder}`);
    const capture = sink.received[sink.received.length - 1];
    c.check("⚠️ under a valid VAPID signature (a signed Authorization header)",
      Boolean(capture?.headers?.authorization) &&
        String(capture?.headers?.authorization).toLowerCase().includes("vapid"),
      String(capture?.headers?.authorization ?? "none").slice(0, 48));
    c.check("and it carried an encrypted payload rather than an empty ping",
      (capture?.bytes ?? 0) > 0, `${capture?.bytes ?? 0} bytes`);
    c.check("the runner stamped what it sent for, so it cannot fire twice",
      outcome.stampAfter !== null, `stamp=${outcome.stampAfter}`);

    /* ── DIRECTION 1: the reminder's moment is EARLIER than the charge's ── */
    c.check("⚠️ the reminder lands BEFORE the charge (instants, not strings)",
      earlierThan(promised.toISOString(), trialEndIso),
      `reminder=${promised.toISOString()} charge=${trialEndIso}`);
    c.check("and by two whole days, which is what the screen promises",
      Math.round((Date.parse(trialEndIso) - promised.getTime()) / DAY_MS) === 2,
      `${((Date.parse(trialEndIso) - promised.getTime()) / DAY_MS).toFixed(2)} days`);

    /* ── DIRECTION 2: no money had moved at that moment ── */
    const paid = await invoicesPaid();
    c.check("⚠️ and nothing had been charged yet when it went out",
      paid.length === 0, `${paid.length} paid invoice(s) at the reminder instant`);

    observed.leg2 = {
      reminderInstant: promised.toISOString(),
      delivered: outcome.delivered,
      verdict: outcome.trialReminder,
      stamp: outcome.stampAfter,
    };
  }, 300_000);

  it("LEG 3: the first charge", async () => {
    c.at("LEG 3 — THE FIRST CHARGE");
    if (!run.subId) return void c.arrived("leg 1 produced a subscription", false);

    const since = Date.now();
    console.log("  advancing past the trial end…");
    await theClock.advanceTo(at(7, 2));
    const sent = await drainEvents(run.customerId, since, seenEvents);
    console.log(`  delivered ${sent.length} event(s): ${sent.map((s) => s.type).join(", ")}`);

    const sub = await subscription();
    c.arrived("⚠️ Stripe says the subscription is ACTIVE", sub.status === "active", `status=${sub.status}`);

    const paid = await invoicesPaid();
    c.arrived("⚠️ Stripe holds exactly one PAID invoice", paid.length === 1, `${paid.length} paid`);
    const invoice = paid[0];
    if (invoice) {
      c.check("the amount charged is the weekly price, in the right currency",
        invoice.amount_paid === 399 && invoice.currency === "usd",
        `${invoice.amount_paid} ${invoice.currency}`);
      c.check("and it is the FIRST charge — nothing was taken during the trial",
        invoice.billing_reason === "subscription_cycle" || invoice.billing_reason === "subscription_create",
        `billing_reason=${invoice.billing_reason}`);
      /**
       * ⚠️ THE SECOND HALF OF LEG 2, AND IT IS ONLY AVAILABLE IN A LIFETIME.
       * A fragment can assert the reminder fired. Only a run that carries the
       * reminder's instant forward past the charge can assert it against the
       * invoice that actually took the money.
       */
      const paidAt = invoice.status_transitions?.paid_at;
      c.check("⚠️ the reminder went out BEFORE the invoice that actually charged them",
        Boolean(paidAt) && earlierThan(observed.leg2 ? (observed.leg2 as { reminderInstant: string }).reminderInstant : null, secondsToIso(paidAt!)),
        `reminder=${(observed.leg2 as { reminderInstant?: string } | undefined)?.reminderInstant} invoice paid_at=${paidAt ? secondsToIso(paidAt) : "none"}`);
    }

    const end = periodEnd(sub);
    const endIso = secondsToIso(end);
    observed.period3 = endIso;

    const ent = await pollFor(
      () => entitlementsFor(run.userId),
      (e) => sameInstant((e.rows?.[0] as { active_until?: string })?.active_until ?? null, endIso),
      { timeoutMs: 30_000 },
    );
    const entRow = ent?.rows?.[0] as Record<string, string | boolean | null> | undefined;
    c.check("⚠️ the entitlement ROLLED FORWARD to the new period end",
      sameInstant(entRow?.active_until as string | null, endIso),
      `entitlement=${entRow?.active_until} period_end=${endIso}`);
    c.check("and there is still exactly ONE entitlement row", ent?.rows?.length === 1,
      `${ent?.rows?.length} row(s)`);

    const mirror = await mirrorFor(run.userId);
    const row = mirror.rows?.[0] as Record<string, string | null> | undefined;
    c.check("the mirror's status followed to active", row?.status === "active", `status=${row?.status}`);
    c.check("the mirror's period end IS Stripe's, as instants",
      sameInstant(row?.current_period_end ?? null, endIso),
      `mirror=${row?.current_period_end} stripe=${endIso}`);

    const text = await billingText();
    c.check('⚠️ the screen now reads "Renews on {date}"',
      text.includes("Renews on") && text.includes(day(endIso)),
      text.split("\n").filter((l) => /Renews on|Ends on|Trial ends/.test(l)).join(" | ") || "no period row");
    c.check('⚠️ and "Trial ends" is GONE — the trial is over',
      !text.includes("Trial ends"),
      text.split("\n").filter((l) => /Trial ends/.test(l)).join(" | ") || "absent");
  }, 900_000);

  it("LEG 4: a renewal, and nothing of the first period lingers", async () => {
    c.at("LEG 4 — A RENEWAL");
    if (!run.subId) return void c.arrived("there is a subscription to renew", false);
    const previousEnd = observed.period3 as string;

    const since = Date.now();
    console.log("  advancing one full interval…");
    await theClock.advanceTo(at(14, 2));
    await drainEvents(run.customerId, since, seenEvents);

    const sub = await subscription();
    c.arrived("Stripe still says ACTIVE after the renewal", sub.status === "active", `status=${sub.status}`);
    const paid = await invoicesPaid();
    c.arrived("⚠️ Stripe holds a SECOND paid invoice", paid.length === 2, `${paid.length} paid`);
    c.check("the second charge is the same weekly amount",
      paid[0]?.amount_paid === 399 && paid[0]?.currency === "usd",
      `${paid[0]?.amount_paid} ${paid[0]?.currency}`);

    const endIso = secondsToIso(periodEnd(sub));
    observed.period4 = endIso;
    c.arrived("the period genuinely moved on", !sameInstant(endIso, previousEnd),
      `was ${previousEnd}, now ${endIso}`);

    const ent = await pollFor(
      () => entitlementsFor(run.userId),
      (e) => sameInstant((e.rows?.[0] as { active_until?: string })?.active_until ?? null, endIso),
      { timeoutMs: 30_000 },
    );
    const entRow = ent?.rows?.[0] as Record<string, string | boolean | null> | undefined;
    c.check("⚠️ the entitlement rolled forward AGAIN",
      sameInstant(entRow?.active_until as string | null, endIso),
      `entitlement=${entRow?.active_until} period_end=${endIso}`);

    /**
     * ⚠️ "NOTHING ABOUT THE FIRST PERIOD LINGERS" — the accumulation question, and
     * the one a fragment seeded fresh structurally cannot ask. Every one of these
     * is a state that would have been correct at leg 3 and is wrong now.
     */
    c.check("no entitlement row still points at the OLD period end",
      !(ent?.rows ?? []).some((r) => sameInstant((r as { active_until?: string }).active_until ?? null, previousEnd)),
      `rows: ${JSON.stringify(ent?.rows)}`);
    c.check("there is still exactly ONE entitlement row, not one per period",
      ent?.rows?.length === 1, `${ent?.rows?.length} row(s)`);
    const mirror = await mirrorFor(run.userId);
    c.check("there is still exactly ONE mirror row, not one per period",
      mirror.rows?.length === 1, `${mirror.rows?.length} row(s)`);
    const row = mirror.rows?.[0] as Record<string, string | null> | undefined;
    c.check("the mirror's period end moved with Stripe",
      sameInstant(row?.current_period_end ?? null, endIso),
      `mirror=${row?.current_period_end} stripe=${endIso}`);
    c.check("⚠️ the mirror no longer carries a trial end from a trial that is over",
      row?.trial_ends_at === null || !sameInstant(row?.trial_ends_at ?? null, observed.trialEndIso as string),
      `trial_ends_at=${row?.trial_ends_at}`);
    c.check("no courtesy marker exists yet — nothing has granted free time",
      !row?.courtesy_until, `courtesy_until=${row?.courtesy_until}`);

    const text = await billingText();
    c.check('the screen still reads "Renews on" with the NEW date',
      text.includes("Renews on") && text.includes(day(endIso)),
      text.split("\n").filter((l) => /Renews on|Ends on/.test(l)).join(" | "));
    c.check("⚠️ and it does not still name the previous period's date",
      !text.includes(day(previousEnd)) || day(previousEnd) === day(endIso),
      `old=${day(previousEnd)} new=${day(endIso)}`);
  }, 900_000);

  it("LEG 5: cancel through the app", async () => {
    c.at("LEG 5 — CANCEL");
    if (!run.subId) return void c.arrived("there is a subscription to cancel", false);
    const endIso = observed.period4 as string;

    livePage = await newContext();
    const { page } = livePage;
    {
      await page.goto(`${BASE_URL}/billing`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("text=Access", { timeout: 30_000 });
      const cancel = page.locator("button", { hasText: /^Cancel my /i }).first();
      c.arrived("the cancel control is on the screen", (await cancel.count()) > 0,
        (await cancel.textContent().catch(() => ""))?.trim() ?? "not found");
      await cancel.click();
      await page.waitForTimeout(800);

      const dialog = page.locator('[role="dialog"]').first();
      c.arrived("the confirm step opened", (await dialog.count()) > 0);
      const confirmText = await dialog.innerText().catch(() => "");
      console.log(`  confirm dialog:\n${confirmText}`);
      c.check("⚠️ the confirmation names the CORRECT end date, from Stripe",
        confirmText.includes(day(endIso)),
        `expected ${day(endIso)}; dialog said: ${confirmText.replace(/\n/g, " / ").slice(0, 200)}`);

      const yes = dialog.locator("button", { hasText: /^Yes, cancel/i }).first();
      c.arrived("the confirm control is present", (await yes.count()) > 0);
      await yes.click();
      await page.waitForTimeout(6000);

      /**
       * ⚠️ THE ORDERING ASSERTION, AND IT IS THE POINT OF THIS LEG.
       *
       * "The cancellation reaches Stripe BEFORE anything else happens." The offer
       * dialog is the thing that happens next, so the proof is that STRIPE ALREADY
       * CARRIES THE FLAG at the moment the offer is on screen. Read from the Stripe
       * object, never from the action's return value.
       */
      const offerDialog = page.locator('[role="dialog"]').first();
      const offerText = (await offerDialog.innerText().catch(() => "")) || "";
      const sub = await subscription();
      c.arrived("⚠️ STRIPE carries cancel_at_period_end BEFORE the offer is shown",
        sub.cancel_at_period_end === true,
        `cancel_at_period_end=${sub.cancel_at_period_end}; offer on screen=${offerText.includes("One more thing")}`);
      c.check("and Stripe did NOT end it immediately — the paid period is preserved",
        sub.status === "active" && !sub.canceled_at === false ? true : sub.status === "active",
        `status=${sub.status} cancel_at=${sub.cancel_at}`);
      c.check("the period end Stripe will end on is unchanged by cancelling",
        sameInstant(secondsToIso(periodEnd(sub)), endIso),
        `stripe=${secondsToIso(periodEnd(sub))} expected=${endIso}`);

      observed.offerDialogText = offerText;
      console.log(`  offer dialog:\n${offerText}`);
      /**
       * ⚠️ THE PAGE STAYS OPEN. Leg 6 acts on THIS dialog. Closing it here is what
       * made every leg-6 assertion vacuous on the first run.
       */
    }

    const mirror = await mirrorFor(run.userId);
    const row = mirror.rows?.[0] as Record<string, string | boolean | null> | undefined;
    c.check("the mirror recorded the scheduled cancellation without waiting for a webhook",
      row?.cancel_at_period_end === true, `cancel_at_period_end=${row?.cancel_at_period_end}`);

    const text = await billingText();
    c.check('⚠️ the screen reads "Ends on {date}" and no longer claims a renewal',
      text.includes("Ends on") && text.includes(day(endIso)) && !text.includes("Renews on"),
      text.split("\n").filter((l) => /Renews on|Ends on/.test(l)).join(" | ") || "no period row");
  }, 900_000);

  it("LEG 6: the save offer — the window is server-side, then accept it", async () => {
    c.at("LEG 6 — THE SAVE OFFER");
    if (!run.subId) return void c.arrived("there is a subscription to save", false);
    const endIso = observed.period4 as string;

    let customer = (await stripe.customers.retrieve(run.customerId)) as { metadata?: Record<string, string> };
    const shownAt = customer.metadata?.trackd_save_offer_shown_at;
    c.arrived("⚠️ the offer WAS offered — this account had never seen it",
      Boolean(shownAt), `trackd_save_offer_shown_at=${shownAt ?? "absent"}`);
    c.check("and it has not already been claimed",
      !customer.metadata?.trackd_save_offer_claimed_at,
      `claimed=${customer.metadata?.trackd_save_offer_claimed_at ?? "absent"}`);
    c.check("the dialog offered another WEEK, matching the weekly plan",
      /another week/i.test((observed.offerDialogText as string) ?? ""),
      ((observed.offerDialogText as string) ?? "").split("\n")[0] ?? "");
    if (!shownAt) return;

    /**
     * ⚠️ IS THE TEN MINUTES ENFORCED SERVER-SIDE, OR ONLY BY THE COUNTDOWN?
     *
     * The countdown on the dialog is the PROMISE; the server check is the thing
     * that keeps it. A server action is a public HTTP endpoint, so "the dialog only
     * appears when the offer is live" is a statement about the screen.
     *
     * The measurement moves the offer's own server timestamp back eleven minutes
     * and then presses the REAL confirm button in a browser whose countdown still
     * believes it is live. That is the only way to put the client and the server
     * into disagreement without waiting eleven real minutes, and it tests exactly
     * the thing at issue: the request that arrives is the one a stale tab sends.
     *
     * ⚠️ IT IS RESTORED IMMEDIATELY AFTERWARDS, and `grantExtraTime` returns before
     * writing anything on the expired path, so the offer is not spent by this.
     */
    /** What Stripe held BEFORE the expired attempt, so "unchanged" is measurable. */
    const preAttempt = await subscription();
    const trialEndBefore = preAttempt.trial_end ? secondsToIso(preAttempt.trial_end) : null;

    const rewound = new Date(Date.parse(shownAt) - 11 * 60_000).toISOString();
    await stripe.customers.update(run.customerId, {
      metadata: { trackd_save_offer_shown_at: rewound },
    });
    /**
     * ⚠️ THE SAME PAGE LEG 5 LEFT OPEN, with the offer dialog still on it. The
     * client's own countdown still believes the offer is live — it is counting from
     * the `shownAt` it was handed at cancel time — so the request that goes out is
     * exactly the one a stale tab sends, which is the case the server check exists
     * for.
     */
    const page = livePage!.page;
    let refusalSeen = "";
    {
      const confirm = page.locator("button", { hasText: /Another week, thanks/i }).first();
      const reachable = (await confirm.count()) > 0;
      c.arrived("the offer's confirm control is on the dialog leg 5 opened",
        reachable, `${await confirm.count()} control(s)`);
      if (reachable) {
        await confirm.click();
        await page.waitForTimeout(6000);
        refusalSeen = await page.locator("body").innerText();
        console.log(`  after the expired claim:\n${refusalSeen.slice(0, 500)}`);
      }
    }
    /**
     * ⚠️ WITHOUT THIS, EVERY ASSERTION BELOW IS VACUOUS. On the first run the
     * control was not found, no request was sent, and "the window is enforced
     * server-side" PASSED — because nothing had happened. A guard that can only be
     * satisfied by the request actually going out is the difference between a
     * measurement and a tick.
     */
    const refusalActuallyTested = refusalSeen.length > 0;
    c.arrived("a real claim request was sent with an expired marker",
      refusalActuallyTested, refusalActuallyTested ? "" : "no request was sent; the checks below prove nothing");

    /**
     * ⚠️ STATED AS THE POSITIVE FACT, NOT AS A DISJUNCTION OF WAYS IT MIGHT BE FINE.
     *
     * A grant does two things and both are observable: it puts the subscription
     * into `trialing`, and it moves `trial_end` forward a week. "Nothing was
     * granted" is therefore "still not trialing AND trial_end is byte-for-byte
     * where it was", and it is guarded on the request having actually been sent.
     * The first draft was `a || b || c` with the guard on only the first term,
     * which `&&` binding tighter than `||` made meaningless.
     */
    const afterRefusal = await subscription();
    const trialEndAfter = afterRefusal.trial_end ? secondsToIso(afterRefusal.trial_end) : null;
    c.check("⚠️ THE TEN-MINUTE WINDOW IS ENFORCED SERVER-SIDE: an expired claim grants nothing",
      refusalActuallyTested &&
        afterRefusal.status !== "trialing" &&
        sameInstant(trialEndAfter, trialEndBefore),
      `sent=${refusalActuallyTested} status=${afterRefusal.status} trial_end before=${trialEndBefore} after=${trialEndAfter}`);
    c.check("and the cancellation still stands after the refusal",
      afterRefusal.cancel_at_period_end === true,
      `cancel_at_period_end=${afterRefusal.cancel_at_period_end}`);
    customer = (await stripe.customers.retrieve(run.customerId)) as { metadata?: Record<string, string> };
    c.check("and the refusal did NOT spend the once-ever offer",
      !customer.metadata?.trackd_save_offer_claimed_at,
      `claimed=${customer.metadata?.trackd_save_offer_claimed_at ?? "absent"}`);
    c.check("the user was told their cancellation stands and nothing was charged",
      /expired/i.test(refusalSeen) && /cancellation still stands/i.test(refusalSeen),
      refusalSeen.split("\n").filter((l) => /expire|cancellation/i.test(l)).join(" | ").slice(0, 200));
    observed.windowRefusal = refusalSeen.split("\n").filter((l) => /expire/i.test(l)).join(" | ");

    /* ── restore the true marker and ACCEPT the offer for real ── */
    await stripe.customers.update(run.customerId, {
      metadata: { trackd_save_offer_shown_at: shownAt },
    });

    const since = Date.now();
    let grantedText = "";
    {
      let confirm = page.locator("button", { hasText: /Another week, thanks/i }).first();
      if ((await confirm.count()) === 0) {
        // The refusal may have moved the dialog on; the way back in is still drawn
        // while the offer is live, and this page still remembers it.
        const back = page.locator("button", { hasText: /week/i }).first();
        if (await back.count()) await back.click().catch(() => {});
        await page.waitForTimeout(1000);
        confirm = page.locator("button", { hasText: /Another week, thanks/i }).first();
      }
      c.arrived("the offer is claimable again with the true marker restored",
        (await confirm.count()) > 0, `${await confirm.count()} control(s)`);
      if (await confirm.count()) {
        await confirm.click();
        await page.waitForTimeout(9000);
        grantedText = await page.locator("body").innerText();
      }
    }
    await livePage!.context.close();
    livePage = null;
    console.log(`  after accepting:\n${grantedText.slice(0, 600)}`);
    await drainEvents(run.customerId, since, seenEvents);

    const sub = await subscription();
    const courtesyIso = sub.trial_end ? secondsToIso(sub.trial_end) : null;
    observed.courtesyIso = courtesyIso;
    c.arrived("⚠️ Stripe moved trial_end — the free week is real", Boolean(sub.trial_end),
      `trial_end=${courtesyIso}`);
    c.check("⚠️ THE CANCELLATION IS LIFTED AT STRIPE",
      sub.cancel_at_period_end === false, `cancel_at_period_end=${sub.cancel_at_period_end}`);
    c.check("⚠️ the free time is trial_end, NEVER a coupon",
      !(sub as unknown as { discounts?: unknown[] }).discounts?.length,
      `discounts=${JSON.stringify((sub as unknown as { discounts?: unknown[] }).discounts ?? [])}`);
    c.check("and the extra time is exactly one week past the period they had paid for",
      Math.round((Date.parse(courtesyIso ?? "") - Date.parse(endIso)) / DAY_MS) === 7,
      `${((Date.parse(courtesyIso ?? "") - Date.parse(endIso)) / DAY_MS).toFixed(2)} days past ${endIso}`);

    customer = (await stripe.customers.retrieve(run.customerId)) as { metadata?: Record<string, string> };
    c.check("⚠️ the COURTESY MARKER is written on the customer",
      Boolean(customer.metadata?.trackd_save_offer_claimed_at),
      `claimed=${customer.metadata?.trackd_save_offer_claimed_at ?? "absent"}`);
    c.check("and the courtesy period is marked on the subscription itself",
      Boolean((sub.metadata ?? {})["trackd_courtesy_until"]),
      `trackd_courtesy_until=${(sub.metadata ?? {})["trackd_courtesy_until"] ?? "absent"}`);
    c.check("the subscription's courtesy marker IS the moved trial_end",
      sameInstant((sub.metadata ?? {})["trackd_courtesy_until"], courtesyIso),
      `marker=${(sub.metadata ?? {})["trackd_courtesy_until"]} trial_end=${courtesyIso}`);

    const mirror = await pollFor(
      () => mirrorFor(run.userId),
      (m) => Boolean((m.rows?.[0] as { courtesy_until?: string })?.courtesy_until),
      { timeoutMs: 30_000 },
    );
    const row = mirror?.rows?.[0] as Record<string, string | boolean | null> | undefined;
    c.check("the mirror carries the courtesy period",
      sameInstant((row?.courtesy_until as string | null) ?? null, courtesyIso),
      `mirror=${row?.courtesy_until} stripe=${courtesyIso}`);
    c.check("and the mirror's cancellation flag was lifted with it",
      row?.cancel_at_period_end === false, `cancel_at_period_end=${row?.cancel_at_period_end}`);

    /**
     * ⚠️ THE DATE THE SCREEN NAMES IS THE DATE STRIPE HOLDS. Asserted against
     * Stripe's own `trial_end`, never against a date computed here.
     */
    c.check("⚠️ the granted screen named the date Stripe actually holds",
      grantedText.includes(day(courtesyIso!)),
      `expected ${day(courtesyIso!)}; screen: ${grantedText.split("\n").filter((l) => /\d{4}/.test(l)).join(" | ").slice(0, 200)}`);
    const text = await billingText();
    c.check('⚠️ and /billing reads "Free until {that same date}"',
      text.includes("Free until") && text.includes(day(courtesyIso!)),
      text.split("\n").filter((l) => /Free until|Renews on|Ends on|Trial ends/.test(l)).join(" | "));
    c.check("⚠️ the word 'trial' is withheld — this is a paying customer on free time",
      !/Trial ends/.test(text), text.split("\n").filter((l) => /[Tt]rial/.test(l)).join(" | ") || "absent");
  }, 900_000);

  it("LEG 7: the reminder before the courtesy charge does not say 'trial'", async () => {
    c.at("LEG 7 — THE REMINDER BEFORE THE COURTESY CHARGE");
    const courtesyIso = observed.courtesyIso as string | null;
    if (!courtesyIso) return void c.arrived("leg 6 produced a courtesy end", false);

    sink.clear();
    const promised = atLocalTime(courtesyIso, 2, "09:05", TZ);
    const outcome = await fireReminder(run.userId, promised, sink);
    c.arrived("⚠️ a SECOND reminder was delivered, against the MOVED end",
      outcome.delivered === 1, `delivered=${outcome.delivered} verdict=${outcome.trialReminder}`);
    c.check("it was not swallowed by the first reminder's stamp",
      outcome.stampAfter !== null && outcome.stampAfter !== (observed.leg2 as { stamp?: string })?.stamp,
      `stamp now=${outcome.stampAfter}, was=${(observed.leg2 as { stamp?: string })?.stamp}`);
    c.check("it lands two days before the courtesy charge",
      earlierThan(promised.toISOString(), courtesyIso) &&
        Math.round((Date.parse(courtesyIso) - promised.getTime()) / DAY_MS) === 2,
      `reminder=${promised.toISOString()} charge=${courtesyIso}`);

    /**
     * ⚠️ THE WORDS, AND THE BOUNDARY OF WHAT THIS PROVES, STATED.
     *
     * The sink captures ENCRYPTED bytes — proving a delivery happened under a valid
     * signature is the claim it can make, and reading the words is not. So the copy
     * is asserted on the app's own composer evaluated against THIS ACCOUNT'S REAL
     * ROWS, read back from the database: the mirror's courtesy period is what
     * `resolveEnding` branches on, and it is the branch that decides whether the
     * word "trial" appears. This is the Law 5 violation `07` exists to prevent —
     * a paying customer on free time being told they are on a trial.
     */
    const { resolveEnding, trialReminderMessage } = await import("@/lib/notifications/trialReminder");
    const mirror = await mirrorFor(run.userId);
    const row = mirror.rows?.[0] as Record<string, string | null> | undefined;
    c.arrived("the mirror still carries the courtesy period the copy branches on",
      Boolean(row?.courtesy_until), `courtesy_until=${row?.courtesy_until}`);
    const ending = resolveEnding({
      isBetaGrace: false,
      courtesyUntil: row?.courtesy_until ?? null,
      noun: "week",
    });
    c.check("the app resolves this ending as a COURTESY period, not a trial",
      ending.kind === "courtesy", `kind=${ending.kind}`);
    const message = trialReminderMessage(
      { trialEndsAt: row?.courtesy_until ?? row?.trial_ends_at ?? null } as never,
      TZ,
      ending,
    );
    const words = `${message?.title ?? ""} ${message?.body ?? ""}`;
    console.log(`  reminder copy: ${words}`);
    c.arrived("the app composed a message for this state at all", Boolean(message), words);
    c.check("⚠️ THE REMINDER DOES NOT USE THE WORD 'trial' (Law 5 / 07)",
      !/trial/i.test(words), words);
    c.check("and it names the date the charge actually falls on",
      words.includes(
        new Intl.DateTimeFormat("en-AU", { timeZone: TZ, day: "numeric", month: "short" }).format(
          new Date(Date.parse(courtesyIso)),
        ),
      ),
      words);
    observed.leg7 = { words, delivered: outcome.delivered };
  }, 300_000);

  it("LEG 8: the charge after the free period", async () => {
    c.at("LEG 8 — THE CHARGE AFTER THE FREE PERIOD");
    const courtesyIso = observed.courtesyIso as string | null;
    if (!courtesyIso || !run.subId) return void c.arrived("there is a courtesy period to end", false);

    const since = Date.now();
    console.log("  advancing past the courtesy end…");
    await theClock.advanceTo(at(28, 2));
    await drainEvents(run.customerId, since, seenEvents);

    const sub = await subscription();
    c.arrived("Stripe left the free period and is ACTIVE again", sub.status === "active", `status=${sub.status}`);
    const paid = await invoicesPaid();
    c.arrived("⚠️ the courtesy period ended in a PAID invoice", paid.length === 3, `${paid.length} paid invoice(s)`);
    c.check("charged the weekly price, nothing more",
      paid[0]?.amount_paid === 399 && paid[0]?.currency === "usd",
      `${paid[0]?.amount_paid} ${paid[0]?.currency}`);

    const endIso = secondsToIso(periodEnd(sub));
    observed.period8 = endIso;
    const ent = await pollFor(
      () => entitlementsFor(run.userId),
      (e) => sameInstant((e.rows?.[0] as { active_until?: string })?.active_until ?? null, endIso),
      { timeoutMs: 30_000 },
    );
    c.check("⚠️ the entitlement rolled forward past the free week",
      sameInstant((ent?.rows?.[0] as { active_until?: string })?.active_until ?? null, endIso),
      `entitlement=${(ent?.rows?.[0] as { active_until?: string })?.active_until} period_end=${endIso}`);

    /**
     * ⚠️ THE ACCUMULATION QUESTION THIS LEG EXISTS FOR, AND ONLY A LIFETIME CAN ASK
     * IT: does the courtesy marker STOP BEING SPENT AS A PROMISE once the date it
     * names has gone by?
     *
     * "Free until {date}" is a promise about the FUTURE. The marker that produces it
     * was written at leg 6 and was true then. A fragment that seeds a courtesy
     * period and reads the screen cannot see what happens after the date passes,
     * because it never gets there.
     */
    const text = await billingText();
    const stalePromise = text.includes("Free until") && text.includes(day(courtesyIso));
    c.check('⚠️ the screen NO LONGER says "Free until {a date that has passed}"',
      !stalePromise,
      stalePromise
        ? `STILL PROMISING: "${text.split("\n").filter((l) => /Free until/.test(l)).join(" | ")}" but the courtesy period ended ${day(courtesyIso)} and they have since been charged`
        : text.split("\n").filter((l) => /Free until|Renews on|Ends on/.test(l)).join(" | "));
    c.check('the screen states the truth instead: "Renews on {new period end}"',
      text.includes("Renews on") && text.includes(day(endIso)),
      text.split("\n").filter((l) => /Renews on|Ends on|Free until/.test(l)).join(" | "));

    const mirror = await mirrorFor(run.userId);
    const row = mirror.rows?.[0] as Record<string, string | null> | undefined;
    observed.mirrorCourtesyAfterCharge = row?.courtesy_until ?? null;
    c.check("⚠️ and the mirror's courtesy marker is not still standing as a live promise",
      !row?.courtesy_until || !sameInstant(row.courtesy_until as string, courtesyIso),
      `courtesy_until=${row?.courtesy_until} (courtesy ended ${courtesyIso})`);
  }, 900_000);

  it("LEG 9: a decline on the next renewal", async () => {
    c.at("LEG 9 — A DECLINE");
    if (!run.subId) return void c.arrived("there is a subscription to decline", false);

    /**
     * ⚠️ `pm_card_chargeDeclined` THROWS AT ATTACH — Stripe validates the card when
     * it is attached, so it can never become a default and can never reach a
     * renewal. It models a CHECKOUT decline and cannot model a dunning failure.
     * `pm_card_chargeCustomerFail` attaches cleanly and fails every charge.
     *
     * ⚠️ AND IT GOES ON THE SUBSCRIPTION, NOT ONLY THE CUSTOMER. A subscription's
     * own `default_payment_method` wins, and `save_default_payment_method:
     * "on_subscription"` has already written the good card there — setting only the
     * customer's leaves the renewal PAID and the run reports "no failure" while
     * looking correct.
     */
    const bad = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", {
      customer: run.customerId,
    });
    await stripe.customers.update(run.customerId, {
      invoice_settings: { default_payment_method: bad.id },
    });
    await stripe.subscriptions.update(run.subId, { default_payment_method: bad.id });
    const armed = await subscription();
    c.arrived("the failing card is the SUBSCRIPTION's default, not just the customer's",
      (armed.default_payment_method as string) === bad.id,
      `sub default=${armed.default_payment_method} customer default=${bad.id}`);

    const since = Date.now();
    console.log("  advancing to the next renewal…");
    await theClock.advanceTo(at(35, 2));
    await drainEvents(run.customerId, since, seenEvents);

    const sub = await subscription();
    c.arrived("⚠️ Stripe says the subscription is PAST DUE", sub.status === "past_due", `status=${sub.status}`);

    const invoices = await stripe.invoices.list({ customer: run.customerId, limit: 10 });
    const open = invoices.data.find((i) => i.status === "open");
    c.arrived("⚠️ the renewal invoice FAILED and is open", Boolean(open),
      `${invoices.data.map((i) => `${i.id}:${i.status}`).join(", ")}`);
    observed.openInvoiceId = open?.id ?? null;

    const charges = await stripe.charges.list({ customer: run.customerId, limit: 10 });
    const failed = charges.data.find((ch) => ch.status === "failed");
    c.arrived("Stripe holds a FAILED charge, which is the declined date's source",
      Boolean(failed), failed ? `${failed.id} ${failed.failure_code}` : "none");
    /**
     * ⚠️ CHARGE TIMESTAMPS DO NOT FOLLOW A TEST CLOCK; INVOICE TIMESTAMPS DO. The
     * declined date is read off the CHARGE OBJECT and never computed from the
     * simulated timeline. In production there is no clock and the two agree.
     */
    const declinedIso = failed ? secondsToIso(failed.created) : null;
    observed.declinedIso = declinedIso;

    const mirror = await pollFor(
      () => mirrorFor(run.userId),
      (m) => (m.rows?.[0] as { status?: string })?.status === "past_due",
      { timeoutMs: 30_000 },
    );
    c.check("the mirror followed to past_due",
      (mirror?.rows?.[0] as { status?: string })?.status === "past_due",
      `status=${(mirror?.rows?.[0] as { status?: string })?.status}`);

    /**
     * ⚠️ THE ENTITLEMENT IS SHORTENED TO THE PAID-THROUGH DATE PLUS THREE DAYS, and
     * it is read back from the row the app's own webhook wrote — never computed
     * here. `markPastDue` uses the start of the UNPAID period, which is the end of
     * the last period they actually paid for.
     */
    const paidThroughIso = observed.period8 as string;
    const ent = await entitlementsFor(run.userId);
    const activeUntil = (ent.rows?.[0] as { active_until?: string })?.active_until ?? null;
    observed.graceEndsIso = activeUntil;
    c.check("⚠️ the entitlement was SHORTENED to paid-through plus the three-day grace",
      Boolean(activeUntil) &&
        Math.round((Date.parse(activeUntil!) - Date.parse(paidThroughIso)) / DAY_MS) === 3,
      `paid through ${paidThroughIso}, access to ${activeUntil} (${activeUntil ? ((Date.parse(activeUntil) - Date.parse(paidThroughIso)) / DAY_MS).toFixed(2) : "?"} days)`);
    c.check("and it is SHORTER than the unpaid period it replaced",
      earlierThan(activeUntil, secondsToIso(periodEnd(sub))),
      `access=${activeUntil} unpaid period end=${secondsToIso(periodEnd(sub))}`);

    const text = await billingText();
    c.arrived("the declined card is on the screen",
      text.includes("Your payment didn't go through"),
      text.split("\n").slice(0, 6).join(" / "));
    c.check("⚠️ the declined date comes from the failed Stripe CHARGE",
      Boolean(declinedIso) &&
        text.includes(`Your card was declined on ${day(declinedIso!)}. Update your card details and we'll take it from there.`),
      `expected date ${declinedIso ? day(declinedIso) : "?"}; line: ${text.split("\n").find((l) => /declined on/.test(l)) ?? "absent"}`);
    c.check("⚠️ the PRE-LAPSE sentence renders, with the entitlement's own date",
      Boolean(activeUntil) &&
        text.includes(`Your account stays as it is until ${day(activeUntil!)}, and goes read only after that until a payment goes through.`),
      text.split("\n").find((l) => /stays as it is until/.test(l)) ?? "absent");
    c.check("F3: a past-due account is NOT told anything renews",
      !text.includes("Renews on"),
      text.split("\n").filter((l) => /Renews on|Ends on/.test(l)).join(" | "));

    saveState({
      notes: {
        ...observed,
        graceEndsIso: activeUntil,
        openInvoiceId: open?.id ?? null,
        declinedIso,
        t0Ms: run.t0,
      },
    });
    console.log(`\n  ⚠️ ACCESS ENDS (wall clock) AT ${activeUntil} — in ${activeUntil ? ((Date.parse(activeUntil) - Date.now()) / 60000).toFixed(1) : "?"} real minutes`);
  }, 900_000);
});
