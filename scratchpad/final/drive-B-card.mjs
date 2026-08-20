/**
 * GROUP B — UPDATING A CARD RETRIES THE OPEN INVOICE.
 *
 * Runs against the fixture `drive-A-grace.mjs` left behind (FINAL_KEEP=1), which
 * is a real past-due account with a real open invoice on a real test clock.
 *
 * The clock run measured the gap this closes: `attempt_count` 1 -> 1, no new
 * charge, invoice still open after 240 seconds of real time, because Stripe waits
 * for its own next dunning attempt at simulated day +2.
 *
 * ⚠️ EVERY ASSERTION IS ON THE STRIPE OBJECT OR THE DATABASE ROW, never on a
 * handler's return value. Handlers here answered "handled" throughout the life of
 * two separate defects.
 */
import fs from "node:fs";
import {
  BASE, Checks, admin, days, deliver, entitlement, eventsFor, iso, mirror, stripe, teardown, DAY,
} from "./lib.mjs";

const c = new Checks();
const runStart = Date.now() - 60_000;
const LEDGER = "/private/tmp/claude-501/-Users-adrianschimizzi-Documents-GitHub-trackd-co-app/0a7847f7-d236-4c11-9d26-bf86f7311d86/scratchpad/final-ledger.json";

const chargeCount = async (cust) =>
  (await stripe.charges.list({ customer: cust, limit: 100 })).data.length;

