"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Wraps the app shell and the desktop interstitial, deciding which the viewer
 * gets purely by CSS width (the interstitial the caller passes is `hidden
 * lg:flex`; the shell is hidden at lg). It checks the pathname only to let two
 * surfaces render at every width instead of being swallowed by the phone-only
 * gate: the dev-only `/preview/*` harness, the public `/waitlist` page
 * (promoted on social), and the founder `/admin` dashboard — all of which need
 * to work on desktop too.
 *
 * `usePathname()` resolves during SSR too, so the server already emits the
 * correct branch — no hydration flash. The interstitial is passed in
 * pre-rendered (a Server Component prop), so nothing in it ships to the client.
 */
export function DesktopGate({
  children,
  interstitial,
}: {
  children: ReactNode;
  interstitial: ReactNode;
}) {
  const pathname = usePathname();

  if (
    pathname?.startsWith("/preview") ||
    pathname?.startsWith("/waitlist") ||
    pathname?.startsWith("/admin")
  ) {
    return <>{children}</>;
  }

  return (
    <>
      {/* The app — `display:contents` keeps it byte-identical below lg, then
          collapses to nothing at desktop widths. */}
      <div className="contents lg:hidden">{children}</div>
      {interstitial}
    </>
  );
}
