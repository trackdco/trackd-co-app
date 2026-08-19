/**
 * SPEC 08 Step 7 — THE THREE STATES, AT 390x844 AND 320x568.
 *
 *   MODE=off  npx next dev -p 3100 -H 127.0.0.1              # normal, cancelled, past-due
 *   MODE=on   BILLING_GATE_ENABLED=true npx next dev -p 3100 -H 127.0.0.1   # lapsed
 *
 *   MODE=off node scratchpad/qa-08-step7-states.mjs
 *   MODE=on  node scratchpad/qa-08-step7-states.mjs
 *
 * §3.9's three states plus the fourth condition that cuts across them:
 *   Normal                    Access, Price, the next date, the cancel control.
 *   Cancelled but running     ONE CARD holding "Keep my Pro plan" AND 03's paragraph.
 *   Lapsed                    Access reads "Read only", the exact phrase.
 *   Past-due                  renders ABOVE the plan card, replacing none of them.
 *
 * ⚠️ THE LAPSED STATE NEEDS THE GATE, so it is a separate run with the flag on the
 * COMMAND LINE only. Never in `.env.local`, and the server is restarted without it
 * afterwards with absence proven FROM BEHAVIOUR.
 *
 * ⚠️ THE PAST-DUE-WITHOUT-STRIPE CASE IS DELIBERATE AND IS THE RULE 0 TEST.
 * A seeded `past_due` mirror row with NO Stripe customer means `declinedOnFor`
 * cannot answer, so the failure date is unknown. §3.5's first sentence must then
 * be WITHHELD — not reworded, not defaulted, not derived from the access date —
 * while the second sentence and both buttons still render. Step 5 drove the happy
 * path against real Stripe; this drives the half that cannot be reached with it.
 *
 * Safety: @trackd-qa.invalid, timestamped, rows deleted then users dropped BY ID
 * in a `finally`. No Stripe objects at all in this driver.
 */
import { chromium } from "playwright";

import { admin, makeUser, dropUser, signIn, env } from "./admin.mjs";

const MODE = process.env.MODE ?? "off";
if (!["on", "off"].includes(MODE)) throw new Error("MODE must be on|off");
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

const VIEWPORTS = [
  [390, 844, "390x844"],
  [320, 568, "320x568"],
];

let seq = 0;
const created = [];
const browser = await chromium.launch();

async function seed(tag, { entitlements = [], subs = [] } = {}) {
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
      stripe_subscription_id: `qa08st_${Date.now()}_${(seq += 1)}`,
      stripe_price_id: PRICE_ID,
      ...s,
    });
    if (error) throw new Error(`subscription seed failed: ${error.message}`);
  }
  return user;
}

async function billing(user, w, h) {
  const session = await signIn(user);
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addCookies(
    [...session.jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })),
  );
  const page = await ctx.newPage();
  await page.goto("http://localhost:3100/billing", { waitUntil: "networkidle" });
  return page;
}

/**
 * §5's layout floor, measured on the live page rather than eyeballed.
 *
 * ⚠️ IT SCROLLS TO THE BOTTOM FIRST, AND THE FIRST VERSION DID NOT.
 *
 * "Nothing sits under the fixed bottom nav" means UNREACHABLE — a control the
 * page cannot be scrolled far enough to clear. Measured at the top of a
 * scrollable page it instead reports everything BELOW THE FOLD, which is normal
 * and is not a fault. The first run flagged 2 controls at y=503 in a 568-tall
 * viewport on a page that scrolls perfectly well, so the assertion was wrong and
 * the screen was fine.
 *
 * The honest test is: scroll to the end, THEN ask whether anything is still
 * behind the nav. That is the state a user can actually get stuck in.
 */
