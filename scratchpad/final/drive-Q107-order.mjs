/**
 * Q107's BLOCKING QUESTION, MEASURED RATHER THAN REASONED.
 *
 * The founder's ruling is that a DEAD subscription's failed invoice must not move
 * the shared entitlement row, on the premise that "cancellation already has its own
 * handler for shortening access" — `endSubscription`.
 *
 * ⚠️ THE CONFIRMATION HE ASKED FOR: is there any path where `markPastDue` is the
 * ONLY thing shortening access after a cancellation?
 *
 * Reading the code says there may be, and the reason is `endSubscription`'s
 * arithmetic rather than its existence:
 *
 *     const until = entitledUntil(sub);              // canceled -> items[0].current_period_end
 *     shortened = max(min(current, until), floor);
 *     if (shortened >= current) return "handled";    // <- declines to write
 *
 * For a subscription cancelled DURING an unpaid period, `current_period_end` is the
 * end of the period nobody paid for. And `syncSubscription` has already extended
 * `active_until` to exactly that instant when the cycle rolled forward while the
 * subscription was still `active` — measured last round at 7.00 days. So `current`
 * and `until` are THE SAME INSTANT, `min` changes nothing, and endSubscription
 * declines to write. It prevents a lengthening; it does not claw anything back.
 *
 * That is a claim about arithmetic. This measures it on real Stripe objects.
 *
 * THE ORDER IS THE WHOLE POINT and it is a real one: Stripe guarantees no event
 * ordering and delivers concurrently, and this route's own `claimEvent` re-runs a
 * handler whose first attempt failed more than 60 seconds ago. So a
 * `invoice.payment_failed` arriving AFTER a `customer.subscription.deleted` is
 * ordinary operation, not a contrivance.
 */
import {
  BASE, Checks, admin, advanceTo, days, deliver, entitlement, env, eventsFor,
  iso, mirror, newClock, record, stripe, teardown, DAY,
} from "./lib.mjs";
import { makeUser } from "../admin.mjs";

const c = new Checks();
const seen = new Set();
const runStart = Date.now() - 60_000;

