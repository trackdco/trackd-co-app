/**
 * SPEC 05 Step 2 + Step 3 — DRIVE THE READ-ONLY POP-UP.
 *
 * ⚠️ A PORTAL RENDERS NOTHING ON THE SERVER (§3.8). This pop-up cannot be
 * verified from served HTML; only the server's decision can. So every claim about
 * it has to come from a real browser, which is what this does.
 *
 *   BILLING_GATE_ENABLED=true npx next dev -p 3100      # in another shell
 *   node scratchpad/qa-05-readonly.mjs
 *
 * ⚠️ THE FLAG IS LOCAL ONLY. Spec 05 Step 7: "Set BILLING_GATE_ENABLED only in a
 * local environment. Never in production." It is passed to the dev server on the
 * command line rather than written into `.env.local`, so nothing about the
 * founder's environment is changed and restarting restores the default.
 *
 * Safety: one account, `@trackd-qa.invalid`, timestamped, deleted BY ID in a
 * `finally`. It has no Stripe objects at all — a lapsed account is exactly one
 * that has none.
 */
import { chromium } from "playwright";

import { admin, makeUser, dropUser, signIn } from "./admin.mjs";

/** §3.6's approved copy, character for character. */
const APPROVED = {
  title: "Your account is read only",
  body: "You're not on a plan at the moment, so Trackd Co is read only. You can still view everything you've logged, you just can't add to it.",
  reassurance: "Nothing has been deleted.",
  dismiss: "Back to my logs",
  action: "Choose a plan",
};

/** Words the brief forbids on any surface naming this state. */
const FORBIDDEN = ["paused", "expired", "locked", "—"];

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "  ✅" : "  ❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

let userId = null;
const browser = await chromium.launch();

