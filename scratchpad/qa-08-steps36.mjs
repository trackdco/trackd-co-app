/**
 * SPEC 08 Steps 3 and 6 — THE STRIPE HANDOFF, AND THE D35 SUBSCRIBE ROW.
 *
 *   npx next dev -p 3100 -H 127.0.0.1     # NO flags
 *   node scratchpad/qa-08-steps36.mjs
 *
 * Step 3 verify: "every route to Stripe passes through it, and no route bypasses it."
 * Step 6 verify: "it renders for a grace account and for nobody else."
 *
 * ⚠️ THE SEAM IS ASSERTED ON THE URL, NEVER THE LABEL. `05`'s "Choose a plan",
 * `06`'s "Set up my plan" and `08`'s subscribe row all land on `?step=plans`, and
 * a label can match while a destination diverges.
 *
 * ⚠️ DATE ASSERTIONS COMPARE THE VALUE FROM ITS SOURCE, NOT THE SHAPE. See
 * `qa-08-step2-grace.mjs` for what a shape check cost: `en-AU` abbreviates
 * September with FOUR letters ("Sept"), so `\w{3}` silently disabled two controls
 * for a quarter of the year.
 *
 * ⚠️ COHORT EXCLUSION IS THE WHOLE POINT OF STEP 6. Asserting the row renders for
 * a grace account proves nothing on its own — a row rendered unconditionally
 * passes that. Every excluded cohort is seeded in the same run.
 *
 * Safety: @trackd-qa.invalid, timestamped, rows deleted then users dropped BY ID
 * in a `finally`. No Stripe objects: nothing here reaches checkout, and the
 * handoff is asserted up to the dialog's Continue button and no further.
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
const iso = (ms) => new Date(Date.now() + ms).toISOString();

/** ⚠️ §3.4's signed copy, character for character. */
const HANDOFF = {
  title: "You're off to Stripe",
  body: "Stripe handles payments for Trackd Co, so your card details never touch us.",
  bodyTwo:
    "Their page is where you change your card or download receipts. You'll come straight back here after.",
  dismiss: "Not now",
  confirm: "Continue",
};

/** D35's label, identical to `06`'s secondary control. */
const SUBSCRIBE_LABEL = "Set up my plan";
/** THE SEAM. Three surfaces, one destination. */
const PLANS_URL = "/onboarding?step=plans";

let seq = 0;
const created = [];
const browser = await chromium.launch();

async function seed(tag, { entitlements = [], subs = [], customer = false } = {}) {
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
      stripe_subscription_id: `qa08s_${Date.now()}_${(seq += 1)}`,
      stripe_price_id: PRICE_ID,
      ...s,
    });
    if (error) throw new Error(`subscription seed failed: ${error.message}`);
  }
  if (customer) {
    const { error } = await admin.from("billing_customers").insert({
      user_id: user.id,
      stripe_customer_id: `cus_qa08_${Date.now()}_${(seq += 1)}`,
    });
    if (error) throw new Error(`customer seed failed: ${error.message}`);
  }
  return user;
}

async function billingFor(user, width = 390, height = 844) {
  const session = await signIn(user);
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addCookies(
    [...session.jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })),
  );
  const page = await context.newPage();
  await page.goto("http://localhost:3100/billing", { waitUntil: "networkidle" });
  return page;
}

const GRACE_ENDS = iso(2 * DAY);

