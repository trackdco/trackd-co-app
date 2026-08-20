/**
 * GROUP C + F3 — THE COURTESY ROW AND THE TWO PAST-DUE SENTENCES, ON REAL SCREENS.
 *
 * ⚠️ CONTROLS ARE NAMED ARTEFACTS, NEVER PROSE REGEXES OR THRESHOLDS. Every
 * assertion below looks for the screen's own furniture ("Access", "Plan",
 * "Billing") before reading a value out of it, and every date is compared against
 * its SOURCE formatted the way the app formats it — never against `/\d\s\w{3}/`,
 * which `en-AU` breaks anyway ("Sept" is four letters, June and July are not
 * abbreviated at all).
 */
import { chromium } from "playwright";
import { admin, makeUser, dropUser, signIn, env } from "../admin.mjs";
import { Checks, DAY } from "./lib.mjs";

const c = new Checks();
const PRICE = env.STRIPE_PRICE_YEARLY;
if (!PRICE) throw new Error("STRIPE_PRICE_YEARLY is not set");
const at = (ms) => new Date(Date.now() + ms).toISOString();
const day = (iso) => new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric",
}).format(new Date(Date.parse(iso)));

/** The rendered text of a page, one line per visible run. */
async function lines(ctx, path) {
  const page = await ctx.newPage();
  await page.goto(`http://localhost:3100${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const text = await page.evaluate(() => document.body.innerText);
  await page.close();
  return { text, rows: text.split("\n").map((l) => l.trim()).filter(Boolean) };
}
const valueOf = (rows, label) => {
  const i = rows.indexOf(label);
  return i < 0 ? null : rows[i + 1];
};

const made = [];
let seq = 0;
const browser = await chromium.launch();

async function seed(tag, { entitlementUntil, status, courtesyUntil = null, periodEnd }) {
  const u = await makeUser(tag);
  made.push(u.id);
  const e = await admin.from("entitlements").insert({
    user_id: u.id, product: "pro", source: "stripe",
    active_until: entitlementUntil, is_active: true });
  if (e.error) throw new Error(`entitlement seed: ${e.error.message}`);
  const s = await admin.from("subscriptions").insert({
    user_id: u.id, stripe_subscription_id: `qafc_${Date.now()}_${(seq += 1)}`,
    stripe_price_id: PRICE, status, current_period_end: periodEnd,
    cancel_at_period_end: false, courtesy_until: courtesyUntil });
  if (s.error) throw new Error(`subscription seed: ${s.error.message}`);
  const b = await admin.from("billing_customers").insert({
    user_id: u.id, stripe_customer_id: `cus_qafc_${Date.now()}_${(seq += 1)}` });
  if (b.error) throw new Error(`billing_customers seed: ${b.error.message}`);
  const sess = await signIn(u);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([...sess.jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })));
  return { u, ctx };
}

try {
  /* ═══ GROUP C ═══ */
  c.at("Group C — a courtesy period that is STILL RUNNING");
  const runningEnd = at(30 * DAY);
  const { u: uRun, ctx: ctxRun } = await seed("qa-fin-crun", {
    entitlementUntil: runningEnd, status: "trialing",
    courtesyUntil: runningEnd, periodEnd: runningEnd,
  });
  {
    const { data } = await admin.from("subscriptions").select("courtesy_until, status").eq("user_id", uRun.id);
    c.arrived("the mirror holds a courtesy_until in the FUTURE",
      Date.parse(data[0].courtesy_until) > Date.now(), `${data[0].courtesy_until} status=${data[0].status}`);
  }
  const runBilling = await lines(ctxRun, "/billing");
  c.arrived("/billing rendered", runBilling.rows.includes("Billing") && runBilling.rows.includes("Access"),
    runBilling.rows.slice(0, 6).join(" | "));
  c.check("the 'Free until' row is present and names the courtesy end",
    valueOf(runBilling.rows, "Free until") === day(runningEnd),
    `Free until = ${JSON.stringify(valueOf(runBilling.rows, "Free until"))}, expected ${day(runningEnd)}`);
  c.check("CONTROL: D36's word never appears for them",
    !runBilling.text.includes("Trial ends") && !runBilling.text.includes("Free trial"),
    `Access = ${JSON.stringify(valueOf(runBilling.rows, "Access"))}`);

  const runManage = await lines(ctxRun, "/billing/manage");
  c.arrived("/billing/manage rendered", runManage.rows.includes("Manage"), runManage.rows.slice(0, 4).join(" | "));
  c.check("the Manage sentence promises the free period",
    runManage.text.includes(`Your Pro plan is free until ${day(runningEnd)}, and then it's`),
    runManage.rows.find((l) => l.startsWith("Your Pro plan")) ?? "(absent)");

  c.at("Group C — the SAME marker, after the period has ended");
  const finishedEnd = at(-10 * DAY);
  const nextRenewal = at(20 * DAY);
  const { u: uFin, ctx: ctxFin } = await seed("qa-fin-cend", {
    entitlementUntil: nextRenewal, status: "active",
    courtesyUntil: finishedEnd, periodEnd: nextRenewal,
  });
  {
    const { data } = await admin.from("subscriptions").select("courtesy_until").eq("user_id", uFin.id);
    c.arrived("⚠️ THE MARKER IS STILL THERE — it is never cleared, and reconciliation needs it",
      Boolean(data[0].courtesy_until) && Date.parse(data[0].courtesy_until) < Date.now(),
      `courtesy_until=${data[0].courtesy_until} (in the past, and PRESENT)`);
  }
  const finBilling = await lines(ctxFin, "/billing");
  c.arrived("/billing rendered", finBilling.rows.includes("Access"), finBilling.rows.slice(0, 6).join(" | "));
  c.check("⚠️ THE DEFECT IS GONE: no 'Free until' row once the period is over",
    valueOf(finBilling.rows, "Free until") === null && !finBilling.text.includes("Free until"),
    `rows: ${finBilling.rows.join(" | ")}`);
  c.check("CONTROL: the renewal row is there instead, so the card is not simply empty",
    finBilling.text.includes("Renews on") || finBilling.text.includes("Ends on"),
    finBilling.rows.join(" | "));
  c.check("⚠️ AND THE OLD DEFECT'S EXACT SHAPE IS ABSENT: no past date beside a future renewal",
    !finBilling.text.includes(day(finishedEnd)),
    `the finished courtesy end ${day(finishedEnd)} appears nowhere`);

  const finManage = await lines(ctxFin, "/billing/manage");
  c.check("⚠️ Manage stops promising it too",
    !finManage.text.includes("is free until"),
    finManage.rows.find((l) => l.startsWith("You're on") || l.startsWith("Your Pro plan")) ?? "(no sentence)");
  c.check("and says the PAYING sentence instead, which is what they are on",
    finManage.text.includes("and it renews on"),
    finManage.rows.find((l) => l.startsWith("You're on")) ?? "(absent)");

  /* ═══ F3 — the two past-due sentences, now that a window exists ═══ */
  c.at("F3 — INSIDE the grace, which was unreachable until Group A");
  const graceEnd = at(2 * DAY);
  const { u: uGrace, ctx: ctxGrace } = await seed("qa-fin-f3in", {
    entitlementUntil: graceEnd, status: "past_due",
    periodEnd: at(27 * DAY),
  });
  {
    const { data } = await admin.from("entitlements").select("active_until, is_active").eq("user_id", uGrace.id);
    c.arrived("the entitlement is LIVE and ends inside the grace window",
      data[0].is_active && Date.parse(data[0].active_until) > Date.now(),
      `active_until=${data[0].active_until}`);
  }
  const grace = await lines(ctxGrace, "/billing");
  const PRE = `Your account stays as it is until ${day(graceEnd)}, and goes read only after that until a payment goes through.`;
  const POST = "Your account is read only for now. We'll keep trying your card, and access comes back as soon as a payment goes through.";
  c.arrived("the declined card is on screen", grace.text.includes("Your payment didn't go through"),
    grace.rows.slice(0, 8).join(" | "));
  c.check("⚠️ THE PRE-LAPSE SENTENCE RENDERS, character for character", grace.text.includes(PRE),
    grace.rows.find((l) => l.startsWith("Your account stays")) ?? "(absent)");
  c.check("CONTROL: the after-lapse sentence is absent from this page", !grace.text.includes(POST),
    "the two windows are exclusive");

  c.at("F3 — AFTER the lapse");
  const { u: uLapsed, ctx: ctxLapsed } = await seed("qa-fin-f3out", {
    entitlementUntil: at(-2 * DAY), status: "past_due",
    periodEnd: at(27 * DAY),
  });
  {
    const { data } = await admin.from("entitlements").select("active_until").eq("user_id", uLapsed.id);
    c.arrived("the entitlement has ENDED", Date.parse(data[0].active_until) < Date.now(),
      `active_until=${data[0].active_until}`);
  }
  const lapsed = await lines(ctxLapsed, "/billing");
  c.arrived("the declined card is on screen", lapsed.text.includes("Your payment didn't go through"),
    lapsed.rows.slice(0, 8).join(" | "));
  c.check("⚠️ THE AFTER-LAPSE SENTENCE RENDERS, character for character", lapsed.text.includes(POST),
    lapsed.rows.find((l) => l.startsWith("Your account is read only")) ?? "(absent)");
  c.check("CONTROL: the pre-lapse sentence is absent from this page",
    !lapsed.text.includes("Your account stays as it is until"), "the two windows are exclusive");

  /* ═══ F1 — the dismiss label and the title, on a real dialog ═══ */
  c.at("F1 — the labels, on a trial and on a plan");
  for (const [label, status, expectTitle, expectDismiss] of [
    ["a TRIAL", "trialing", "Cancel your trial?", "Keep my trial"],
    ["a PLAN", "active", "Cancel your plan?", "Keep my plan"],
  ]) {
    const { ctx } = await seed(`qa-fin-f1-${status}`, {
      entitlementUntil: at(20 * DAY), status,
      periodEnd: at(20 * DAY),
    });
    const page = await ctx.newPage();
    await page.goto("http://localhost:3100/billing", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const trigger = page.getByRole("button", { name: /^Cancel my / });
    const arrived = await trigger.count();
    c.arrived(`${label}: the cancel control is on screen`, arrived === 1, `${arrived} control(s)`);
    if (arrived === 1) {
      await trigger.click();
      await page.waitForTimeout(600);
      const dialog = page.locator('[role="dialog"]');
      const title = (await dialog.locator("h2").first().innerText()).trim();
      const buttons = await dialog.getByRole("button").allInnerTexts();
      c.check(`${label}: the title is "${expectTitle}"`, title === expectTitle, `got ${JSON.stringify(title)}`);
      c.check(`${label}: the dismiss button is "${expectDismiss}"`,
        buttons.map((b) => b.trim()).includes(expectDismiss), `buttons: ${JSON.stringify(buttons)}`);
      const forbidden = status === "active" ? "trial" : null;
      if (forbidden) {
        c.check(`${label}: CONTROL — D36's word appears nowhere on the dialog`,
          !`${title} ${buttons.join(" ")}`.toLowerCase().includes("trial"),
          `${title} / ${buttons.join(", ")}`);
      }
      c.check(`${label}: CONTROL — "Yes, cancel" is still present and undisguised`,
        buttons.map((b) => b.trim()).includes("Yes, cancel"), JSON.stringify(buttons));
    }
    await page.close();
  }
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
