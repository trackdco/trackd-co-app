import Image from "next/image";
import { notFound } from "next/navigation";

import { DesktopInterstitial } from "@/components/pwa/desktop-interstitial";

/**
 * DEV-ONLY preview of the desktop interstitial — signed-in "welcome back"
 * variant. Viewable at any width without signing in (the /preview harness opts
 * out of the gate). 404s in production. Sibling: /preview/desktop.
 */
export default function DesktopInterstitialReturningPreview() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <DesktopInterstitial
      className="flex"
      returning
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
