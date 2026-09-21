/**
 * Kyle asset generation. Run with: `node scripts/brand/kyle.mjs`
 *
 * Companion to `generate.mjs` (the wordmark). This one owns the mascot and
 * EVERY asset derived from him — onboarding art, iOS launch images, app icons.
 * If a file has Kyle in it, it is made here and nowhere else.
 *
 * Sources — full-size renders, transparent PNG, one per pose, all on the same
 * square canvas (scripts/brand/kyle/):
 *   kyle_default.png          flex, determined smirk   — the splash + app icon
 *   kyle_flex_smile.png       flex, eyes closed        — onboarding welcome
 *   Kyle_thumbs_up_smile.png  thumbs up, grin          — onboarding celebrate
 *   kyle_wave.png             waving                   — onboarding open
 *
 * Outputs:
 *   public/onboarding/kyle-{default,flex,thumbs,wave}.png   what screens load
 *   public/trackd-kyle-vial-splash-poster.jpg               iOS launch poster
 *   public/splash/apple-splash-*.png                        9 iOS launch images
 *   public/icon-192.png, public/icon-maskable.png           PWA icons
 *   app/icon.png, app/apple-icon.png, app/favicon.ico       Next icon conventions
 *
 * ## Why the poses share ONE crop box
 *
 * Every render arrives with a different amount of space around Kyle, and the
 * mascot component sizes him by capping his HEIGHT. Trim each pose to its own
 * content and each gets normalised to its own height — so Kyle's body would
 * change size between the welcome screen and the celebrate screen. A few
 * percent, which is small enough to read as a bug rather than a decision.
 *
 * Worse, the bounding box is the wrong thing to normalise on: it grows with an
 * ARM, not with him. The wave pose raises a hand well above the cap, so trimming
 * it alone would shrink the vial to make room for the hand.
 *
 * So the alpha boxes of all four are unioned and every pose is cut to that one
 * box. Dead space goes, relative scale survives, and a raised hand costs the
 * other poses a little headroom rather than costing Kyle his size.
 *
 * ## Why they are cropped at all
 *
 * The first set shipped with ~37% of the image height empty. That space is
 * transparent, so it is invisible — but it is not free: it scales with him and
 * pushes everything around him apart, and no margin can pull a neighbour into
 * it. Adrian asked for the top and bottom cut so he sits properly on the page.
 * This crop leaves ~9%, which is the wave pose's headroom and nothing else.
 *
 * Cropping makes him render BIGGER for the same `size` prop, so the call sites
 * were scaled by the same factor to keep his on-screen size unchanged — tighter
 * box, same Kyle. Re-run with differently-framed art and check those numbers
 * again; the script prints the factor it would take.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../..");
const pub = path.join(root, "public");
const appDir = path.join(root, "app");

/**
 * The renders live beside this script, NOT under public/, for two reasons.
 *
 * They are sources, and generate.mjs already sets the convention: keep them
 * here so regeneration never depends on what is in somebody's Downloads folder.
 * And they were previously in public/, which SERVES them — 60MB of masters that
 * no code references, shipped to production and downloadable by anyone who
 * guessed the path. Nothing imports them; only this script reads them.
 */
const MASTERS = path.join(dir, "kyle");

/** pose key -> [master filename, output filename under public/onboarding/] */
const POSES = {
  default: ["kyle_default.png", "kyle-default.png"],
  flex: ["kyle_flex_smile.png", "kyle-flex.png"],
  thumbs: ["Kyle_thumbs_up_smile.png", "kyle-thumbs.png"],
  wave: ["kyle_wave.png", "kyle-wave.png"],
};

/** The pose the launch screen and the app icon both use. */
const HERO_POSE = "default";

/** Output height for the onboarding PNGs. He is displayed at most ~330 CSS px,
 *  so 900px of actual Kyle covers 3x screens with room to spare. */
const ONBOARDING_HEIGHT = 900;

// --bg-base #111110, fully opaque — same value and same caveat as generate.mjs.
// Keep in sync with app/globals.css if that token ever changes. The icons and
// the launch images use it so the app never flashes a different black.
const BG = { r: 0x11, g: 0x11, b: 0x10, alpha: 1 };

