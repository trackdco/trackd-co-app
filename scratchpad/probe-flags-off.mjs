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
 * ⚠️ THE CONTROL IS THE SECOND ASSERTION, NOT THE FIRST. "No pop-up" is what a
 * broken selector looks like too. "Access: Pro" is a NAMED ARTEFACT that can only
 * be produced by `planLabelFor(null, null, false)` — the gate-off branch — so the
 * pair distinguishes flag-off from driver-broken.
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
  check(
    "ARRIVAL: the account really is lapsed (no entitlement row)",
    (ent.data?.length ?? 0) === 0,
    `${ent.data?.length ?? 0} rows`,
  );

  const session = await signIn(user);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies(
    [...session.jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })),
  );
  const page = await context.newPage();

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
  check("BILLING_GATE_ENABLED is OFF: no read-only pop-up on a write", n === 0, `${n} dialog(s)`);

  await page.goto("http://localhost:3100/billing", { waitUntil: "networkidle" });
  const billing = await page.locator("body").innerText();
  console.log(`\n--- /billing for a lapsed account ---\n${billing}\n---`);
  check(
    "CONTROL: Access reads the gate-OFF label, so the flag is genuinely unset",
    /Access[\s\S]{0,40}\bPro\b/.test(billing) && !/Read only/.test(billing),
    /Read only/.test(billing) ? 'found "Read only" — THE GATE IS ON' : 'found "Pro"',
  );
} finally {
  await browser.close();
  if (userId) { await dropUser(userId); console.log(`\ntorn down by id: ${userId}`); }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { for (const f of failed) console.log(`  - ${f.name} (${f.detail})`); process.exitCode = 1; }
}
