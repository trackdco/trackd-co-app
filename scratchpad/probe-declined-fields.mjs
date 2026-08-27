/**
 * MEASUREMENT ONLY — WHICH STRIPE FIELD CARRIES "WHEN THE CARD WAS DECLINED"?
 *
 * `08` §5 requires the declined card's two dates to come from two sources: "the
 * failure date from Stripe, the access date from the entitlement". The mirror
 * carries no failure column (probed: `subscriptions` has no such field) and this
 * spec produces no migration, so the failure date must be read from Stripe.
 *
 * ⚠️ WHICH field is not obvious and is NOT guessed. `Invoice` has
 * `attempt_count`, `attempted`, `next_payment_attempt` and `status_transitions`,
 * none of which is documented as "when the charge failed"; `Charge` has
 * `created`, `status` and `failure_code`. This creates the real state on a test
 * clock and prints what each one actually holds, the same way `freeTime.ts`
 * settled Q76 rather than trusting the documentation.
 *
 * ⚠️ IT WRITES NOTHING TO THE DATABASE and creates no app account. Everything
 * lives on a TEST CLOCK, and deleting the clock removes every object on it —
 * which is the point: Stripe keeps subscriptions and invoices after a customer is
 * deleted, so a seeded dunning failure becomes permanent test-mode residue
 * otherwise. `11`'s first real run reported 206 findings that were mostly that.
 *
 *   node scratchpad/probe-declined-fields.mjs
 */
import { stripe, env, TEST_PM } from "./qa-billing.mjs";

const PRICE = env.STRIPE_PRICE_WEEKLY ?? env.STRIPE_PRICE_MONTHLY;
if (!PRICE) throw new Error("no weekly or monthly price in .env.local");

let clock = null;
const t = (unix) => (unix ? new Date(unix * 1000).toISOString() : null);

