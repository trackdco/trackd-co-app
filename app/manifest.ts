import type { MetadataRoute } from "next";

/**
 * PWA web app manifest (Next.js 16 `app/manifest.ts` file convention — served at
 * /manifest.webmanifest). Makes Trackd installable to the home screen as a
 * standalone app on Android/Chrome; iOS uses this plus the apple-touch-icon and
 * the appleWebApp metadata in app/layout.tsx.
 *
 * Colours mirror the near-black canvas (--bg-base #111110) so the splash and
 * status bar match the app. Icons reuse the existing app/ icon files.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trackd Co",
    short_name: "Trackd",
    description:
      "Track peptide, anabolic, supplement, and hormone-optimisation protocols in one place.",
    // Installed app opens straight to /dashboard (the guard sends a logged-out
    // or un-gated user on to /login or /welcome). Skips the /->/dashboard
    // redirect on launch — one fewer round-trip, and iOS keeps the launch image
    // up through a single navigation instead of dropping it on the redirect.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // background_color is --bg-base (matches the launch-splash PNG canvas).
    background_color: "#111110",
    // theme_color is --bg-surface (the nav colour): iOS paints the uncovered
    // bottom strip on a standalone launch from the theme-color, so matching it to
    // the nav makes that strip blend in rather than read as a black bar.
    theme_color: "#1c1c1a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Dedicated maskable icon (mark inside the safe zone on #111110) so adaptive-
      // icon devices show an edge-to-edge icon, not the mark inside a white plate.
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
