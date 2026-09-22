/**
 * RE-CAPTURE THE FOUR ONBOARDING CAROUSEL SCREENSHOTS.
 *
 *     npx next dev --webpack -H 127.0.0.1 -p 3100      # in another terminal
 *     node scratchpad/icon-harness/capture-carousel.mjs [--check]
 *
 * These are NOT harness drawings like the install frames — they are captures of
 * the real app, taken through the `/preview/*` routes, which is why the branding
 * in them fixes itself the moment the app renders the new wordmark.
 *
 * ## ⚠️ WHY THEY WENT STALE AND NOTHING NOTICED
 *
 * They are baked pixels of the app's own header, so swapping
 * `public/trackd-wordmark.png` could not reach them. All four carried the
 * retired serif "trackd co" through the whole rename, on the carousel that
 * plays during onboarding — for NEW signups, who are precisely the cohort the
 * rebrand notice deliberately withholds the explanation from. They would have
 * seen the old brand with no context for it, by design.
 *
 * ## ⚠️ 1170x2532, WHICH IS NOT WHAT THE OLD FILES WERE
 *
 * `app-carousel.tsx` declares `width={1170} height={2532}` on every slide, but
 * the files were 688x1504 and 1145x2489 — two different sizes, neither of them
 * the declared one. The ratios were close enough that `object-cover` hid it.
 * Capturing at the declared size removes a latent mismatch rather than
 * preserving it: 390x844 CSS at deviceScaleFactor 3 is exactly 1170x2532, and
 * is the iPhone Pro frame the rest of this project's assets use.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, "public/onboarding");
const BASE = process.env.PREVIEW_BASE ?? "http://127.0.0.1:3100";

const SLIDES = [
  { route: "/preview/home", file: "app-dashboard.png" },
  { route: "/preview/protocol", file: "app-protocol.png" },
  { route: "/preview/recon", file: "app-calculator.png" },
  { route: "/preview/progress", file: "app-progress.png" },
];

const CHECK = process.argv.includes("--check");
const dest = CHECK ? fs.mkdtempSync(path.join(os.tmpdir(), "carousel-")) : OUT;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  // The app is dark-only; without this the preview can resolve light tokens.
  colorScheme: "dark",
});

let failed = false;

for (const s of SLIDES) {
  const res = await page.goto(BASE + s.route, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  if (!res || res.status() !== 200) {
    console.error(`REFUSING ${s.route}: HTTP ${res ? res.status() : "no response"}`);
    failed = true;
    continue;
  }

  /**
   * ⚠️ WAIT OUT THE ENTRANCE STAGGER. Every tab screen animates its cards in
   * with `animate-home-up` on a per-card delay, and the metric values count up
   * over ~400ms. Captured early, the slide shows a half-built screen with
   * numbers still climbing — which is what a careless recapture ships.
   */
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter((a) => a.effect?.getTiming?.().iterations !== Infinity);
    await Promise.all(finite.map((a) => a.finished.catch(() => {})));
  });
  /**
   * ⚠️ HIDE THE HARNESS CHROME. The /preview/* routes wrap the real screen in a
   * header carrying a "Preview · <page>" pill. The originals were captured from
   * the signed-in app (their top-right reads "Sign out"), so neither chrome is
   * "correct" — but a marketing slide must not ship the word PREVIEW, and an
   * empty top-right beside the wordmark reads better than a stray Sign out.
   */
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("header span")) {
      if (/^preview\s/i.test(el.textContent || "")) el.style.visibility = "hidden";
    }
  });

  await page.waitForTimeout(2500);

  /**
   * ⚠️ REFUSE A BLANK CAPTURE. /preview/protocol returned HTTP 200 and rendered
   * an empty screen — its data arrives client-side after the route responds —
   * and the result was a 14KB slab of pure background that would have shipped
   * as an onboarding slide. A 200 is not evidence that a page drew anything.
   */
  const textLen = await page.evaluate(() => (document.body.innerText || "").trim().length);
  if (textLen < 80) {
    console.error(`REFUSING ${s.route}: page rendered only ${textLen} chars of text — blank or still loading`);
    failed = true;
    continue;
  }

  const file = path.join(dest, s.file);
  await page.screenshot({ path: file, type: "png" });

  const b = fs.readFileSync(file);
  console.log(
    `  ${s.file.padEnd(20)} ${b.readUInt32BE(16)}x${b.readUInt32BE(20)}  ${String(Math.round(b.length / 1024)).padStart(4)}KB  ${s.route}`,
  );
}

await browser.close();

if (failed) {
  console.error("\n⚠️ ONE OR MORE ROUTES REFUSED. Is the dev server up?");
  process.exit(1);
}

console.log(`\n4 slides written to ${dest}`);
if (CHECK) console.log("(--check: public/ was not touched)");
