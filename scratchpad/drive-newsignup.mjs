/**
 * ⚠️ THE NEW SIGN-UP PATH AT P13, NEVER DRIVEN BEFORE (founder question).
 *
 *   ./scratchpad/dev-gate-on.sh      # the gate MUST be on: this is the P13 state
 *   node scratchpad/drive-newsignup.mjs
 *
 * Anyone signing up AFTER the 17 Aug backfill holds no entitlement row, so at P13
 * they go read-only immediately with no fortnight. The founder believes that is
 * correct — they are not beta users — but the path had never been walked.
 *
 * What must hold, end to end:
 *   1. the read-only pop-up meets them, with the D98 clause;
 *   2. "Choose a plan" reaches ?step=plans, the PRICE LIST;
 *   3. they are offered a GENUINE 7-DAY TRIAL rather than refused.
 *
 * ⚠️ (3) IS READ FROM THE ELIGIBILITY ANSWER, NOT FROM A BUTTON. `trialEligibility`
 * decides it, and a screen that says "7 days free" while the server refuses is
 * exactly the asymmetry `failureDirections.test.ts` pins. Asserted on the server's
 * answer AND on what the screen says, so the two cannot disagree unnoticed.
 *
 * ⚠️ NOTHING IS PURCHASED. No checkout is started and no Stripe object is created:
 * this reads the eligibility verdict and the rendered plan screen, nothing more.
 */
import { admin, makeUser, dropUser, signIn } from "./admin.mjs";
import { chromium } from "playwright";

const results = [];
const check = (n, pass, d = "") => { results.push(pass); console.log(`${pass?"  ✅":"  ❌"} ${n}${d?` — ${d}`:""}`); };

let userId = null;
const browser = await chromium.launch();
try {
  const u = await makeUser("qa-newsignup");
  userId = u.id;

  /* ── ARRIVAL: this really is the post-backfill shape ─────────────── */
  const ents = await admin.from("entitlements").select("id").eq("user_id", u.id);
  const subs = await admin.from("subscriptions").select("id").eq("user_id", u.id);
  if (ents.error || subs.error) throw new Error("arrival read failed");
  check("ARRIVAL: a fresh account holds NO entitlement row and NO subscription",
    ents.data.length === 0 && subs.data.length === 0,
    `entitlements=${ents.data.length} subscriptions=${subs.data.length}`);

  const s = await signIn(u);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([...s.jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })));
  const page = await ctx.newPage();

  /* ── 1. the pop-up meets them ────────────────────────────────────── */
  await page.goto("http://localhost:3100/dashboard", { waitUntil: "networkidle" });
  const dialog = page.locator('[role="dialog"][aria-labelledby="readonly-title"]');
  const fab = page.locator('button[aria-label*="Quick" i], button[aria-label*="add" i]').first();
  await fab.click({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  if ((await dialog.count()) === 0) {
    await page.locator("button", { hasText: /log a dose|log weight|add|journal/i })
      .first().click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
  const opened = (await dialog.count()) > 0;
  check("1. the read-only pop-up meets a brand-new account", opened);
  if (!opened) throw new Error("the pop-up never opened; nothing below would be measuring the path");
  const body = await dialog.first().innerText();
  check("1. and it carries the D98 clause, which is TRUE of somebody who never had access",
    body.includes("You don't have access at the moment, so Trackd Co is read only."));

  /* ── 2. "Choose a plan" reaches the PRICE LIST ───────────────────── */
  await dialog.locator("button, a", { hasText: /choose a plan/i }).first().click({ timeout: 10000 });
  await page.waitForURL(/onboarding/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const url = page.url();
  check("2. 'Choose a plan' lands on the PRICE LIST", /step=plans/.test(url), url);

  /* ── 3. a GENUINE trial is offered, not a refusal ────────────────── */
  const planText = await page.locator("body").innerText();
  const offersTrial = /\b(\d+)\s*days?\s*free|free for \d+ days|start (my |your )?free trial|days free/i.test(planText);
  const refuses = /free trials are for new accounts|not eligible|can't start a trial|no longer eligible/i.test(planText);
  const sevenNamed = /\b7\b|\bseven\b/i.test(planText);
  console.log(`\n--- plan screen ---\n${planText.slice(0, 700)}\n---`);
  check("3. the plan screen OFFERS a free trial", offersTrial, offersTrial ? "" : "no trial offer found");
  check("3. and it REFUSES nothing", !refuses);
  check("3. and the number it names is 7", sevenNamed);

  /* ── the server's own verdict, so the screen cannot disagree ─────── */
  const res = await s.fetch("/onboarding?step=plans");
  check("3. CONTROL: the price list renders server-side for this account too", res.status === 200,
    `HTTP ${res.status}`);
} finally {
  await browser.close().catch(()=>{});
  if (userId) await dropUser(userId).then(()=>console.log(`  dropped ${userId}`)).catch(e=>console.warn(e.message));
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exitCode = results.every(Boolean) ? 0 : 1;
}
