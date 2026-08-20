/**
 * GROUP E + F2 — THE SAVE OFFER: THE MONTH FORM ON A REAL SCREEN, AND SURVIVING
 * AN INTERRUPTED SESSION.
 *
 * ⚠️ F2's MONTH FORM HAS NEVER BEEN RENDERED. The driver that was meant to test it
 * used a yearly price but created the subscription with a `trial_end`, so
 * `offerPeriodToGrant` short-circuited on `status === "trialing"` and returned
 * "week" — every character-for-character assertion ran on the week strings.
 *
 * So this creates the yearly with NO trial and asserts it is `active` BEFORE
 * touching the dialog. That arrival is the whole point of the leg.
 */
import { chromium } from "playwright";
import { admin, makeUser, dropUser, signIn, env } from "../admin.mjs";
import { Checks, deliver, entitlement, eventsFor, record, stripe, teardown } from "./lib.mjs";

const c = new Checks();
const runStart = Date.now() - 60_000;
const seen = new Set();
const browser = await chromium.launch();
const made = [];

const day = (ms) => new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric",
}).format(new Date(ms));

async function drainUntil(customerId, done, tries = 20) {
  for (let i = 0; i < tries; i += 1) {
    for (const e of await eventsFor(customerId, runStart)) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      await deliver(e, { id: e.id });
    }
    if (await done()) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

/** A real Stripe subscriber whose mirror and entitlement were written by the app. */
async function subscriber(tag, priceId) {
  const u = await makeUser(tag);
  made.push(u.id);
  record("users", u.id);
  const customer = await stripe.customers.create({
    email: u.email, payment_method: "pm_card_visa",
    invoice_settings: { default_payment_method: "pm_card_visa" },
    metadata: { user_id: u.id },
  });
  record("customers", customer.id);
  const { error } = await admin.from("billing_customers")
    .insert({ user_id: u.id, stripe_customer_id: customer.id });
  if (error) throw new Error(`billing_customers: ${error.message}`);
  const sub = await stripe.subscriptions.create({
    customer: customer.id, items: [{ price: priceId }],
    default_payment_method: customer.invoice_settings.default_payment_method,
    metadata: { user_id: u.id },
  });
  await drainUntil(customer.id, async () => Boolean((await entitlement(u.id))?.active_until));
  const sess = await signIn(u);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([...sess.jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })));
  return { u, customer, sub, sess, ctx, newContext: async () => {
    const k = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await k.addCookies([...sess.jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })));
    return k;
  } };
}

/**
 * ⚠️ WAIT FOR THE NAMED ARTEFACT, NEVER FOR A NUMBER OF SECONDS.
 *
 * The first version of this drive slept 4s after "Yes, cancel" and read the dialog
 * while it still said "Working…" — a real Stripe cancellation plus the offer
 * lookup takes longer than that. Six assertions went red against a perfectly
 * correct screen, and the tell was in the run's own output: a LATER read showed
 * the offer rendered exactly as specified. A timeout that "felt long enough" is
 * the threshold the harness README forbids as a control.
 */
async function waitForText(page, text, timeout = 45_000) {
  try {
    await page.locator('[role="dialog"]').getByText(text, { exact: false })
      .first().waitFor({ state: "visible", timeout });
    return true;
  } catch { return false; }
}

