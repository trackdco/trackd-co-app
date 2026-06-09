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
    // --bg-surface (the bottom-nav colour), NOT --bg-base. On a standalone iOS
    // launch the web view can come up shorter than the screen and iOS paints the
    // uncovered bottom strip with this colour; matching it to the nav surface
    // makes that strip blend into the nav instead of reading as a black bar. The
    // launch splash is a full-screen PNG (#111110), so it's unaffected.
    background_color: "#1c1c1a",
    theme_color: "#111110",
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
