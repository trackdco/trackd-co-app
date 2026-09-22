/**
 * RE-RENDER THE 23 INSTALL-WALKTHROUGH FRAMES from `install-build.html`.
 *
 *     node scratchpad/icon-harness/render-install-frames.mjs [--check]
 *
 * `--check` renders to a temp directory and reports sizes without touching
 * `public/`, which is how to confirm a change before it ships.
 *
 * ## ⚠️ WHY THIS SCRIPT EXISTS AT ALL
 *
 * `lib/onboarding/platform.ts` has always said the frames are "generated from
 * the same step data in scratchpad/icon-harness/install-build.html". The file
 * was there; the thing that turned it into 23 webps was not, and neither was
 * the mapping below. During the rename that cost a cold reviewer the wrong
 * conclusion — that no generator existed and the only fix was recapturing on
 * five physical devices. It is a desk job, and this is the desk.
 *
 * ## ⚠️ IT DRIVES THE PAGE'S OWN PLAYER RATHER THAN REDRAWING ANYTHING
 *
 * `draw()` in the harness builds the phone, injects the frame's markup and
 * positions the tap highlight. Reimplementing that here would produce frames
 * that drift from the harness the moment either changed — and the harness is
 * also where the captions come from, so a drift would put a caption under a
 * picture it no longer describes. So: set `pathKey` and `step`, call the
 * page's `draw()`, screenshot what it made.
 *
 * ## ⚠️ THE FLOW -> DIRECTORY MAPPING IS NOT OBVIOUS AND IS NOT GUESSABLE
 *
 * The harness holds SEVEN flows; only five ship. Two of the shipped
 * directories are named after a browser whose harness key is different
 * (`ios-chrome` is drawn by `ios-chrome-safari`, `android-chrome` by
 * `and-chrome-menu`), and the harness also holds longer alternates —
 * `ios-chrome` (12 frames) and `and-chrome` (3) — that are NOT what ship.
 * Getting this wrong publishes another browser's instructions, which is worse
 * than the stale branding this was written to fix.
 *
 * Verified two independent ways: frame counts match the shipped directories
 * exactly (6/3/4/5/5 = 23), and the captions match `INSTALL_CAPTIONS` in
 * `lib/onboarding/platform.ts`. `caps.mjs` encodes four of the five already.
 */
import { chromium } from "playwright";
import sharp from "sharp";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SRC = path.join(ROOT, "scratchpad/icon-harness/install-build.html");
const OUT = path.join(ROOT, "public/onboarding/install");

/**
 * ⚠️ THE SHIPPED SIZE, AND IT IS LOAD-BEARING.
 * `components/onboarding/install-walkthrough.tsx` hardcodes 750x1625 as the
 * intrinsic size. A frame at any other ratio reintroduces the aspect bug that
 * was fixed in intro.tsx. The harness phone is 375x812 CSS px, so this is a
 * 2x capture, normalised to the exact declared size.
 */
const W = 750;
const H = 1625;

const FLOWS = [
  { key: "ios-safari", dir: "ios-safari", n: 6 },
  { key: "ios-chrome-safari", dir: "ios-chrome", n: 3 },
  { key: "and-chrome-menu", dir: "android-chrome", n: 4 },
  { key: "samsung", dir: "android-samsung", n: 5 },
  { key: "firefox", dir: "android-firefox", n: 5 },
];

const CHECK = process.argv.includes("--check");
const dest = CHECK ? fs.mkdtempSync(path.join(os.tmpdir(), "frames-")) : OUT;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 1200 },
  deviceScaleFactor: 2,
});

await page.setContent(
  '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    fs.readFileSync(SRC, "utf8") +
    "</body></html>",
  { waitUntil: "networkidle" },
);
await page.waitForTimeout(600);

// ⚠️ STOP THE PLAYER. It autoplays, and a frame captured mid-advance is a
// frame of the wrong step.
await page.evaluate(() => {
  playing = false;
  if (typeof timer !== "undefined" && timer) clearInterval(timer);
});

let wrote = 0;
let failed = false;

