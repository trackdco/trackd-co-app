/**
 * GROUP G — THE CROSS-SUBSCRIPTION CLAWBACK, REPRODUCED DELIBERATELY.
 *
 * The lifetime clock run saw it ONCE and the account was torn down before it could
 * be reproduced: a resubscribed customer's entitlement clawed back 371 days, from
 * 2027-09-02 to 2026-08-27 — the OLD, cancelled subscription's unpaid period plus
 * three days. `otherLiveEntitlementFloor` exists to prevent exactly that.
 *
 * ## The plausible mechanism, stated before the drive rather than after it
 *
 * `otherLiveEntitlementFloor` skips any subscription whose status is not in
 * `ENTITLING`, which is `{trialing, active}`. **`past_due` is not in it.** So if
 * the LIVE subscription holding the long entitlement is itself past-due, it raises
 * no floor, and a dead subscription's failed invoice can pull the shared row back
 * to its own three-day grace.
 *
 * ## The shape, built out of real Stripe objects and no seeded rows
 *
 *   sub A   weekly from t0, card dies at t0+7d   -> past_due, open invoice
 *   sub B   weekly from t0+5d, paid, card dies at t0+12d  -> past_due, and its
 *           own grace LENGTHENS the shared entitlement to t0+15d
 *   then    sub A is CANCELLED, and its `invoice.payment_failed` is delivered
 *           again under a fresh event id — which is what a Stripe retry, a
 *           dashboard resend or a stale-claim recovery all do.
 *
 * If the entitlement moves from t0+15d back to t0+10d, the lead reproduces: five
 * days of access bought on subscription B, taken away by a dead subscription A.
 */
import {
  BASE, Checks, admin, advanceTo, days, deliver, entitlement, env, eventsFor,
  iso, mirror, newClock, record, stripe, teardown, DAY,
} from "./lib.mjs";
import { makeUser } from "../admin.mjs";

const c = new Checks();
const seen = new Set();
const runStart = Date.now() - 60_000;