/** iOS launch images iOS exact-matches on (physical px). Must mirror the list
 *  in components/pwa/apple-splash-links.tsx.
 *
 *  NOTE: generate.mjs used to carry this list too and it was MISSING 1260x2736
 *  (the iPhone Air) — added by hand in June, never put back into the script. So
 *  running it silently left one launch image stale, which on a rebrand means one
 *  device model cold-launches into the old logo forever. Splash generation now
 *  lives ONLY here, and the drift guard in main() is what keeps it honest. */
const SPLASHES = [
  [750, 1334], [828, 1792], [1170, 2532], [1179, 2556], [1206, 2622],
  [1260, 2736], [1284, 2778], [1290, 2796], [1320, 2868],
];

const POSTER = [1080, 1920];

/** Kyle spans this fraction of the launch-image WIDTH, centred.
 *
 *  The retired splash composited a square render (Kyle on his own near-black
 *  backdrop) onto our canvas, which left a faintly visible square seam where the
 *  two near-blacks disagreed. Compositing a cutout straight onto the canvas has
 *  no seam, so this ratio is Kyle himself, not his backdrop — it is NOT the 0.58
 *  in generate.mjs, which measured a square that was mostly padding. */
const SPLASH_KYLE_WIDTH_RATIO = 0.52;

/**
 * App icons. `ratio` is Kyle's width as a fraction of the icon.
 *
 * The maskable one is deliberately smaller. Android crops a maskable icon to
 * whatever shape the launcher likes — circle, squircle, teardrop — and only the
 * centre 80% is guaranteed to survive. Kyle is widest at the fists, which sit
 * near the corners of his box, so he is scaled to keep those inside the safe
 * circle rather than to fill the square. The non-maskable icons are never
 * cropped, so he can sit larger there.
 */
const ICONS = [
  { out: [pub, "icon-192.png"], size: 192, ratio: 0.72 },
  { out: [appDir, "icon.png"], size: 512, ratio: 0.72 },
  { out: [appDir, "apple-icon.png"], size: 180, ratio: 0.72 },
  { out: [pub, "icon-maskable.png"], size: 512, ratio: 0.58, maskable: true },
];

/** favicon.ico — 48px, the size Next's convention ships. */
const FAVICON_SIZE = 48;

/** Alpha bounding box of one PNG, in its own pixel coordinates. */
async function bbox(file) {
  const { info } = await sharp(file).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  return {
    left: -info.trimOffsetLeft,
    top: -info.trimOffsetTop,
    width: info.width,
    height: info.height,
  };
}

/**
 * Wrap a PNG as a single-image .ico.
 *
 * sharp cannot write ICO, but the format has allowed a raw PNG payload per entry
 * since Vista and every browser we care about reads it. So this is the 6-byte
 * ICONDIR + one 16-byte ICONDIRENTRY, then the PNG bytes verbatim — no re-encode
 * and no dependency. Width/height bytes are 0 for 256, which is why the size is
 * masked rather than written straight.
 */
function pngToIco(png, size) {
  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(size & 0xff, 0); // width  (0 means 256)
  dirEntry.writeUInt8(size & 0xff, 1); // height (0 means 256)
  dirEntry.writeUInt8(0, 2); // palette count — 0 for truecolour
  dirEntry.writeUInt8(0, 3); // reserved
  dirEntry.writeUInt16LE(1, 4); // colour planes
  dirEntry.writeUInt16LE(32, 6); // bits per pixel
  dirEntry.writeUInt32LE(png.length, 8); // payload size
  dirEntry.writeUInt32LE(6 + 16, 12); // payload offset — header + this entry

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(1, 4); // one image

  return Buffer.concat([header, dirEntry, png]);
}

