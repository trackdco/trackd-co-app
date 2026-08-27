/**
 * SPEC 08 — THE FOUR CRITICAL PROPERTIES, RE-DRIVEN AFTER RESTRUCTURING page.tsx.
 *
 * Five commits put these into `app/(app)/billing/page.tsx` and every one of them
 * was found by DRIVING rather than by a test. Step 2 restructured that file, so
 * each is re-established from the user path rather than from a grep.
 *
 *   P1  row selection: the screen describes the subscription that will STILL CHARGE
 *   P2  the date comes from a read that INCLUDES dead entitlements
 *   P4  tier 3 (paused/unpaid/incomplete) reaches manageActionFor -> D83's line
 *   P5  endsImmediately is resolved on the SERVER from the row's status (D80)
 *
 * P3 (no status literal in the file) is a STATIC property and grep is its correct
 * confirmation. P6 (the tolerant courtesy read) is confirmed by the courtesy
 * cohort in `qa-08-step2-grace.mjs`, which reads "Pro" on both Billing and
 * Profile — a value only reachable through the moved module, from both callers.
 *
 *   npx next dev -p 3100 -H 127.0.0.1     # NO flags
 *   node scratchpad/qa-08-properties.mjs
 *
 * ⚠️ EVERY PROPERTY HAS A CONTROL that fails if the property is over-applied.
 * P1's control is that a single cancelled subscription STILL shows the resume
 * card; without it, "always prefer the uncancelled row" passes P1 and breaks the
 * feature. P2's control is that a HEALTHY entitlement does not shorten the date.
 *
 * Safety: @trackd-qa.invalid, timestamped, rows deleted then users dropped BY ID
 * in a `finally`. No Stripe objects are created.
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

let seq = 0;
const created = [];
const browser = await chromium.launch();

async function seed(tag, { entitlements = [], subs = [] }) {
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
      stripe_subscription_id: `qa08p_${Date.now()}_${(seq += 1)}`,
      stripe_price_id: PRICE_ID,
      ...s,
    });
    if (error) throw new Error(`subscription seed failed: ${error.message}`);
  }
  return user;
}

async function billingFor(user) {
  const session = await signIn(user);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies(
    [...session.jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })),
  );
  const page = await context.newPage();
  await page.goto("http://localhost:3100/billing", { waitUntil: "networkidle" });
  return page;
}

try {
  /* ══ P1 — the row the screen is ABOUT is the one that will still charge ══ */
  /**
   * The display half of the $69.99 defect. A cancelled trial ending next week
   * sorts ahead of an active yearly running to 2027, so ordering alone described
   * the trial, rendered the RESUME card from its `cancel_at_period_end: true`,
   * and left the yearly with no exit from inside the app at all.
   */
  const p1 = await seed("qa08p-two", {
    entitlements: [{ source: "stripe", active_until: iso(365 * DAY), is_active: true }],
    subs: [
      {
        status: "trialing",
        trial_ends_at: iso(5 * DAY),
        current_period_end: iso(5 * DAY),
        cancel_at_period_end: true,
      },
      {
        status: "active",
        current_period_end: iso(365 * DAY),
        cancel_at_period_end: false,
      },
    ],
  });
  const p1rows = await admin.from("subscriptions").select("status").eq("user_id", p1.id);
  check(
    "ARRIVAL (P1): the account really holds TWO live rows",
    p1rows.data?.length === 2,
    `${p1rows.data?.length ?? 0} row(s)`,
  );

  const p1page = await billingFor(p1);
  const p1text = await p1page.locator("body").innerText();
  console.log(`\n--- P1: cancelled trial (5d) + active yearly (365d) ---\n${p1text}\n---`);
  check(
    "P1: the screen offers the EXIT for the subscription still billing",
    /Cancel my/.test(p1text),
    /Cancel my/.test(p1text) ? "cancel control present" : "NO CANCEL CONTROL — the $69.99 defect",
  );
  check(
    "P1: and does NOT describe the cancelled trial as the whole story",
    !/Keep my Pro plan/.test(p1text),
    /Keep my Pro plan/.test(p1text) ? "resume card rendered — wrong row chosen" : "no resume card",
  );
  check(
    "P1: the date shown is the YEARLY's, not the trial's",
    p1text.includes(day(iso(365 * DAY))) && !p1text.includes(day(iso(5 * DAY))),
    `expected ${day(iso(365 * DAY))}, not ${day(iso(5 * DAY))}`,
  );

  /* ── ⚠️ P1's CONTROL: one cancelled subscription STILL resumes ── */
  const p1c = await seed("qa08p-onecancelled", {
    entitlements: [{ source: "stripe", active_until: iso(30 * DAY), is_active: true }],
    subs: [
      {
        status: "active",
        current_period_end: iso(30 * DAY),
        cancel_at_period_end: true,
      },
    ],
  });
  const p1ctext = await (await billingFor(p1c)).locator("body").innerText();
  check(
    "⚠️ P1 CONTROL: a lone cancelled subscription STILL renders the resume card",
    /Keep my Pro plan/.test(p1ctext),
    /Keep my Pro plan/.test(p1ctext)
      ? "resume card present"
      : "NO RESUME CARD — tier 2 was lost, the fix broke the feature",
  );

  /* ══ P2 — the date comes from a read that INCLUDES dead entitlements ══ */
  /**
   * `currentEntitlement` filters to rows active NOW, so a clawed-back row
   * answered null and `soonerOf` fell back to the mirror — the guard stopped
   * applying at exactly the moment the two dates diverge most. Measured at 365
   * days of over-promised access.
   */
  const clawedBack = iso(-3 * DAY);
  const p2 = await seed("qa08p-clawback", {
    entitlements: [{ source: "stripe", active_until: clawedBack, is_active: true }],
    subs: [
      {
        status: "active",
        current_period_end: iso(365 * DAY),
        cancel_at_period_end: false,
      },
    ],
  });
  const p2ent = await admin
    .from("entitlements")
    .select("active_until")
    .eq("user_id", p2.id);
  check(
    "ARRIVAL (P2): the entitlement really is clawed back into the past",
    Date.parse(p2ent.data?.[0]?.active_until) < Date.now(),
    `active_until=${p2ent.data?.[0]?.active_until}`,
  );

  const p2text = await (await billingFor(p2)).locator("body").innerText();
  console.log(`\n--- P2: entitlement -3d, mirror +365d ---\n${p2text}\n---`);
  check(
    "P2: the screen states the ENTITLEMENT's date, not the mirror's",
    p2text.includes(day(clawedBack)) && !p2text.includes(day(iso(365 * DAY))),
    `expected ${day(clawedBack)}; mirror would say ${day(iso(365 * DAY))}`,
  );

  /* ── ⚠️ P2's CONTROL: a HEALTHY entitlement must not shorten anything ── */
  const p2c = await seed("qa08p-healthy", {
    entitlements: [{ source: "stripe", active_until: iso(365 * DAY), is_active: true }],
    subs: [
      {
        status: "active",
        current_period_end: iso(365 * DAY),
        cancel_at_period_end: false,
      },
    ],
  });
  const p2ctext = await (await billingFor(p2c)).locator("body").innerText();
  check(
    "⚠️ P2 CONTROL: a healthy account still reads its FULL date",
    p2ctext.includes(day(iso(365 * DAY))),
    `expected ${day(iso(365 * DAY))}`,
  );
  check(
    "⚠️ P2 CONTROL: and it says Renews, because something genuinely does",
    /Renews on/.test(p2ctext),
    /Renews on/.test(p2ctext) ? "Renews on" : "not labelled as renewing",
  );

  /* ══ P4 — tier 3 reaches manageActionFor, so D83's line renders ══ */
  const p4 = await seed("qa08p-paused", {
    entitlements: [{ source: "comp", active_until: null, is_active: true }],
    subs: [
      {
        status: "paused",
        current_period_end: iso(30 * DAY),
        cancel_at_period_end: false,
      },
    ],
  });
  const p4check = await admin.from("subscriptions").select("status").eq("user_id", p4.id);
  check(
    "ARRIVAL (P4): the account really holds a `paused` row",
    p4check.data?.[0]?.status === "paused",
    `status=${p4check.data?.[0]?.status}`,
  );

  const p4page = await billingFor(p4);
  const p4text = await p4page.locator("body").innerText();
  console.log(`\n--- P4/P5: comp + paused subscription ---\n${p4text}\n---`);
  /**
   * ⚠️ D80 CHANGED WHAT THIS COHORT GETS. `paused` used to fall through to
   * `unavailable` and the support line; it is now stoppable immediately, so the
   * property being defended is that the row REACHES `manageActionFor` at all —
   * it was filtered out of the query entirely, which produced a screen with no
   * control AND no signpost. Either outcome proves reachability; silence does not.
   */
  const reached = /Cancel my/.test(p4text) || /can&#x27;t be changed from here|can't be changed from here/.test(p4text);
  check(
    "P4: a `paused` row REACHES manageActionFor (a control or the support line, never silence)",
    reached,
    reached
      ? /Cancel my/.test(p4text)
        ? "D80 control rendered"
        : "D83 support line rendered"
      : "SILENCE — the row was filtered out again",
  );

  /* ══ P5 — endsImmediately, resolved on the server from the row's status ══ */
  /* ── F3: a paused subscription does not renew, so the date is an end ── */
  check(
    "F3: a `paused` subscription is NOT described as renewing",
    !/Renews on/.test(p4text),
    /Renews on/.test(p4text)
      ? "still says Renews on — it is charging nobody and D80 ends it immediately"
      : "correctly not labelled a renewal",
  );
  check(
    'F3: it uses the existing signed "Ends on" vocabulary instead',
    /Ends on/.test(p4text),
    /Ends on/.test(p4text) ? "Ends on" : "no date label at all",
  );

  /* ── F1: the noun on a cohort that is `trialing` but not on a trial ── */
  const p1n = await seed("qa08p-noun", {
    entitlements: [{ source: "comp", active_until: iso(2 * DAY), is_active: true }],
    subs: [
      {
        status: "trialing",
        trial_ends_at: iso(2 * DAY),
        current_period_end: iso(367 * DAY),
        cancel_at_period_end: false,
      },
    ],
  });
  const p1ntext = await (await billingFor(p1n)).locator("body").innerText();
  check(
    "F1: a mid-grace subscriber's cancel control does NOT call it a trial",
    /Cancel my subscription/.test(p1ntext) && !/Cancel my trial/.test(p1ntext),
    p1ntext.split("\n").filter((l) => /Cancel my/.test(l)).join(" | "),
  );
  check(
    "⚠️ F1 CONTROL: a GENUINE trialist's control still says trial",
    await (async () => {
      const t = await seed("qa08p-realtrial", {
        entitlements: [{ source: "stripe", active_until: iso(7 * DAY), is_active: true }],
        subs: [
          {
            status: "trialing",
            trial_ends_at: iso(7 * DAY),
            current_period_end: iso(7 * DAY),
            cancel_at_period_end: false,
          },
        ],
      });
      const txt = await (await billingFor(t)).locator("body").innerText();
      return /Cancel my trial/.test(txt);
    })(),
    "without this, renaming the noun for everyone passes the assertion above",
  );

  const cancelBtn = p4page.locator("button", { hasText: /^Cancel my / });
  check(
    "ARRIVAL (P5): the cancel control is on the paused account's screen",
    (await cancelBtn.count()) > 0,
    `${await cancelBtn.count()} control(s)`,
  );
  if ((await cancelBtn.count()) > 0) {
    await cancelBtn.first().click();
    await p4page.waitForTimeout(700);
    const dialog = p4page.locator('[role="dialog"]').first();
    const dtext = (await dialog.count()) > 0 ? await dialog.innerText() : "";
    console.log(`\n--- P5: the dialog for a PAUSED subscription ---\n${dtext}\n---`);
    check(
      "P5: the dialog says the cancellation takes effect straight away (D80)",
      /straight away/.test(dtext),
      /straight away/.test(dtext) ? "stated" : "NOT STATED — the client would be guessing",
    );
  }

  /* ── ⚠️ P5's CONTROL: an ACTIVE subscription must NOT say it ── */
  /**
   * ⚠️ THIS CONTROL ASSERTED AN ABSENCE AGAINST AN EMPTY STRING (5.2).
   *
   * `d2text` was `""` when the dialog was absent, and `!/straight away/.test("")`
   * is TRUE — so it passed whether the dialog opened or not. And the whole block
   * sat inside an unguarded `if (count > 0)`, so a RENAMED BUTTON made the check
   * vanish from the results with no trace at all: not a failure, not a skip, just
   * one fewer line in a total nobody counts.
   *
   * Its positive twin twenty lines up already had the right shape — an arrival
   * check OUTSIDE the guard, so a missing control fails rather than disappears.
   * **That asymmetry was the finding**, and this is now symmetric with it.
   *
   * ⚠️ THE PROPERTY IT IS ABOUT: D80's "straight away" is true for a PAUSED or
   * UNPAID subscription and false for an ACTIVE one, so the sentence must be
   * selected per-subscription rather than switched on for everybody. Asserting
   * that requires the active account's dialog to have actually OPENED — an
   * unopened dialog says nothing about which sentence it would have carried.
   */
  const p5cpage = await billingFor(p2c);
  const p5cbtn = p5cpage.locator("button", { hasText: /^Cancel my / });
  const p5cCount = await p5cbtn.count();
  check(
    "ARRIVAL (P5 CONTROL): the cancel control is on the ACTIVE account's screen",
    p5cCount > 0,
    p5cCount > 0 ? `${p5cCount} control(s)` : "absent — the control below would prove nothing",
  );
  if (p5cCount > 0) {
    await p5cbtn.first().click();
    await p5cpage.waitForTimeout(700);
    const d2 = p5cpage.locator('[role="dialog"]').first();
    const d2Count = await d2.count();
    const d2text = d2Count > 0 ? await d2.innerText() : "";
    check(
      "ARRIVAL (P5 CONTROL): the dialog OPENED, so its wording is readable",
      d2Count > 0,
      d2Count > 0 ? `${d2text.length} chars` : "no dialog — an absence asserted here is vacuous",
    );
    check(
      "⚠️ P5 CONTROL: an ACTIVE subscription does NOT claim to end straight away",
      d2Count > 0 && !/straight away/.test(d2text),
      d2Count === 0
        ? "NOT MEASURED — the dialog never opened"
        : /straight away/.test(d2text)
          ? "it does — the flag is on for everybody, which is a false promise"
          : "correctly absent, and the dialog was genuinely read",
    );
  }
} finally {
  await browser.close();
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
