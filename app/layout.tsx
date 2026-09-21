import type { Metadata, Viewport } from "next";
import { Caveat, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { IconProvider } from "@/components/providers/icon-provider";
import { AppleSplashLinks } from "@/components/pwa/apple-splash-links";
import { PressFeedback } from "@/components/feel/PressFeedback";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * A THIRD typeface, and the only one, for exactly one line: the founders' names
 * at the foot of the onboarding letter (Adrian, 2026-08-01).
 *
 * `ui-context.md` ships two faces and retired the display serif outright, so
 * this is a deliberate exception rather than an oversight — see the note there.
 * It is scoped by the variable: nothing in the app proper references
 * `--font-hand`, and it must stay that way. A handwriting face on a dose figure
 * or a card title is the drift the two-face rule exists to prevent.
 *
 * `next/font` self-hosts it at build time, so there is no runtime request to
 * Google and nothing for the CSP to allow.
 */
const caveat = Caveat({
  variable: "--font-hand",
  subsets: ["latin"],
  weight: ["600"],
});

export const metadata: Metadata = {
  title: "Trakabl",
  description:
    "Track peptide, anabolic, supplement, and hormone-optimisation protocols in one place.",
  // PWA: link the manifest (app/manifest.ts) and tell iOS Safari this is a
  // standalone web app so "Add to Home Screen" launches chromeless with our
  // icon/title and a status bar that matches the near-black canvas.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Trakabl",
    statusBarStyle: "black-translucent",
  },
};

// Native-app wiring: match the status bar to the near-black canvas and enable
// the safe-area insets the entry screen relies on (viewport-fit=cover).
export const viewport: Viewport = {
  themeColor: "#111110",
  colorScheme: "dark",
  viewportFit: "cover",
  // App feel: no pinch-zoom and, crucially, no iOS auto-zoom when focusing an
  // input under 16px (which zoomed in and wouldn't zoom back out).
  maximumScale: 1,
  userScalable: false,
};

/**
 * ## THE PHONE-ONLY GATE IS GONE (2026-09-10, Adrian's call)
 *
 * Until now this layout wrapped the app in `DesktopGate`: at >=1024px the whole
 * shell was hidden and a "grab your phone to use Trakabl" interstitial stood in
 * its place, for signed-in users too. That was the correct call while there was
 * no desktop design. There is one now (`app/desktop.css` + `components/desktop/`),
 * so the wall has nothing left to do and keeping it would mean shipping a laptop
 * app behind a sign saying laptops are not supported.
 *
 * Removed rather than disabled, deliberately: a gate left in place behind a flag
 * is a gate somebody re-enables by accident. `desktop-interstitial.tsx` and
 * `desktop-gate.tsx` are deleted with it; the QR code that was its one genuinely
 * useful part now lives in Profile, where somebody on a laptop can actually go
 * looking for it (`components/profile/InstallAppRow.tsx`).
 *
 * The `getCurrentUser()` call went with it. It existed only to pick which of the
 * interstitial's two variants to show, so a logged-in page load no longer
 * verifies the session twice.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* iOS launch images — React hoists these <link> tags into <head>.
            This native launch image IS the splash: iOS shows Kyle the vial once
            on cold launch, then hands off straight to the app. There is no
            in-app splash overlay (it caused a second Kyle "come-up" after the
            native one). */}
        <AppleSplashLinks />

        {/* Phosphor stroke weight is set once here for every icon in the app. */}
        <IconProvider>{children}</IconProvider>
        {/* The press system's one listener (feel pass §2). Renders nothing; a
            screen opts in per element with a `press-*` class. */}
        <PressFeedback />
      </body>
    </html>
  );
}
