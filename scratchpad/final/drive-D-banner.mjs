/**
 * GROUP D — THE DECLINED-PAYMENT DASHBOARD BANNER, ON THE REAL HOME SCREEN.
 *
 * ⚠️ NEEDS THE GATE ON. Both sentences make a claim about ACCESS, and with
 * `BILLING_GATE_ENABLED` unset nothing is enforced, so neither is true of anybody.
 * That gating is the same condition `graceTrial` and the final-day banner take,
 * and this driver asserts the gate's state from a POSITIVE NAMED ARTEFACT before
 * it reads a banner — a run against a gate-off server would be vacuously green on
 * the two "absent" controls.
 *
 *   ./scratchpad/dev-gate-on.sh    (in another terminal)
 *   node scratchpad/final/drive-D-banner.mjs
 *   ./scratchpad/dev-gate-off.sh
 */
import { chromium } from "playwright";
import { admin, makeUser, dropUser, signIn, env } from "../admin.mjs";
import { Checks, DAY } from "./lib.mjs";

const c = new Checks();
const PRICE = env.STRIPE_PRICE_YEARLY;
const at = (ms) => new Date(Date.now() + ms).toISOString();
const day = (iso) => new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric",
}).format(new Date(Date.parse(iso)));

const IN_GRACE = (d) => `Your payment didn't go through. Update your card by ${d} to keep access.`;
const LAPSED = "Your last payment didn't go through, so your account is read only. Update your card details to reclaim access.";

const made = [];
let seq = 0;
const browser = await chromium.launch();

async function seed(tag, { entitlementUntil, status }) {
  const u = await makeUser(tag);
  made.push(u.id);
  const e = await admin.from("entitlements").insert({
    user_id: u.id, product: "pro", source: "stripe",
    active_until: entitlementUntil, is_active: true });
  if (e.error) throw new Error(`entitlement seed: ${e.error.message}`);
  if (status) {
    const s = await admin.from("subscriptions").insert({
      user_id: u.id, stripe_subscription_id: `qad_${Date.now()}_${(seq += 1)}`,
      stripe_price_id: PRICE, status, current_period_end: at(27 * DAY),
      cancel_at_period_end: false });
    if (s.error) throw new Error(`subscription seed: ${s.error.message}`);
  }
  const sess = await signIn(u);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([...sess.jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })));
  return { u, ctx };
}
/**
 * ⚠️ THE FIRST LOAD AFTER `rm -rf .next` COMPILES THE ROUTE, and `/dashboard` is
 * the heaviest one in the app. Playwright's default 30s navigation timeout is not
 * enough for it and the run died on a cold cache rather than on anything about the
 * product. `dev-gate-on.sh` clears `.next` deliberately, so this is every gate-on
 * run, not a one-off.
 */
async function screen(ctx, path, timeout = 120_000) {
  const page = await ctx.newPage();
  await page.goto(`http://localhost:3100${path}`, { waitUntil: "domcontentloaded", timeout });
  await page.waitForTimeout(2000);
  const text = await page.evaluate(() => document.body.innerText);
  await page.close();
  return text;
}

