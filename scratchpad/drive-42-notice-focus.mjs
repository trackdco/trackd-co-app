/**
 * 4.2 — THE LAUNCH NOTICE ACTUALLY TAKES THE KEYBOARD.
 *
 *   ./scratchpad/dev-gate-on.sh      # the notice requires the gate
 *   node scratchpad/drive-42-notice-focus.mjs
 *
 * It declares role="dialog" aria-modal="true" and, before 4.2, never moved focus
 * in or trapped Tab: the effect's deps were [open, close], `open` starts true and
 * never changes, and `mounted` is false until hydration so the ref was null when
 * it fired. Focus stayed on <body> and Tab walked the dashboard behind the
 * backdrop.
 *
 * ⚠️ ASSERTED ON document.activeElement, NOT ON THE MARKUP. The markup was
 * correct throughout the entire life of the defect — that is what made it a lie
 * rather than an omission.
 */
import { admin, makeUser, dropUser, signIn } from "./admin.mjs";
import { chromium } from "playwright";

const results = [];
const check = (n, pass, d = "") => { results.push(pass); console.log(`${pass?"  ✅":"  ❌"} ${n}${d?` — ${d}`:""}`); };

const made = [];
const browser = await chromium.launch();
try {
  for (const [label, ent] of [
    ["COMP (free for life)", { source: "comp", active_until: null, is_active: true }],
    ["BETA (14-day grace) ", { source: "comp", active_until: new Date(Date.now() + 12 * 864e5).toISOString(), is_active: true }],
  ]) {
    const u = await makeUser(`qa42-${label.slice(0,4).toLowerCase()}`); made.push(u.id);
    const e = await admin.from("entitlements").insert({ user_id: u.id, product: "pro", ...ent });
    if (e.error) throw new Error(`entitlement seed: ${e.error.message}`);

    const s = await signIn(u);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies([...s.jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })));
    const page = await ctx.newPage();
    await page.goto("http://localhost:3100/dashboard", { waitUntil: "networkidle" });

    const dialog = page.locator('[role="dialog"][aria-labelledby="beta-notice-title"]');
    await dialog.waitFor({ timeout: 20000 }).catch(() => {});
    const opened = await dialog.count() > 0;
    check(`${label} ARRIVAL: the notice opened`, opened,
      opened ? "" : "it never opened, so nothing below proves anything");
    if (!opened) { await ctx.close(); continue; }

    /* ── 1. focus MOVED IN, read off document.activeElement ─────────── */
    const inside = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"][aria-labelledby="beta-notice-title"]');
      const a = document.activeElement;
      return { contained: !!d && !!a && d.contains(a), tag: a?.tagName ?? "(none)",
               text: (a?.textContent ?? "").trim().slice(0, 30) };
    });
    check(`${label} focus MOVED INTO the dialog on open`, inside.contained,
      `activeElement=<${inside.tag}> "${inside.text}"`);
    check(`${label} and it landed on a real control, not body`, inside.tag !== "BODY");

    /* ── 2. Tab is TRAPPED. Press it more times than there are buttons ── */
    const buttons = await dialog.locator("button:not([disabled])").count();
    let escaped = null;
    for (let i = 0; i < buttons + 4; i += 1) {
      await page.keyboard.press("Tab");
      const still = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"][aria-labelledby="beta-notice-title"]');
        const a = document.activeElement;
        return !!d && !!a && d.contains(a);
      });
      if (!still) { escaped = i + 1; break; }
    }
    check(`${label} Tab is TRAPPED across ${buttons + 4} presses (${buttons} focusable)`,
      escaped === null, escaped === null ? "never left the dialog" : `escaped on press ${escaped}`);

    /* ── 3. Shift+Tab too, which is the half a forward-only trap misses ── */
    let escapedBack = null;
    for (let i = 0; i < buttons + 4; i += 1) {
      await page.keyboard.press("Shift+Tab");
      const still = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"][aria-labelledby="beta-notice-title"]');
        const a = document.activeElement;
        return !!d && !!a && d.contains(a);
      });
      if (!still) { escapedBack = i + 1; break; }
    }
    check(`${label} Shift+Tab is trapped too`, escapedBack === null,
      escapedBack === null ? "never left the dialog" : `escaped backwards on press ${escapedBack}`);

    /* ── 4. CONTROL: Escape still closes it, so the trap is not a cage ── */
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    check(`${label} CONTROL: Escape still closes it`, (await dialog.count()) === 0);
    await ctx.close();
  }
} finally {
  await browser.close().catch(()=>{});
  for (const id of [...made].reverse())
    await dropUser(id).then(()=>console.log(`  dropped ${id}`)).catch(e=>console.warn(`  ${id}: ${e.message}`));
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exitCode = results.every(Boolean) ? 0 : 1;
}