try {
  /* ══════════ STEP 3 — THE HANDOFF ══════════ */
  /**
   * The payment row only renders for somebody who HAS a Stripe customer, so the
   * handoff cohort is a subscriber. A lapsed-but-once-paying account would do as
   * well; this one is the ordinary case.
   */
  const payer = await seed("qa08-payer", {
    entitlements: [{ source: "stripe", active_until: iso(365 * DAY), is_active: true }],
    subs: [
      { status: "active", current_period_end: iso(365 * DAY), cancel_at_period_end: false },
    ],
    customer: true,
  });
  const cust = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", payer.id);
  check(
    "ARRIVAL (3): the account has a Stripe customer, so the payment row can render",
    Boolean(cust.data?.[0]?.stripe_customer_id),
    cust.data?.[0]?.stripe_customer_id ?? "none",
  );

  const pay = await billingFor(payer);
  const payRow = pay.locator("button", { hasText: "Payment method and invoices" });
  check(
    "ARRIVAL (3): the payment row is on screen",
    (await payRow.count()) > 0,
    `${await payRow.count()} row(s)`,
  );

  const dialog = pay.locator('[role="dialog"][aria-labelledby="handoff-title"]');
  check(
    "⚠️ the handoff dialog is NOT open before anything is pressed",
    (await dialog.count()) === 0,
    "a dialog already open would make every assertion below vacuous",
  );

  await payRow.first().click();
  await pay.waitForTimeout(500);
  check("§3.4: pressing the payment row opens the handoff", (await dialog.count()) > 0);

  const dText = await dialog.innerText();
  console.log(`\n--- the handoff dialog ---\n${dText}\n---`);
  check("§3.4 title, character for character", dText.includes(HANDOFF.title));
  check("§3.4 first line, character for character", dText.includes(HANDOFF.body));
  check("§3.4 second line, character for character", dText.includes(HANDOFF.bodyTwo));
  check(`§3.4 dismiss reads "${HANDOFF.dismiss}"`, dText.includes(HANDOFF.dismiss));
  check(`§3.4 primary reads "${HANDOFF.confirm}"`, dText.includes(HANDOFF.confirm));
  check("no em dash anywhere in the dialog", !dText.includes("—"));

  /* ── mechanics: §5's dialog checkboxes, measured ── */
  const focusIn = await pay.evaluate(() => {
    const d = document.querySelector('[role="dialog"][aria-labelledby="handoff-title"]');
    return Boolean(d && d.contains(document.activeElement));
  });
  check("§5: focus moves INTO the dialog", focusIn);

  const btns = dialog.locator("button");
  const n = await btns.count();
  let smallest = Infinity;
  let measured = 0;
  for (let i = 0; i < n; i += 1) {
    const box = await btns.nth(i).boundingBox();
    if (box) { measured += 1; smallest = Math.min(smallest, box.height); }
  }
  /**
   * ⚠️ A SENTINEL IS NOT A MEASUREMENT (5.1). `smallest` started at 999, so
   * "every tap target is at least 44px" was TRUE for a dialog with no buttons —
   * which is what a renamed selector or a dialog that never opened looks like.
   * The property is "every MEASURED button is thumb-reachable", so it must first
   * have measured one.
   */
  check("§5: ARRIVAL — buttons were found to measure", measured > 0, `${measured} of ${n} laid out`);
  check(
    "§5: every tap target is at least 44px tall",
    measured > 0 && smallest >= 44,
    measured > 0 ? `smallest ${smallest}px across ${measured}` : "NOTHING MEASURED",
  );

  // ⚠️ pointer-events is load-bearing: Radix sets `pointer-events: none` on body.
  const hittable = await dialog.evaluate((node) => {
    const b = [...node.querySelectorAll("button")];
    return b.filter((x) => {
      const r = x.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el && (el === x || x.contains(el));
    }).length;
  });
  check("§5: every button is genuinely hit-testable", hittable === n, `${hittable} of ${n}`);

  // Tab cycles INSIDE. Press it more times than there are buttons and check we
  // are still in the dialog — walking out is the defect being guarded against.
  for (let i = 0; i < n + 3; i += 1) await pay.keyboard.press("Tab");
  const stillIn = await pay.evaluate(() => {
    const d = document.querySelector('[role="dialog"][aria-labelledby="handoff-title"]');
    return Boolean(d && d.contains(document.activeElement));
  });
  check("§5: Tab cycles inside and never walks out", stillIn);

  await pay.keyboard.press("Escape");
  await pay.waitForTimeout(400);
  check("§5: Escape closes the dialog", (await dialog.count()) === 0);
  const backOnTrigger = await pay.evaluate(() =>
    document.activeElement?.textContent?.includes("Payment method and invoices"),
  );
  check("§5: and focus returns to the trigger", Boolean(backOnTrigger));

  /* ── ⚠️ NO BYPASS. The action must be unreachable without the dialog ── */
  check(
    "§3.4: pressing the row NEVER navigates straight to Stripe",
    pay.url().includes("/billing"),
    pay.url(),
  );
  const stripeLinks = await pay.evaluate(() =>
    [...document.querySelectorAll("a[href]")]
      .map((a) => a.getAttribute("href"))
      .filter((h) => /stripe\.com|billing\.stripe/.test(h ?? "")),
  );
  check(
    "§3.4: no anchor on the page reaches Stripe directly, bypassing the dialog",
    stripeLinks.length === 0,
    stripeLinks.join(", ") || "none",
  );
  check(
    "§3.4 CONTROL: the dismiss button does NOT leave the app",
    pay.url().includes("localhost:3100/billing"),
    pay.url(),
  );

  /* ══════════ STEP 6 — THE D35 SUBSCRIBE ROW ══════════ */
  /* The cohort: a LIVE beta grace and NO subscription. Nothing else. */
  const graceUser = await seed("qa08-g-nosub", {
    entitlements: [{ source: "comp", active_until: GRACE_ENDS, is_active: true }],
  });
  const gEnt = await admin
    .from("entitlements")
    .select("source, active_until")
    .eq("user_id", graceUser.id);
  const gSubs = await admin.from("subscriptions").select("id").eq("user_id", graceUser.id);
  check(
    "ARRIVAL (6): a live dated comp AND zero subscription rows",
    gEnt.data?.[0]?.source === "comp" &&
      gEnt.data?.[0]?.active_until !== null &&
      gSubs.data?.length === 0,
    `comp until ${gEnt.data?.[0]?.active_until}, ${gSubs.data?.length ?? 0} sub(s)`,
  );

  const gPage = await billingFor(graceUser);
  const subscribeRow = gPage.locator("a", { hasText: SUBSCRIBE_LABEL });
  check(
    `D35: the grace account gets the "${SUBSCRIBE_LABEL}" row`,
    (await subscribeRow.count()) > 0,
    `${await subscribeRow.count()} row(s)`,
  );
  check(
    "D35: the label is IDENTICAL to 06's secondary control",
    (await subscribeRow.first().innerText()).trim() === SUBSCRIBE_LABEL,
    `"${(await subscribeRow.first().innerText()).trim()}"`,
  );

  /* ── ⚠️ THE SEAM: assert the URL, not the label ── */
  const href = await subscribeRow.first().getAttribute("href");
  check(
    "⚠️ THE SEAM: the subscribe row's destination is ?step=plans",
    href === PLANS_URL,
    `href="${href}" (05, 06 and 08 must all land here)`,
  );
  await subscribeRow.first().click();
  await gPage.waitForURL(/onboarding/, { timeout: 15000 }).catch(() => {});
  check(
    "⚠️ THE SEAM: and following it actually lands on the price list",
    gPage.url().includes("step=plans"),
    gPage.url(),
  );

  /* ── §3.8: not amber, and not a filled call to action ── */
  const gPage2 = await billingFor(graceUser);
  const rowStyle = await gPage2
    .locator("a", { hasText: SUBSCRIBE_LABEL })
    .first()
    .evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, color: cs.color, cls: el.className };
    });
  check(
    "§3.8: the subscribe row is NOT amber",
    !/amber/i.test(rowStyle.cls),
    rowStyle.cls.slice(0, 90),
  );
  check(
    "§3.8: it reads as available rather than urgent (no filled accent background)",
    !/accent-primary|bg-accent/i.test(rowStyle.cls),
    `bg=${rowStyle.bg}`,
  );
  const rowBox = await gPage2.locator("a", { hasText: SUBSCRIBE_LABEL }).first().boundingBox();
  check("§5: the subscribe row is at least 44px tall", rowBox.height >= 44, `${rowBox.height}px`);

  /* ── ⚠️ EVERY EXCLUDED COHORT, SEEDED IN THIS RUN ── */
  const excluded = [
    [
      "a COURTESY customer (already has a subscription; a second would break the invariant)",
      {
        entitlements: [{ source: "stripe", active_until: iso(30 * DAY), is_active: true }],
        subs: [
          {
            status: "trialing",
            trial_ends_at: iso(30 * DAY),
            current_period_end: iso(30 * DAY),
            cancel_at_period_end: false,
            courtesy_until: iso(30 * DAY),
          },
        ],
      },
    ],
    [
      "a FREE-FOR-LIFE comp (01 refuses them at the create call)",
      { entitlements: [{ source: "comp", active_until: null, is_active: true }] },
    ],
    [
      "a LAPSED account (05's pop-up owns that route)",
      {},
    ],
    [
      "a PAYING subscriber (nothing to set up)",
      {
        entitlements: [{ source: "stripe", active_until: iso(365 * DAY), is_active: true }],
        subs: [
          { status: "active", current_period_end: iso(365 * DAY), cancel_at_period_end: false },
        ],
      },
    ],
    [
      "a GENUINE trialist (not a grace)",
      {
        entitlements: [{ source: "stripe", active_until: iso(7 * DAY), is_active: true }],
        subs: [
          {
            status: "trialing",
            trial_ends_at: iso(7 * DAY),
            current_period_end: iso(7 * DAY),
            cancel_at_period_end: false,
          },
        ],
      },
    ],
    [
      "a MID-GRACE SUBSCRIBER (a live grace, but they already set one up)",
      {
        entitlements: [{ source: "comp", active_until: GRACE_ENDS, is_active: true }],
        subs: [
          {
            status: "trialing",
            trial_ends_at: GRACE_ENDS,
            current_period_end: iso(367 * DAY),
            cancel_at_period_end: false,
          },
        ],
      },
    ],
  ];

  for (const [who, shape] of excluded) {
    const u = await seed("qa08-x", shape);
    const p = await billingFor(u);
    const count = await p.locator("a", { hasText: SUBSCRIBE_LABEL }).count();
    check(`D35 EXCLUDED: ${who} does NOT get the row`, count === 0, `${count} row(s)`);
  }
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
