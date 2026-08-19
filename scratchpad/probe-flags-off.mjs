/**
 * ⚠️ FLAG ABSENCE, PROVEN FROM BEHAVIOUR — never from `ps eww`, which returns
 * nothing on this machine.
 *
 * BILLING_GATE_ENABLED was passed on the command line for the qa-05 baseline and
 * the server has been restarted without it. Two behaviours separate on that flag
 * and nothing else, so both are asserted on ONE lapsed account:
 *
 *   gate ON   -> /dashboard opens the read-only pop-up; /billing Access = "Read only"
 *   gate OFF  -> no pop-up at all;                      /billing Access = "Pro"
 *
 * ⚠️ THE NAMED ARTEFACT IS ASSERTED FIRST AND THE ABSENCE IS GATED ON IT (5.1).
 * "No pop-up" is what a broken selector looks like too, and a cold reviewer's
 * equivalent assertion PASSED while the gate was ON. "Access: Pro" can only be
 * produced by `planLabelFor(null, null, false)` — the gate-off branch — and
 * "Read only" only by the gate-on one, so the label proves the state in BOTH
 * directions while an absence proves it in neither.
 *
 * Safety: one account, @trackd-qa.invalid, timestamped, deleted BY ID in finally.
 * No Stripe objects: a lapsed account is exactly one that has none.
 */
import { chromium } from "playwright";
import { admin, makeUser, dropUser, signIn } from "./admin.mjs";

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "  ✅" : "  ❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

let userId = null;
const browser = await chromium.launch();
try {
  const user = await makeUser(`probeflags-${Date.now()}`);
  userId = user.id;
  const ent = await admin.from("entitlements").select("id").eq("user_id", user.id);
  console.log(`seeded ${user.email}`);
  /**
   * ⚠️ `?? 0` MADE A FAILED READ LOOK LIKE AN EMPTY ONE (5.3). Supabase returns
   * `data: null` on error, so `(data?.length ?? 0) === 0` was TRUE both when the
   * fixture genuinely had no rows and when the QUERY FAILED — on an ARRIVAL
   * check, whose whole job is to establish the state before anything is claimed
   * about it. Without the coalesce, `undefined === 0` is false and it fails
   * correctly; the error is asserted too, so the reason is named rather than
   * inferred. The shape already used correctly elsewhere in these files is
   * `data?.length === N`.
   */
  check(
    "ARRIVAL: the entitlements read WORKED",
    ent.error === null,
    ent.error ? `${ent.error.code}: ${ent.error.message}` : "no error",
  );
  check(
    "ARRIVAL: the account really is lapsed (no entitlement row)",
    ent.data?.length === 0,
    `${ent.data?.length ?? "READ FAILED"} rows`,
  );

  const session = await signIn(user);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies(
    [...session.jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })),
  );
  const page = await context.newPage();

  /**
   * ⚠️ THE NAMED ARTEFACT RUNS FIRST, AND THE ABSENCE IS GATED ON IT (5.1).
   *
   * This file used to assert "no read-only pop-up on a write" FIRST, under a name
   * claiming it proved the flag. It does not prove anything: a cold reviewer's
   * equivalent assertion PASSED while the gate was ON — a one-sided assertion
   * agreeing with a broken selector. **An absence cannot be told apart from a
   * probe that found nothing.**
   *
   * The Access label can, and is the model for the whole class: it reads a
   * POSITIVE string in BOTH directions —
   *
   *     gate OFF, no entitlement  ->  "Pro"        (FULL_ACCESS_LABEL)
   *     gate ON,  no entitlement  ->  "Read only"  (NO_ACCESS_LABEL)
   *
   * — so neither answer can be produced by a selector that matched nothing, and
   * the state is proven in both directions rather than only one.
   *
   * So the order is reversed and the absence below is explicitly a CORROBORATION,
   * gated on the artefact. If the artefact ever fails, the absence is reported as
   * NOT MEASURED rather than as a pass.
   */
  await page.goto("http://localhost:3100/billing", { waitUntil: "networkidle" });
  const billing = await page.locator("body").innerText();
  console.log(`\n--- /billing for a lapsed account ---\n${billing}\n---`);
  const sawPro = /Access[\s\S]{0,40}\bPro\b/.test(billing);
  const sawReadOnly = /Read only/.test(billing);
  const gateOff = sawPro && !sawReadOnly;
  check(
    "⚠️ NAMED ARTEFACT: Access reads the gate-OFF label, so the flag is genuinely unset",
    gateOff,
    sawReadOnly
      ? 'found "Read only" — THE GATE IS ON'
      : sawPro
        ? 'found "Pro"'
        : "found NEITHER label — the page did not render, so nothing is proven either way",
  );

  await page.goto("http://localhost:3100/dashboard", { waitUntil: "networkidle" });
  const dash = await page.locator("body").innerText();
  check("ARRIVAL: the dashboard rendered", dash.length > 200, `${dash.length} chars`);

  // The same two taps qa-05 uses, so a null result here means the same thing there would.
  const fab = page.locator('button[aria-label*="Quick" i], button[aria-label*="add" i]').first();
  await fab.click({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  const dialog = page.locator('[role="dialog"][aria-labelledby="readonly-title"]');
  let n = await dialog.count();
  if (n === 0) {
    const anyWrite = page.locator("button", { hasText: /log a dose|log weight|add|journal/i }).first();
    await anyWrite.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
    n = await dialog.count();
  }
  /**
   * ⚠️ CORROBORATION, NOT PROOF, and the name says so. It agrees with the
   * artefact above or it contradicts it; on its own it means nothing.
   */
  check(
    "corroboration (gated on the artefact): no read-only pop-up on a write",
    gateOff && n === 0,
    gateOff ? `${n} dialog(s)` : "NOT MEASURED — the artefact did not establish the gate is off",
  );
} finally {
  await browser.close();
  if (userId) { await dropUser(userId); console.log(`\ntorn down by id: ${userId}`); }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { for (const f of failed) console.log(`  - ${f.name} (${f.detail})`); process.exitCode = 1; }
}