try {
  const led = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
  const customerId = led.customers.at(-1);
  const userId = led.users.at(-1);
  if (!customerId || !userId) throw new Error("no fixture in the ledger; run drive-A-grace.mjs with FINAL_KEEP=1 first");

  const res = await fetch(`${BASE}/login`, { redirect: "manual" });
  if (res.status >= 500) throw new Error(`dev server not healthy: ${res.status}`);

  /* ── arrival ── */
  c.at("leg 1 — the state a locked-out customer is actually in");
  const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
  const sub = subs.data.find((s) => s.status === "past_due");
  c.arrived("the subscription is past_due at Stripe", Boolean(sub), `status=${subs.data.map((s) => s.status).join(",")}`);

  const openBefore = (await stripe.invoices.list({ customer: customerId, status: "open", limit: 10 })).data;
  c.arrived("an invoice is OPEN", openBefore.length === 1,
    openBefore.map((i) => `${i.id} ${i.status} attempts=${i.attempt_count}`).join(", ") || "none");
  const invoice = openBefore[0];
  const attemptsBefore = invoice.attempt_count;
  const chargesBefore = await chargeCount(customerId);

  const deadCard = sub.default_payment_method;
  c.arrived("the subscription's own default is the card that is failing", Boolean(deadCard), `${deadCard}`);

  const graceRow = await entitlement(userId);
  c.arrived("the entitlement sits at the three-day grace and has lapsed against the wall clock",
    Boolean(graceRow?.active_until) && Date.parse(graceRow.active_until) < Date.now(),
    `active_until=${graceRow?.active_until}`);

  /* ── the customer fixes their card ── */
  c.at("leg 2 — the card is updated, and the invoice is attempted");
  const newCard = await stripe.paymentMethods.attach("pm_card_visa", { customer: customerId });
  c.arrived("a working card is attached, and it is NOT the dead one",
    newCard.id !== deadCard, `${newCard.id} ${newCard.card?.brand}/${newCard.card?.last4}`);

  /**
   * ⚠️ THE REAL EVENT, NOT A SYNTHESIZED ONE. `payment_method.attached` is what
   * Stripe fires when the card lands on the customer from its own hosted portal,
   * and it is the only signal this app can ever get — the card is typed into
   * Stripe's form and never touches us.
   */
  let attachEvent = null;
  for (let i = 0; i < 15 && !attachEvent; i += 1) {
    attachEvent = (await eventsFor(customerId, runStart))
      .find((e) => e.type === "payment_method.attached" && e.data.object.id === newCard.id);
    if (!attachEvent) await new Promise((r) => setTimeout(r, 2000));
  }
  c.arrived("Stripe raised payment_method.attached for the new card", Boolean(attachEvent), attachEvent?.id ?? "never arrived");

  const r1 = await deliver(attachEvent, { id: attachEvent.id });
  c.arrived("the app's own webhook accepted it", r1.status === 200, `${r1.status} ${r1.body.slice(0, 60)}`);

  const subAfter = await stripe.subscriptions.retrieve(sub.id);
  c.check("⚠️ THE SUBSCRIPTION'S OWN default_payment_method now points at the new card",
    subAfter.default_payment_method === newCard.id,
    `${deadCard} -> ${subAfter.default_payment_method}`);

  const invAfter = await stripe.invoices.retrieve(invoice.id);
  /**
   * ⚠️ `attempt_count` IS THE WRONG INSTRUMENT AND THIS RUN MEASURED IT SAYING SO.
   *
   * The first version of this assertion read `attempt_count > attemptsBefore` and
   * went RED while the invoice moved `open -> paid`, `amount_paid` went to 399 and
   * a fourth charge appeared on the customer. Two lines of the same output
   * contradicting each other is the tell, and the assertion between them was the
   * wrong one: **Stripe counts AUTOMATIC collection attempts in `attempt_count`
   * and does not increment it for an explicit `invoices.pay`.**
   *
   * ⚠️ WORTH KNOWING BEYOND THIS DRIVER. The lifetime clock run's finding — "card
   * updated, attempt_count 1 -> 1, no new charge" — used this same field, and it
   * would have read 1 -> 1 even if the retry HAD worked. The charge count and the
   * invoice's own status are what actually distinguish the two, and they are what
   * this asserts on now.
   */
  c.check("⚠️ THE INVOICE WAS ATTEMPTED AND IS PAID", invAfter.status === "paid",
    `${invoice.status} -> ${invAfter.status}, amount_paid=${invAfter.amount_paid}`);
  const chargesAfter = await chargeCount(customerId);
  c.check("⚠️ EXACTLY ONE NEW CHARGE was created — the real measure of an attempt",
    chargesAfter === chargesBefore + 1, `${chargesBefore} -> ${chargesAfter}`);
  console.log(`     (attempt_count ${attemptsBefore} -> ${invAfter.attempt_count}: Stripe counts ` +
    `AUTOMATIC attempts only, so this field cannot see an explicit invoices.pay)`);
  c.check("the retry marker names the card it was tried with",
    invAfter.metadata?.trackd_card_update_retry_pm === newCard.id,
    `marker=${invAfter.metadata?.trackd_card_update_retry_pm}`);

  /**
   * ⚠️ ACCESS IS NOT RESTORED HERE. This is the assertion the brief names:
   * `invoice.paid` restores access and nothing else may, so between the card
   * update and that event the entitlement must be exactly where the grace left it.
   */
  const stillLapsed = await entitlement(userId);
  c.check("⚠️ ACCESS IS NOT RESTORED OPTIMISTICALLY ON THE UPDATE",
    stillLapsed.active_until === graceRow.active_until,
    `still ${stillLapsed.active_until} (the grace date), money has moved but no invoice.paid has been delivered`);

  /* ── idempotence ── */
  c.at("leg 3 — a customer who updates their card three times");
  const before3 = await chargeCount(customerId);
  const r2 = await deliver(attachEvent);                    // same payload, fresh id
  const r3 = await deliver(attachEvent);                    // and again
  /**
   * ⚠️ THE `status === 0` ESCAPE HATCH IS GONE, and removing it is the point.
   *
   * This read `const r4 = custEvent ? await deliver(custEvent) : { status: 0 }`
   * with `(r4.status === 200 || r4.status === 0)` in the assertion — so when no
   * `customer.updated` event existed, NOTHING was POSTed for the third of the
   * "three more card-update events" and the check passed anyway. The name claimed
   * three; the predicate was satisfied by two.
   *
   * Found by auditing this round's own `deliver` defect rather than by reading. It
   * is the same family: an assertion whose green does not mean what its name says.
   * A missing `customer.updated` is now a failed ARRIVAL, which is what it is.
   */
  const custEvent = (await eventsFor(customerId, runStart)).find((e) => e.type === "customer.updated");
  c.arrived("a customer.updated event exists to deliver as the third",
    Boolean(custEvent), custEvent?.id ?? "none — the third delivery cannot happen");
  const r4 = custEvent ? await deliver(custEvent) : { status: 0, body: "" };
  c.arrived("three more card-update events reached the handler, and none was refused as a duplicate",
    r2.status === 200 && r3.status === 200 && r4.status === 200 &&
      ![r2, r3, r4].some((r) => r.body.includes("duplicate")),
    `${r2.status}/${r3.status}/${r4.status}`);
  const after3 = await chargeCount(customerId);
  c.check("⚠️ NO FURTHER CHARGE ATTEMPT WAS MADE", after3 === before3, `${before3} -> ${after3}`);
  const invAfter3 = await stripe.invoices.retrieve(invoice.id);
  c.check("and the invoice is still the same paid invoice, not re-raised",
    invAfter3.status === "paid" && invAfter3.amount_paid === invAfter.amount_paid,
    `${invAfter3.status} amount_paid=${invAfter3.amount_paid}`);

  /* ── access comes back on invoice.paid ── */
  c.at("leg 4 — access comes back, and it comes back on invoice.paid");
  let paidEvent = null;
  for (let i = 0; i < 15 && !paidEvent; i += 1) {
    paidEvent = (await eventsFor(customerId, runStart))
      .find((e) => e.type === "invoice.paid" && e.data.object.id === invoice.id);
    if (!paidEvent) await new Promise((r) => setTimeout(r, 2000));
  }
  c.arrived("Stripe raised invoice.paid for the retried invoice", Boolean(paidEvent), paidEvent?.id ?? "never arrived");
  await deliver(paidEvent, { id: paidEvent.id });
  const restored = await entitlement(userId);
  c.check("⚠️ ACCESS IS RESTORED, and to the period the payment bought",
    Date.parse(restored.active_until) > Date.parse(graceRow.active_until),
    `${graceRow.active_until} -> ${restored.active_until}`);
  const paidLine = iso(invAfter.lines.data[0].period.end);
  c.check("the restored date is the paid period's end, not a guess",
    Math.abs(Date.parse(restored.active_until) - Date.parse(paidLine)) < 1000,
    `entitlement ${restored.active_until} vs invoice line end ${paidLine}`);
  c.check("the entitlement is live", restored.is_active === true, `is_active=${restored.is_active}`);

  /* ── the control: nothing open, nothing happens ── */
  c.at("leg 5 — CONTROL: a card update with NO open invoice MOVES THE POINTER and charges nothing");
  const healthy = await stripe.subscriptions.retrieve(sub.id);
  const openNow = (await stripe.invoices.list({ customer: customerId, status: "open", limit: 10 })).data;
  c.arrived("there is now no open invoice", openNow.length === 0, `${openNow.length} open`);
  const defaultBefore = healthy.default_payment_method;
  const chargesBeforeControl = await chargeCount(customerId);
  const invoicesBeforeControl = (await stripe.invoices.list({ customer: customerId, limit: 100 })).data;

  const thirdCard = await stripe.paymentMethods.attach("pm_card_mastercard", { customer: customerId });
  c.arrived("a THIRD card is attached to a healthy account", Boolean(thirdCard.id),
    `${thirdCard.id} ${thirdCard.card?.brand}/${thirdCard.card?.last4}`);
  let thirdEvent = null;
  for (let i = 0; i < 15 && !thirdEvent; i += 1) {
    thirdEvent = (await eventsFor(customerId, runStart))
      .find((e) => e.type === "payment_method.attached" && e.data.object.id === thirdCard.id);
    if (!thirdEvent) await new Promise((r) => setTimeout(r, 2000));
  }
  c.arrived("Stripe raised payment_method.attached for it", Boolean(thirdEvent), thirdEvent?.id ?? "never arrived");
  const rc = await deliver(thirdEvent, { id: thirdEvent.id });
  c.arrived("the handler ran", rc.status === 200, `${rc.status}`);

  const healthyAfter = await stripe.subscriptions.retrieve(sub.id);
  /**
   * ⚠️ THE CONTROL FLIPPED, ON THE FOUNDER'S RULING (20 Aug 2026).
   *
   * It used to assert the subscription's default was UNTOUCHED, which was the
   * brief read too literally. Somebody who replaces a card BEFORE it expires still
   * had their subscription pointing at the dead one, so their next renewal failed
   * for a problem they had already fixed. Setting the pointer charges nobody, so
   * it is now unconditional — and the three assertions below are what keep
   * "charges nobody" honest rather than assumed.
   */
  c.check("⚠️ THE SUBSCRIPTION'S DEFAULT CARD MOVED TO THE NEW ONE, with no invoice open",
    healthyAfter.default_payment_method === thirdCard.id,
    `${defaultBefore} -> ${healthyAfter.default_payment_method} (the card just attached)`);
  c.check("⚠️ NO CHARGE WAS MADE", (await chargeCount(customerId)) === chargesBeforeControl,
    `${chargesBeforeControl} charges before and after`);
  const invoicesAfterControl = (await stripe.invoices.list({ customer: customerId, limit: 100 })).data;
  c.check("no invoice was created", invoicesAfterControl.length === invoicesBeforeControl.length,
    `${invoicesBeforeControl.length} -> ${invoicesAfterControl.length}`);
  const markedWithThird = invoicesAfterControl.filter(
    (i) => i.metadata?.trackd_card_update_retry_pm === thirdCard.id);
  c.check("⚠️ NO RETRY MARKER WAS WRITTEN ANYWHERE for the third card",
    markedWithThird.length === 0, `${markedWithThird.length} invoice(s) marked`);
  const entAfterControl = await entitlement(userId);
  c.check("and the entitlement did not move", entAfterControl.active_until === restored.active_until,
    `${entAfterControl.active_until}`);

  /**
   * ⚠️ AND THE POINT STEP IS IDEMPOTENT. One portal update fires more than one
   * event that reaches this handler; a second delivery must find the subscription
   * already pointing at the card and write nothing.
   */
  c.at("leg 6 — the same card again: the pointer is already there, so nothing is written");
  const updatedBefore = healthyAfter.items.data[0].current_period_end;
  const again = await deliver(thirdEvent);   // same payload, FRESH id, so the handler runs
  c.arrived("the handler ran again and was not refused as a duplicate",
    again.status === 200 && !again.body.includes("duplicate"), `${again.status} ${again.body}`);
  const healthyAgain = await stripe.subscriptions.retrieve(sub.id);
  c.check("the default is still the same card, and unchanged",
    healthyAgain.default_payment_method === thirdCard.id,
    `${healthyAgain.default_payment_method}`);
  c.check("nothing else about the subscription moved",
    healthyAgain.items.data[0].current_period_end === updatedBefore,
    `period_end unchanged`);
  c.check("still no charge", (await chargeCount(customerId)) === chargesBeforeControl,
    `${chargesBeforeControl} charges throughout the control`);

  console.log(`\n  user=${userId} customer=${customerId}`);
} catch (err) {
  console.error("\n💥 the drive threw:", err);
  c.check("the drive completed", false, String(err?.message ?? err));
} finally {
  if (process.env.FINAL_KEEP !== "1") await teardown().catch((e) => console.error("teardown:", e.message));
  const failed = c.report();
  process.exitCode = failed > 0 ? 1 : 0;
}
