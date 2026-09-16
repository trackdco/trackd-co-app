import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * THE LAPTOP, AND IT IS A PLACEHOLDER ON PURPOSE (Adrian, 2026-09-16).
 *
 * He read the page on a laptop and said it looked like a phone page stretched
 * wide, which it did: the only device on it was an iPhone. Trackd genuinely
 * runs on a laptop (shipped 2026-09-11, "one DOM, two placements"), so showing
 * one is honest rather than aspirational.
 *
 * ⚠️ HE IS REPLACING BOTH DEVICES TOMORROW with something of his own, so this
 * is deliberately cheap: a frame drawn in CSS, no image, no perspective
 * transforms, nothing to unpick. Do not polish it.
 *
 * The screen holds the SAME component the phone does, because that is what the
 * desktop app actually does. Drawing a second, wider layout here would be
 * inventing a screen the product does not have.
 */
export function LandingLaptop({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)} aria-hidden>
      {/* The lid. Same three-stop band as the phone, so the two read as one
          family rather than as two borrowed mockups. */}
      <div
        className={cn(
          "relative rounded-[0.9rem] p-[7px]",
          "bg-gradient-to-b from-border-default via-bg-surface to-black",
          "shadow-[0_2px_5px_rgb(0_0_0/0.5),0_30px_60px_-28px_rgb(0_0_0/0.9)]",
        )}
      >
        <div className="pointer-events-none absolute inset-0 rounded-[0.9rem] ring-1 ring-inset ring-white/10" />
        <div className="relative overflow-hidden rounded-[0.55rem] bg-bg-base">
          {/* The camera, a dot rather than a notch: this is a placeholder and a
              drawn notch at this size reads as a smudge. */}
          <div className="absolute left-1/2 top-[6px] z-10 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-border-strong" />
          {children}
        </div>
      </div>

      {/* The base: a shallow bar wider than the lid, with the thumb notch. */}
      <div className="relative mx-auto h-[10px] w-[108%] -translate-x-[3.7%] rounded-b-[7px] bg-gradient-to-b from-border-strong via-bg-surface to-bg-base shadow-[0_10px_18px_-12px_rgb(0_0_0/0.9)]">
        <div className="absolute left-1/2 top-0 h-[3px] w-[13%] -translate-x-1/2 rounded-b-full bg-bg-base/80" />
      </div>
    </div>
  );
}