try {
  /* ── the gate, from a POSITIVE NAMED ARTEFACT, before anything else ── */
  c.at("the instrument — is the gate actually on?");
  const { u: probe, ctx: probeCtx } = await seed("qa-fin-dgate", { entitlementUntil: null, status: null });
  await admin.from("entitlements").delete().eq("user_id", probe.id);
  const probeBilling = await screen(probeCtx, "/billing");
  const rows = probeBilling.split("\n").map((l) => l.trim()).filter(Boolean);
  const accessLabel = rows[rows.indexOf("Access") + 1];
  c.arrived("the Access row was read at all", rows.includes("Access"), rows.slice(0, 6).join(" | "));
  c.arrived("⚠️ THE GATE IS ON — the artefact is NO_ACCESS_LABEL, not FULL_ACCESS_LABEL",
    accessLabel === "Read only",
    `Access = ${JSON.stringify(accessLabel)} (gate off would read "Pro")`);
  if (accessLabel !== "Read only") {
    throw new Error("the gate is OFF; every 'the banner is absent' control below would be vacuous");
  }

  /* ── inside the grace ── */
  c.at("Group D — INSIDE the grace, the one that matters");
  const graceEnd = at(2 * DAY);
  const { ctx: graceCtx } = await seed("qa-fin-dgrace", { entitlementUntil: graceEnd, status: "past_due" });
  const graceHome = await screen(graceCtx, "/dashboard");
  c.arrived("the dashboard rendered", graceHome.includes("Dashboard"), graceHome.split("\n").slice(0, 5).join(" | "));
  c.check("⚠️ THE IN-GRACE SENTENCE RENDERS, character for character, naming the grace end",
    graceHome.includes(IN_GRACE(day(graceEnd))),
    graceHome.split("\n").find((l) => l.includes("didn't go through")) ?? "(absent)");
  c.check("CONTROL: the after-lapse sentence is absent", !graceHome.includes(LAPSED), "");
  c.check("CONTROL: the final-day banner did not render beside it",
    !graceHome.includes("Your plan ends today."), "one slot, one banner");

  /* ── after the lapse ── */
  c.at("Group D — AFTER the lapse");
  const { ctx: lapsedCtx } = await seed("qa-fin-dlapse", { entitlementUntil: at(-2 * DAY), status: "past_due" });
  const lapsedHome = await screen(lapsedCtx, "/dashboard");
  c.arrived("the dashboard rendered", lapsedHome.includes("Dashboard"), "");
  c.check("⚠️ THE AFTER-LAPSE SENTENCE RENDERS, character for character",
    lapsedHome.includes(LAPSED),
    lapsedHome.split("\n").find((l) => l.includes("didn't go through")) ?? "(absent)");
  c.check("CONTROL: it names NO date", !/Update your card by /.test(lapsedHome),
    "nobody can promise when a Smart Retry lands");
  c.check("CONTROL: the in-grace sentence is absent",
    !lapsedHome.includes("Update your card by"), "");

  /* ── the control that matters most ── */
  c.at("Group D — CONTROL: a healthy subscriber gets neither sentence");
  const { ctx: healthyCtx } = await seed("qa-fin-dok", { entitlementUntil: at(20 * DAY), status: "active" });
  const healthyHome = await screen(healthyCtx, "/dashboard");
  c.arrived("the dashboard rendered", healthyHome.includes("Dashboard"), "");
  c.check("⚠️ NO PAYMENT BANNER AT ALL for an account whose card is fine",
    !healthyHome.includes("didn't go through"),
    healthyHome.split("\n").slice(0, 8).join(" | "));

  /* ── and it taps through ── */
  c.at("Group D — it taps through to /billing, and it is not a dialog");
  const page = await graceCtx.newPage();
  await page.goto("http://localhost:3100/dashboard", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(2000);
  const dialogs = await page.locator('[role="dialog"]').count();
  c.check("⚠️ NOT A POP-UP — no dialog is open on the dashboard", dialogs === 0, `${dialogs} dialog(s)`);
  const link = page.getByRole("link", { name: /didn't go through/ });
  c.arrived("the banner is a link", (await link.count()) >= 1, `${await link.count()} link(s)`);
  await link.first().click();
  /**
   * ⚠️ WAITED FOR, NOT SLEPT ON. It is a `next/link` soft navigation and `/billing`
   * may still be compiling on a cold dev cache; 2.5 seconds was not enough and the
   * assertion went red on a link that works.
   */
  const landed = await page.waitForURL(/\/billing$/, { timeout: 120_000 }).then(() => true).catch(() => false);
  c.check("it taps through to /billing", landed, page.url());
  const billingText = landed ? await page.evaluate(() => document.body.innerText) : "";
  c.check("CONTROL: and the screen it lands on is the one that can fix it",
    billingText.includes("Update my card"), billingText.split("\n").slice(0, 6).join(" | "));
  await page.close();
} catch (err) {
  console.error("\n💥 the drive threw:", err);
  c.check("the drive completed", false, String(err?.message ?? err));
} finally {
  await browser.close().catch(() => {});
  for (const id of [...made].reverse()) {
    await dropUser(id).then(() => console.log(`  dropped ${id}`)).catch((e) => console.warn(`  ${id}: ${e.message}`));
  }
  console.log(`ledger: ${made.length} account(s) created, all dropped BY ID`);
  const failed = c.report();
  process.exitCode = failed > 0 ? 1 : 0;
}