async function layoutFaults(page, label) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(250);
  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    const horiz = doc.scrollWidth > doc.clientWidth + 0.5;
    // The fixed bottom nav, and the FAB above it.
    const nav = document.querySelector("nav");
    const navTop = nav ? nav.getBoundingClientRect().top : Infinity;
    // Every interactive thing in the page's own content column.
    const main = document.querySelector("main") ?? document.body;
    const controls = [...main.querySelectorAll("a,button")];
    let smallest = Infinity;
    let measured = 0;
    let underNav = 0;
    for (const c of controls) {
      const r = c.getBoundingClientRect();
      if (r.height === 0 && r.width === 0) continue;
      if (nav && nav.contains(c)) continue;
      measured += 1;
      smallest = Math.min(smallest, r.height);
      // "Sits under" means its MIDDLE is behind the nav; a control scrolled
      // partly past the fold is normal and is not a fault.
      if (r.top + r.height / 2 > navTop) underNav += 1;
    }
    return {
      horiz, smallest, underNav, measured, navFound: Boolean(nav),
      count: controls.length, navTop,
    };
  });
  check(`${label}: the page does not scroll horizontally`, !m.horiz);
    /**
     * ⚠️ A SENTINEL IS NOT A MEASUREMENT (5.1).
     *
     * `smallest` started at 999 and `navTop` at Infinity, so BOTH checks below
     * were true when there was nothing to measure: a page with no tap targets
     * "had every tap target at least 44px", and a page with no bottom nav had
     * "nothing sitting under the bottom nav". A renamed selector or a screen that
     * failed to render read as a pass.
     *
     * ⚠️ THE PROPERTY EACH CHECK IS ABOUT, so a future change is judged against
     * the property rather than the number:
     *   · the tap-target check is about EVERY MEASURED CONTROL being reachable by
     *     a thumb — so it must first have measured at least one control;
     *   · the nav-clearance check is about CONTENT NOT HIDING BEHIND THE NAV — so
     *     it is only askable where a nav exists, and says so when one does not.
     *
     * `measured` and `navFound` are returned rather than inferred, so the
     * assertion can require that something was seen before it claims anything.
     */
  check(
    `${label}: ARRIVAL — controls were found to measure`,
    m.measured > 0,
    `${m.measured} measurable control(s) of ${m.count} matched`,
  );
  check(
    `${label}: every tap target is at least 44px`,
    m.measured > 0 && m.smallest >= 44,
    m.measured > 0 ? `smallest ${m.smallest}px across ${m.measured} control(s)` : "NOTHING MEASURED",
  );
  check(
    `${label}: ARRIVAL — the bottom nav exists, so clearance is askable`,
    m.navFound,
    m.navFound ? `nav top y=${Math.round(m.navTop)}` : "NO NAV, so 'nothing sits under it' proves nothing",
  );
  check(
    `${label}: nothing sits under the fixed bottom nav`,
    m.navFound && m.underNav === 0,
    m.navFound
      ? `${m.underNav} control(s) behind nav at y=${Math.round(m.navTop)}`
      : "NOT MEASURED",
  );
  return m;
}

