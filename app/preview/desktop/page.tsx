import Image from "next/image";
import { notFound } from "next/navigation";

import { DesktopInterstitial } from "@/components/pwa/desktop-interstitial";

/**
 * DEV-ONLY preview of the desktop interstitial — logged-out variant. Viewable
 * at any width without signing in (the /preview harness opts out of the gate).
 * 404s in production so it never ships. Sibling: /preview/desktop-returning.
 */
export default function DesktopInterstitialPreview() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <DesktopInterstitial
      className="flex"
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
  );
}
