import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * THE PHONE. A PLACEHOLDER, and Adrian is replacing it tomorrow.
 *
 * He asked for it to look more realistic in the meantime (2026-09-16), so this
 * adds the things that actually make a drawn iPhone read as one: side buttons
 * on both edges, a proper pill island, a home indicator, and a second inner
 * ring so the glass sits inside the band rather than flush with it. All of it
 * is proportional, so one component serves the hero at any width.
 *
 * ⚠️ DO NOT POLISH THIS FURTHER. He has "a cool thing" for it tomorrow, and
 * the useful version of this component is whatever holds that.
 *
 * The frame band is still the one from `app-carousel.tsx`, which took it from
 * `device-frame.tsx` after he asked for a single device across the flow
 * (2026-08-14). Three stops, one direction of light. A second recipe here
 * would be a third device.
 *
 * ## ⚠️ WHAT GOES INSIDE IS MARKUP, NOT A SCREENSHOT
 *
 * `public/onboarding/app-*.png` are real captures and were the obvious fill.
 * Each bakes in the old serif wordmark, which defeats `lib/brand.ts`; each
 * carries a "Sign out" control, which is nonsense on a page for people without
 * accounts; and each names real compounds, where he asked for generic labels.
 */
export function LandingDevice({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      {/* The side buttons sit on the OUTER edge, behind the band, so they read
          as part of the case rather than as bars drawn on top of it. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 -left-[2px] w-[2px]">
        <span className="absolute left-0 top-[16%] h-[3.6%] w-full rounded-l-sm bg-gradient-to-l from-border-strong to-bg-base" />
        <span className="absolute left-0 top-[25%] h-[7%] w-full rounded-l-sm bg-gradient-to-l from-border-strong to-bg-base" />
        <span className="absolute left-0 top-[34%] h-[7%] w-full rounded-l-sm bg-gradient-to-l from-border-strong to-bg-base" />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 -right-[2px] w-[2px]">
        <span className="absolute right-0 top-[29%] h-[11%] w-full rounded-r-sm bg-gradient-to-r from-border-strong to-bg-base" />
      </div>

      <div
        className={cn(
          "relative rounded-[2.4rem] p-[5px]",
          "bg-gradient-to-b from-border-default via-bg-surface to-black",
          "shadow-[0_2px_5px_rgb(0_0_0/0.5),0_28px_60px_-22px_rgb(0_0_0/0.95)]",
        )}
      >
        {/* The chamfer: a hairline of caught light on the band's inner edge. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[2.4rem] ring-1 ring-inset ring-white/10"
        />
        <div className="relative overflow-hidden rounded-[2.05rem] bg-bg-base ring-1 ring-inset ring-black/60">
          {/* The island: a true pill, and small. Drawn too large is the single
              clearest tell of a hand-made phone. */}
          <div
            aria-hidden
            className="absolute left-1/2 top-[1.6%] z-10 h-[2.4%] w-[26%] -translate-x-1/2 rounded-full bg-black"
          />
          {children}
          {/* The home indicator. */}
          <div
            aria-hidden
            className="absolute bottom-[0.9%] left-1/2 h-[0.45%] w-[32%] -translate-x-1/2 rounded-full bg-text-primary/35"
          />
        </div>
      </div>
    </div>
  );
}