try {
  if (MODE === "off") {
    /* ══════════ 1. NORMAL ══════════ */
    const normal = await seed("qa08-normal", {
      entitlements: [{ source: "stripe", active_until: iso(365 * DAY), is_active: true }],
      subs: [
        { status: "active", current_period_end: iso(365 * DAY), cancel_at_period_end: false },
      ],
    });
    for (const [w, h, label] of VIEWPORTS) {
      const p = await billing(normal, w, h);
      const text = await p.locator("body").innerText();
      if (label === "390x844") console.log(`\n--- NORMAL ---\n${text}\n---`);
      check(`NORMAL ${label}: Access, Price and the next date all render`,
        /Access/.test(text) && /Price/.test(text) && text.includes(day(iso(365 * DAY))),
      );
      check(`NORMAL ${label}: it says Renews on, because something genuinely does`,
        /Renews on/.test(text), text.split("\n").filter((l) => /Renews|Ends on/.test(l)).join(" | "));
      check(`NORMAL ${label}: the cancel control is present and quiet`, /Cancel my subscription/.test(text));
      check(`NORMAL ${label}: no resume card, because nothing is cancelled`, !/Keep my Pro plan/.test(text));
      await layoutFaults(p, `NORMAL ${label}`);
    }

    /* ══════════ 2. CANCELLED BUT STILL RUNNING ══════════ */
    const cancelled = await seed("qa08-cancelled", {
      entitlements: [{ source: "stripe", active_until: iso(30 * DAY), is_active: true }],
      subs: [
        { status: "active", current_period_end: iso(30 * DAY), cancel_at_period_end: true },
      ],
    });
    for (const [w, h, label] of VIEWPORTS) {
      const p = await billing(cancelled, w, h);
      const text = await p.locator("body").innerText();
      if (label === "390x844") console.log(`\n--- CANCELLED BUT RUNNING ---\n${text}\n---`);
      check(`CANCELLED ${label}: D22's control reads "Keep my Pro plan"`, /Keep my Pro plan/.test(text));
      check(`CANCELLED ${label}: 03's explanatory paragraph is present`,
        text.includes("and nothing more will be charged. You can change your mind until then."));
      check(`CANCELLED ${label}: the date says Ends on, never Renews on`,
        /Ends on/.test(text) && !/Renews on/.test(text));
      /**
       * ⚠️ §3.9: "this spec owns THE CARD THAT HOLDS THEM". The paragraph was a
       * SIBLING of the card, so the one thing explaining what happens on the date
       * floated loose beneath a surface it belongs to. Measured structurally, not
       * from the text: both must share one rounded container.
       */
      const together = await p.evaluate(() => {
        const btn = [...document.querySelectorAll("button")].find((b) =>
          b.textContent.includes("Keep my Pro plan"),
        );
        const para = [...document.querySelectorAll("p")].find((x) =>
          x.textContent.includes("nothing more will be charged"),
        );
        if (!btn || !para) return null;
        const card = btn.closest("div.rounded-2xl");
        return Boolean(card && card.contains(para));
      });
      check(`CANCELLED ${label}: ⚠️ ONE CARD holds the control AND the paragraph (§3.9)`,
        together === true, together === null ? "one of the two is missing" : `sharedCard=${together}`);
      await layoutFaults(p, `CANCELLED ${label}`);
    }

    /* ══════════ 4. PAST-DUE CUTTING ACROSS — and the Rule 0 withhold ══════════ */
    const pdCancelled = await seed("qa08-pd-cancelled", {
      entitlements: [{ source: "stripe", active_until: iso(3 * DAY), is_active: true }],
      subs: [
        { status: "past_due", current_period_end: iso(30 * DAY), cancel_at_period_end: true },
      ],
    });
    for (const [w, h, label] of VIEWPORTS) {
      const p = await billing(pdCancelled, w, h);
      const text = await p.locator("body").innerText();
      if (label === "390x844") console.log(`\n--- PAST DUE x CANCELLED (no Stripe customer) ---\n${text}\n---`);
      check(`PAST-DUE ${label}: the declined card renders`, text.includes("Your payment didn't go through"));
      check(`PAST-DUE ${label}: it sits ABOVE the plan card`,
        text.indexOf("Your payment didn't go through") < text.indexOf("Access"));
      check(`PAST-DUE ${label}: it replaces nothing — the cancelled state is intact underneath`,
        /Keep my Pro plan/.test(text) && /Access/.test(text));
      /* ⚠️ THE WITHHOLD. No Stripe customer, so the failure date is UNKNOWN. */
      check(`PAST-DUE ${label}: ⚠️ the unknown failure date WITHHOLDS its sentence`,
        !/Your card was declined on/.test(text),
        "a defaulted or derived date here would be a date the server never produced");
      check(`PAST-DUE ${label}: and the sentence whose date IS known still renders`,
        text.includes(`Your account stays as it is until ${day(iso(3 * DAY))}, and goes read only after that until a payment goes through.`));
      check(`PAST-DUE ${label}: both buttons still stand`,
        text.includes("Not now") && text.includes("Update my card"));
      await layoutFaults(p, `PAST-DUE ${label}`);
    }
  } else {
    /* ══════════ 3. LAPSED (needs the gate) ══════════ */
    const lapsed = await seed("qa08-lapsed");
    const ent = await admin.from("entitlements").select("id").eq("user_id", lapsed.id);
    /* ⚠️ 5.3: no `?? 0`. On a failed read `data?.length` is undefined, so
       `undefined === 0` is false and this fails rather than certifying the state
       it was meant to verify. The error is asserted beside it so the reason is
       named. */
    check("ARRIVAL: the entitlements read WORKED", ent.error === null,
      ent.error ? `${ent.error.code}: ${ent.error.message}` : "no error");
    check("ARRIVAL: the lapsed account genuinely holds no entitlement",
      ent.data?.length === 0, `${ent.data?.length ?? "READ FAILED"} row(s)`);

    for (const [w, h, label] of VIEWPORTS) {
      const p = await billing(lapsed, w, h);
      const text = await p.locator("body").innerText();
      if (label === "390x844") console.log(`\n--- LAPSED (gate on) ---\n${text}\n---`);
      check(`LAPSED ${label}: ARRIVAL — the gate is really on, so this IS the lapsed state`,
        /Read only/.test(text),
        /Read only/.test(text) ? "Read only" : "the gate is OFF; nothing below measures the lapsed state");
      check(`LAPSED ${label}: the exact phrase, two words, lower-case second word`,
        /Read only/.test(text) && !/Read-only/i.test(text) && !/READ ONLY/.test(text));
      for (const forbidden of ["paused", "expired", "locked"]) {
        check(`LAPSED ${label}: never "${forbidden}"`, !text.toLowerCase().includes(forbidden));
      }
      check(`LAPSED ${label}: no price and no date, because there is no plan`,
        !/\$\d/.test(text) && !/Renews on|Ends on/.test(text));
      check(`LAPSED ${label}: nothing threatens the user's data`,
        !/delete|lost|removed|at risk/i.test(text));
      await layoutFaults(p, `LAPSED ${label}`);
    }
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
  console.log(`\nMODE=${MODE}  ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    console.log("FAILED:");
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
    process.exitCode = 1;
  }
}
