/**
 * 3.3 / D98 — THE READ-ONLY POP-UP'S FIRST CLAUSE, AGAINST ALL SIX COHORTS.
 *
 *   ./scratchpad/dev-gate-on.sh      # in another shell — the gate MUST be on
 *   node scratchpad/drive-33-readonly-six.mjs
 *
 * The clause must be true of every cohort that meets this pop-up, and the pop-up
 * STAYS UNBRANCHED — so the assertion is that all six read the IDENTICAL body.
 *
 * ⚠️ COHORT 1 IS THE ONE THE FINDING DID NOT NAME. Anyone signing up after the
 * 17 Aug backfill holds NO entitlement row at all, so at P13 they go read-only
 * immediately. "Your access has ended" would be false for them — they never had
 * any — which is why the signed clause is a statement about NOW.
 */
import { admin, makeUser, dropUser, signIn, env } from "./admin.mjs";
import { chromium } from "playwright";

const PRICE_ID = env.STRIPE_PRICE_YEARLY;
if (!PRICE_ID) throw new Error("STRIPE_PRICE_YEARLY is not set");
const DAY = 864e5;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

const BODY = "You don't have access at the moment, so Trackd Co is read only. You can still view everything you've logged, you just can't add to it.";
const TITLE = "Your account is read only";
const REASSURANCE = "Nothing has been deleted.";
const FORBIDDEN = ["paused", "expired", "locked", "—"];

const results = [];
const check = (n, pass, d = "") => { results.push(pass); console.log(`${pass?"  ✅":"  ❌"} ${n}${d?` — ${d}`:""}`); };

/** ent: null means NO ROW AT ALL. sub: null means no mirror row. */
const COHORTS = [
  ["1 never had access (a fresh sign-up)", null, null],
  ["2 lapsed beta grace            ", { source: "comp",   active_until: iso(-2*DAY), is_active: true }, null],
  ["3 lapsed trial                 ", { source: "stripe", active_until: iso(-2*DAY), is_active: true }, { status: "canceled" }],
  ["4 lapsed subscription          ", { source: "stripe", active_until: iso(-9*DAY), is_active: true }, { status: "canceled" }],
  ["5 revoked                      ", { source: "stripe", active_until: iso(365*DAY), is_active: false }, { status: "active" }],
  ["6 past-due after the lapse     ", { source: "stripe", active_until: iso(-2*DAY), is_active: true }, { status: "past_due" }],
];

const made = [];
let seq = 0;
const bodies = [];
const browser = await chromium.launch();
try {
  for (const [label, ent, sub] of COHORTS) {
    const u = await makeUser(`qa33-${seq}`); made.push(u.id);
    if (ent) {
      const e = await admin.from("entitlements").insert({ user_id: u.id, product: "pro", ...ent });
      if (e.error) throw new Error(`entitlement seed: ${e.error.message}`);
    }
    if (sub) {
      const sres = await admin.from("subscriptions").insert({
        user_id: u.id, stripe_subscription_id: `qa33_${Date.now()}_${(seq+=1)}`,
        stripe_price_id: PRICE_ID, current_period_end: iso(365*DAY),
        cancel_at_period_end: false, ...sub });
      if (sres.error) throw new Error(`subscription seed: ${sres.error.message}`);
      const c = await admin.from("billing_customers").insert({
        user_id: u.id, stripe_customer_id: `cus_qa33_${Date.now()}_${(seq+=1)}` });
      if (c.error) throw new Error(`customer seed: ${c.error.message}`);
    }
    seq += 1;

    /* ── ARRIVAL on the DATABASE: the cohort really is what it claims ── */
    const rows = await admin.from("entitlements").select("source, is_active, active_until").eq("user_id", u.id);
    if (rows.error) throw new Error(`arrival read failed: ${rows.error.message}`);
    check(`${label} ARRIVAL: ${ent ? "entitlement row present" : "NO entitlement row at all"}`,
      (rows.data?.length ?? -1) === (ent ? 1 : 0), `rows=${rows.data?.length}`);

    const s = await signIn(u);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies([...s.jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })));
    const page = await ctx.newPage();
    await page.goto("http://localhost:3100/dashboard", { waitUntil: "networkidle" });

    /**
     * ⚠️ THE POP-UP OPENS ON A WRITE ATTEMPT, NOT ON PAGE LOAD — and the FAB is
     * TWO TAPS, not one. The first version of this driver loaded /dashboard and
     * waited for the title; it reported "never opened" for all six cohorts,
     * including ones `qa-05-readonly.mjs` proves it opens for. **The driver had
     * not reached the state**, and reporting that as a defect would have been the
     * exact mistake this project's rules exist to prevent.
     *
     * This is `qa-05-readonly.mjs`'s own sequence, copied rather than re-invented,
     * with its note: the FAB's label is "Open quick actions", so the first tap
     * opens the MENU and the write control inside it is what the gate intercepts.
     */
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
    const text = opened ? await dialog.first().innerText() : await page.locator("body").innerText();
    await ctx.close();

    check(`${label} ARRIVAL: the pop-up opened`, opened,
      opened ? "" : "it never opened, so nothing below proves anything");
    if (!opened) continue;
    const body = text.split("\n").map(l => l.trim()).find(l => l.startsWith("You don't have access")) ?? "(absent)";
    bodies.push(body);
    check(`${label} carries the SIGNED clause, character for character`, text.includes(BODY), body.slice(0, 46) + "...");
    check(`${label} keeps "Nothing has been deleted."`, text.includes(REASSURANCE));
    check(`${label} no forbidden word`, !FORBIDDEN.some((w) => body.includes(w)));
    check(`${label} makes no claim about HISTORY`, !/has ended|no longer|used to/.test(body));
  }

  /* ── ⚠️ THE POINT OF THE WHOLE DRIVE: IT IS UNBRANCHED ──────────── */
  const unique = [...new Set(bodies)];
  check(`⚠️ UNBRANCHED: all ${bodies.length} cohorts read the IDENTICAL body`,
    bodies.length === COHORTS.length && unique.length === 1,
    `${unique.length} distinct body/bodies across ${bodies.length} cohorts`);
} finally {
  await browser.close().catch(()=>{});
  for (const id of [...made].reverse())
    await dropUser(id).then(()=>console.log(`  dropped ${id}`)).catch(e=>console.warn(`  ${id}: ${e.message}`));
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exitCode = results.every(Boolean) ? 0 : 1;
}