try {
  clock = await stripe.testHelpers.testClocks.create({
    frozen_time: Math.floor(Date.now() / 1000),
    name: "probe-declined-fields",
  });
  console.log(`test clock ${clock.id} frozen at ${t(clock.frozen_time)}`);

  const customer = await stripe.customers.create({
    email: `probe-decline-${Date.now()}@trackd-qa.invalid`,
    test_clock: clock.id,
  });
  /**
   * ⚠️ ATTACH FIRST, THEN NAME THE ATTACHED ID. Measured, first run:
   * `customers.create({ payment_method: "pm_card_visa", invoice_settings: {
   * default_payment_method: "pm_card_visa" }})` is refused with "The customer
   * does not have a payment method with the ID pm_1U5a7D...". The shared token is
   * CLONED into a new PaymentMethod when it attaches, so the id the customer ends
   * up holding is not the string that was sent, and `invoice_settings` must name
   * the clone.
   */
  const good = await stripe.paymentMethods.attach(TEST_PM.visa, { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: good.id },
  });

  let sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: PRICE }],
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice"],
  });
  // Pay the first invoice with the good card so the subscription goes ACTIVE:
  // a decline at creation is `incomplete`, which is a different state entirely.
  await stripe.invoices.pay(sub.latest_invoice.id, { payment_method: good.id });
  sub = await stripe.subscriptions.retrieve(sub.id);
  console.log(`subscription ${sub.id} -> ${sub.status}`);
  if (sub.status !== "active") throw new Error(`expected active, got ${sub.status}`);

  const periodEnd = sub.items.data[0].current_period_end ?? sub.current_period_end;
  console.log(`period ends ${t(periodEnd)}`);

  /**
   * Swap to a card that will decline on the RENEWAL, then advance past it.
   *
   * ⚠️ NOT `pm_card_chargeDeclined`. Measured: attaching it throws
   * `StripeCardError: Your card was declined.` immediately — Stripe validates the
   * card at attach time, so it can never become the default on a live customer
   * and can never reach a renewal. It is the token for a decline AT CHECKOUT.
   *
   * `pm_card_chargeCustomerFail` is the one for this shape: it attaches cleanly
   * and every charge made to the CUSTOMER fails, which is exactly a card that
   * worked in June and stops working in July.
   */
  const declining = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", {
    customer: customer.id,
  });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: declining.id },
  });
  /**
   * ⚠️ AND ON THE SUBSCRIPTION, WHICH IS THE ONE THAT WINS. Measured: setting
   * only the customer's `invoice_settings.default_payment_method` changed
   * nothing and the renewal was PAID — because
   * `save_default_payment_method: "on_subscription"` had written the good card
   * onto the subscription itself, and a subscription's own
   * `default_payment_method` takes precedence over the customer's.
   *
   * Worth knowing beyond this probe: it is why swapping a card at the customer
   * level does not fix a failing subscription.
   */
  await stripe.subscriptions.update(sub.id, { default_payment_method: declining.id });

  console.log("advancing the clock past the renewal…");
  await stripe.testHelpers.testClocks.advance(clock.id, {
    frozen_time: periodEnd + 3600,
  });
  for (let i = 0; i < 60; i += 1) {
    const c = await stripe.testHelpers.testClocks.retrieve(clock.id);
    if (c.status === "ready") break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  sub = await stripe.subscriptions.retrieve(sub.id, { expand: ["latest_invoice"] });
  console.log(`\nsubscription is now: ${sub.status}`);

  const inv = await stripe.invoices.retrieve(sub.latest_invoice.id ?? sub.latest_invoice);
  console.log(`\n── INVOICE ${inv.id} ──`);
  console.log(`  status                      ${inv.status}`);
  console.log(`  attempted                   ${inv.attempted}`);
  console.log(`  attempt_count               ${inv.attempt_count}`);
  console.log(`  next_payment_attempt        ${t(inv.next_payment_attempt)}`);
  console.log(`  created                     ${t(inv.created)}`);
  console.log(`  status_transitions          ${JSON.stringify(inv.status_transitions)}`);
  console.log(`  period_end                  ${t(inv.period_end)}`);

  const charges = await stripe.charges.list({ customer: customer.id, limit: 10 });
  console.log(`\n── CHARGES (${charges.data.length}), newest first ──`);
  for (const c of charges.data) {
    console.log(
      `  ${c.id}  status=${c.status.padEnd(9)} created=${t(c.created)}  failure_code=${c.failure_code ?? "-"}`,
    );
  }
  const failed = charges.data.filter((c) => c.status === "failed");
  console.log(`\n  failed charges: ${failed.length}`);
  console.log(`  ⇒ newest FAILED charge created = ${failed[0] ? t(failed[0].created) : "NONE"}`);
  console.log(`  ⇒ clock now                    = ${t((await stripe.testHelpers.testClocks.retrieve(clock.id)).frozen_time)}`);
  console.log(
    `\n  Is the failed charge's created DIFFERENT from the entitlement grace end?`,
  );
  console.log(
    `    failure  ${failed[0] ? t(failed[0].created) : "-"}\n    +3d      ${failed[0] ? t(failed[0].created + 3 * 86400) : "-"}   <- markPastDue's grace, for comparison`,
  );
} catch (e) {
  // ⚠️ THE MESSAGE, NOT THE DUMP. A 400 from Stripe prints ~60 lines of response
  // headers by default and buries the one line that says what was wrong.
  console.error(`\n❌ ${e.type ?? "error"}: ${e.message}`);
  if (e.param) console.error(`   param: ${e.param}`);
} finally {
  if (clock) {
    // ⚠️ THE CLOCK, EXPLICITLY. Deleting it removes every customer, subscription
    // and invoice created on it. Deleting only the customer would leave the
    // subscription and the failed invoice behind as permanent test-mode residue.
    await stripe.testHelpers.testClocks.del(clock.id).catch((e) => console.warn(`clock del: ${e.message}`));
    console.log(`\ntest clock deleted: ${clock.id}`);
  }
}
