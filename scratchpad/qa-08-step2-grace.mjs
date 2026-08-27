/**
 * SPEC 08 Step 2 — THE GRACE LABEL AND THE DATE ROW, DRIVEN.
 *
 * §3.6's defect: a beta user on day twelve of fourteen opens Billing and sees
 * "Access — Complimentary" and no date anywhere, reading identically to a founder
 * who is free for life. Step 2's verify: "a seeded grace account on day twelve
 * sees its end date, and a seeded free-for-life account sees no date and no
 * expiry language."
 *
 *   npx next dev -p 3100 -H 127.0.0.1     # NO flags. Both stay unset.
 *   node scratchpad/qa-08-step2-grace.mjs
 *
 * ⚠️ EVERY DEFECT ASSERTION HAS A NAMED COUNTERPART BESIDE IT. Both comp states
 * returned "Complimentary" before this, so a one-sided test for the free-for-life
 * answer passed throughout the defect's life. The control is always the OTHER
 * account, seeded in the same run.
 *
 * ⚠️ ARRIVAL BEFORE ASSERTION. Every account's entitlement row is read back from
 * the database and its shape asserted before anything about the screen is
 * claimed, because a label rendered for an account that was never in the state is
 * measuring nothing.
 *
 * ⚠️ THE 320x568 GATE. §3.6 puts a DATE inside a row where every other value is
 * one word. It is measured on the live element, not eyeballed: overflow past the
 * card and wrapping to a second line both fail, and a failure is a stop-and-ask
 * rather than a trim.
 *
 * Safety: four accounts, all `@trackd-qa.invalid`, timestamped, billing rows
 * deleted then the users dropped BY ID in a `finally`. No Stripe objects are
 * created at all — every state here is an entitlements/mirror shape.
 */
import { chromium } from "playwright";

import { admin, makeUser, dropUser, signIn, env } from "./admin.mjs";

/**
 * ⚠️ THE MIRROR'S NOT-NULL COLUMNS. `stripe_subscription_id` is UNIQUE and
 * `stripe_price_id` is NOT NULL, so a seeded row must carry both or the insert is
 * rejected — which is how the first run of this driver failed, loudly and in the
 * right direction. The ids are local fictions with a `qa08_` prefix and are never
 * sent to Stripe; the PRICE id is the real one from `.env.local`, so the Price row
 * renders from its actual source rather than from a blank.
 */
const PRICE_ID = env.STRIPE_PRICE_YEARLY;
if (!PRICE_ID) throw new Error("STRIPE_PRICE_YEARLY is not set in .env.local");
let seq = 0;
const fakeSubId = () => `qa08_${Date.now()}_${(seq += 1)}`;

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "  ✅" : "  ❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const DAY = 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

/**
 * ⚠️ ASSERT THE VALUE FROM ITS SOURCE, NOT THE SHAPE. THE HOUSE RULE FOR DATES.
 *
 * A shape check (`/\d{1,2}\s\w{3}\s\d{4}/`) is satisfied by ANY date, so it
 * cannot tell the right date from the wrong one sitting in the next row — and it
 * silently failed on its own terms as well:
 *
 * ⚠️ **`en-AU` ABBREVIATES SEPTEMBER WITH FOUR LETTERS — "Sept", not "Sep".**
 * June and July are not abbreviated at all. So `\w{3}` matched nine months out of
 * twelve, and the two CONTROLS written as "there is NO date here" passed
 * vacuously for a quarter of the year. A control that is off for three months is
 * worse than no control, because it is counted as one.
 *
 * So: format the expected instant with {@link day} and compare the STRING, the
 * way the courtesy row is asserted against `courtesy_until` itself. Shape checks
 * survive below only where the claim genuinely is "no date of any kind appears",
 * and they use `\w{3,4}` so that claim is not quietly true for September.
 */
const day = (isoStr) =>
  new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.parse(isoStr)));

/** Words §3.6 forbids on a free-for-life account's screen. */
const EXPIRY_WORDS = ["until", "ends", "expires", "left", "remaining", "days"];

const created = [];
const browser = await chromium.launch();

