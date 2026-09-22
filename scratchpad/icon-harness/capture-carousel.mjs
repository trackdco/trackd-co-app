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
    timeout: 60000,
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
  await page.waitForTimeout(400);

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
