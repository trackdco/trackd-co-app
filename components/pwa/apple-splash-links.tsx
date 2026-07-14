/**
 * iOS PWA launch (splash) images.
 *
 * iOS does NOT auto-generate a splash from the web manifest (that's Android-only),
 * so an installed Trackd PWA shows a blank #111110 screen on launch unless we
 * provide `apple-touch-startup-image` links. iOS exact-matches on logical
 * width/height/DPR/orientation — no closest-match, no scaling — so we enumerate
 * every modern iPhone. `media` is in LOGICAL points; the PNG is PHYSICAL pixels
 * (logical × DPR). Each PNG has the Trackd mark baked onto #111110.
 *
 * Each PNG shows Kyle the vial fit (object-contain) into the device's physical
 * resolution and letterboxed on pure black. This launch image IS the splash:
 * iOS holds it from cold launch until the app paints, then hands off straight to
 * the app on its near-black (#111110) canvas — one Kyle "come-up", no in-app
 * overlay after it. The letterbox is pure black, so it's invisible against the
 * canvas.
 *
 * Rendered from the root layout; React hoists these <link> tags into <head>.
 * Portrait-only (an installed PWA cold-launches in portrait virtually always).
 */
const SPLASHES = [
  { w: 375, h: 667, dpr: 2, file: "750-1334" }, // SE 2nd/3rd
  { w: 414, h: 896, dpr: 2, file: "828-1792" }, // 11 / XR
  { w: 390, h: 844, dpr: 3, file: "1170-2532" }, // 12/13/14, 12/13 Pro, 16e
  { w: 393, h: 852, dpr: 3, file: "1179-2556" }, // 14 Pro, 15, 15 Pro, 16
  { w: 402, h: 874, dpr: 3, file: "1206-2622" }, // 16 Pro, 17, 17 Pro
  { w: 420, h: 912, dpr: 3, file: "1260-2736" }, // iPhone Air (17 gen)
  { w: 428, h: 926, dpr: 3, file: "1284-2778" }, // 14 Plus
  { w: 430, h: 932, dpr: 3, file: "1290-2796" }, // 14/15 Pro Max, 15/16 Plus
  { w: 440, h: 956, dpr: 3, file: "1320-2868" }, // 16 Pro Max, 17 Pro Max
] as const;

export function AppleSplashLinks() {
  return (
    <>
      {/* iOS needs the LEGACY capable meta to run standalone + honour the launch
          images below. Next 16's appleWebApp.capable only emits the modern
          `mobile-web-app-capable`, so add the apple- one explicitly. */}
      <meta name="apple-mobile-web-app-capable" content="yes" />
      {SPLASHES.map(({ w, h, dpr, file }) => (
        <link
          key={file}
          rel="apple-touch-startup-image"
          href={`/splash/apple-splash-${file}.png`}
          media={`screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`}
        />
      ))}
    </>
  );
}
