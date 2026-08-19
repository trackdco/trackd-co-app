/**
 * SPEC 08 Step 5 — THE DECLINED CARD, AGAINST REAL STRIPE ON A TEST CLOCK.
 *
 *   npx next dev -p 3100 -H 127.0.0.1     # NO flags
 *   node scratchpad/qa-08-step5-declined.mjs
 *
 * Step 5's verify: "drive a decline on a test clock and confirm both dates match
 * Stripe and the entitlement respectively."
 *
 * ⚠️ NO FIXTURE, BY RULE 3 OF THE SPEC. "Billing is verified against real Stripe
 * test mode, never a fixture. The defects live in Stripe's own state machine."
 * So the subscription is really created, really paid, and really declined on a
 * renewal, and the entitlement is written by the app's OWN webhook handler from
 * the real invoice — never typed in here. A driver that computes the date the app
 * is supposed to compute is a fixture wearing a costume.
 *
 * ⚠️ EACH DATE IS ASSERTED AGAINST ITS OWN SOURCE.
 *   the failure date  <- the failed Stripe CHARGE object
 *   the access date   <- the `entitlements` row
 * Never against each other, never for date-shape. And they are seeded APART by
 * construction: the renewal is a week out and the grace is three days past the
 * unpaid period's start, so a coincidence cannot make this pass.
 *
 * ⚠️ CHARGE TIMESTAMPS DO NOT FOLLOW A TEST CLOCK; INVOICE TIMESTAMPS DO.
 * Measured (`probe-declined-fields.mjs`): in one captured state the invoice read
 * 2026-08-24 (simulated) and the failed charge read 2026-08-17 (wall clock),
 * eight days apart. In production there is no clock and the two agree. This is
 * why the failure assertion reads the charge object rather than any date this
 * script could calculate.
 *
 * ⚠️ TEARDOWN: the TEST CLOCK is deleted explicitly, which removes the customer,
 * the subscription and the failed invoice with it. Deleting only the customer
 * leaves the subscription and invoice behind as permanent test-mode residue —
 * `11`'s first real run reported 206 findings that were mostly exactly that.
 * Stripe is cleaned BEFORE the app user, because deleting the user cascades away
 * `billing_customers`, which is the only mapping back to the Stripe customer.
 */
import { chromium } from "playwright";

import { stripe, env, TEST_PM } from "./qa-billing.mjs";
/**
 * ⚠️ `dropUser` AND `signIn` COME FROM `admin.mjs`, NOT `qa-billing.mjs`.
 *
 * `qa-billing.mjs` re-exports only `admin`, `env` and `makeUser`. Importing the
 * other two from it is an ESM LINK error, which throws before the `try` block is
 * entered — so the `finally` never runs and the test clock leaks. esbuild parses
 * the file happily because it does not resolve imports; only running it finds
 * this, and by then a clock exists.
 */
import { admin, makeUser, dropUser, signIn } from "./admin.mjs";

const PRICE = env.STRIPE_PRICE_WEEKLY ?? env.STRIPE_PRICE_MONTHLY;
if (!PRICE) throw new Error("no weekly or monthly price in .env.local");
const WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET is not set in .env.local");

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "  ✅" : "  ❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

/** ⚠️ §3.5's signed copy, character for character. */
const DECLINED = {
  title: "Your payment didn't go through",
  declinedOn: (d) =>
    `Your card was declined on ${d}. Update your card details and we'll take it from there.`,
  accessUntil: (d) =>
    `Your account stays as it is until ${d}, and goes read only after that until a payment goes through.`,
  dismiss: "Not now",
  primary: "Update my card",
};

/** The house date format. en-AU abbreviates September with FOUR letters. */
const day = (isoStr) =>
  new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.parse(isoStr)));

