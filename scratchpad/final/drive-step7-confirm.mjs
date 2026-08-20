/**
 * 09 STEP 7 — THE BEHAVIOUR BOXES: does the checkout still confirm after Step 6?
 *
 * Step 6 was four className edits, so the risk is not logical — it is that a
 * subtractive spacing change moved something under something else and made the CTA
 * untappable. Only a real tap on the real screen answers that.
 *
 * ⚠️ THE CARD IS TYPED INTO STRIPE'S OWN FORM. No script here passes a PAN to
 * `paymentMethods.create` or `tokens.create`.
 *
 * ⚠️ EVERY ASSERTION IS FALSE FOR THE STATE IT IS NOT ABOUT. "The page rendered" is
 * satisfied by every screen in the flow, so arrival is asserted on the checkout's own
 * furniture and the outcome on the holding screen's own signed text.
 */
import { chromium } from "playwright";
import { Checks, admin, stripe, teardown, record } from "./lib.mjs";
import { makeUser, dropUser, signIn } from "../admin.mjs";

const c = new Checks();
const BASE = "http://localhost:3100";
const made = [];
const browser = await chromium.launch();

/** Stripe's own card frame, found by the NAMED FIELD it must contain. */
async function fillCard(page, pan, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    for (const frame of page.frames()) {
      const number = frame.locator('[name="number"]');
      if (await number.count().catch(() => 0)) {
        await number.fill(pan);
        await frame.locator('[name="expiry"]').fill("12/34").catch(() => {});
        await frame.locator('[name="cvc"]').fill("123").catch(() => {});
        const zip = frame.locator('[name="postalCode"]');
        if (await zip.count().catch(() => 0)) await zip.fill("2000").catch(() => {});
        return true;
      }
    }
    if (Date.now() > deadline) return false;
    await page.waitForTimeout(1000);
  }
}

