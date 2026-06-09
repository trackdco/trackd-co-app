/**
 * Brand-asset generation. Run with: `node scripts/brand/generate.mjs`
 *
 * Sources (transparent PNG masters, kept alongside this script so regeneration
 * never depends on anyone's Downloads folder):
 *   - trackd-wordmark.src.png  → the long "trackd co" wordmark (header logo)
 *   - trackd-mark.src.png      → the short "Trackd" mark (launch/splash logo)
 *
 * Outputs (web-served from public/):
 *   - public/trackd-wordmark.png            → top-left header logo
 *   - public/splash/apple-splash-*.png      → iOS launch images (mark on #111110)
 *
 * The near-black canvas is --bg-base (#111110) — see app/globals.css. Keep these
 * in sync if that token ever changes.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../..");
const pub = path.join(root, "public");

const LONG_SRC = path.join(dir, "trackd-wordmark.src.png"); // "trackd co"
const SHORT_SRC = path.join(dir, "trackd-mark.src.png"); // "Trackd"

// --bg-base #111110, fully opaque.
const BG = { r: 0x11, g: 0x11, b: 0x10, alpha: 1 };

// iOS launch images iOS exact-matches on (physical px). Must mirror the list in
// components/pwa/apple-splash-links.tsx.
const SPLASHES = [
  [750, 1334],
  [828, 1792],
  [1170, 2532],
  [1179, 2556],
  [1206, 2622],
  [1284, 2778],
  [1290, 2796],
  [1320, 2868],
];

// The mark spans this fraction of the splash width (centred).
const SPLASH_MARK_WIDTH_RATIO = 0.58;
// Header wordmark export height (px). Displayed ~20px tall, so this is retina-safe.
const HEADER_HEIGHT = 200;

async function main() {
  // 1) Header wordmark — trim transparent margins so it isn't lost in padding,
  //    then cap the height (keeps the file tiny; next/image handles the rest).
  const longTrimmed = await sharp(LONG_SRC).trim().png().toBuffer();
  const headerBuf = await sharp(longTrimmed)
    .resize({ height: HEADER_HEIGHT })
    .png()
    .toBuffer();
  const headerMeta = await sharp(headerBuf).metadata();
  await sharp(headerBuf).toFile(path.join(pub, "trackd-wordmark.png"));
  console.log(
    `header wordmark → public/trackd-wordmark.png (${headerMeta.width}x${headerMeta.height})`,
  );

  // 2) Splash images — short mark, trimmed, centred on the near-black canvas.
  const shortTrimmed = await sharp(SHORT_SRC).trim().png().toBuffer();
  for (const [w, h] of SPLASHES) {
    const markW = Math.round(w * SPLASH_MARK_WIDTH_RATIO);
    const mark = await sharp(shortTrimmed).resize({ width: markW }).png().toBuffer();
    const markMeta = await sharp(mark).metadata();
    const out = await sharp({
      create: { width: w, height: h, channels: 4, background: BG },
    })
      .composite([
        {
          input: mark,
          left: Math.round((w - markMeta.width) / 2),
          top: Math.round((h - markMeta.height) / 2),
        },
      ])
      .png()
      .toBuffer();
    await sharp(out).toFile(path.join(pub, "splash", `apple-splash-${w}-${h}.png`));
  }
  console.log(`splash → public/splash/apple-splash-*.png (${SPLASHES.length} sizes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