async function drain(customerId) {
  for (const e of await eventsFor(customerId, runStart)) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    await deliver(e, { id: e.id });
  }
}
async function drainUntil(customerId, done, tries = 15) {
  for (let i = 0; i < tries; i += 1) {
    await drain(customerId);
    if (await done()) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

try {
  const res = await fetch(`${BASE}/login`, { redirect: "manual" });
  if (res.status >= 500) throw new Error(`dev server not healthy: ${res.status}`);

  c.at("leg 1 — subscription A, weekly, paying");
  const t0 = Date.now() - 60 * DAY;
  const clock = await newClock(t0);
  const user = await makeUser("qa-fin-g");
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
  const subA = await stripe.subscriptions.create({
    customer: customer.id, items: [{ price: env.STRIPE_PRICE_WEEKLY }],
    default_payment_method: goodCard, metadata: { user_id: user.id },
  });
  c.arrived("A is active", subA.status === "active", `${subA.id} ${subA.status}`);
  await drainUntil(customer.id, async () => Boolean((await entitlement(user.id))?.active_until));
  const e1 = await entitlement(user.id);
  c.arrived("the entitlement exists", Boolean(e1?.active_until), `${e1?.active_until}`);

  c.at("leg 2 — subscription B starts five days later, on the same customer");
  await advanceTo(clock, t0 + 5 * DAY);
  const subB = await stripe.subscriptions.create({
    customer: customer.id, items: [{ price: env.STRIPE_PRICE_WEEKLY }],
    default_payment_method: goodCard, metadata: { user_id: user.id },
  });
  c.arrived("B is active and paid", subB.status === "active", `${subB.id} ${subB.status}`);
  await drainUntil(customer.id, async () =>
    Date.parse((await entitlement(user.id)).active_until) > Date.parse(e1.active_until));
  const e2 = await entitlement(user.id);
  c.arrived("B extended the shared entitlement", Date.parse(e2.active_until) > Date.parse(e1.active_until),
    `${e1.active_until} -> ${e2.active_until}`);

  c.at("leg 3 — the card dies, and A's renewal fails");
  const badCard = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: customer.id });
  await stripe.subscriptions.update(subA.id, { default_payment_method: badCard.id });
  await stripe.subscriptions.update(subB.id, { default_payment_method: badCard.id });
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: badCard.id } });

  await advanceTo(clock, t0 + 7 * DAY + 3 * 60 * 60 * 1000);
  const liveA = await stripe.subscriptions.retrieve(subA.id);
  c.arrived("A is past_due", liveA.status === "past_due", `${liveA.status}`);
  const invA = (await stripe.invoices.list({ customer: customer.id, status: "open", limit: 10 }))
    .data.find((i) => (i.parent?.subscription_details?.subscription ?? i.subscription) === subA.id);
  c.arrived("A has an OPEN invoice", Boolean(invA), invA?.id ?? "none");
  const aPaidThrough = iso(invA.lines.data[0].period.start);

  /** ⚠️ POLLED. Stripe's event stream lags the state change by a second or two. */
  let failedA = null;
  for (let i = 0; i < 20 && !failedA; i += 1) {
    failedA = (await eventsFor(customer.id, runStart))
      .find((e) => e.type === "invoice.payment_failed" && e.data.object.id === invA.id);
    if (!failedA) await new Promise((r) => setTimeout(r, 2000));
  }
  c.arrived("A's invoice.payment_failed exists", Boolean(failedA), failedA?.id ?? "none");
  if (!failedA) throw new Error("A's payment_failed never appeared; the reproduction cannot be attempted");
  await drain(customer.id);
  const e3 = await entitlement(user.id);
  console.log(`     A paid through ${aPaidThrough}; entitlement now ${e3.active_until}`);

  c.at("leg 4 — B's renewal fails too, and its own grace LENGTHENS the shared row");
  await advanceTo(clock, t0 + 12 * DAY + 3 * 60 * 60 * 1000);
  const liveB = await stripe.subscriptions.retrieve(subB.id);
  c.arrived("B is past_due as well", liveB.status === "past_due", `${liveB.status}`);
  await drain(customer.id);
  const e4 = await entitlement(user.id);
  c.arrived("⚠️ THE STATE THE LEAD DESCRIBES: a long entitlement beside two past-due subscriptions",
    Boolean(e4?.active_until), `entitlement=${e4.active_until}`);
  console.log(`     A ${liveA.status} (dead-to-be), B ${liveB.status}`);

  c.at("leg 5 — A is cancelled, and its failed invoice is delivered again");
  const cancelledA = await stripe.subscriptions.cancel(subA.id);
  c.arrived("A is now a DEAD subscription with an outstanding invoice",
    cancelledA.status === "canceled" && (await stripe.invoices.retrieve(invA.id)).status === "open",
    `A=${cancelledA.status}, invoice=${(await stripe.invoices.retrieve(invA.id)).status}`);
  const liveB2 = await stripe.subscriptions.retrieve(subB.id);
  c.arrived("B is still live and still past_due behind it", liveB2.status === "past_due", `${liveB2.status}`);

  const before = await entitlement(user.id);
  /**
   * ⚠️ A FRESH EVENT ID ON THE SAME PAYLOAD. The route's `webhook_events` dedupe
   * would refuse the original id, and this is what a Stripe retry, a dashboard
   * resend and a stale-claim recovery all deliver.
   */
  const r = await deliver(failedA);
  const after = await entitlement(user.id);
  /** ⚠️ A 200 IS NOT PROOF. The route answers 200 for a refused duplicate too. */
  c.arrived("the handler ran, and was NOT refused as a duplicate",
    r.status === 200 && !r.body.includes("duplicate") && !r.body.includes("attributed\":false"),
    `${r.status} ${r.body}`);

  const moved = before.active_until !== after.active_until;
  const clawedToAGrace = Math.abs(days(after.active_until, aPaidThrough) - 3) < 1e-6;

  console.log(`\n     before ${before.active_until}`);
  console.log(`     after  ${after.active_until}`);
  console.log(`     A's paid-through + 3d would be ${new Date(Date.parse(aPaidThrough) + 3 * DAY).toISOString()}`);

  if (moved && clawedToAGrace) {
    c.check("⚠️⚠️ THE LEAD REPRODUCES — a DEAD subscription clawed the shared row back to ITS OWN grace",
      false,
      `${before.active_until} -> ${after.active_until}, which is A's unpaid period + 3 days. ` +
      `${days(before.active_until, after.active_until).toFixed(2)} days of access taken off a ` +
      `customer by a subscription that is cancelled.`);
  } else if (moved) {
    c.check("⚠️ the entitlement MOVED, but not to A's grace — a different shape, still worth reporting",
      false, `${before.active_until} -> ${after.active_until}`);
  } else {
    c.check("⚠️ THE LEAD DOES NOT REPRODUCE in this shape — the entitlement is unmoved",
      true, `${before.active_until} unchanged`);
  }

  /* the floor, measured directly rather than inferred */
  c.at("leg 6 — what the floor actually saw");
  const all = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 10 });
  for (const s of all.data) {
    console.log(`     ${s.id} ${s.status} entitles_to=${
      s.status === "trialing" ? iso(s.trial_end) : iso(s.items.data[0].current_period_end)}`);
  }
  const entitlingOthers = all.data.filter((s) => s.id !== subA.id && ["trialing", "active"].includes(s.status));
  c.check("ENTITLING is {trialing, active}, so a past_due sibling raises NO floor",
    entitlingOthers.length === 0,
    `${entitlingOthers.length} sibling(s) counted as entitling; B is ${liveB2.status}`);

  console.log(`\n  user=${user.id} customer=${customer.id} A=${subA.id} B=${subB.id}`);
} catch (err) {
  console.error("\n💥 the drive threw:", err);
  c.check("the drive completed", false, String(err?.message ?? err));
} finally {
  if (process.env.FINAL_KEEP !== "1") await teardown().catch((e) => console.error("teardown:", e.message));
  const failed = c.report();
  process.exitCode = failed > 0 ? 1 : 0;
}
