/**
 * 09 STEP 7 — "PROVE NOTHING ELSE MOVED", MEASURED RATHER THAN ARGUED.
 *
 * Step 2's commit says no other onboarding screen can move BY CONSTRUCTION. That is
 * an argument. This is the measurement.
 *
 * ⚠️ GEOMETRY AND TEXT, NOT PIXELS. A pixel diff on a headless browser is noisy —
 * font antialiasing and animation frames differ between two identically-built
 * servers — and it cannot say WHAT moved. This captures, for every element on the
 * screen, its tag, class and bounding box, plus the screen's full rendered text, and
 * diffs those. It is deterministic, it names the element that moved, and "nothing
 * moved" means what it says.
 *
 * ⚠️ AND IT CARRIES ITS OWN CONTROL, which is the lesson checkoutfold paid for: an
 * assertion that passes for every screen proves nothing. `start` IS the screen that
 * changed, so the diff MUST show a difference there. If every screen comes back
 * identical, the instrument is broken and the run is void.
 *
 * ⚠️ ONE SERVER, TWO PASSES, AND THE FILE SWAP IN BETWEEN. A second dev server on a
 * git worktree was tried first and Turbopack refused it: a `node_modules` symlink
 * "points out of the filesystem root". Reverting only the two changed files against
 * the same running server is cheaper AND tighter — every other input (node_modules,
 * .next, the database, the account) is provably identical rather than merely built
 * the same way.
 *
 *   node scratchpad/final/drive-step7-nothing-moved.mjs after
 *   git checkout <baseline> -- components/onboarding/payment-sheet.tsx \
 *                              components/onboarding/screens/checkout.tsx
 *   node scratchpad/final/drive-step7-nothing-moved.mjs before
 *   git checkout HEAD -- components/onboarding/payment-sheet.tsx \
 *                        components/onboarding/screens/checkout.tsx
 *   node scratchpad/final/drive-step7-nothing-moved.mjs compare
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { Checks } from "./lib.mjs";
import { makeUser, dropUser, signIn } from "../admin.mjs";

const c = new Checks();
const BASE = "http://localhost:3100";
const OUT = "/private/tmp/claude-501/-Users-adrianschimizzi-Documents-GitHub-trackd-co-app/0a7847f7-d236-4c11-9d26-bf86f7311d86/scratchpad";
const MODE = process.argv[2];
if (!["before", "after", "compare"].includes(MODE)) {
  throw new Error("usage: drive-step7-nothing-moved.mjs before|after|compare");
}
const VIEWPORT = { width: 390, height: 844 };

/** Every step in STEP_ORDER. `start` is the checkout screen and is the control. */
const STEPS = [
  "hook", "name", "birthday", "gender", "greeting", "running", "struggle",
  "celebrate", "demo", "payoff", "cost", "free", "account", "plans", "start",
  "welcome", "notifications", "attribution", "letter", "install",
];
const CHANGED = "start";

/**
 * ⚠️ CAPTURED WITH ANIMATION OFF AND AFTER A SETTLE. The flow animates on entry
 * (`animate-home-up` and friends), so a capture taken mid-transition differs from
 * itself between two runs of the SAME build — which would report every screen as
 * moved and hide the one that did.
 */