/** Seed an account and give it exactly the entitlement/mirror shape named. */
async function seed(tag, { source, activeUntil, sub = null }) {
  const user = await makeUser(tag);
  created.push(user.id);
  if (source) {
    const { error } = await admin.from("entitlements").insert({
      user_id: user.id,
      product: "pro",
      source,
      active_until: activeUntil,
      is_active: true,
    });
    if (error) throw new Error(`entitlement seed failed: ${error.message}`);
  }
  if (sub) {
    const { error } = await admin.from("subscriptions").insert({
      user_id: user.id,
      stripe_subscription_id: fakeSubId(),
      stripe_price_id: PRICE_ID,
      ...sub,
    });
    if (error) throw new Error(`subscription seed failed: ${error.message}`);
  }
  return user;
}

/** Sign in and open a page at the given viewport. */
async function open(user, width, height) {
  const session = await signIn(user);
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addCookies(
    [...session.jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })),
  );
  return context.newPage();
}

/** The Access row's value, read off the live DOM rather than off page text. */
async function accessRow(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll("div.flex.items-center")];
    for (const r of rows) {
      const spans = r.querySelectorAll("span");
      if (spans.length === 2 && spans[0].textContent.trim() === "Access") {
        const v = spans[1];
        const card = r.parentElement;
        return {
          value: v.textContent.trim(),
          valueBox: v.getBoundingClientRect().toJSON(),
          cardBox: card.getBoundingClientRect().toJSON(),
          lineHeight: parseFloat(getComputedStyle(v).lineHeight),
          scrollWidth: v.scrollWidth,
          clientWidth: v.clientWidth,
        };
      }
    }
    return null;
  });
}

/** Every `label / value` row in the plan card, in order. */
async function planRows(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("div.flex.items-center")]
      .map((r) => r.querySelectorAll("span"))
      .filter((s) => s.length === 2)
      .map((s) => [s[0].textContent.trim(), s[1].textContent.trim()]),
  );
}

