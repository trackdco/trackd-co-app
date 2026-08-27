/**
 * SPEC 08 Step 4 — THE MANAGE SUB-SCREEN.
 *
 *   npx next dev -p 3100 -H 127.0.0.1     # NO flags
 *   node scratchpad/qa-08-step4-manage.mjs
 *
 * Step 4's verify: "back navigation returns to Billing cleanly, and the existing
 * single row no longer exists in two places."
 *
 * ⚠️ EACH SENTENCE IS ASSERTED AGAINST THE STATE THAT PRODUCES IT, and every OTHER
 * sentence is asserted ABSENT from that state. Twelve near-identical sentences on
 * one surface is exactly where a neighbouring cohort's line passes for the one you
 * meant: several share the opening "You've got 14 days on us until", several share
 * a date, and eleven of the twelve are wrong for any given user. Presence alone
 * proves nothing.
 *
 * ⚠️ D39 IS THE FIRST NESTED ROUTE IN THIS APP, so its back behaviour and layout
 * are DRIVEN rather than assumed (§3.3 says so in as many words).
 *
 * Safety: @trackd-qa.invalid, timestamped, rows deleted then users dropped BY ID
 * in a `finally`. No Stripe objects.
 */
import { chromium } from "playwright";

import { admin, makeUser, dropUser, signIn, env } from "./admin.mjs";

const PRICE_ID = env.STRIPE_PRICE_YEARLY;
if (!PRICE_ID) throw new Error("STRIPE_PRICE_YEARLY is not set in .env.local");

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "  ✅" : "  ❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const DAY = 24 * 60 * 60 * 1000;
/**
 * ⚠️ ONE INSTANT PER RUN, BECAUSE THE WRITER WRITES ONE INSTANT (5.1 / the 0.1 rule).
 *
 * This read `Date.now()` on EVERY call, so a seed writing
 *
 *     entitlements.active_until      : iso(365 * DAY)
 *     subscriptions.current_period_end: iso(365 * DAY)
 *
 * produced TWO timestamps milliseconds apart whenever the two calls straddled a
 * millisecond boundary. `sync.ts` writes both columns from ONE call to
 * `entitledUntil(sub)` — the same instant, always — so the diverged pair is a
 * state the app cannot produce, exactly as 0.1's revoked cohort was.
 *
 * ⚠️ IT IS NOT COSMETIC. `accessEndsEarly` compares those two as STRINGS
 * (`manage.ts`: `endsOn !== mirrorEnd`), so one millisecond flips it true and
 * `/billing` renders **"Ends on"** where "Renews on" is correct. It fired on
 * 20 Aug 2026 and took two cohorts of `qa-08-step7-states` red — a real defect
 * report against entirely correct product code.
 *
 * Freezing the base makes `iso(N)` stable for the whole run, which reproduces the
 * writer's property rather than approximating it. Thirteen seeds across five
 * tracked drivers were affected; all are fixed by this one line.
 */
const RUN_NOW = Date.now();
const iso = (ms) => new Date(RUN_NOW + ms).toISOString();
const day = (isoStr) =>
  new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.parse(isoStr)));

/**
 * ⚠️ THE SIGNED SET, WITH THE STATE THAT PRODUCES EACH ONE.
 *
 * `lib/billing/signed/manage-summary.txt` pins these as codepoints in the suite;
 * this drives that the RIGHT one reaches the RIGHT user's screen.
 */
const PRICE = "$69.99 USD a year";

let seq = 0;
const created = [];
const browser = await chromium.launch();