/** Deliver a real Stripe event to the local webhook, signed the way Stripe signs. */
async function deliver(type, object) {
  const payload = JSON.stringify({
    id: `evt_qa08_${Date.now()}`,
    object: "event",
    api_version: "2026-07-29.dahlia",
    created: Math.floor(Date.now() / 1000),
    type,
    data: { object },
  });
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
  const res = await fetch("http://localhost:3100/api/stripe/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: payload,
  });
  return { status: res.status, body: await res.text() };
}

let clock = null;
let userId = null;
const browser = await chromium.launch();

try {
  /* ══ a real subscription, really past due ══════════════════════ */
  clock = await stripe.testHelpers.testClocks.create({
    frozen_time: Math.floor(Date.now() / 1000),
    name: "qa08-step5",
  });
  const user = await makeUser("qa08-declined");
  userId = user.id;
  await admin
    .from("profiles")
    .update({ timezone: "Australia/Sydney" })
    .eq("id", user.id);

  const customer = await stripe.customers.create({
    email: user.email,
    test_clock: clock.id,
    metadata: { user_id: user.id, purpose: "spec08-step5" },
  });
  // ⚠️ Attach first, then name the ATTACHED id: a shared test token is cloned on
  // attach, so `invoice_settings` must reference the clone and not the token.
  const good = await stripe.paymentMethods.attach(TEST_PM.visa, { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: good.id },
  });
  await admin
    .from("billing_customers")
    .insert({ user_id: user.id, stripe_customer_id: customer.id });

  let sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: PRICE }],
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice"],
  });
  await stripe.invoices.pay(sub.latest_invoice.id, { payment_method: good.id });
  sub = await stripe.subscriptions.retrieve(sub.id);
  check("ARRIVAL: the subscription is really ACTIVE before anything fails", sub.status === "active", sub.status);

  const periodEnd = sub.items.data[0].current_period_end ?? sub.current_period_end;

  // Let the app write its own mirror + entitlement from the real object.
  const created = await deliver("customer.subscription.created", sub);
  check("ARRIVAL: the app's webhook accepted the real subscription", created.status === 200, `${created.status} ${created.body}`);

  /**
   * ⚠️ THE CARD THAT FAILS ON THE RENEWAL IS NOT `pm_card_chargeDeclined`.
   * Measured: attaching that one throws `StripeCardError` immediately — Stripe
   * validates at attach time, so it can never become a default and never reach a
   * renewal. `pm_card_chargeCustomerFail` attaches cleanly and fails every charge.
   *
   * ⚠️ AND IT GOES ON THE SUBSCRIPTION, NOT ONLY THE CUSTOMER. Measured: setting
   * only `customer.invoice_settings.default_payment_method` changed nothing and
   * the renewal was PAID, because `save_default_payment_method: "on_subscription"`
   * had written the good card onto the subscription and that one wins.
   */
  const bad = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", {
    customer: customer.id,
  });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: bad.id },
  });
  await stripe.subscriptions.update(sub.id, { default_payment_method: bad.id });

  console.log("  advancing the clock past the renewal…");
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: periodEnd + 3600 });
  for (let i = 0; i < 90; i += 1) {
    const c = await stripe.testHelpers.testClocks.retrieve(clock.id);
    if (c.status === "ready") break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  sub = await stripe.subscriptions.retrieve(sub.id, { expand: ["latest_invoice"] });
  check("ARRIVAL: Stripe says the subscription is PAST DUE", sub.status === "past_due", sub.status);

  /* ── the app writes the entitlement from the REAL invoice ── */
  const invoice = await stripe.invoices.retrieve(
    sub.latest_invoice.id ?? sub.latest_invoice,
    { expand: ["lines"] },
  );
  const failedEvent = await deliver("invoice.payment_failed", invoice);
  check(
    "ARRIVAL: the app's own webhook processed invoice.payment_failed",
    failedEvent.status === 200,
    `${failedEvent.status} ${failedEvent.body}`,
  );
  await deliver("customer.subscription.updated", sub);

  /* ══ THE TWO SOURCES, READ INDEPENDENTLY ══════════════════════ */
  const charges = await stripe.charges.list({ customer: customer.id, limit: 10 });
  const failedCharge = charges.data.find((c) => c.status === "failed");
  check(
    "ARRIVAL: Stripe holds a FAILED charge, which is the failure date's source",
    Boolean(failedCharge),
    failedCharge ? `${failedCharge.id} ${failedCharge.failure_code}` : "none",
  );
  const STRIPE_FAILURE_ISO = new Date(failedCharge.created * 1000).toISOString();

  const ent = await admin
    .from("entitlements")
    .select("source, active_until, is_active")
    .eq("user_id", user.id)
    .eq("source", "stripe");
  /**
   * ⚠️ `?? 0` MADE A FAILED READ LOOK LIKE AN EMPTY ONE (5.3). Supabase returns
   * `data: null` on error, so `(data?.length ?? 0) === 0` was TRUE both when the
   * fixture genuinely had no rows and when the QUERY FAILED — on an ARRIVAL
   * check, whose whole job is to establish the state before anything is claimed
   * about it. Without the coalesce, `undefined === 0` is false and it fails
   * correctly; the error is asserted too, so the reason is named rather than
   * inferred. The shape already used correctly elsewhere in these files is
   * `data?.length === N`.
   */
  check(
    "ARRIVAL: the entitlements read WORKED",
    ent.error === null,
    ent.error ? `${ent.error.code}: ${ent.error.message}` : "no error",
  );
  check(
    "ARRIVAL: the app wrote an entitlement row, which is the access date's source",
    ent.data?.length === 1 && ent.data[0].active_until !== null,
    `active_until=${ent.data?.[0]?.active_until ?? "none"}`,
  );
  const ENTITLEMENT_ISO = ent.data[0].active_until;

  const mirror = await admin
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id);
  check(
    "ARRIVAL: the mirror says past_due, so the screen will render the declined card",
    mirror.data?.[0]?.status === "past_due",
    `status=${mirror.data?.[0]?.status}`,
  );

  console.log(`\n  failure date (Stripe charge)   ${STRIPE_FAILURE_ISO}  -> ${day(STRIPE_FAILURE_ISO)}`);
  console.log(`  access date  (entitlement row) ${ENTITLEMENT_ISO}  -> ${day(ENTITLEMENT_ISO)}`);
  check(
    "⚠️ §3.5: THE TWO DATES ARE GENUINELY DIFFERENT, not a coincidence",
    day(STRIPE_FAILURE_ISO) !== day(ENTITLEMENT_ISO),
    `${day(STRIPE_FAILURE_ISO)} vs ${day(ENTITLEMENT_ISO)}`,
  );

  /* ══ THE SCREEN ══════════════════════════════════════════════ */
  const session = await signIn(user);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies(
    [...session.jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })),
  );
  const page = await context.newPage();
  await page.goto("http://localhost:3100/billing", { waitUntil: "networkidle" });
  const text = await page.locator("body").innerText();
  console.log(`\n--- /billing for a past-due account ---\n${text}\n---`);

  check("§3.5 title, character for character", text.includes(DECLINED.title));
  check(
    "⚠️ §3.5 first sentence carries the date FROM THE STRIPE CHARGE",
    text.includes(DECLINED.declinedOn(day(STRIPE_FAILURE_ISO))),
    `expected "${DECLINED.declinedOn(day(STRIPE_FAILURE_ISO))}"`,
  );
  check(
    "⚠️ §3.5 second sentence carries the date FROM THE ENTITLEMENT ROW",
    text.includes(DECLINED.accessUntil(day(ENTITLEMENT_ISO))),
    `expected "${DECLINED.accessUntil(day(ENTITLEMENT_ISO))}"`,
  );
  check(`§3.5 dismiss reads "${DECLINED.dismiss}"`, text.includes(DECLINED.dismiss));
  check(`§3.5 primary reads "${DECLINED.primary}"`, text.includes(DECLINED.primary));
  check("no em dash on the screen", !text.includes("—"));

  /* ── ⚠️ THE STATE NEVER THREATENS DATA (§3.5) ── */
  for (const word of ["delete", "deleted", "lost", "lose", "removed", "at risk"]) {
    check(`§3.5: the screen never threatens data ("${word}")`, !text.toLowerCase().includes(word));
  }
  check(
    '§3.5: "read only" is the exact phrase',
    /read only/.test(text) && !/read-only/.test(text),
  );

  /* ── §3.9: ABOVE the plan card, replacing nothing ── */
  check(
    "§3.9: the declined card sits ABOVE the plan card",
    text.indexOf(DECLINED.title) < text.indexOf("Access"),
    `declined at ${text.indexOf(DECLINED.title)}, Access at ${text.indexOf("Access")}`,
  );
  check(
    "§3.9: and it REPLACES nothing — the plan card is still there",
    text.includes("Access") && text.includes("Price"),
  );
  check(
    "§3.9: the cancel control is still offered to a past-due account",
    /Cancel my/.test(text),
  );
  check(
    "F3 (regression): a past-due account is NOT told anything renews",
    !/Renews on/.test(text) && /Ends on/.test(text),
    text.split("\n").filter((l) => /Renews|Ends on/.test(l)).join(" | "),
  );

  /* ── D37: the primary action routes THROUGH the handoff ── */
  const handoff = page.locator('[role="dialog"][aria-labelledby="handoff-title"]');
  check("⚠️ the handoff is NOT open before pressing anything", (await handoff.count()) === 0);
  await page.locator("button", { hasText: DECLINED.primary }).first().click();
  await page.waitForTimeout(500);
  check(
    "D37: 'Update my card' routes through the handoff dialog, never straight to Stripe",
    (await handoff.count()) > 0,
    `${await handoff.count()} dialog(s); url=${page.url()}`,
  );
  check(
    "D37: and it is the SAME handoff, with the same signed copy",
    (await handoff.innerText()).includes("You're off to Stripe"),
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  /* ── "Not now" dismisses the card for this view only ── */
  await page.locator("button", { hasText: DECLINED.dismiss }).first().click();
  await page.waitForTimeout(300);
  const afterDismiss = await page.locator("body").innerText();
  check("§3.5: 'Not now' dismisses the declined card", !afterDismiss.includes(DECLINED.title));
  check(
    "CONTROL: and the plan card is untouched by the dismissal",
    afterDismiss.includes("Access") && /Cancel my/.test(afterDismiss),
  );
  await page.reload({ waitUntil: "networkidle" });
  const afterReload = await page.locator("body").innerText();
  check(
    "⚠️ the dismissal is NOT persisted — a state that is still true comes back",
    afterReload.includes(DECLINED.title),
    "a card that stayed dismissed would let somebody wave away their only warning",
  );
} finally {
  await browser.close();
  /**
   * ⚠️ STRIPE FIRST, THEN THE USER, AND THE CLOCK EXPLICITLY.
   *
   * Deleting the app user cascades away `billing_customers`, which is the only
   * mapping back to the Stripe customer — so Stripe is cleaned while that mapping
   * still exists. And the CLOCK is deleted rather than the customer: Stripe keeps
   * subscriptions and invoices after a customer is deleted, so the failed invoice
   * would otherwise be permanent test-mode residue.
   */
  if (clock) {
    await stripe.testHelpers.testClocks
      .del(clock.id)
      .then(() => console.log(`\nstripe: test clock deleted (${clock.id}), with every object on it`))
      .catch((e) => console.warn(`\n⚠️ clock del failed: ${e.message}`));
  }
  if (userId) {
    await admin.from("subscriptions").delete().eq("user_id", userId);
    await admin.from("entitlements").delete().eq("user_id", userId);
    await admin.from("billing_customers").delete().eq("user_id", userId);
    await dropUser(userId);
    console.log(`torn down by id: ${userId}`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    console.log("FAILED:");
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
    process.exitCode = 1;
  }
}