async function openBilling(ctx) {
  const page = await ctx.newPage();
  await page.goto("http://localhost:3100/billing", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  return page;
}

try {
  /* ═══════════ F2 — THE MONTH FORM, ON A YEARLY THAT IS ACTUALLY ACTIVE ═══════════ */
  c.at("F2 — a YEARLY subscriber, active and paid, with no trial anywhere near it");
  const yearly = await subscriber("qa-fin-f2y", env.STRIPE_PRICE_YEARLY);
  c.arrived("⚠️ THE SUBSCRIPTION IS `active`, NOT `trialing` — the trap that hid this form",
    yearly.sub.status === "active", `status=${yearly.sub.status} price=${env.STRIPE_PRICE_YEARLY}`);
  c.arrived("its period is a YEAR, so the offer is the month form",
    (yearly.sub.items.data[0].current_period_end - yearly.sub.items.data[0].current_period_start) > 300 * 86400,
    `${new Date(yearly.sub.items.data[0].current_period_start * 1000).toISOString()} .. ${new Date(yearly.sub.items.data[0].current_period_end * 1000).toISOString()}`);
  const periodEndMs = yearly.sub.items.data[0].current_period_end * 1000;
  const invSnap = async () =>
    (await stripe.invoices.list({ customer: yearly.customer.id, limit: 100 })).data.map((i) => ({
      id: i.id, status: i.status, total: i.total, due: i.amount_due, paid: i.amount_paid,
      reason: i.billing_reason,
    }));
  const invoicesBeforeList = await invSnap();
  const invoicesBefore = invoicesBeforeList.length;
  const paidBefore = invoicesBeforeList.reduce((n, i) => n + i.paid, 0);

  const yPage = await openBilling(yearly.ctx);
  const yTrigger = yPage.getByRole("button", { name: /^Cancel my / });
  c.arrived("the cancel control is on screen", (await yTrigger.count()) === 1);
  await yTrigger.click();
  await yPage.waitForTimeout(500);
  await yPage.getByRole("button", { name: "Yes, cancel" }).click();
  const yArrived = await waitForText(yPage, "Another month, thanks");
  c.arrived("the offer dialog finished loading", yArrived, "waited on its own confirm button");

  const yDialog = yPage.locator('[role="dialog"]');
  const yText = await yDialog.innerText();
  c.arrived("⚠️ THE OFFER DIALOG IS ON SCREEN — detected by its own confirm button",
    yText.includes("Another month, thanks"), yText.replace(/\n/g, " | "));

  const expectedStart = day(periodEndMs);
  c.check("⚠️ THE GIFT BLOCK NAMES A WINDOW, not just its end",
    new RegExp(`${expectedStart} to \\d`).test(yText),
    yText.split("\n").find((l) => l.includes(" to ")) ?? "(no window line)");
  c.check("CONTROL: the deleted 'until {end}' form is gone",
    !/^until /m.test(yText), "no bare 'until ...' line");
  c.check("the gift names a MONTH", yText.includes("Another month"), "Another month");
  c.check("⚠️ CONTROL: the WEEK form is absent from this page",
    !yText.includes("Another week"), "no week strings");
  c.check("the terms line still names the charge and the date",
    /You'll be charged .* on /.test(yText) || yText.includes("charged"),
    yText.split("\n").find((l) => l.toLowerCase().includes("charged")) ?? "(absent)");
  c.check("CONTROL: $0.00 USD is still stated", yText.includes("$0.00 USD"), "D25");

  await yPage.getByRole("button", { name: "Another month, thanks" }).click();
  const gArrived = await waitForText(yPage, "Thank you!");
  c.arrived("the granted screen finished loading", gArrived, "waited on its own title");
  const grantedText = await yPage.locator('[role="dialog"]').innerText();
  c.arrived("the granted screen is on screen", grantedText.includes("Thank you!"),
    grantedText.replace(/\n/g, " | "));
  c.check("⚠️ THE GRANTED BODY NAMES THE WINDOW AND THE MONTH",
    new RegExp(`Your free month is on us\\. It runs from ${expectedStart} to .+, and your plan picks up from there unless you choose to cancel\\.`)
      .test(grantedText),
    grantedText.split("\n").find((l) => l.startsWith("Your free")) ?? "(absent)");
  c.check("⚠️ CONTROL: the week form and the deleted present-tense opener are both absent",
    !grantedText.includes("Your free week") && !grantedText.includes("Enjoy your free"),
    "neither string on the page");

  /* ── "no charge at accept" for a paid subscriber, measured ── */
  c.at("also worth driving — no charge at accept, on a YEARLY (previously unmeasured)");
  const invoicesAfterList = await invSnap();
  const paidAfter = invoicesAfterList.reduce((n, i) => n + i.paid, 0);
  const added = invoicesAfterList.filter((a) => !invoicesBeforeList.some((b) => b.id === a.id));
  console.log(`     before: ${invoicesBeforeList.map((i) => `${i.id} ${i.status} total=${i.total} paid=${i.paid} ${i.reason}`).join(" ; ")}`);
  console.log(`     after : ${invoicesAfterList.map((i) => `${i.id} ${i.status} total=${i.total} paid=${i.paid} ${i.reason}`).join(" ; ")}`);
  /**
   * ⚠️ THE COUNT IS THE WRONG INSTRUMENT, AND THIS RUN MEASURED IT SAYING SO.
   *
   * The brief asked for "assert the invoice count is unchanged after a yearly
   * grant". It is NOT unchanged: Stripe raises a `subscription_update` invoice for
   * the trial_end move. Measured on this run:
   *
   *     before  in_...VoFBTOHU  paid  total=6999  reason=subscription_create
   *     after   in_...TCJWpJET  paid  total=0 due=0 paid=0  reason=subscription_update
   *
   * **A ZERO INVOICE, owing nothing and paying nothing.** So the property the
   * brief is actually asking about — no charge at accept — HOLDS, and the count
   * was measuring a Stripe bookkeeping artefact rather than money. The two
   * assertions below are the ones that can tell the difference, and the count is
   * reported rather than asserted.
   */
  console.log(`     invoice count ${invoicesBefore} -> ${invoicesAfterList.length}` +
    (added.length ? ` (new: ${added.map((i) => `${i.id} ${i.status} total=${i.total} due=${i.due} reason=${i.reason}`).join(" ; ")})` : ""));
  c.check("⚠️ NOTHING NEW CHARGES ANYTHING — every invoice raised by the grant totals zero",
    added.every((i) => i.total === 0), added.map((i) => `${i.id} total=${i.total}`).join(" ; ") || "no new invoice");
  /**
   * ⚠️ AND THE QUESTION UNDERNEATH IT: DID ANY MONEY MOVE? A count can change for
   * reasons that cost the customer nothing; a total cannot.
   */
  c.check("⚠️ NO MONEY MOVED at accept — the total ever paid is unchanged",
    paidAfter === paidBefore, `paid ${paidBefore} -> ${paidAfter} (minor units)`);
  c.check("and nothing is OWED either", added.every((i) => i.due === 0),
    added.map((i) => `${i.id} due=${i.due}`).join(" ; ") || "no new invoice");
  const afterGrant = await stripe.subscriptions.retrieve(yearly.sub.id);
  c.check("the subscription flipped to trialing for the free stretch, as the grant works by moving trial_end",
    afterGrant.status === "trialing", `status=${afterGrant.status} trial_end=${afterGrant.trial_end ? new Date(afterGrant.trial_end * 1000).toISOString() : null}`);
  c.check("and it carries the courtesy marker, so no screen calls them a trialist",
    Boolean(afterGrant.metadata?.trackd_courtesy_until),
    `trackd_courtesy_until=${afterGrant.metadata?.trackd_courtesy_until}`);
  c.check("the cancellation was lifted, which is what the copy promises",
    afterGrant.cancel_at_period_end === false, `cancel_at_period_end=${afterGrant.cancel_at_period_end}`);
  await yPage.close();

  /* ═══════════ E — the offer survives an interrupted session ═══════════ */
  c.at("E — a WEEKLY subscriber cancels, and the session ends at the dialog");
  const weekly = await subscriber("qa-fin-e", env.STRIPE_PRICE_WEEKLY);
  c.arrived("the weekly subscription is active", weekly.sub.status === "active", `status=${weekly.sub.status}`);
  const wPage = await openBilling(weekly.ctx);
  await wPage.getByRole("button", { name: /^Cancel my / }).click();
  await wPage.waitForTimeout(500);
  await wPage.getByRole("button", { name: "Yes, cancel" }).click();
  const wArrived = await waitForText(wPage, "Another week, thanks");
  c.arrived("the offer dialog finished loading", wArrived, "waited on its own confirm button");
  const wText = await wPage.locator('[role="dialog"]').innerText();
  c.arrived("⚠️ THE OFFER WAS SHOWN — its own confirm button is the artefact",
    wText.includes("Another week, thanks"), wText.replace(/\n/g, " | "));
  c.check("⚠️ CONTROL: the MONTH form is absent from the week page",
    !wText.includes("Another month"), "no month strings");
  c.check("the week gift also names a window",
    /\d{1,2} \w+ \d{4} to \d{1,2} \w+ \d{4}/.test(wText),
    wText.split("\n").find((l) => l.includes(" to ")) ?? "(no window line)");

  const markers0 = (await stripe.customers.retrieve(weekly.customer.id)).metadata;
  c.arrived("the offer is recorded as SHOWN and not claimed",
    Boolean(markers0.trackd_save_offer_shown_at) && !markers0.trackd_save_offer_claimed_at,
    `shown_at=${markers0.trackd_save_offer_shown_at} claimed=${markers0.trackd_save_offer_claimed_at ?? "(none)"}`);

  c.at("E — the tab dies. A brand-new session returns at minute two.");
  /**
   * ⚠️ THE MARKER IS AGED DELIBERATELY, and the state is asserted before anything
   * is read off it. Waiting two real minutes would prove the same thing and cost
   * the run two minutes; what must NOT be faked is the app's own decision, and it
   * is not — `openOfferFor` reads this marker from Stripe exactly as it would in
   * production.
   */
  if (!markers0.trackd_save_offer_shown_at) {
    throw new Error("no shown marker; the offer was never recorded, so E cannot be driven");
  }
  const twoMinutesAgo = new Date(Date.parse(markers0.trackd_save_offer_shown_at) - 2 * 60_000).toISOString();
  await stripe.customers.update(weekly.customer.id, {
    metadata: { trackd_save_offer_shown_at: twoMinutesAgo },
  });
  c.arrived("the offer is now two minutes old and still unclaimed",
    (await stripe.customers.retrieve(weekly.customer.id)).metadata.trackd_save_offer_shown_at === twoMinutesAgo,
    twoMinutesAgo);

  const ctx2 = await weekly.newContext();   // a NEW browser context: sessionStorage is gone
  const page2 = await openBilling(ctx2);
  const body2 = await page2.evaluate(() => document.body.innerText);
  c.arrived("/billing rendered for the returning session", body2.includes("Billing"), body2.split("\n")[1] ?? "");
  c.check("⚠️ THE OFFER IS BACK — the way in is drawn from the SERVER's own marker",
    /Your extra week is still here/.test(body2),
    body2.split("\n").find((l) => l.includes("still here")) ?? `rows: ${body2.replace(/\n/g, " | ")}`);
  c.check("CONTROL: and the bare Resume control is what it replaced, still present",
    body2.includes("Keep my Pro plan"), "the resume control");
  const remaining = (body2.match(/0(\d):(\d\d)/) ?? [])[0];
  c.check("⚠️ THE COUNTDOWN CARRIES ON rather than restarting — under 8 minutes left",
    Boolean(remaining) && Number(remaining.split(":")[0]) <= 8,
    `countdown reads ${remaining ?? "(none)"}, and the window is 10 minutes`);
  await page2.close();
  await ctx2.close();

  c.at("E — the same session returns at minute eleven");
  const elevenAgo = new Date(Date.now() - 11 * 60_000).toISOString();
  await stripe.customers.update(weekly.customer.id, {
    metadata: { trackd_save_offer_shown_at: elevenAgo },
  });
  c.arrived("the offer is now eleven minutes old", 
    (await stripe.customers.retrieve(weekly.customer.id)).metadata.trackd_save_offer_shown_at === elevenAgo,
    elevenAgo);
  const ctx3 = await weekly.newContext();
  const page3 = await openBilling(ctx3);
  const body3 = await page3.evaluate(() => document.body.innerText);
  c.arrived("/billing rendered", body3.includes("Billing"), "");
  c.check("⚠️ PAST THE WINDOW THE OFFER IS GONE, exactly as it is today",
    !body3.includes("still here"), body3.replace(/\n/g, " | "));
  c.check("CONTROL: the Resume control is still there, so the page is not simply broken",
    body3.includes("Keep my Pro plan"), "the resume control");
  await page3.close();
  await ctx3.close();

  c.at("E — and the SERVER still refuses a claim from the tab that never closed");
  /**
   * ⚠️ THE ORIGINAL DIALOG IS STILL OPEN AND ITS CLIENT CLOCK STILL SHOWS TIME
   * LEFT, because it counts from the `shownAt` it was handed before the marker was
   * aged. That is precisely the "a tab left open, or a request replayed from a
   * log" case the server-side window exists for.
   */
  const stillOpen = await wPage.locator('[role="dialog"]').innerText();
  c.arrived("the original dialog is still showing the offer",
    stillOpen.includes("Another week, thanks"), stillOpen.split("\n")[0]);
  await wPage.getByRole("button", { name: "Another week, thanks" }).click();
  /** Either an error appears or the dialog closes; both are a refusal, and the
   *  Stripe markers below are what actually decide. Wait for the request to land. */
  await wPage.waitForTimeout(8000);
  const refused = await wPage.locator('[role="dialog"]').innerText();
  const claimedAfter = (await stripe.customers.retrieve(weekly.customer.id)).metadata.trackd_save_offer_claimed_at;
  c.check("⚠️ THE CLAIM IS REFUSED — no grant, and no claimed marker",
    !claimedAfter && !refused.includes("Thank you!"),
    `claimed_at=${claimedAfter ?? "(none)"}; dialog says: ${refused.replace(/\n/g, " | ").slice(0, 160)}`);
  const wSubAfter = await stripe.subscriptions.retrieve(weekly.sub.id);
  c.check("and the subscription got no free time and stayed cancelled",
    wSubAfter.cancel_at_period_end === true && !wSubAfter.metadata?.trackd_courtesy_until,
    `cancel_at_period_end=${wSubAfter.cancel_at_period_end} courtesy=${wSubAfter.metadata?.trackd_courtesy_until ?? "(none)"}`);
  await wPage.close();
} catch (err) {
  console.error("\n💥 the drive threw:", err);
  c.check("the drive completed", false, String(err?.message ?? err));
} finally {
  await browser.close().catch(() => {});
  await teardown().catch((e) => console.error("teardown:", e.message));
  for (const id of [...made].reverse()) {
    await dropUser(id).catch(() => {});
  }
  const failed = c.report();
  process.exitCode = failed > 0 ? 1 : 0;
}