async function seed(tag, { entitlements = [], subs = [], customer = true } = {}) {
  const user = await makeUser(tag);
  created.push(user.id);
  for (const e of entitlements) {
    const { error } = await admin
      .from("entitlements")
      .insert({ user_id: user.id, product: "pro", ...e });
    if (error) throw new Error(`entitlement seed failed: ${error.message}`);
  }
  for (const s of subs) {
    const { error } = await admin.from("subscriptions").insert({
      user_id: user.id,
      stripe_subscription_id: `qa08m_${Date.now()}_${(seq += 1)}`,
      stripe_price_id: PRICE_ID,
      ...s,
    });
    if (error) throw new Error(`subscription seed failed: ${error.message}`);
  }
  if (customer) {
    const { error } = await admin.from("billing_customers").insert({
      user_id: user.id,
      stripe_customer_id: `cus_qa08m_${Date.now()}_${(seq += 1)}`,
    });
    if (error) throw new Error(`customer seed failed: ${error.message}`);
  }
  return user;
}

async function open(user, path = "/billing/manage", w = 390, h = 844) {
  const session = await signIn(user);
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addCookies(
    [...session.jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })),
  );
  const page = await ctx.newPage();
  await page.goto(`http://localhost:3100${path}`, { waitUntil: "networkidle" });
  return page;
}

