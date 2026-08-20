/**
 * GROUP A — THE THREE-DAY GRACE, DRIVEN ON A REAL STRIPE TEST CLOCK.
 *
 * The clock run measured the grace at 0.00 days. This drives the property:
 *
 *   after a RENEWAL payment fails, the entitlement ends exactly
 *   PAST_DUE_GRACE_DAYS after the PAID-THROUGH date
 *
 * and every bound around it, plus the CONTROL that the clawback direction — the
 * behaviour that already existed — still works.
 *
 * ⚠️ THE DRIVER NEVER COMPUTES THE DATE THE APP IS SUPPOSED TO COMPUTE. It reads
 * the paid-through date off the FAILING INVOICE'S OWN LINE and the access date off
 * `entitlements.active_until`, and subtracts. A driver that calculated
 * "period start plus three days" would prove the arithmetic agrees with itself.
 *
 * ⚠️ THE CLOCK IS FROZEN IN THE PAST. The app compares entitlement dates against
 * WALL CLOCK while a test clock moves only Stripe's, so a clock frozen at `now`
 * puts every simulated date in the wall-clock future and a lapsed account still
 * reads entitled.
 */
import {
  BASE, Checks, admin, advanceTo, days, deliver, entitlement, env, eventsFor,
  iso, mirror, newClock, record, stripe, teardown, DAY,
} from "./lib.mjs";
import { makeUser } from "../admin.mjs";

const c = new Checks();
const seen = new Set();
/**
 * ⚠️ THE WALL-CLOCK MOMENT THE RUN STARTED. `event.created` does not follow a
 * test clock, so every event sweep is bounded by this and never by `t0`, which is
 * forty simulated days in the past. Passing `t0` made one sweep take 3m39s.
 */
const runStart = Date.now() - 60_000;

/** Deliver every real event since `since`, oldest first, skipping ones already sent. */
async function drain(customerId, since, only = null) {
  const sent = [];
  for (const e of await eventsFor(customerId, since)) {
    if (seen.has(e.id)) continue;
    if (only && !only.includes(e.type)) continue;
    seen.add(e.id);
    const { status } = await deliver(e, { id: e.id });
    sent.push({ type: e.type, id: e.id, status });
  }
  return sent;
}