async function main() {
  // 1) One box for every pose.
  const metas = {};
  let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
  for (const [pose, [src]] of Object.entries(POSES)) {
    const file = path.join(MASTERS, src);
    const box = await bbox(file);
    const m = await sharp(file).metadata();
    metas[pose] = { file, box, m };
    L = Math.min(L, box.left);
    T = Math.min(T, box.top);
    R = Math.max(R, box.left + box.width);
    B = Math.max(B, box.top + box.height);
    console.log(
      `  ${pose.padEnd(8)} ${m.width}x${m.height}  content ${box.width}x${box.height} at ${box.left},${box.top}`,
    );
  }

  // A shared crop box only means the same thing if the masters share a canvas.
  const canvases = new Set(Object.values(metas).map(({ m }) => `${m.width}x${m.height}`));
  if (canvases.size > 1) {
    throw new Error(
      `masters differ in canvas size (${[...canvases].join(", ")}) — a shared crop box ` +
        `is only meaningful if every pose is framed on the same canvas`,
    );
  }

  const crop = { left: L, top: T, width: R - L, height: B - T };
  const { m: canvas } = Object.values(metas)[0];
  console.log(
    `\nunion crop ${crop.width}x${crop.height} at ${crop.left},${crop.top} ` +
      `(canvas ${canvas.width}x${canvas.height}) — dropping ` +
      `${(100 - (crop.height / canvas.height) * 100).toFixed(1)}% of the height\n`,
  );
  for (const [pose, { box }] of Object.entries(metas)) {
    const fill = ((box.height / crop.height) * 100).toFixed(1);
    console.log(`  ${pose.padEnd(8)} fills ${fill}% of the shared box's height`);
  }
  console.log();

  // 2) The onboarding PNGs — cut to the shared box, then to display height.
  const cut = {};
  for (const [pose, [, out]] of Object.entries(POSES)) {
    const buf = await sharp(metas[pose].file)
      .extract(crop)
      .resize({ height: ONBOARDING_HEIGHT })
      .png({ compressionLevel: 9 })
      .toBuffer();
    cut[pose] = buf;
    const om = await sharp(buf).metadata();
    await sharp(buf).toFile(path.join(pub, "onboarding", out));
    console.log(`onboarding → public/onboarding/${out} (${om.width}x${om.height})`);
  }

  // 3) Kyle centred on the canvas at a given size — launch images and icons.
  const compose = async (w, h, kyleWidth, pose = HERO_POSE) => {
    const kyle = await sharp(cut[pose]).resize({ width: Math.round(kyleWidth) }).png().toBuffer();
    const km = await sharp(kyle).metadata();
    return sharp({ create: { width: w, height: h, channels: 4, background: BG } }).composite([
      { input: kyle, left: Math.round((w - km.width) / 2), top: Math.round((h - km.height) / 2) },
    ]);
  };

  const [pw, ph] = POSTER;
  await (await compose(pw, ph, pw * SPLASH_KYLE_WIDTH_RATIO))
    .jpeg({ quality: 86, chromaSubsampling: "4:4:4" })
    .toFile(path.join(pub, "trackd-kyle-vial-splash-poster.jpg"));
  console.log(`poster → public/trackd-kyle-vial-splash-poster.jpg (${pw}x${ph})`);

  const written = new Set();
  for (const [w, h] of SPLASHES) {
    const name = `apple-splash-${w}-${h}.png`;
    await (await compose(w, h, w * SPLASH_KYLE_WIDTH_RATIO))
      .png()
      .toFile(path.join(pub, "splash", name));
    written.add(name);
  }
  console.log(`splash → public/splash/apple-splash-*.png (${SPLASHES.length} sizes)`);

  // Drift guard. A launch image we do NOT rewrite keeps whatever art it had, and
  // on a rebrand that means one device model cold-launches into the old logo
  // forever — silently, because nothing renders it but the phone that matches.
  // This is not hypothetical: generate.mjs lost 1260x2736 exactly this way.
  const stale = (await fs.readdir(path.join(pub, "splash")))
    .filter((f) => f.startsWith("apple-splash-") && !written.has(f));
  if (stale.length) {
    throw new Error(
      `public/splash has launch image(s) this script does not generate: ${stale.join(", ")}.\n` +
        `They still carry the previous art. Add the size to SPLASHES (and to ` +
        `components/pwa/apple-splash-links.tsx if a device needs it), or delete the file.`,
    );
  }

  // 4) App icons — the same hero pose, on the same black.
  for (const { out, size, ratio, maskable } of ICONS) {
    const buf = await (await compose(size, size, size * ratio)).png({ compressionLevel: 9 }).toBuffer();
    await sharp(buf).toFile(path.join(...out));
    console.log(
      `icon → ${path.relative(root, path.join(...out))} (${size}x${size}${maskable ? ", maskable safe zone" : ""})`,
    );
  }

  const favPng = await (await compose(FAVICON_SIZE, FAVICON_SIZE, FAVICON_SIZE * 0.78))
    .png({ compressionLevel: 9 })
    .toBuffer();
  await fs.writeFile(path.join(appDir, "favicon.ico"), pngToIco(favPng, FAVICON_SIZE));
  console.log(`icon → app/favicon.ico (${FAVICON_SIZE}x${FAVICON_SIZE}, PNG-in-ICO)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
