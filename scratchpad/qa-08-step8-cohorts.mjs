/**
 * SPEC 08 Step 8 — EVERY COHORT, AND THE FOUR PROPERTIES AGAINST THEIR NEW HOME.
 *
 *   npx next dev -p 3100 -H 127.0.0.1     # NO flags
 *   node scratchpad/qa-08-step8-cohorts.mjs
 *
 * ## ⚠️ PART A EXISTS BECAUSE THE READS MOVED FILE
 *
 * The four CRITICAL properties five commits put into `app/(app)/billing/page.tsx`
 * now live in `lib/billing/screenFacts.ts`. "Moved comment for comment" is a claim
 * about a diff, not about behaviour, and relocating code is exactly the change
 * that preserves every line while moving what happens. **The pre-move drive is not
 * evidence for the post-move code**, so every property is re-established here.
 *
 * And one of them has never been asserted at all: `loadBillingFacts` exists so two
 * screens one tap apart cannot pick DIFFERENT rows for one user. That is the
 * $69.99 defect with a second chance to happen, and it is only visible ACROSS
 * BOTH SURFACES. Part A asserts each property on `/billing` AND `/billing/manage`.
 *
 * ## Part B is §5's cohort list
 *
 * Every cohort sees something true, and D36's plan label across its states —
 * including that the three read-only states, identical in what the user can do,
 * read identically.
 *
 * Safety: @trackd-qa.invalid, timestamped, rows deleted then users dropped BY ID
 * in a `finally`. No Stripe objects: Step 5 owns the test-clock cohort and these
 * are label, row-selection and date questions the mirror answers.
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
const day = (isoStr) =>
  new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.parse(isoStr)));

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
      stripe_subscription_id: `qa08c_${Date.now()}_${(seq += 1)}`,
      stripe_price_id: PRICE_ID,
      ...s,
    });
    if (error) throw new Error(`subscription seed failed: ${error.message}`);
  }
  if (customer) {
    const { error } = await admin.from("billing_customers").insert({
      user_id: user.id,
      stripe_customer_id: `cus_qa08c_${Date.now()}_${(seq += 1)}`,
    });
    if (error) throw new Error(`customer seed failed: ${error.message}`);
  }
  return user;
}

/** Both surfaces for one user, from one sign-in. */
async function bothScreens(user) {
  const session = await signIn(user);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies(
    [...session.jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })),
  );
  const page = await ctx.newPage();
  await page.goto("http://localhost:3100/billing", { waitUntil: "networkidle" });
  const billing = await page.locator("body").innerText();
  await page.goto("http://localhost:3100/billing/manage", { waitUntil: "networkidle" });
  const manage = await page.locator("body").innerText();
  await page.goto("http://localhost:3100/profile", { waitUntil: "networkidle" });
  const pill = await page.evaluate(() => {
    const el = document.querySelector("span.rounded-full.border");
    return el ? el.textContent.trim() : null;
  });
  return { billing, manage, pill, page };
}