for (const flow of FLOWS) {
  const n = await page.evaluate((k) => PATHS[k].frames.length, flow.key);
  if (n !== flow.n) {
    console.error(
      `REFUSING ${flow.key}: expected ${flow.n} frames, harness has ${n}. ` +
        `The mapping above is stale — do not publish these.`,
    );
    failed = true;
    continue;
  }

  const dir = path.join(dest, flow.dir);
  fs.mkdirSync(dir, { recursive: true });

  for (let i = 0; i < n; i++) {
    await page.evaluate(
      ([k, s]) => {
        pathKey = k;
        step = s;
        buildAside();
        draw();
        playing = false;
        if (typeof timer !== "undefined" && timer) clearInterval(timer);
      },
      [flow.key, i],
    );

    /**
     * ⚠️ WAIT FOR THE FRAME'S OWN ENTRANCE ANIMATIONS TO FINISH, AND WAIT ON
     * THE ANIMATIONS THEMSELVES RATHER THAN ON A GUESSED SLEEP.
     *
     * Two things made this necessary, both found by looking at the output:
     *
     *   · The home-screen payoff frames carry `.landing .tile {drop 1.05s}` and
     *     `.landing .nm {fadein .5s .5s}` — a full second before the app's
     *     NAME under the icon reaches opacity 1. Captured early, the tile is
     *     there and the label is simply absent, which on the one frame whose
     *     whole job is "the app is on your home screen, and here is what it is
     *     called" is the worst possible thing to drop.
     *   · The tap target's rect is only final once the frame's images have
     *     laid out. Measured too early, the ring lands low and right of the
     *     control it is supposed to circle.
     *
     * ⚠️ INFINITE ANIMATIONS ARE EXCLUDED OR THIS NEVER RETURNS. `.ours
     * .tile::after` runs `halo 2.4s infinite`, so its `finished` promise never
     * resolves. There is no settled phase for it to be in; it is sampled
     * wherever it happens to be, exactly as the original frames did.
     */
    await page.evaluate(async () => {
      const finite = document
        .getAnimations()
        .filter((a) => a.effect?.getTiming?.().iterations !== Infinity);
      await Promise.all(finite.map((a) => a.finished.catch(() => {})));
    });

    await page.evaluate(
      ([k, s]) => {
        /**
         * ⚠️ THE TAP TARGET GETS AN AMBER RING, AND `draw()` DOES NOT DRAW ONE.
         *
         * The harness's own indicator is `.finger` — a 36px translucent WHITE
         * circle that sits ON the target, which is right for the animated
         * player where it slides between steps. The shipped frames use a
         * different treatment entirely: a ring AROUND the target, so the label
         * underneath stays readable. Rendering the player's finger instead
         * produced a blob over the word "Add".
         *
         * The geometry is lifted verbatim from `still.mjs` (which builds the
         * Instagram stills from this same harness) so the two cannot drift:
         * target rect + 26px, fully round only when the target is near-square,
         * otherwise a 20px-max corner.
         *
         * ⚠️ WITHOUT still.mjs's DIM. That script also darkens the screen and
         * punches the target back to full brightness, which suits a social
         * still standing alone. The shipped walkthrough frames are not dimmed —
         * they sit under a caption inside the app, and dimming them would make
         * the screen the user is looking at disagree with the one in front of
         * them.
         */
        const screen = recStage.querySelector(".screen");
        const finger = recStage.querySelector("[data-finger]");
        if (finger) finger.style.display = "none";

        const at = PATHS[k].frames[s].at;
        const el = at ? screen.querySelector(at) : null;
        if (el) {
          const r = el.getBoundingClientRect();
          const b = screen.getBoundingClientRect();
          const round = Math.abs(r.width - r.height) < 10;
          const rw = r.width + 26;
          const rh = r.height + 26;
          const ring = document.createElement("div");
          ring.style.cssText =
            "position:absolute;z-index:30;pointer-events:none;" +
            "border:3px solid #F5C05A;box-shadow:0 0 30px rgba(245,192,90,.55);" +
            `width:${rw}px;height:${rh}px;` +
            `border-radius:${round ? "999px" : Math.min(rh / 2, 20) + "px"};` +
            `left:${r.left - b.left + r.width / 2 - rw / 2}px;` +
            `top:${r.top - b.top + r.height / 2 - rh / 2}px;`;
          screen.appendChild(ring);
        }
      },
      [flow.key, i],
    );
    // The ring is placed; give it a frame to paint before capturing.
    await page.waitForTimeout(80);

    const phone = page.locator("#recStage .phone");
    const png = await phone.screenshot({ type: "png" });

    const file = path.join(dir, `${String(i + 1).padStart(2, "0")}.webp`);
    await sharp(png)
      .resize(W, H, { fit: "fill" })
      .webp({ quality: 90 })
      .toFile(file);

    const cap = await page.evaluate(
      ([k, s]) => PATHS[k].frames[s].cap.replace(/<\/?b>/g, ""),
      [flow.key, i],
    );
    console.log(
      `  ${flow.dir}/${String(i + 1).padStart(2, "0")}.webp  ${String(fs.statSync(file).size).padStart(6)}b  ${cap}`,
    );
    wrote++;
  }
}

await browser.close();

if (failed) {
  console.error("\n⚠️ ONE OR MORE FLOWS REFUSED. Frames above may be incomplete.");
  process.exit(1);
}

console.log(`\n${wrote} frames written to ${dest}`);
if (CHECK) console.log("(--check: public/ was not touched)");
