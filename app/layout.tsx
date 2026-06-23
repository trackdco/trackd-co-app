import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import Image from "next/image";
import "./globals.css";

import { SplashScreen } from "@/app/_components/splash-screen";
import { AppleSplashLinks } from "@/components/pwa/apple-splash-links";
import { DesktopGate } from "@/components/pwa/desktop-gate";
import { DesktopInterstitial } from "@/components/pwa/desktop-interstitial";
import { getCurrentUser } from "@/lib/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Serif display face for headings and the wordmark (see Context/ui-context.md).
// Load real display weights so the high-contrast Didone actually shows (default
// 400 renders flat). Italic enabled for editorial emphasis on key heading words.
const playfairDisplay = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700", "900"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Trackd Co",
  description:
    "Track peptide, anabolic, supplement, and hormone-optimisation protocols in one place.",
  // PWA: link the manifest (app/manifest.ts) and tell iOS Safari this is a
  // standalone web app so "Add to Home Screen" launches chromeless with our
  // icon/title and a status bar that matches the near-black canvas.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Trackd",
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Trackd is a phone-only PWA. At ≥1024px the whole app shell is hidden and
  // the desktop interstitial stands in — even for signed-in users, who get the
  // "welcome back" variant. `display:contents` means the wrapper is invisible
  // to layout on mobile (the app renders exactly as before) and collapses to
  // nothing at lg. One verified `getUser()` (cached) picks the variant.
  const user = await getCurrentUser();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${playfairDisplay.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* iOS launch images — React hoists these <link> tags into <head>. */}
        <AppleSplashLinks />

        {/* Full-screen Kyle-the-vial video splash; fades into the app once
            loaded. Sits above everything on the near-black canvas. */}
        <SplashScreen />

        {/* The app below lg; the "go to your phone" interstitial at ≥1024px. */}
        <DesktopGate
          interstitial={
            <DesktopInterstitial
              className="hidden lg:flex"
              returning={Boolean(user)}
              logo={
                <Image
                  src="/trackd-wordmark.png"
                  alt="trackd co"
                  width={1049}
                  height={200}
                  priority
                  className="h-5 w-auto"
                />
              }
            />
          }
        >
          {children}
        </DesktopGate>
      </body>
    </html>
  );
}