try {
  const renewsOn = iso(365 * DAY);
  const trialEnds = iso(7 * DAY);
  const graceEnds = iso(2 * DAY);
  const courtesyEnds = iso(30 * DAY);

  /* ⚠️ Every cohort, its expected sentence, and the states seeded to reach it. */
  const COHORTS = [
    [
      "PAYING",
      { entitlements: [{ source: "stripe", active_until: renewsOn, is_active: true }],
        subs: [{ status: "active", current_period_end: renewsOn, cancel_at_period_end: false }] },
      `You're on your Pro plan at ${PRICE}, and it renews on ${day(renewsOn)}.`,
    ],
    [
      "TRIAL",
      { entitlements: [{ source: "stripe", active_until: trialEnds, is_active: true }],
        subs: [{ status: "trialing", trial_ends_at: trialEnds, current_period_end: trialEnds, cancel_at_period_end: false }] },
      `You're on a free trial of your Pro plan until ${day(trialEnds)}, and then it's ${PRICE}.`,
    ],
    [
      "CANCELLED, paid at least once",
      { entitlements: [{ source: "stripe", active_until: renewsOn, is_active: true }],
        subs: [{ status: "active", current_period_end: renewsOn, cancel_at_period_end: true }] },
      `You've cancelled, so you keep your Pro plan until ${day(renewsOn)} and won't be charged again.`,
    ],
    [
      "CANCELLED, never charged",
      { entitlements: [{ source: "stripe", active_until: trialEnds, is_active: true }],
        subs: [{ status: "trialing", trial_ends_at: trialEnds, current_period_end: trialEnds, cancel_at_period_end: true }] },
      `You've cancelled, so you keep your Pro plan until ${day(trialEnds)} and won't be charged.`,
    ],
    [
      "BETA GRACE",
      { entitlements: [{ source: "comp", active_until: graceEnds, is_active: true }] },
      `You've got 14 days on us until ${day(graceEnds)}, and you'll need a plan after that to keep adding.`,
    ],
    [
      "FREE FOR LIFE",
      { entitlements: [{ source: "comp", active_until: null, is_active: true }] },
      "You have free access for life, so there's nothing to pay and nothing to renew.",
    ],
    [
      "COURTESY",
      { entitlements: [{ source: "stripe", active_until: courtesyEnds, is_active: true }],
        subs: [{ status: "trialing", trial_ends_at: courtesyEnds, current_period_end: courtesyEnds, cancel_at_period_end: false, courtesy_until: courtesyEnds }] },
      `Your Pro plan is free until ${day(courtesyEnds)}, and then it's ${PRICE}.`,
    ],
    [
      "PAST DUE",
      { entitlements: [{ source: "stripe", active_until: iso(3 * DAY), is_active: true }],
        subs: [{ status: "past_due", current_period_end: renewsOn, cancel_at_period_end: false }] },
      `Your last payment didn't go through, so your Pro plan runs until ${day(iso(3 * DAY))} and your account goes read only after that until a payment goes through.`,
    ],
    [
      "GRACE-ALIGNED TRIALING",
      { entitlements: [{ source: "comp", active_until: graceEnds, is_active: true }],
        subs: [{ status: "trialing", trial_ends_at: graceEnds, current_period_end: renewsOn, cancel_at_period_end: false }] },
      `You've got 14 days on us until ${day(graceEnds)}, and then your Pro plan starts at ${PRICE}.`,
    ],
    [
      "FREE FOR LIFE while Stripe is charging (R5a)",
      { entitlements: [{ source: "comp", active_until: null, is_active: true }],
        subs: [{ status: "active", current_period_end: renewsOn, cancel_at_period_end: false }] },
      `You have free access for life, so your Pro plan at ${PRICE} adds nothing, and cancelling it won't change what you can do.`,
    ],
  ];

  const allSentences = COHORTS.map(([, , s]) => s);

  for (const [name, shape, expected] of COHORTS) {
    const u = await seed("qa08m", shape);
    const p = await open(u);
    const text = await p.locator("body").innerText();
    if (name === "PAYING") console.log(`\n--- /billing/manage (PAYING) ---\n${text}\n---`);

    check(`${name}: the signed sentence renders, character for character`,
      text.includes(expected), expected);

    /**
     * ⚠️ AND EVERY OTHER COHORT'S SENTENCE IS ABSENT. This is the assertion that
     * makes the one above mean something: several sentences share an opening and
     * a date, so "the right words appear" is satisfied by the wrong sentence.
     */
    const strays = allSentences.filter((s) => s !== expected && text.includes(s));
    check(`${name}: ⚠️ and NO other cohort's sentence appears`,
      strays.length === 0, strays.join(" || ") || "none");
  }

  /* ══ R5(b): the unavailable cohort gets NO sentence ══════════════ */
  const paused = await seed("qa08m-paused", {
    entitlements: [{ source: "stripe", active_until: iso(30 * DAY), is_active: true }],
    subs: [{ status: "paused", current_period_end: iso(30 * DAY), cancel_at_period_end: false }],
  });
  const pausedPage = await open(paused);
  const pausedText = await pausedPage.locator("body").innerText();
  console.log(`\n--- /billing/manage (paused — R5b withhold) ---\n${pausedText}\n---`);
  /**
   * ⚠️ ASSERTED STRUCTURALLY, AND THE FIRST VERSION WAS VACUOUS.
   *
   * It compared the page against the exact expected sentences, every one of which
   * carried a FIXED date — so a paused account rendering the PAYING sentence with
   * its OWN date matched nothing and the check went green while the sentence sat
   * in the log directly above it. The tell was the log, not the tick.
   *
   * "No summary" is a fact about the DOM, so it is asked of the DOM: is there any
   * paragraph between the heading and the Payment card? That cannot be satisfied
   * by a date the script failed to predict.
   */
  const summaryPara = await pausedPage.evaluate(() => {
    const h1 = document.querySelector("h1");
    if (!h1) return "NO HEADING";
    let el = h1.nextElementSibling;
    while (el && el.tagName !== "SECTION") {
      if (el.tagName === "P" && el.textContent.trim().length > 0) return el.textContent.trim();
      el = el.nextElementSibling;
    }
    return null;
  });
  check("⚠️ R5(b): the unavailable cohort gets NO summary sentence at all",
    summaryPara === null, summaryPara ?? "no paragraph before the Payment card");
  /**
   * ⚠️ DELETED: A HARDCODED `true` RECORDED AS A PASSING CONTROL (5.7).
   *
   * A line here read `check("... CONTROL: the same probe FINDS a sentence ...",
   * true, "asserted immediately below against a paying account")`. It was the
   * only literal `true` verdict in 200 drivers.
   *
   * Nothing was unprotected: the REAL control runs ~25 lines down against a
   * paying account, is well built, and fails loudly if the probe stops seeing
   * sentences. But this line reported GREEN for a control it did not perform, so
   * if the real one were ever deleted the summary would still show a control
   * passing — a green tick standing in for the thing it points at.
   *
   * It is deleted rather than rewritten: the assertion it described already
   * exists, correctly, and adding a second one would be two checks for one
   * property. The pointer belongs in a comment, which is what this is.
   *
   * ⚠️ The real control is "⚠️ CONTROL: the same probe DOES find the sentence for
   * a paying account". If that is ever removed, the withhold assertion above it
   * proves nothing and must be removed with it.
   */
  check("R5(b) CONTROL: but the screen itself still works — Card and Receipts render",
    /Card/.test(pausedText) && /Receipts/.test(pausedText));

  /* ══ §3.3's structure, and D39's nested-route behaviour ══════════ */
  const payer = await seed("qa08m-nav", {
    entitlements: [{ source: "stripe", active_until: renewsOn, is_active: true }],
    subs: [{ status: "active", current_period_end: renewsOn, cancel_at_period_end: false }],
  });

  /**
   * ⚠️ THE STRUCTURAL PROBE'S OWN CONTROL. Without it, a probe that always
   * returned null would pass the withhold assertion above and prove nothing.
   */
  const payerManage = await open(payer);
  const payerPara = await payerManage.evaluate(() => {
    const h1 = document.querySelector("h1");
    let el = h1?.nextElementSibling;
    while (el && el.tagName !== "SECTION") {
      if (el.tagName === "P" && el.textContent.trim().length > 0) return el.textContent.trim();
      el = el.nextElementSibling;
    }
    return null;
  });
  check("⚠️ CONTROL: the same probe DOES find the sentence for a paying account",
    typeof payerPara === "string" && payerPara.startsWith("You're on your Pro plan"),
    payerPara ?? "null — the probe cannot see sentences at all, so the withhold above proved nothing");

  /* the Manage row on Billing reaches it */
  const billing = await open(payer, "/billing");
  const manageRow = billing.locator('a[href="/billing/manage"]');
  check("§3.2: Billing carries a Manage row", (await manageRow.count()) > 0);
  const billingText = await billing.locator("body").innerText();
  check("⚠️ Step 4: the old single payment row no longer exists on Billing",
    !billingText.includes("Payment method and invoices"),
    "the row that did both jobs must not survive alongside the two that replace it");
  await manageRow.first().click();
  await billing.waitForURL(/\/billing\/manage/, { timeout: 15000 }).catch(() => {});
  check("D39: the Manage row opens /billing/manage", billing.url().endsWith("/billing/manage"), billing.url());

  const manageText = await billing.locator("body").innerText();
  check("§3.3: Card and Receipts are TWO rows", /Card/.test(manageText) && /Receipts/.test(manageText));
  check("§5: Receipts states that it hands off to Stripe until 19 ships",
    /Receipts[\s\S]{0,90}Stripe/.test(manageText),
    manageText.split("\n").filter((l) => /Stripe/.test(l)).join(" | "));
  check("§3.3: a bare page-title heading, no app bar and no chevron",
    /^\s*Manage\s*$/m.test(manageText));
  check("§3.3: the fixed bottom nav is still visible",
    (await billing.locator("nav").count()) > 0);
  check("no em dash anywhere on Manage", !manageText.includes("—"));

  /* back navigation, driven because D39 says to drive it */
  const back = billing.locator('a[href="/billing"]');
  check("§3.3: a plain text back link at the foot, reading back to BILLING",
    (await back.count()) > 0 && (await back.first().innerText()).includes("Back to billing"),
    (await back.first().innerText().catch(() => "none")));
  await back.first().click();
  await billing.waitForURL(/\/billing$/, { timeout: 15000 }).catch(() => {});
  check("D39: back navigation returns to Billing cleanly", billing.url().endsWith("/billing"), billing.url());
  check("D39 CONTROL: and Billing is genuinely rendered, not a blank shell",
    (await billing.locator("body").innerText()).includes("Access"));

  /* the browser's own back button, which a nested route must also survive */
  await billing.goto("http://localhost:3100/billing/manage", { waitUntil: "networkidle" });
  await billing.goBack({ waitUntil: "networkidle" });
  check("D39: the BROWSER back button also lands on Billing",
    billing.url().endsWith("/billing"), billing.url());

  /* ══ every route to Stripe still passes through the handoff ══════ */
  await billing.goto("http://localhost:3100/billing/manage", { waitUntil: "networkidle" });
  const dialog = billing.locator('[role="dialog"][aria-labelledby="handoff-title"]');
  for (const label of ["Card", "Receipts"]) {
    check(`${label}: the handoff is not open before pressing`, (await dialog.count()) === 0);
    await billing.locator("button", { hasText: new RegExp(`^${label}`) }).first().click();
    await billing.waitForTimeout(400);
    check(`§3.4: ${label} routes THROUGH the handoff dialog`, (await dialog.count()) > 0);
    check(`§3.4: ${label} did not navigate away by itself`, billing.url().includes("/billing/manage"));
    await billing.keyboard.press("Escape");
    await billing.waitForTimeout(300);
  }
  const stripeAnchors = await billing.evaluate(() =>
    [...document.querySelectorAll("a[href]")]
      .map((a) => a.getAttribute("href"))
      .filter((h) => /stripe\.com/.test(h ?? "")),
  );
  check("§3.4: no anchor on Manage reaches Stripe directly", stripeAnchors.length === 0,
    stripeAnchors.join(", ") || "none");

  /* ══ 320x568 ══════════════════════════════════════════════════ */
  const small = await open(payer, "/billing/manage", 320, 568);
  await small.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await small.waitForTimeout(250);
  const m = await small.evaluate(() => {
    const doc = document.documentElement;
    const nav = document.querySelector("nav");
    const navTop = nav ? nav.getBoundingClientRect().top : Infinity;
    const main = document.querySelector("main") ?? document.body;
    let smallest = Infinity;
    let measured = 0;
    let under = 0;
    for (const c of main.querySelectorAll("a,button")) {
      if (nav && nav.contains(c)) continue;
      const r = c.getBoundingClientRect();
      if (!r.height && !r.width) continue;
      measured += 1;
      smallest = Math.min(smallest, r.height);
      if (r.top + r.height / 2 > navTop) under += 1;
    }
    return {
      horiz: doc.scrollWidth > doc.clientWidth + 0.5,
      smallest, under, measured, navFound: Boolean(nav),
    };
  });
  check("320x568: Manage does not scroll horizontally", !m.horiz);
  /**
   * ⚠️ A SENTINEL IS NOT A MEASUREMENT (5.1). `smallest` started at 999 and
   * `navTop` at Infinity, so both checks below were TRUE when nothing was found:
   * a screen that failed to render "had every tap target at least 44px". The
   * properties they are about are "every MEASURED control is thumb-reachable"
   * and "content does not hide behind the nav" — the first needs at least one
   * control, the second needs a nav to exist at all.
   */
  check("320x568: ARRIVAL — controls were found to measure", m.measured > 0, `${m.measured} measured`);
  check(
    "320x568: every tap target is at least 44px",
    m.measured > 0 && m.smallest >= 44,
    m.measured > 0 ? `smallest ${m.smallest}px across ${m.measured}` : "NOTHING MEASURED",
  );
  check("320x568: ARRIVAL — the bottom nav exists, so clearance is askable", m.navFound);
  check(
    "320x568: nothing sits under the fixed bottom nav",
    m.navFound && m.under === 0,
    m.navFound ? `${m.under} control(s)` : "NOT MEASURED",
  );
} finally {
  await browser.close();
  for (const id of created) {
    await admin.from("subscriptions").delete().eq("user_id", id);
    await admin.from("entitlements").delete().eq("user_id", id);
    await admin.from("billing_customers").delete().eq("user_id", id);
    await dropUser(id);
  }
  console.log(`\ntorn down by id: ${created.length} account(s)`);
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    console.log("FAILED:");
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
    process.exitCode = 1;
  }
}