async function capture(ctx, step) {
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/onboarding?step=${step}`, {
      waitUntil: "domcontentloaded", timeout: 120_000,
    });
    await page.waitForTimeout(3500);
    return await page.evaluate(() => {
      const round = (n) => Math.round(n * 10) / 10;
      const nodes = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        // Stripe's iframes carry a per-mount random name/src; the FRAME's box is
        // what matters and is captured, its identity is not.
        const cls = (el.getAttribute("class") ?? "").replace(/\s+/g, " ").trim();
        const tag = el.tagName.toLowerCase();
        nodes.push(`${tag}|${cls}|${round(r.x)},${round(r.y)},${round(r.width)},${round(r.height)}`);
      }
      return { text: document.body.innerText, nodes, count: nodes.length };
    });
  } catch (err) {
    return { error: String(err?.message ?? err) };
  } finally {
    await page.close();
  }
}

function diff(a, b) {
  if (a.error || b.error) return { kind: "error", detail: a.error ?? b.error };
  const textSame = a.text === b.text;
  const moved = [];
  const max = Math.max(a.nodes.length, b.nodes.length);
  for (let i = 0; i < max; i += 1) {
    if (a.nodes[i] !== b.nodes[i]) moved.push({ i, old: a.nodes[i] ?? "(absent)", now: b.nodes[i] ?? "(absent)" });
    if (moved.length >= 6) break;
  }
  return { kind: "ok", textSame, countOld: a.nodes.length, countNew: b.nodes.length, moved };
}

const made = [];

if (MODE === "compare") {
  const before = JSON.parse(fs.readFileSync(`${OUT}/step7-before.json`, "utf8"));
  const after = JSON.parse(fs.readFileSync(`${OUT}/step7-after.json`, "utf8"));
  c.at("Step 7 — every onboarding screen, baseline vs the working tree");
  let controlSeen = null;
  for (const step of STEPS) {
    const d = diff(before[step], after[step]);
    if (d.kind === "error") { c.check(`${step}: captured in both passes`, false, d.detail); continue; }
    const identical = d.moved.length === 0 && d.textSame && d.countOld === d.countNew;
    console.log(
      `  ${identical ? "identical" : "MOVED   "}  ${step.padEnd(14)} ` +
        `nodes ${d.countOld}->${d.countNew} text=${d.textSame ? "same" : "DIFFERENT"}` +
        (d.moved.length ? `\n        first: ${d.moved[0].old}\n           ->  ${d.moved[0].now}` : ""),
    );
    if (step === CHANGED) { controlSeen = d; continue; }
    c.check(`${step} is unchanged from its baseline`, identical,
      identical ? "" : `${d.moved.length}+ element(s) moved; text ${d.textSame ? "same" : "DIFFERENT"}`);
  }
  /**
   * ⚠️ THE CONTROL, and it is the checkoutfold lesson applied. `start` IS the screen
   * Step 6 changed. If the instrument reports it identical, the instrument is reading
   * nothing and every "unchanged" above is worthless.
   */
  const controlMoved = controlSeen?.kind === "ok" && controlSeen.moved.length > 0;
  c.check("⚠️ CONTROL: the screen that DID change is detected as changed", controlMoved,
    controlMoved ? `${CHANGED}: ${controlSeen.moved[0].old} -> ${controlSeen.moved[0].now}`
                 : "the diff saw no change on the one screen that definitely changed — instrument broken");
  /** Step 6 is spacing. No string may move with it. */
  c.check("⚠️ and no user-facing string changed on it either",
    controlSeen?.kind === "ok" && controlSeen.textSame,
    controlSeen?.kind === "ok" ? `text ${controlSeen.textSame ? "identical" : "DIFFERENT"}` : "n/a");
  const failed = c.report();
  process.exitCode = failed > 0 ? 1 : 0;
} else {
  const browser = await chromium.launch();
  try {
    const res = await fetch(`${BASE}/login`, { redirect: "manual" }).catch(() => null);
    if (!res || res.status >= 500) throw new Error(`${BASE} is not healthy`);
    const user = await makeUser(`qa-step7-${MODE}`);
    made.push(user.id);
    const sess = await signIn(user);
    const ctx = await browser.newContext({ viewport: VIEWPORT, reducedMotion: "reduce" });
    await ctx.addCookies([...sess.jar].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })));

    const out = {};
    for (const step of STEPS) {
      out[step] = await capture(ctx, step);
      console.log(`  captured ${step.padEnd(14)} ${out[step].error ? `ERROR ${out[step].error}` : `${out[step].count} nodes`}`);
    }
    fs.writeFileSync(`${OUT}/step7-${MODE}.json`, JSON.stringify(out));
    console.log(`\n  wrote ${OUT}/step7-${MODE}.json`);
  } catch (err) {
    console.error("\n💥 the capture threw:", err);
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    for (const id of [...made].reverse()) await dropUser(id).catch(() => {});
    console.log(`ledger: ${made.length} account(s) created, all dropped BY ID`);
  }
}
