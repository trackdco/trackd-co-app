import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";

import { AppleSplashLinks } from "@/components/pwa/apple-splash-links";

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

// Native-app wiring: theme-color + safe-area insets (viewport-fit=cover).
// theme-color is --bg-surface (the nav colour), NOT --bg-base: on a standalone
// iOS launch the web view comes up ~62px shorter than the screen and iOS paints
// the uncovered bottom strip from the theme-color. Matching it to the nav makes
// that strip blend into the nav instead of reading as a black bar.
export const viewport: Viewport = {
  themeColor: "#1c1c1a",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${playfairDisplay.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* iOS launch images — React hoists these <link> tags into <head>. */}
        <AppleSplashLinks />
        {children}
      </body>
    </html>
  );
}