async function drain(customerId, { skip = [] } = {}) {
  const sent = [];
  for (const e of await eventsFor(customerId, runStart)) {
    if (seen.has(e.id)) continue;
    if (skip.includes(e.type)) continue;
    seen.add(e.id);
    const { status } = await deliver(e, { id: e.id });
    sent.push(`${e.type}(${status})`);
  }
  return sent;
}
async function drainUntil(customerId, done, opts = {}, tries = 20) {
  for (let i = 0; i < tries; i += 1) {
    await drain(customerId, opts);
    if (await done()) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

try {
  const res = await fetch(`${BASE}/login`, { redirect: "manual" });
  if (res.status >= 500) throw new Error(`dev server not healthy: ${res.status}`);

  c.at("leg 1 — a paying weekly subscriber");
  const t0 = Date.now() - 40 * DAY;
  const clock = await newClock(t0);
  const user = await makeUser("qa-q107");
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
  const goodCard = customer.invoice_settings.default_payment_method;
  const sub = await stripe.subscriptions.create({
    customer: customer.id, items: [{ price: env.STRIPE_PRICE_WEEKLY }],
    default_payment_method: goodCard, metadata: { user_id: user.id },
  });
  c.arrived("the subscription is active and paid", sub.status === "active", `${sub.id} ${sub.status}`);
  await drainUntil(customer.id, async () => Boolean((await entitlement(user.id))?.active_until));
  const paidPeriodEnd = await entitlement(user.id);
  c.arrived("the app granted the entitlement", Boolean(paidPeriodEnd?.active_until),
    `active_until=${paidPeriodEnd?.active_until}`);

  c.at("leg 2 — the cycle rolls forward while the subscription is still active");
  const badCard = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: customer.id });
  await stripe.subscriptions.update(sub.id, { default_payment_method: badCard.id });
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: badCard.id } });

  const failAt = t0 + 7 * DAY;
  await advanceTo(clock, failAt + 60_000);
  await drainUntil(customer.id, async () =>
    Date.parse((await entitlement(user.id)).active_until) > Date.parse(paidPeriodEnd.active_until));
  const rolled = await entitlement(user.id);
  const rolledDays = days(rolled.active_until, paidPeriodEnd.active_until);
  c.arrived("⚠️ active_until now sits at the END OF AN UNPAID PERIOD",
    rolledDays > 0,
    `${paidPeriodEnd.active_until} -> ${rolled.active_until} (+${rolledDays.toFixed(2)}d, nobody has paid for these)`);

  c.at("leg 3 — the renewal fails, and the payment_failed event is HELD BACK");
  await advanceTo(clock, failAt + 3 * 60 * 60 * 1000);
  const live = await stripe.subscriptions.retrieve(sub.id);
  c.arrived("the subscription is past_due at Stripe", live.status === "past_due", live.status);
  const openInv = (await stripe.invoices.list({ customer: customer.id, status: "open", limit: 10 })).data[0];
  c.arrived("an invoice is open", Boolean(openInv), openInv?.id ?? "none");
  const paidThrough = iso(openInv.lines.data[0].period.start);
  const unpaidEnd = iso(openInv.lines.data[0].period.end);
  console.log(`     paid through ${paidThrough}`);
  console.log(`     the unpaid period ends ${unpaidEnd}`);

  /**
   * ⚠️ EVERY EVENT EXCEPT THE FAILURE IS DELIVERED. Holding one back is not a
   * contrivance: Stripe guarantees no ordering, delivers concurrently, and this
   * route re-runs a handler whose first attempt failed more than 60 seconds ago.
   */
  let failedEvent = null;
  for (let i = 0; i < 20 && !failedEvent; i += 1) {
    failedEvent = (await eventsFor(customer.id, runStart))
      .find((e) => e.type === "invoice.payment_failed" && e.data.object.id === openInv.id);
    if (!failedEvent) await new Promise((r) => setTimeout(r, 2000));
  }
  c.arrived("the payment_failed event exists and is being HELD", Boolean(failedEvent),
    failedEvent?.id ?? "none");
  seen.add(failedEvent.id);          // never drained by accident
  await drain(customer.id, { skip: ["invoice.payment_failed"] });
  const beforeCancel = await entitlement(user.id);
  c.check("with the failure held back, the unpaid period is still standing",
    Math.abs(Date.parse(beforeCancel.active_until) - Date.parse(unpaidEnd)) < 1000,
    `active_until=${beforeCancel.active_until} vs unpaid period end ${unpaidEnd}`);

  c.at("leg 4 — the subscription is CANCELLED, and endSubscription runs");
  const cancelled = await stripe.subscriptions.cancel(sub.id);
  c.arrived("Stripe says canceled", cancelled.status === "canceled",
    `status=${cancelled.status} current_period_end=${iso(cancelled.items.data[0].current_period_end)}`);
  const delivered = await drainUntil(
    customer.id,
    async () => (await mirror(user.id))[0]?.status === "canceled",
    { skip: ["invoice.payment_failed"] },
  );
  const mirrorRows = await mirror(user.id);
  c.arrived("customer.subscription.deleted reached the app and endSubscription ran",
    mirrorRows[0]?.status === "canceled",
    `mirror status=${mirrorRows[0]?.status} (delivered=${delivered})`);

  const afterCancel = await entitlement(user.id);
  const unpaidDaysLeft = days(afterCancel.active_until, paidThrough);
  console.log(`\n     ⚠️ AFTER THE CANCELLATION, BEFORE THE FAILURE IS DELIVERED:`);
  console.log(`        active_until = ${afterCancel.active_until}`);
  console.log(`        that is ${unpaidDaysLeft.toFixed(2)} days past the paid-through date`);

  const endSubShortened = Date.parse(afterCancel.active_until) < Date.parse(beforeCancel.active_until);
  c.check(
    endSubShortened
      ? "endSubscription CLAWED BACK the unpaid period — the narrowing would be safe"
      : "⚠️ endSubscription DID NOT claw back the unpaid period",
    true,
    `${beforeCancel.active_until} -> ${afterCancel.active_until}` +
      (endSubShortened ? "" : " (unchanged: min() found them equal and declined to write)"),
  );

  c.at("leg 5 — the held-back failure is delivered LAST");
  const r = await deliver(failedEvent, { id: failedEvent.id });
  c.arrived("markPastDue ran and was not refused as a duplicate",
    r.status === 200 && !r.body.includes("duplicate"), `${r.status} ${r.body}`);
  const afterFailure = await entitlement(user.id);
  const finalDays = days(afterFailure.active_until, paidThrough);
  console.log(`\n     AFTER THE FAILURE IS DELIVERED:`);
  console.log(`        active_until = ${afterFailure.active_until}`);
  console.log(`        that is ${finalDays.toFixed(2)} days past the paid-through date`);

  const markPastDueShortened =
    Date.parse(afterFailure.active_until) < Date.parse(afterCancel.active_until);

  c.at("THE ANSWER");
  if (!endSubShortened && markPastDueShortened) {
    c.check(
      "⚠️⚠️ markPastDue IS THE ONLY SHORTENER IN THIS PATH — the narrowing would leave " +
        "an unpaid period standing",
      false,
      `endSubscription left ${unpaidDaysLeft.toFixed(2)}d of unpaid access; markPastDue then ` +
        `pulled it to ${finalDays.toFixed(2)}d. Narrowed, the ${unpaidDaysLeft.toFixed(2)}d would stand.`,
    );
  } else if (endSubShortened) {
    c.check("endSubscription covers the unpaid period, so the narrowing is safe on this path",
      true, `${beforeCancel.active_until} -> ${afterCancel.active_until}`);
  } else {
    c.check("neither handler moved it — the premise of the question does not arise here",
      true, `${afterCancel.active_until}`);
  }

  console.log(`\n  user=${user.id} customer=${customer.id} sub=${sub.id} clock=${clock}`);
} catch (err) {
  console.error("\n💥 the drive threw:", err);
  c.check("the drive completed", false, String(err?.message ?? err));
} finally {
  if (process.env.FINAL_KEEP !== "1") await teardown().catch((e) => console.error("teardown:", e.message));
  const failed = c.report();
  process.exitCode = failed > 0 ? 1 : 0;
}