try {
  /* ══ the two comp states, seeded side by side ═══════════════════ */
  // Day twelve of fourteen: two days left, which is §3.6's own example.
  const graceEnds = iso(2 * DAY);
  const graceUser = await seed("qa08-grace", { source: "comp", activeUntil: graceEnds });
  const foreverUser = await seed("qa08-forever", { source: "comp", activeUntil: null });

  /* ── ⚠️ ARRIVAL: both are really in the state before anything is claimed ── */
  for (const [who, id, expectDated] of [
    ["grace", graceUser.id, true],
    ["free for life", foreverUser.id, false],
  ]) {
    const { data } = await admin
      .from("entitlements")
      .select("source, active_until, is_active")
      .eq("user_id", id);
    const row = data?.[0];
    check(
      `ARRIVAL: the ${who} account holds one comp row, ${expectDated ? "dated" : "undated"}`,
      data?.length === 1 &&
        row.source === "comp" &&
        row.is_active === true &&
        (row.active_until !== null) === expectDated,
      `${data?.length ?? 0} row(s), active_until=${row?.active_until ?? "null"}`,
    );
  }

  /* ══ §3.6's defect, and its control ════════════════════════════ */
  const gracePage = await open(graceUser, 390, 844);
  await gracePage.goto("http://localhost:3100/billing", { waitUntil: "networkidle" });
  const graceAccess = await accessRow(gracePage);
  const graceText = await gracePage.locator("body").innerText();
  console.log(`\n--- BETA GRACE, day 12 of 14 ---\n${(await planRows(gracePage)).map(([l, v]) => `  ${l}  ${v}`).join("\n")}\n---`);

  const foreverPage = await open(foreverUser, 390, 844);
  await foreverPage.goto("http://localhost:3100/billing", { waitUntil: "networkidle" });
  const foreverAccess = await accessRow(foreverPage);
  const foreverText = await foreverPage.locator("body").innerText();
  console.log(`\n--- FREE FOR LIFE ---\n${(await planRows(foreverPage)).map(([l, v]) => `  ${l}  ${v}`).join("\n")}\n---`);

  check("ARRIVAL: the Access row rendered on both screens", Boolean(graceAccess && foreverAccess));

  // The date §3.6 says is missing. `formatAccessDate` is en-AU: "20 Nov 2026".
  const expectDay = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.parse(graceEnds)));

  check(
    "§3.6 DEFECT FIXED: the grace account sees its end date on Billing",
    graceAccess?.value.includes(expectDay),
    `Access = "${graceAccess?.value}" (expected the date ${expectDay})`,
  );
  check(
    "and it reads the signed days-on-us vocabulary, not the founder's word",
    graceAccess?.value.startsWith("On us") && !graceAccess.value.includes("Complimentary"),
    `Access = "${graceAccess?.value}"`,
  );
  check(
    '⚠️ D36 absolute rule: the word "trial" appears NOWHERE for a grace account',
    !graceText.toLowerCase().includes("trial"),
    graceText.toLowerCase().includes("trial") ? "found it" : "absent",
  );

  /* ── the CONTROL: the same word must NOT appear for free-for-life ── */
  check(
    "CONTROL: the free-for-life account reads Complimentary",
    foreverAccess?.value === "Complimentary",
    `Access = "${foreverAccess?.value}"`,
  );
  check(
    "CONTROL: it sees NO date and no expiry language",
    !/\d{1,2}\s\w{3,4}\s\d{4}/.test(foreverAccess?.value ?? "") &&
      !EXPIRY_WORDS.some((w) => foreverAccess.value.toLowerCase().includes(w)),
    `Access = "${foreverAccess?.value}"`,
  );
  check(
    "⚠️ THE DEFECT ITSELF: the two accounts no longer read the same",
    graceAccess?.value !== foreverAccess?.value,
    `"${graceAccess?.value}" vs "${foreverAccess?.value}"`,
  );

  /* ══ Q88 — Profile's pill must agree on STATE ══════════════════ */
  for (const [who, page, expected] of [
    ["grace", gracePage, "On us"],
    ["free for life", foreverPage, "Complimentary"],
  ]) {
    await page.goto("http://localhost:3100/profile", { waitUntil: "networkidle" });
    const pill = await page.evaluate(() => {
      const el = document.querySelector("span.rounded-full.border");
      return el ? el.textContent.trim() : null;
    });
    check(
      `Q88: the ${who} account's Profile pill reads the bare state`,
      pill === expected,
      `pill = "${pill}"`,
    );
    check(
      `Q88: and the pill carries NO date (the date belongs to Billing's row)`,
      pill !== null && !/\d/.test(pill),
      `pill = "${pill}"`,
    );
  }

  /* ══ the mid-grace subscriber: Pro, with Starts ════════════════ */
  const midUser = await seed("qa08-midgrace", {
    source: "comp",
    activeUntil: graceEnds,
    sub: {
      status: "trialing",
      trial_ends_at: graceEnds,
      current_period_end: iso(367 * DAY),
      cancel_at_period_end: false,
    },
  });
  const midCheck = await admin
    .from("subscriptions")
    .select("status")
    .eq("user_id", midUser.id);
  check(
    "ARRIVAL: the mid-grace account holds a dated comp AND a trialing mirror row",
    midCheck.data?.length === 1 && midCheck.data[0].status === "trialing",
    `${midCheck.data?.length ?? 0} mirror row(s)`,
  );

  const midPage = await open(midUser, 390, 844);
  await midPage.goto("http://localhost:3100/billing", { waitUntil: "networkidle" });
  const midRows = await planRows(midPage);
  const midText = await midPage.locator("body").innerText();
  console.log(`\n--- MID-GRACE SUBSCRIBER ---\n${midRows.map(([l, v]) => `  ${l}  ${v}`).join("\n")}\n---`);

  const midAccess = midRows.find(([l]) => l === "Access");
  const startsRow = midRows.find(([l]) => l === "Starts");
  check(
    "§3.6: a mid-grace subscriber is named by the PLAN, not by a trial",
    midAccess?.[1] === "Pro",
    `Access = "${midAccess?.[1]}"`,
  );
  check(
    "§3.6: and gets a `Starts {date}` row carrying the server-sourced date",
    Boolean(startsRow) && startsRow[1].includes(expectDay),
    startsRow ? `Starts = "${startsRow[1]}"` : "no Starts row",
  );
  if (midText.toLowerCase().includes("trial")) console.log("  WHERE:", midText.split("\n").filter((l) => /trial/i.test(l)).join(" | "));
  check(
    '⚠️ D36 absolute rule: "trial" appears nowhere for the mid-grace subscriber',
    !midText.toLowerCase().includes("trial"),
    midText.toLowerCase().includes("trial") ? "found it" : "absent",
  );
  check(
    "CONTROL: the Access row is NOT carrying a date as well, so the two renderings never both do",
    !/\d{1,2}\s\w{3,4}\s\d{4}/.test(midAccess?.[1] ?? ""),
    `Access = "${midAccess?.[1]}"`,
  );

  /* ══ Q88's LIVE defect: a courtesy customer, both screens ══════ */
  const courtesyUser = await seed("qa08-courtesy", {
    source: "stripe",
    activeUntil: iso(30 * DAY),
    sub: {
      status: "trialing",
      trial_ends_at: iso(30 * DAY),
      current_period_end: iso(30 * DAY),
      cancel_at_period_end: false,
      courtesy_until: iso(30 * DAY),
    },
  });
  const courtesyCheck = await admin
    .from("subscriptions")
    .select("status, courtesy_until")
    .eq("user_id", courtesyUser.id);
  check(
    "ARRIVAL: the courtesy account holds a trialing row WITH courtesy_until set",
    courtesyCheck.data?.[0]?.status === "trialing" &&
      courtesyCheck.data?.[0]?.courtesy_until !== null,
    `courtesy_until=${courtesyCheck.data?.[0]?.courtesy_until ?? "null"}`,
  );

  const cPage = await open(courtesyUser, 390, 844);
  await cPage.goto("http://localhost:3100/billing", { waitUntil: "networkidle" });
  const cAccess = await accessRow(cPage);
  const cRows = await planRows(cPage);
  const cText = await cPage.locator("body").innerText();
  console.log(`\n--- COURTESY MONTH (003 applied) ---\n${cRows.map(([l, v]) => `  ${l}  ${v}`).join("\n")}\n---`);
  /**
   * ⚠️ THE SAME DEFECT, ONE COHORT ACROSS. The "Trial ends" row read Stripe's
   * status directly, and a courtesy period IS `trialing` at Stripe — that is the
   * entire mechanism the save offer uses. So a customer of two years on a free
   * month got the forbidden word beside an Access row that had been written
   * specifically to avoid it. Asserted here rather than assumed from the
   * mid-grace fix, because they arrive at it by different branches.
   */
  if (cText.toLowerCase().includes("trial")) console.log("  WHERE:", cText.split("\n").filter((l) => /trial/i.test(l)).join(" | "));
  check(
    '⚠️ D36 absolute rule: "trial" appears nowhere for a COURTESY customer',
    !cText.toLowerCase().includes("trial"),
    cText.toLowerCase().includes("trial") ? "found it" : "absent",
  );
  /**
   * F2's signed row. Withholding "Trial ends" from this cohort left them with a
   * price row and no date at all, on a card whose whole job is "what am I on and
   * when does the next thing happen".
   */
  const freeUntil = cRows.find(([l]) => l === "Free until");
  check(
    'F2: a courtesy customer gets the signed "Free until {date}" row',
    Boolean(freeUntil) && /\d{1,2}\s\w{3,4}\s\d{4}/.test(freeUntil[1]),
    freeUntil ? `Free until = "${freeUntil[1]}"` : "no date row at all",
  );
  check(
    "F2 CONTROL: and it is NOT labelled as renewing, which the signed sentence rules out",
    !cRows.some(([l]) => /Renews/.test(l)),
    cRows.map(([l]) => l).join(", "),
  );
  check(
    "F2: the date is courtesy_until from its source, not the trial end beside it",
    freeUntil &&
      freeUntil[1] ===
        new Intl.DateTimeFormat("en-AU", {
          timeZone: "Australia/Sydney",
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(new Date(Date.parse(courtesyCheck.data[0].courtesy_until))),
    `row "${freeUntil?.[1]}" vs courtesy_until ${courtesyCheck.data?.[0]?.courtesy_until}`,
  );
  await cPage.goto("http://localhost:3100/profile", { waitUntil: "networkidle" });
  const cPill = await cPage.evaluate(() => {
    const el = document.querySelector("span.rounded-full.border");
    return el ? el.textContent.trim() : null;
  });
  check(
    "Q88 DEFECT FIXED: a courtesy customer reads the same STATE on both screens",
    cAccess?.value === cPill,
    `Billing "${cAccess?.value}" vs Profile "${cPill}"`,
  );
  check(
    'CONTROL: and that state is "Pro", never the first-timer label',
    cAccess?.value === "Pro" && cPill === "Pro",
    `Billing "${cAccess?.value}" / Profile "${cPill}"`,
  );

  /* ══ ⚠️ THE CONTROL FOR THE WITHHOLD: A GENUINE TRIALIST ═══════ */
  /**
   * Without this the three assertions above are one-sided and a fix that simply
   * DELETED the "Trial ends" row would pass every one of them. A first-timer's
   * seven days is the cohort the word belongs to, and they must still get it.
   */
  const trialUser = await seed("qa08-trial", {
    source: "stripe",
    activeUntil: iso(7 * DAY),
    sub: {
      status: "trialing",
      trial_ends_at: iso(7 * DAY),
      current_period_end: iso(7 * DAY),
      cancel_at_period_end: false,
      courtesy_until: null,
    },
  });
  const tPage = await open(trialUser, 390, 844);
  await tPage.goto("http://localhost:3100/billing", { waitUntil: "networkidle" });
  const tRows = await planRows(tPage);
  console.log(`\n--- GENUINE FIRST TRIAL ---\n${tRows.map(([l, v]) => `  ${l}  ${v}`).join("\n")}\n---`);
  const tAccess = tRows.find(([l]) => l === "Access");
  const tTrialRow = tRows.find(([l]) => l === "Trial ends");
  check(
    "CONTROL: a genuine trialist is STILL called a trialist",
    tAccess?.[1] === "Free trial",
    `Access = "${tAccess?.[1]}"`,
  );
  check(
    "CONTROL: and STILL gets the 'Trial ends' row, so the withhold is targeted and not a deletion",
    Boolean(tTrialRow) && /\d{1,2}\s\w{3,4}\s\d{4}/.test(tTrialRow[1]),
    tTrialRow ? `Trial ends = "${tTrialRow[1]}"` : "the row is gone — THE FIX DELETED THE FEATURE",
  );

  /* ══ THE 320x568 GATE, on both renderings ══════════════════════ */
  for (const [who, user, expectDate] of [
    ["grace (a date inside the row)", graceUser, true],
    ["free for life (one word)", foreverUser, false],
  ]) {
    const small = await open(user, 320, 568);
    await small.goto("http://localhost:3100/billing", { waitUntil: "networkidle" });
    const row = await accessRow(small);
    const overflowsCard =
      row.valueBox.right > row.cardBox.right + 0.5 || row.valueBox.left < row.cardBox.left - 0.5;
    const wrapped = row.valueBox.height > row.lineHeight + 1;
    const truncated = row.scrollWidth > row.clientWidth + 0.5;
    check(
      `320x568: ${who} does not overflow the card`,
      !overflowsCard,
      `value right ${row.valueBox.right.toFixed(1)} vs card right ${row.cardBox.right.toFixed(1)}`,
    );
    check(
      `320x568: ${who} does not wrap to a second line`,
      !wrapped,
      `height ${row.valueBox.height.toFixed(1)} vs line-height ${row.lineHeight.toFixed(1)}`,
    );
    check(
      `320x568: ${who} is not truncated`,
      !truncated,
      `scrollWidth ${row.scrollWidth} vs clientWidth ${row.clientWidth}`,
    );
    check(
      `320x568 CONTROL: ${who} still renders its full value`,
      expectDate ? row.value.includes(expectDate ? expectDay : "") : row.value === "Complimentary",
      `value = "${row.value}"`,
    );
    // ⚠️ The page must not scroll sideways either; a row that fits while the
    // page overflows has moved the problem rather than solved it.
    const bodyOverflows = await small.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 0.5,
    );
    check(`320x568: ${who} — the page does not scroll horizontally`, !bodyOverflows);
  }
} finally {
  await browser.close();
  // Billing rows first, then the user, and BY ID throughout.
  for (const id of created) {
    await admin.from("subscriptions").delete().eq("user_id", id);
    await admin.from("entitlements").delete().eq("user_id", id);
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