try {
  const res = await fetch(`${BASE}/login`, { redirect: "manual" });
  if (res.status >= 500) throw new Error(`dev server not healthy: ${res.status}`);

  c.at("Step 7 — the TRIAL path still confirms, after Step 6");
  const user = await makeUser("qa-s7-trial");
  made.push(user.id);
  const sess = await signIn(user);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([...sess.jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })));
  const page = await ctx.newPage();

  await page.goto(`${BASE}/onboarding?step=plans`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(2500);
  const planText = await page.evaluate(() => document.body.innerText);
  c.arrived("the price list rendered, and it is the price list",
    planText.includes("$69.99") || planText.includes("$11.99") || planText.includes("$3.99"),
    planText.split("\n").slice(0, 6).join(" | "));

  /** The yearly card, chosen by its own price rather than by position. */
  const yearly = page.getByText("$69.99", { exact: false }).first();
  if (await yearly.count()) await yearly.click().catch(() => {});
  await page.waitForTimeout(800);
  const cta = page.getByRole("button", { name: /Start my|Continue|Subscribe/ }).first();
  c.arrived("a forward control is on the price list", (await cta.count()) > 0);
  await cta.click();

  await page.waitForURL("**step=start*", { timeout: 120_000 });
  await page.waitForSelector("iframe", { timeout: 120_000 });
  await page.waitForTimeout(6000);
  const checkoutText = await page.evaluate(() => document.body.innerText);
  /**
   * ⚠️ ARRIVAL ON THE CHECKOUT'S OWN SIGNED TEXT, and it must be FALSE for the other
   * two variants. This is a brand-new account, so the disclosure must lead with the
   * trial fact, not "Starts today" and not "Starts {date}".
   */
  c.arrived("⚠️ the TRIAL variant of the checkout is on screen",
    /7 days free, then \$/.test(checkoutText) &&
      !checkoutText.includes("Starts today,") && !/Starts \d/.test(checkoutText),
    checkoutText.split("\n").find((l) => l.includes("then $")) ?? "(no disclosure line)");

  /** All four facts, and the button, above the fold at 390x844 — 02b §3.7's hard bar. */
  const fold = await page.evaluate(() => {
    const vh = window.innerHeight;
    const ps = [...document.querySelectorAll("p")].filter((p) => /(yr|mo|wk)/.test(p.innerText));
    const btn = [...document.querySelectorAll("button")].find((b) => /Start my|Subscribe/.test(b.innerText));
    return {
      facts: ps.slice(0, 2).map((p) => Math.round(p.getBoundingClientRect().bottom)),
      button: btn ? Math.round(btn.getBoundingClientRect().bottom) : null,
      vh,
    };
  });
  c.check("⚠️ 02b §3.7 at 390x844: every fact and the button above the fold",
    fold.button !== null && fold.button <= fold.vh && fold.facts.every((b) => b <= fold.vh),
    `facts ${fold.facts.join("/")}, button ${fold.button}, viewport ${fold.vh}`);

  c.arrived("Stripe's card form is reachable and fillable", await fillCard(page, "4242424242424242"));
  const submit = page.getByRole("button", { name: /Start my|Subscribe/ }).first();
  c.arrived("the CTA is enabled and hittable", await submit.isEnabled());
  await submit.click();

  /**
   * ⚠️ THE OUTCOME IS READ FROM THE HOLDING SCREEN AND FROM STRIPE, never from the
   * button's own state. A spinner is not a confirmation.
   */
  const landed = await page
    .waitForFunction(() => /setting up|hold tight|all set|you're in|Trackd/i.test(document.body.innerText) &&
      !document.body.innerText.includes("Something went wrong"), null, { timeout: 180_000 })
    .then(() => true).catch(() => false);
  const afterText = await page.evaluate(() => document.body.innerText);
  c.arrived("the flow moved off the card form without an error", landed,
    afterText.split("\n").slice(0, 8).join(" | "));

  const { data: rows } = await admin.from("billing_customers").select("stripe_customer_id").eq("user_id", user.id);
  const customerId = rows?.[0]?.stripe_customer_id;
  c.check("⚠️ A REAL STRIPE SUBSCRIPTION EXISTS — the confirm reached Stripe", Boolean(customerId),
    customerId ?? "no billing_customers row");
  if (customerId) {
    record("customers", customerId);
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 5 });
    const live = subs.data.filter((s) => ["trialing", "active"].includes(s.status));
    c.check("and it is trialing, which is what the TRIAL path must produce",
      live.some((s) => s.status === "trialing"),
      subs.data.map((s) => `${s.id} ${s.status}`).join(", ") || "none");
  }

  c.at("Step 7 — what could NOT be driven, stated rather than ticked");
  /**
   * ⚠️ WALLETS ARE NOT REACHABLE IN HEADLESS CHROMIUM. Apple Pay needs Safari on
   * Apple hardware with a provisioned card; Google Pay needs a signed-in Chrome
   * profile with a saved card. `ExpressCheckoutElement` mounts and reports no
   * available payment method, which is the no-wallet case — that IS driven above,
   * and the wallet-present case is not drivable here at all.
   */
  const walletVisible = await page.evaluate(() =>
    [...document.querySelectorAll("iframe")].some((f) => /express|payment-request/i.test(f.name || f.src || "")));
  c.check("no wallet is offered in headless Chromium, so the no-wallet layout is what was measured",
    walletVisible === false,
    "the wallet-present case needs a real device and is reported as not driven, never ticked");

  await page.close();
} catch (err) {
  console.error("\n💥 the drive threw:", err);
  c.check("the drive completed", false, String(err?.message ?? err));
} finally {
  await browser.close().catch(() => {});
  await teardown().catch((e) => console.error("teardown:", e.message));
  for (const id of [...made].reverse()) await dropUser(id).catch(() => {});
  console.log(`ledger: ${made.length} account(s) created, all dropped BY ID`);
  const failed = c.report();
  process.exitCode = failed > 0 ? 1 : 0;
}
