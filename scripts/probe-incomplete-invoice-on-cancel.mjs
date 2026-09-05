/**
 * ⚠️ DOES `subscriptions.cancel()` LEAVE AN `incomplete` SUBSCRIPTION'S FIRST
 * INVOICE PAYABLE? A ONE-QUESTION PROBE AGAINST STRIPE TEST MODE.
 *
 * ▶ HOW TO RUN THIS
 *
 *     node --env-file=.env.local scripts/probe-incomplete-invoice-on-cancel.mjs
 *
 * It prints a verdict and cleans up after itself. Read the verdict; nothing else
 * in the repo changes.
 *
 * ## Why it exists
 *
 * `16-account-deletion.md` §3.2 cancels at Stripe before deleting anything, and
 * the deletion screen promises in signed copy that "no further charges will be
 * made". `cancelNowForUser` (`lib/billing/cancel.ts:459`) does that with a bare
 * `subscriptions.cancel(id)`.
 *
 * `incomplete` IS in `BILLABLE_STATUSES` (`cancel.ts:188`), so deletion reaches
 * it. And D76 (`cancel.ts:326-336`) records, as measured, that an `incomplete`
 * subscription's first invoice stays payable for about 23 hours and that
 * anything settling it turns the subscription `active` on the spot — which is
 * why the USER-FACING cancel path calls `voidOpenInvoiceFor`. The deletion path
 * does not: that helper has exactly one caller (`cancel.ts:374`).
 *
 * If the invoice survives the cancel, then somebody who abandons a 3D Secure
 * challenge, deletes their account, and later finishes the challenge in a stale
 * tab is CHARGED — after `billing_customers` has cascaded away, so nothing maps
 * the charge back to a person. That is §3.2's unattributable-chargeback state.
 *
 * D76's reasoning is about `cancel_at_period_end`, NOT about the immediate
 * cancel, so it does not settle this. Only Stripe can. Hence a probe rather than
 * an argument.
 *
 * ## ⚠️ WHAT THIS TOUCHES, AND WHAT IT REFUSES TO
 *
 * - It talks to STRIPE ONLY. It does not import, read or write Supabase, so it
 *   cannot put a test-mode customer id into the production billing tables. That
 *   is the specific risk the founder held back, and it is not present here.
 * - It REFUSES to run unless `STRIPE_SECRET_KEY` begins `sk_test_`.
 * - It creates one customer, one product, one price and one subscription, and
 *   deletes or archives all of them at the end, including on failure.
 */
import Stripe from "stripe";

const KEY = process.env.STRIPE_SECRET_KEY;

if (!KEY) {
  console.error("STRIPE_SECRET_KEY is not set. Run with: node --env-file=.env.local " + process.argv[1]);
  process.exit(1);
}

// ⚠️ THE ONE GUARD THAT MATTERS. A live key would create a real customer and a
// real payable invoice on the production Stripe account.
if (!KEY.startsWith("sk_test_")) {
  console.error(
    "\n⚠️ REFUSING TO RUN. STRIPE_SECRET_KEY does not begin with `sk_test_`.\n\n" +
      "This probe creates a subscription and an open invoice. Against a live key\n" +
      "that is a real charge waiting to happen. Test mode only.\n",
  );
  process.exit(1);
}

const stripe = new Stripe(KEY);
const made = { customer: null, product: null, price: null };

const line = (s = "") => console.log(s);

try {
  line("Stripe test mode. Creating an `incomplete` subscription…\n");

  made.customer = (await stripe.customers.create({
    email: `probe-${Date.now()}@trackd-qa.invalid`,
    description: "spec 16 probe: does cancel() void an incomplete invoice? Safe to delete.",
  })).id;

  made.product = (await stripe.products.create({ name: "Spec 16 probe product" })).id;

  made.price = (await stripe.prices.create({
    product: made.product,
    currency: "gbp",
    unit_amount: 6999,
    recurring: { interval: "year" },
  })).id;

  /**
   * ⚠️ `default_incomplete` IS THE WHOLE POINT. It finalises the first invoice
   * and leaves it awaiting payment, which is exactly the state a user reaches by
   * opening a 3D Secure challenge and not finishing it.
   */
  const sub = await stripe.subscriptions.create({
    customer: made.customer,
    items: [{ price: made.price }],
    payment_behavior: "default_incomplete",
    expand: ["latest_invoice"],
  });

  const invoiceId =
    typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;

  line(`  subscription ${sub.id}`);
  line(`  status       ${sub.status}`);
  line(`  invoice      ${invoiceId}`);
  line(`  invoice status BEFORE cancel: ${(await stripe.invoices.retrieve(invoiceId)).status}`);

  if (sub.status !== "incomplete") {
    line(`\n⚠️ Expected status \`incomplete\`, got \`${sub.status}\`. The probe did not`);
    line("   reproduce the state in question, so its answer would mean nothing.");
    process.exitCode = 1;
  } else {
    line("\nCancelling, exactly the way `cancelNowForUser` does…\n");
    const cancelled = await stripe.subscriptions.cancel(sub.id);
    const after = await stripe.invoices.retrieve(invoiceId);

    line(`  subscription status AFTER cancel: ${cancelled.status}`);
    line(`  invoice status      AFTER cancel: ${after.status}`);
    line(`  invoice amount due:               ${after.amount_due} ${after.currency}`);
    line("");
    line("─".repeat(68));
    if (after.status === "void" || after.status === "uncollectible") {
      line("VERDICT: Stripe voided the invoice on cancel. The deletion path is SAFE.");
      line("         HIGH-2 drops to LOW: record the dependency on this behaviour");
      line("         and move on. No code change needed.");
    } else if (after.status === "paid") {
      line("VERDICT: the invoice was PAID. Unexpected here; investigate before");
      line("         drawing any conclusion.");
    } else {
      line(`VERDICT: ⚠️ the invoice is still \`${after.status}\` after the cancel.`);
      line("         HIGH-2 IS CONFIRMED AND IS A PAYMENTS DEFECT. A user who");
      line("         finishes an abandoned 3DS challenge after deleting their");
      line("         account is charged, with billing_customers already cascaded");
      line("         away, so nothing maps the charge back to them.");
      line("");
      line("         Fix: the deletion path must void the open invoice the way");
      line("         the cancel path already does at cancel.ts:374 (D76).");
    }
    line("─".repeat(68));
  }
} catch (err) {
  console.error("\nProbe failed:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  line("\nCleaning up…");
  // Deleting the customer cancels and detaches everything hanging off it.
  if (made.customer) {
    try { await stripe.customers.del(made.customer); line(`  deleted customer ${made.customer}`); }
    catch (e) { console.error(`  ⚠️ could not delete customer ${made.customer}:`, e.message); }
  }
  // Prices cannot be deleted, only archived.
  if (made.price) {
    try { await stripe.prices.update(made.price, { active: false }); line(`  archived price ${made.price}`); }
    catch (e) { console.error(`  ⚠️ could not archive price ${made.price}:`, e.message); }
  }
  if (made.product) {
    try { await stripe.products.update(made.product, { active: false }); line(`  archived product ${made.product}`); }
    catch (e) { console.error(`  ⚠️ could not archive product ${made.product}:`, e.message); }
  }
  line("done.");
}