try {
  /* ── a LAPSED account: signed up, no entitlement row at all ─────── */
  const user = await makeUser(`qa05-${Date.now()}`);
  userId = user.id;
  await admin
    .from("profiles")
    .update({
      is_18_plus: true,
      tos_accepted_at: new Date().toISOString(),
      date_of_birth: "1990-01-01",
      timezone: "Australia/Sydney",
    })
    .eq("id", user.id);

  const rows = await admin.from("entitlements").select("id").eq("user_id", user.id);
  console.log(`\nseeded ${user.email}`);
  console.log(`entitlement rows: ${rows.data?.length ?? 0} (a lapsed account has none)`);

  const session = await signIn(user);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies(
    [...session.jar].map(([name, value]) => ({
      name,
      value,
      domain: "localhost",
      path: "/",
    })),
  );
  const page = await context.newPage();

  /* ── ⚠️ ARRIVE BEFORE ASSERTING ─────────────────────────────────── */
  await page.goto("http://localhost:3100/dashboard", { waitUntil: "networkidle" });
  const onDashboard = await page.locator("body").innerText();
  check(
    "ARRIVAL: the app rendered for a lapsed account (nothing redirected, nothing blocked)",
    onDashboard.length > 200,
    `${onDashboard.length} chars of page text`,
  );

  /**
   * ⚠️ THE GATE IS PROVEN BY THE POP-UP ITSELF, and the probe that used to sit
   * here has been REMOVED (D89 part two, on tracking this driver).
   *
   * It POSTed to `/api/billing/reconcile` and logged the status. Three things
   * wrong with it: it called a billing route from a QA driver; it never asserted
   * anything, so it could not fail; and its comment claimed it established the
   * gate was on, which a reconcile route's status code does not.
   *
   * Nothing is lost by dropping it. The read-only pop-up renders ONLY when
   * `BILLING_GATE_ENABLED` is on, so the ARRIVAL check below — "the read-only
   * pop-up opened", which throws rather than continuing — is the gate proof, and
   * it is a named artefact rather than a status code.
   */

  /* ── open the pop-up ────────────────────────────────────────────── */
  const dialog = page.locator('[role="dialog"][aria-labelledby="readonly-title"]');

  /**
   * ⚠️ THE FAB IS TWO TAPS, NOT ONE, and getting that wrong cost a run.
   *
   * Its aria-label is "Open quick actions": the first tap opens the quick-actions
   * MENU, and the write control inside it is what the gate intercepts. A driver
   * that tapped the FAB once and looked for the dialog found nothing and reported
   * it as the pop-up refusing to re-open — a defect that did not exist. Probed
   * directly (`qa-05-reopen-probe.mjs`) rather than assumed.
   *
   * So the whole sequence is a function, and re-opening repeats it exactly.
   */
  const openPopup = async () => {
    const fab = page
      .locator('button[aria-label*="Quick" i], button[aria-label*="add" i]')
      .first();
    await fab.click({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
    if ((await dialog.count()) > 0) return;
    const anyWrite = page
      .locator("button", { hasText: /log a dose|log weight|add|journal/i })
      .first();
    await anyWrite.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
  };

  await openPopup();
  const found = await dialog.count();
  check("ARRIVAL: the read-only pop-up opened", found > 0, `${found} dialog(s)`);
  if (found === 0) {
    console.log("\nPage text was:\n", (await page.locator("body").innerText()).slice(0, 1200));
    throw new Error("the pop-up never opened; nothing below would be measuring it");
  }

  const text = await dialog.innerText();
  console.log(`\n--- what the pop-up actually says ---\n${text}\n---`);

  /* ── the words, character for character ─────────────────────────── */
  check("title is the approved line", text.includes(APPROVED.title));
  check("body is the approved line", text.replace(/\s+/g, " ").includes(APPROVED.body));
  check("reassurance is the approved line", text.includes(APPROVED.reassurance));
  check("dismiss button reads 'Back to my logs'", text.includes(APPROVED.dismiss));
  check("action button reads 'Choose a plan'", text.includes(APPROVED.action));

  check(
    'the exact phrase "read only" appears',
    /read only/.test(text) && !/read-only/.test(text),
  );
  for (const word of FORBIDDEN) {
    check(`"${word}" does NOT appear`, !text.toLowerCase().includes(word.toLowerCase()));
  }

  /* ── D28: the selector is gone ──────────────────────────────────── */
  const prices = /\$\d/.test(text);
  check("D28: no prices and no plan selector in the pop-up", !prices);
  check(
    "D28: the old strings are gone",
    !text.includes("Subscribe to keep logging") &&
      !text.includes("Not now") &&
      !/free trials are for new accounts/.test(text),
  );

  /* ── the state leads, the reassurance follows (§3.6) ─────────────── */
  check(
    "the STATE leads and the reassurance follows",
    text.indexOf(APPROVED.title) < text.indexOf(APPROVED.reassurance),
  );

  /* ── mechanics: tap targets, focus, pointer-events ──────────────── */
  const buttons = dialog.locator("button");
  const n = await buttons.count();
  let smallest = 999;
  for (let i = 0; i < n; i += 1) {
    const box = await buttons.nth(i).boundingBox();
    if (box) smallest = Math.min(smallest, box.height);
  }
  check("every tap target is at least 44px tall", smallest >= 44, `smallest ${smallest}px`);

  // ⚠️ pointer-events on the backdrop is load-bearing (§3.8). Measured, not read.
  const hitTestable = await dialog.evaluate((node) => {
    const btns = [...node.querySelectorAll("button")];
    return btns.filter((b) => {
      const r = b.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el && (el === b || b.contains(el));
    }).length;
  });
  check(
    "every button is genuinely hit-testable (pointer-events-auto)",
    hitTestable === n,
    `${hitTestable} of ${n}`,
  );

  const focusInside = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"][aria-labelledby="readonly-title"]');
    return Boolean(d && d.contains(document.activeElement));
  });
  check("focus moved into the dialog", focusInside);

  /* ── the dismiss path, ticked HERE rather than after a re-open ──── */
  // ⚠️ Done on the pop-up that is already open. The previous version re-opened it
  // first and the re-trigger did not fire, so the check silently never ran and
  // the box stayed unticked. Assert on the thing in front of you.
  await dialog.locator("button", { hasText: APPROVED.dismiss }).click();
  await page.waitForTimeout(400);
  check("'Back to my logs' closes the pop-up", (await dialog.count()) === 0);
  check(
    "and it closes WITHOUT leaving the app",
    page.url().includes("/dashboard"),
    page.url(),
  );

  // ⚠️ AND THE SYNCING NOTICE MUST NOT BE ANYWHERE. §5: "No refused write renders
  // the syncing notice", on any gated surface.
  const bodyText = await page.locator("body").innerText();
  check(
    "the syncing notice never appeared",
    !/Still syncing/i.test(bodyText) && !/keep trying/i.test(bodyText),
  );

  /* ── D28: the destination ───────────────────────────────────────── */
  await openPopup();
  const reopened = await dialog.count();
  check("ARRIVAL: the pop-up re-opens after being dismissed", reopened > 0);
  await dialog.locator("button", { hasText: APPROVED.action }).click();
  await page.waitForURL(/onboarding/, { timeout: 15000 }).catch(() => {});
  const url = page.url();
  check(
    "D28: 'Choose a plan' lands on the PRICE LIST, not the card screen",
    url.includes("step=plans"),
    url,
  );

} finally {
  await browser.close();
  if (userId) {
    await dropUser(userId);
    console.log(`\ntorn down by id: ${userId}`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    console.log("FAILED:");
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
    process.exitCode = 1;
  }
}
