import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * THE PHONE THE LANDING PAGE IS BUILT AROUND.
 *
 * The frame band is lifted from `components/onboarding/app-carousel.tsx`, which
 * took it from `device-frame.tsx` after Adrian asked for one device across the
 * flow (2026-08-14: "do those same outlines in the carousel as well"). Three
 * stops, one direction of light. A second recipe here would be a third device.
 *
 * ## ⚠️ WHAT GOES INSIDE IS MARKUP, NOT A SCREENSHOT
 *
 * `public/onboarding/app-*.png` are real captures and they were the obvious
 * fill. They are wrong for this page for three reasons that have nothing to do
 * with taste: every one bakes in the old serif "trackd co" wordmark, which
 * defeats the whole point of `lib/brand.ts` (a rename would need a re-capture,
 * not an edit); each carries a "Sign out" control, which is nonsense on a page
 * for people without accounts; and they name real compounds, where Adrian asked
 * for generic labels on the public page (2026-09-16).
 *
 * Drawn markup also stays sharp at any size, weighs nothing next to 1.9 MB of
 * PNGs on mobile data, and cannot go stale the day a screen is restyled. This
 * is the same argument `hero-cards.tsx` already makes in the flow.
 */
export function LandingDevice({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-[2.4rem] p-[4px]",
        "bg-gradient-to-b from-border-default via-bg-surface to-black",
        "shadow-[0_2px_5px_rgb(0_0_0/0.5),0_28px_60px_-22px_rgb(0_0_0/0.95)]",
        className,
      )}
    >
      {/* The chamfer: a hairline of caught light on the band's inner edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[2.4rem] ring-1 ring-inset ring-white/10"
      />
      <div className="relative overflow-hidden rounded-[2.1rem] bg-bg-base">
        {/* The island. Sized as a share of the frame so one component serves
            every width the page renders it at. */}
        <div
          aria-hidden
          className="absolute left-1/2 top-[1.8%] z-10 h-[2.2%] w-[30%] -translate-x-1/2 rounded-full bg-black"
        />
        {children}
      </div>
    </div>
  );
}