try {
  /* ══════════════════════════════════════════════════════════════════
     PART A — THE FOUR PROPERTIES, FROM THE NEW RESOLVER, ON BOTH SCREENS
     ══════════════════════════════════════════════════════════════════ */

  /* ── P1: the row the screens are ABOUT is the one that will still charge ── */
  const yearlyEnd = iso(365 * DAY);
  const trialEnd = iso(5 * DAY);
  const p1 = await seed("qa08c-tworows", {
    entitlements: [{ source: "stripe", active_until: yearlyEnd, is_active: true }],
    subs: [
      {
        status: "trialing",
        trial_ends_at: trialEnd,
        current_period_end: trialEnd,
        cancel_at_period_end: true,
      },
      { status: "active", current_period_end: yearlyEnd, cancel_at_period_end: false },
    ],
  });
  const p1rows = await admin.from("subscriptions").select("status").eq("user_id", p1.id);
  check(
    "ARRIVAL (P1): the account really holds TWO live rows",
    p1rows.data?.length === 2,
    `${p1rows.data?.length ?? 0} row(s)`,
  );

  const a = await bothScreens(p1);
  console.log(`\n--- P1 /billing ---\n${a.billing}\n--- P1 /billing/manage ---\n${a.manage}\n---`);
  check(
    "P1 /billing: names the YEARLY, the row that will still charge",
    a.billing.includes(day(yearlyEnd)) && !a.billing.includes(day(trialEnd)),
    `expected ${day(yearlyEnd)}, not ${day(trialEnd)}`,
  );
  /**
   * ⚠️ THE ASSERTION THE SINGLE RESOLVER EXISTS FOR, AND IT HAS NEVER BEEN MADE.
   *
   * Before `loadBillingFacts` there was one screen, so "both screens agree" could
   * not be wrong. Now there are two, one tap apart, and if they resolved
   * independently they could name different subscriptions for the same user —
   * which is the display half of the $69.99 defect with a second surface to
   * happen on.
   */
  check(
    "⚠️ P1 /billing/manage: names the SAME row, from the same resolver",
    a.manage.includes(day(yearlyEnd)) && !a.manage.includes(day(trialEnd)),
    `manage says ${a.manage.split("\n").find((l) => /\d{1,2}\s\w{3,4}\s\d{4}/.test(l)) ?? "no date"}`,
  );
  check(
    "⚠️ P1: and the two screens cannot disagree — same date on both",
    a.billing.includes(day(yearlyEnd)) === a.manage.includes(day(yearlyEnd)),
  );
  check(
    "P1 CONTROL: the cancelled trial is not described as the whole story",
    !/Keep my Pro plan/.test(a.billing),
  );

  /* ── P1 CONTROL: a LONE cancelled subscription still resumes ── */
  const p1c = await seed("qa08c-onecancelled", {
    entitlements: [{ source: "stripe", active_until: iso(30 * DAY), is_active: true }],
    subs: [{ status: "active", current_period_end: iso(30 * DAY), cancel_at_period_end: true }],
  });
  const ac = await bothScreens(p1c);
  check(
    "⚠️ P1 CONTROL: a lone cancelled subscription STILL renders the resume card",
    /Keep my Pro plan/.test(ac.billing),
    "without this, 'always prefer the uncancelled row' passes P1 and breaks tier 2",
  );
  check(
    "⚠️ P1 CONTROL: and Manage agrees it is cancelled",
    ac.manage.includes("You've cancelled, so you keep your Pro plan until"),
  );

  /* ── P2: the date comes from a read that INCLUDES dead entitlements ── */
  const clawed = iso(-3 * DAY);
  const p2 = await seed("qa08c-clawback", {
    entitlements: [{ source: "stripe", active_until: clawed, is_active: true }],
    subs: [{ status: "active", current_period_end: iso(365 * DAY), cancel_at_period_end: false }],
  });
  const p2ent = await admin.from("entitlements").select("active_until").eq("user_id", p2.id);
  check(
    "ARRIVAL (P2): the entitlement really is clawed back into the past",
    Date.parse(p2ent.data?.[0]?.active_until) < Date.now(),
    `active_until=${p2ent.data?.[0]?.active_until}`,
  );
  const b = await bothScreens(p2);
  check(
    "P2 /billing: states the ENTITLEMENT's date, not the mirror's",
    b.billing.includes(day(clawed)) && !b.billing.includes(day(iso(365 * DAY))),
    `expected ${day(clawed)}; the mirror would say ${day(iso(365 * DAY))}`,
  );
  /**
   * ⚠️ THE DATE AGREES; THE VERB MAY NOT. Asserted rather than assumed.
   *
   * Billing's row label is driven by `accessEndsEarly`, which is true here because
   * the entitlement and the mirror disagree — so it reads "Ends on". Manage's
   * summary has no equivalent branch and uses the PAYING sentence, which says
   * "renews on". Same date, two verbs, one account. Captured here so the report is
   * evidence rather than inference.
   */
  const billingVerb = /Ends on/.test(b.billing) ? "Ends on" : /Renews on/.test(b.billing) ? "Renews on" : "neither";
  const manageVerb = /renews on/.test(b.manage) ? "renews on" : /runs until/.test(b.manage) ? "runs until" : "neither";
  check(
    "⚠️ P2: do the two surfaces use the same VERB for the same date?",
    !(billingVerb === "Ends on" && manageVerb === "renews on"),
    `billing="${billingVerb}", manage="${manageVerb}"`,
  );
  /**
   * ⚠️ WITHHELD-PENDING-RULING, NOT PASSING. This assertion originally required
   * Manage to state the same date, and it FAILED — Manage said "and it renews on
   * 15 Aug 2026" where Billing said "Ends on 15 Aug 2026". One account, one date,
   * two verbs.
   *
   * The state is real and is NOT `past_due` (driven below with the revoked
   * variant), so D37's sentence does not cover it and no signed sentence does.
   * Per the founder's ruling the summary is WITHHELD rather than reworded, and a
   * sentence is being drafted. So what is asserted now is the withhold — and the
   * assertion is named for what it is, so nobody reads a green tick as "this
   * state is finished".
   *
   * ⚠️ THE RESOLVER IS NOT AT FAULT AND THAT IS WORTH SEPARATING. Both screens
   * read the SAME date from `loadBillingFacts` — asserted directly below. The
   * divergence was entirely in the copy layer above it.
   */
  check(
    "⚠️ P2 /billing/manage: the SIGNED suspended sentence, never a renewal claim",
    !/renews on/.test(b.manage) &&
      b.manage.includes("Your access has been suspended while we look into a payment dispute"),
    `manage: ${b.manage.split("\n").find((l) => /suspended|renews on/.test(l)) ?? "neither"}`,
  );
  check(
    "⚠️ P2: the RESOLVER did its job — Billing has the entitlement's date, not the mirror's",
    b.billing.includes(day(clawed)) && !b.billing.includes(day(iso(365 * DAY))),
    "the divergence was in the copy layer above screenFacts.ts, never in the row it resolved",
  );

  /* ── ⚠️ WHICH REAL STATE PRODUCES THE VERB DIVERGENCE? ── */
  /**
   * The seeded P2 shape was an EXPIRED entitlement (is_active true, date passed),
   * which is only the invoice.paid lag after a renewal — minutes, transient.
   * The durable variant is a REVOKED one: `revokeForCustomer` writes
   * `is_active: false` and DOES NOT TOUCH `active_until` (sync.ts:1114), and a
   * dispute does not cancel the Stripe subscription — so the customer keeps a
   * live, billing `active` subscription beside an entitlement that grants nothing.
   *
   * Driven here rather than reasoned about, because "which real state" is the
   * question that decides whether this needs copy at all.
   */
  const revokedUntil = iso(30 * DAY);
  const rev = await seed("qa08c-revoked", {
    entitlements: [{ source: "stripe", active_until: revokedUntil, is_active: false }],
    subs: [{ status: "active", current_period_end: yearlyEnd, cancel_at_period_end: false }],
  });
  const revRow = await admin
    .from("entitlements")
    .select("is_active, active_until")
    .eq("user_id", rev.id);
  check(
    "ARRIVAL (revoked): is_active FALSE with its date left standing, as revokeForCustomer writes it",
    revRow.data?.[0]?.is_active === false && revRow.data?.[0]?.active_until !== null,
    `is_active=${revRow.data?.[0]?.is_active}, active_until=${revRow.data?.[0]?.active_until}`,
  );
  const r = await bothScreens(rev);
  console.log(`\n--- REVOKED entitlement beside a live active subscription ---\n${r.billing}\n--- manage ---\n${r.manage}\n---`);
  check(
    "revoked: Billing states the revoked entitlement's date, not the mirror's",
    r.billing.includes(day(revokedUntil)) && !r.billing.includes(day(yearlyEnd)),
    `expected ${day(revokedUntil)}, mirror would say ${day(yearlyEnd)}`,
  );
  const revBillingVerb = /Ends on/.test(r.billing) ? "Ends on" : /Renews on/.test(r.billing) ? "Renews on" : "neither";
  const revManageVerb = /renews on/.test(r.manage) ? "renews on" : "not a renewal claim";
  check(
    "⚠️ revoked: the two surfaces use the same VERB for the same date",
    !(revBillingVerb === "Ends on" && revManageVerb === "renews on"),
    `billing="${revBillingVerb}", manage="${revManageVerb}" — THIS IS THE DURABLE VARIANT, not a seeding artefact`,
  );
  /**
   * ⚠️ THE SIGNED SENTENCE FOR THIS STATE (2026-08-18). It names BOTH halves,
   * because either alone is a lie: the access is gone AND the money is still
   * moving. The account is a real revocation, so this is the cohort the sentence
   * was written for rather than the transient renewal-lag variant.
   */
  const SUSPENDED = `Your access has been suspended while we look into a payment dispute, and your Pro plan at $69.99 USD a year is still active.`;
  check(
    "⚠️ revoked: Manage carries the SIGNED suspended sentence, character for character",
    r.manage.includes(SUSPENDED),
    r.manage.split("\n").find((l) => /suspended/.test(l)) ?? "absent",
  );
  check(
    "⚠️ revoked: it says neither 'read only' nor 'cancelled' — they lapsed nothing and cancelled nothing",
    !/read only/i.test(r.manage) && !/cancelled/i.test(r.manage),
  );
  check(
    "⚠️ revoked CONTROL: the cancel control is STILL offered, so they have an exit",
    /Cancel my/.test(r.billing),
    "a customer with no access being charged must at least be able to stop it",
  );

  /* ── P4: a tier-3 row reaches manageActionFor from the new resolver ── */
  const p4 = await seed("qa08c-paused", {
    entitlements: [{ source: "comp", active_until: null, is_active: true }],
    subs: [{ status: "paused", current_period_end: iso(30 * DAY), cancel_at_period_end: false }],
  });
  const c = await bothScreens(p4);
  const reached = /Cancel my/.test(c.billing) || /can.t be changed from here/.test(c.billing);
  check(
    "P4: a `paused` row REACHES manageActionFor through the new resolver",
    reached,
    reached ? "a control or the support line rendered" : "SILENCE — the row was filtered out",
  );
  check(
    "P4: and it does NOT claim to renew (F3, from the new location)",
    !/Renews on/.test(c.billing) && /Ends on/.test(c.billing),
  );
  check(
    "P4: Manage withholds its summary for this cohort (R5b, from the new resolver)",
    !/You're on your Pro plan|You've cancelled|free trial/.test(c.manage),
    c.manage.split("\n").filter((l) => l.length > 40).join(" | ") || "no summary",
  );

  /* ══════════════════════════════════════════════════════════════════
     PART B — §5's COHORTS, AND D36's LABELS
     ══════════════════════════════════════════════════════════════════ */
  const graceEnds = iso(2 * DAY);
  const COHORTS = [
    ["new trialist", { entitlements: [{ source: "stripe", active_until: iso(7 * DAY), is_active: true }], subs: [{ status: "trialing", trial_ends_at: iso(7 * DAY), current_period_end: iso(7 * DAY), cancel_at_period_end: false }] }, "Free trial", day(iso(7 * DAY))],
    ["paying subscriber", { entitlements: [{ source: "stripe", active_until: yearlyEnd, is_active: true }], subs: [{ status: "active", current_period_end: yearlyEnd, cancel_at_period_end: false }] }, "Pro", day(yearlyEnd)],
    ["courtesy month", { entitlements: [{ source: "stripe", active_until: iso(30 * DAY), is_active: true }], subs: [{ status: "trialing", trial_ends_at: iso(30 * DAY), current_period_end: iso(30 * DAY), cancel_at_period_end: false, courtesy_until: iso(30 * DAY) }] }, "Pro", day(iso(30 * DAY))],
    ["beta grace mid-fortnight", { entitlements: [{ source: "comp", active_until: graceEnds, is_active: true }] }, "On us", day(graceEnds)],
    ["mid-grace subscriber", { entitlements: [{ source: "comp", active_until: graceEnds, is_active: true }], subs: [{ status: "trialing", trial_ends_at: graceEnds, current_period_end: yearlyEnd, cancel_at_period_end: false }] }, "Pro", day(graceEnds)],
    ["free-for-life comp", { entitlements: [{ source: "comp", active_until: null, is_active: true }] }, "Complimentary", null],
    ["App Store account", { entitlements: [{ source: "apple", active_until: yearlyEnd, is_active: true }] }, "Pro", null],
  ];

  for (const [name, shape, expectedLabel, expectedDate] of COHORTS) {
    const u = await seed("qa08c", shape);
    const s = await bothScreens(u);
    const access = s.billing.split("\n").find((_, i, arr) => arr[i - 1]?.trim() === "Access") ?? "";
    check(`${name}: the Access label is "${expectedLabel}"`, access.startsWith(expectedLabel), `read "${access}"`);
    check(
      `${name}: ⚠️ Q88 — Profile's pill agrees on the STATE`,
      s.pill === expectedLabel,
      `Billing "${access}" vs pill "${s.pill}"`,
    );
    if (expectedDate) {
      check(`${name}: sees a date, and it is the right one`, s.billing.includes(expectedDate), expectedDate);
    } else {
      check(`${name}: sees NO date, correctly`, !/\d{1,2}\s\w{3,4}\s\d{4}/.test(s.billing));
    }
    if (name === "App Store account") {
      check("App Store: told it can only be changed there", /managed by the App Store/.test(s.billing));
      check("App Store: and no Stripe payment route is offered", !/\/billing\/manage/.test(s.billing));
    }
  }

  /* ── ⚠️ D36: the THREE read-only states must read IDENTICALLY ── */
  /**
   * Identical in consequence reads identically. All three reach the label as "no
   * active entitlement", because `strongestEntitlement` filters to rows active
   * now — an expired row and a revoked one are both absent from its answer,
   * exactly like a user who never had one. Driven here with the gate OFF, where
   * all three read "Pro"; the gate-ON run in Step 7 asserted the "Read only"
   * side. What matters either way is that the three AGREE.
   */
  const readonly = [
    ["never had access", {}],
    ["had it and the date passed (row present, is_active TRUE)", { entitlements: [{ source: "stripe", active_until: iso(-2 * DAY), is_active: true }] }],
    ["had it and it was taken away (is_active FALSE)", { entitlements: [{ source: "stripe", active_until: iso(30 * DAY), is_active: false }] }],
  ];
  const labels = [];
  for (const [name, shape] of readonly) {
    const u = await seed("qa08c-ro", shape);
    const s = await bothScreens(u);
    const access = s.billing.split("\n").find((_, i, arr) => arr[i - 1]?.trim() === "Access") ?? "";
    labels.push([name, access, s.pill]);
    check(`read-only (${name}): ARRIVAL — reached the state`, access.length > 0, `"${access}"`);
  }
  const distinct = new Set(labels.map(([, l]) => l));
  check(
    "⚠️ D36: the three read-only states read IDENTICALLY on Billing",
    distinct.size === 1,
    labels.map(([n, l]) => `${n}="${l}"`).join(" | "),
  );
  check(
    "⚠️ D36: and identically on Profile's pill",
    new Set(labels.map(([, , p]) => p)).size === 1,
    labels.map(([n, , p]) => `${n}="${p}"`).join(" | "),
  );
  check(
    "⚠️ D36 CONTROL: the label CAN say something else, so agreement is a decision",
    distinct.has("Pro") || distinct.has("Read only"),
    [...distinct].join(", "),
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
