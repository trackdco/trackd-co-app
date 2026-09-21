/**
 * Brand-asset generation. Run with: `node scripts/brand/generate.mjs`
 *
 * Sources (transparent PNG masters, kept alongside this script so regeneration
 * never depends on anyone's Downloads folder):
 *   - trackd-wordmark.src.png  → the wordmark (header logo)
 *
 * Outputs (web-served from public/):
 *   - public/trackd-wordmark.png            → top-left header logo
 *
 * ## The splash images are NOT made here any more
 *
 * This script used to also composite a text mark onto the iOS launch images.
 * They have shown Kyle since June, and they are now generated — along with the
 * poster and every app icon — by `kyle.mjs`, which owns everything with the
 * mascot in it.
 *
 * They were left in BOTH places for a while, and that is exactly how
 * apple-splash-1260-2736.png (the iPhone Air) went stale: it was added by hand
 * to public/splash and to the <link> list, but never to this script's size
 * array, so every run quietly skipped it. Two scripts writing one directory is
 * how a launch image keeps the old logo through a rebrand and nobody sees it,
 * because only the one device that matches ever renders it. One owner now.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../..");
const pub = path.join(root, "public");

const LONG_SRC = path.join(dir, "trackd-wordmark.src.png");

// Header wordmark export height (px). Displayed ~20px tall, so this is retina-safe.
const HEADER_HEIGHT = 200;

async function main() {
  // Trim the transparent margins so the mark isn't lost inside its own padding,
  // then cap the height (keeps the file tiny; next/image handles the rest).
  const trimmed = await sharp(LONG_SRC).trim().png().toBuffer();
  const buf = await sharp(trimmed).resize({ height: HEADER_HEIGHT }).png().toBuffer();
  const meta = await sharp(buf).metadata();
  await sharp(buf).toFile(path.join(pub, "trackd-wordmark.png"));
  console.log(`header wordmark → public/trackd-wordmark.png (${meta.width}x${meta.height})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