try {
  const res = await fetch(`${BASE}/login`, { redirect: "manual" });
  if (res.status >= 500) throw new Error(`dev server not healthy: ${res.status}`);

  /* ── leg 1: an account paying weekly, on a clock frozen 40 days back ── */
  c.at("leg 1 — a paying weekly subscriber");
  const t0 = Date.now() - 40 * DAY;
  const clock = await newClock(t0);
  const user = await makeUser("qa-fin-a");
  record("users", user.id);
  const customer = await stripe.customers.create({
    email: user.email, test_clock: clock,
    payment_method: "pm_card_visa",
    invoice_settings: { default_payment_method: "pm_card_visa" },
    metadata: { user_id: user.id },
  });
  record("customers", customer.id);
  {
    const { error } = await admin.from("billing_customers")
      .insert({ user_id: user.id, stripe_customer_id: customer.id });
    if (error) throw new Error(`billing_customers: ${error.message}`);
  }
  /**
   * ⚠️ THE SHARED TOKEN IS NOT A PAYMENT METHOD ID. `pm_card_visa` is accepted by
   * `customers.create` (which ATTACHES it and mints a real `pm_...`) and refused
   * by `subscriptions.create` with `resource_missing` on `default_payment_method`.
   * Cost this drive one run. The real id is read back off the customer.
   */
  const goodCard = customer.invoice_settings?.default_payment_method;
  if (!goodCard) throw new Error("the customer has no default payment method to subscribe with");
  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: env.STRIPE_PRICE_WEEKLY }],
    default_payment_method: typeof goodCard === "string" ? goodCard : goodCard.id,
    metadata: { user_id: user.id },
  });
  c.arrived("the subscription is live and paying", sub.status === "active", `status=${sub.status}`);

  /**
   * ⚠️ POLLED. Stripe's event stream lags the API call that produced it by a
   * second or two, so a single sweep immediately after `subscriptions.create`
   * finds nothing and the entitlement read comes back `undefined` — measured on
   * this run. The row is never written by hand; the drain is simply repeated
   * until the app's own handler has had the event to act on.
   */
  let granted = null;
  for (let i = 0; i < 15 && !granted?.active_until; i += 1) {
    await drain(customer.id, runStart);
    granted = await entitlement(user.id);
    if (!granted?.active_until) await new Promise((r) => setTimeout(r, 2000));
  }
  c.arrived("the app's own webhook granted the entitlement", Boolean(granted?.active_until),
    `active_until=${granted?.active_until} is_active=${granted?.is_active}`);

  /* ── leg 2: the card stops working, and the next renewal fails ── */
  c.at("leg 2 — the renewal declines");
  /**
   * ⚠️ pm_card_chargeCustomerFail, AND IT GOES ON THE SUBSCRIPTION.
   * `pm_card_chargeDeclined` throws AT ATTACH and can never reach a renewal, so
   * it models a checkout decline and not a dunning failure. And a subscription's
   * own default beats the customer's: set only at customer level, the renewal
   * is PAID and the run reports "no failure" while looking correct.
   */
  const badCard = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", {
    customer: customer.id,
  });
  await stripe.subscriptions.update(sub.id, { default_payment_method: badCard.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: badCard.id },
  });

  /**
   * ⚠️ THE RENEWAL CYCLE AND THE CHARGE ATTEMPT ARE NOT THE SAME MOMENT.
   *
   * Measured on this run: advancing to `t0 + 7d + 1min` rolled the subscription
   * forward and left the invoice **`draft`** with `attempt_count: 0`. Stripe
   * finalizes a subscription's draft invoice about an hour after it is created,
   * and only then charges the card — so a driver that advances to the period end
   * observes `status: active` and reports "no failure" while everything is
   * working correctly. Three hours past the boundary, which is comfortably clear.
   */
  const failAt = t0 + 7 * DAY;

  /**
   * ⚠️ THE ROLL-FORWARD IS OBSERVED FIRST, AND IT HAS TO BE OBSERVED *LIVE*.
   *
   * Stripe's real sequence is:
   *
   *   1. `customer.subscription.updated` -> **active**, period rolled forward
   *   2. `invoice.payment_failed`
   *   3. `customer.subscription.updated` -> `past_due`
   *
   * Step 1 is indistinguishable from a successful renewal, so `syncSubscription`
   * correctly extends `active_until` into the new period — and THAT is the
   * longer-dated entitlement `markPastDue` exists to claw back. It is the state
   * that measured "14 Aug became 14 Sept on a card that declined".
   *
   * ⚠️ IT CANNOT BE OBSERVED BY REPLAYING THE EVENT LATER. Every subscription
   * handler re-reads the LIVE object, deliberately, so arrival order cannot change
   * the answer — replay step 1 after step 3 and the app reads `past_due`, declines
   * to extend, and is RIGHT to. The first attempt at this control did exactly that
   * and measured 0.00 days of roll-forward on a perfectly working app.
   *
   * So the clock stops between the cycle rolling and the invoice finalizing, and
   * the events are drained there, while `active` is still the truth.
   */
  await advanceTo(clock, failAt + 60_000);
  await drain(customer.id, runStart);
  const afterRollForward = await entitlement(user.id);
  const midSub = await stripe.subscriptions.retrieve(sub.id);
  c.arrived("the cycle rolled forward while the subscription was still active",
    midSub.status === "active", `status=${midSub.status} period_end=${iso(midSub.items.data[0].current_period_end)}`);

  /**
   * ⚠️ AND THE INVOICE IS NOT CHARGED AT THE CYCLE BOUNDARY. Stripe finalizes a
   * subscription's draft invoice about an hour after creating it, and charges only
   * then. Measured on this run: at `t0 + 7d + 1min` the invoice was **`draft`**
   * with `attempt_count: 0` and the subscription `active`, so a driver that stops
   * here reports "no failure" while everything is working correctly.
   */
  await advanceTo(clock, failAt + 3 * 60 * 60 * 1000);

  const failed = (await stripe.invoices.list({ customer: customer.id, limit: 10 }))
    .data.find((i) => i.status === "open");
  c.arrived("Stripe left an OPEN invoice on the renewal", Boolean(failed),
    failed ? `${failed.id} ${failed.status} attempt_count=${failed.attempt_count}` : "none");
  const live = await stripe.subscriptions.retrieve(sub.id);
  c.arrived("the subscription is past_due at Stripe", live.status === "past_due", `status=${live.status}`);

  /**
   * ⚠️ THE PAID-THROUGH DATE, READ OFF THE FAILING INVOICE'S OWN LINE.
   *
   * On a `subscription_cycle` invoice the TOP-LEVEL period covers the cycle just
   * COMPLETED and the LINE carries the one that just failed. Reading the wrong one
   * put the grace a whole billing period in the past once.
   */
  const paidThrough = iso(failed.lines.data[0].period.start);
  const wouldHaveGiven = iso(failed.lines.data[0].period.end);
  console.log(`     paid through ${paidThrough}`);
  console.log(`     a successful renewal would have given access to ${wouldHaveGiven}`);

  /* ── the events, in Stripe's own order, snapshotting between them ── */
  c.at("leg 3 — the clawback control, then the grace");
  const ordered = (await eventsFor(customer.id, runStart)).filter((e) => !seen.has(e.id));
  console.log(`     ${ordered.length} event(s): ${ordered.map((e) => e.type).join(", ")}`);

  let failedEventId = null;
  let failedEventPayload = null;
  for (const e of ordered) {
    seen.add(e.id);
    await deliver(e, { id: e.id });
    if (e.type === "invoice.payment_failed") {
      failedEventId = e.id;
      failedEventPayload = e;
      break; // stop before the past_due update, so the two directions stay legible
    }
  }
  c.arrived("invoice.payment_failed reached the app", Boolean(failedEventId), failedEventId ?? "never arrived");

  /**
   * ⚠️ THE CONTROL FOR THE OTHER DIRECTION, AND IT IS A REAL STATE RATHER THAN A
   * SEEDED ONE. Stripe rolls the subscription forward into the new period and
   * fires `updated -> active` BEFORE the failure, so `syncSubscription`
   * legitimately extends `active_until` into a month nobody paid for. That is the
   * longer-dated entitlement `markPastDue` has to claw back.
   */
  const rolled = days(afterRollForward.active_until, paidThrough);
  c.check("CONTROL: the roll-forward really did extend the entitlement into the UNPAID period",
    rolled > 0,
    `active_until=${afterRollForward.active_until} is ${rolled.toFixed(2)}d past the paid-through date ` +
      `— this is the free week a failed payment used to buy`);

  const afterGrace = await entitlement(user.id);
  const graceDays = days(afterGrace.active_until, paidThrough);
  c.check("⚠️ THE PROPERTY: access ends exactly 3.00 days after the paid-through date",
    Math.abs(graceDays - 3) < 1e-6,
    `paid through ${paidThrough} -> access to ${afterGrace.active_until} = ${graceDays.toFixed(2)} days`);

  c.check("⚠️ THE CLAWBACK DIRECTION STILL WORKS: that is SHORTER than the roll-forward left standing",
    Date.parse(afterGrace.active_until) < Date.parse(afterRollForward.active_until),
    `${afterRollForward.active_until} -> ${afterGrace.active_until} ` +
      `(${days(afterRollForward.active_until, afterGrace.active_until).toFixed(2)}d taken back)`);

  c.check("bound 3: it never reaches what a successful renewal would have given",
    Date.parse(afterGrace.active_until) < Date.parse(wouldHaveGiven),
    `${afterGrace.active_until} < ${wouldHaveGiven}`);

  c.check("the entitlement was not revoked, only re-dated",
    afterGrace.is_active === true, `is_active=${afterGrace.is_active}`);

  /* ── idempotence, both layers ── */
  c.at("leg 4 — idempotence: the same event twice, and the same PAYLOAD twice");
  const again = await deliver(failedEventPayload, { id: failedEventId });
  const afterSameId = await entitlement(user.id);
  c.check("the route refuses a redelivery of the same event id",
    again.body.includes('"duplicate":true'), again.body.slice(0, 80));
  c.check("and the date is unmoved", afterSameId.active_until === afterGrace.active_until,
    `${afterSameId.active_until}`);

  /**
   * ⚠️ THE ROUTE'S DEDUPE WOULD HIDE THE HANDLER'S OWN IDEMPOTENCE, so the same
   * payload is delivered under a FRESH id. That is what a stale-claim retry does,
   * and it is the only way to make `markPastDue` actually run twice.
   */
  const fresh1 = await deliver(failedEventPayload);
  const afterFresh1 = await entitlement(user.id);
  const fresh2 = await deliver(failedEventPayload);
  const afterFresh2 = await entitlement(user.id);
  /**
   * ⚠️ A 200 IS NOT PROOF THE HANDLER RAN. The route answers 200 for a duplicate
   * too, and an earlier version of `deliver` fell back to the event's REAL id when
   * none was given — so this assertion passed while `webhook_events` short-circuited
   * and `markPastDue` never executed. The body is what tells them apart.
   */
  c.arrived("the handler ran again on a FRESH event id, not a refused duplicate",
    fresh1.status === 200 && fresh2.status === 200 &&
      !fresh1.body.includes("duplicate") && !fresh2.body.includes("duplicate"),
    `${fresh1.status} ${fresh1.body.slice(0, 40)} / ${fresh2.status} ${fresh2.body.slice(0, 40)}`);
  c.check("⚠️ THE DATE IS IDENTICAL after two more runs of the same payload",
    afterFresh1.active_until === afterGrace.active_until &&
      afterFresh2.active_until === afterGrace.active_until,
    `${afterGrace.active_until} -> ${afterFresh1.active_until} -> ${afterFresh2.active_until}`);
  c.check("and the grace did not stack",
    Math.abs(days(afterFresh2.active_until, paidThrough) - 3) < 1e-6,
    `${days(afterFresh2.active_until, paidThrough).toFixed(2)} days`);

  /* ── the mirror, and the remaining event ── */
  c.at("leg 5 — the mirror records past_due");
  await drain(customer.id, runStart);
  const rows = await mirror(user.id);
  c.check("the mirror says past_due", rows[0]?.status === "past_due", `status=${rows[0]?.status}`);
  const afterAll = await entitlement(user.id);
  c.check("and delivering the rest of the events did not move the date",
    afterAll.active_until === afterGrace.active_until, `${afterAll.active_until}`);

  /* ── the lapse, against wall clock ── */
  c.at("leg 6 — is the grace reachable in both windows?");
  const nowMs = Date.now();
  const graceEnd = Date.parse(afterAll.active_until);
  c.check("the grace end is in the WALL-CLOCK past, so the lapsed window is observable",
    graceEnd < nowMs, `access ended ${((nowMs - graceEnd) / DAY).toFixed(1)} wall-clock days ago`);

  console.log(`\n  user=${user.id} email=${user.email}`);
  console.log(`  customer=${customer.id} sub=${sub.id} clock=${clock}`);
  console.log(`  ⚠️ KEPT FOR GROUP B: run drive-B-card.mjs before tearing down.`);
  process.env.FINAL_KEEP === "1" || (await teardown());
} catch (err) {
  console.error("\n💥 the drive threw:", err);
  c.check("the drive completed", false, String(err?.message ?? err));
  if (process.env.FINAL_KEEP !== "1") await teardown().catch((e) => console.error("teardown:", e.message));
} finally {
  const failed = c.report();
  process.exitCode = failed > 0 ? 1 : 0;
}
