"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Phone chrome (Spec 3-01 §11 "device-frame chrome"): a bezel, a Dynamic
 * Island, a status bar and a home indicator, drawn from the same tokens as the
 * app inside it.
 *
 * Drawn rather than photographed for the same reason the containers are: a
 * screenshot of a phone cannot be themed, cannot animate, and goes stale the
 * day the app changes. It is decorative, so the whole frame is `aria-hidden`
 * except for the content passed in.
 *
 * ## It is a WHOLE phone now (Adrian, 2026-08-14)
 *
 * This used to be a bezel wrapped around whatever height its content happened
 * to be, which on the hook screen produced a squat rounded box — recognisably
 * "a device" only because of the status bar. The screen is now a fixed
 * **390×844** — the iPhone logical frame, the same ratio the paywall carousel
 * uses — and the content region flexes inside it. So the silhouette is a phone
 * before anything is drawn on it.
 *
 * Adrian asked for "9:16". A real iPhone is 9:19.5, and 9:16 (0.5625) is
 * noticeably wider and shorter than any phone shipped in the last eight years;
 * it is also the wrong shape for every screenshot in `public/onboarding/`,
 * which are all ~0.46 captures, so a 9:16 screen would crop each of them by
 * roughly 18%. 390/844 is the shape he was describing and it crops nothing.
 *
 * Size it from the OUTSIDE. The default is width-driven (`max-w-[17rem]`);
 * pass `h-full w-auto max-w-none` to make it height-driven instead, which is
 * what the hook screen does so the phone grows into whatever vertical space
 * the headline and the CTA leave behind.
 */
export function DeviceFrame({
  children,
  className,
  time = "10:10",
}: {
  children: ReactNode;
  className?: string;
  time?: string;
}) {
  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-[17rem] rounded-[2.5rem] p-[3px]",
        // THE BAND IS LIT, NOT FLAT (Adrian, 2026-08-14: "a little bit more
        // realistic ... maybe adding some shade"). A flat fill reads as a
        // rounded rectangle; what says "object" is a top edge that catches the
        // light and a bottom edge that falls away. One light source, above.
        //
        // Darkened on his second pass — it was mid-grey and read as plastic.
        // The top stop is only just lighter than the page it sits on, which is
        // the whole trick: enough separation to see the edge, not so much that
        // the phone looks lit from inside. The bottom runs to true black, below
        // the page ground, so the base of the phone reads as shadow.
        "bg-gradient-to-b from-border-default via-bg-surface to-black",
        // Two shadows, because real objects cast two: a tight contact shadow
        // that sits it ON something, and a wide ambient one for the room.
        "shadow-[0_2px_5px_rgb(0_0_0/0.55),0_24px_60px_-24px_rgb(0_0_0/0.9),0_44px_90px_-50px_rgb(0_0_0/0.85)]",
        className,
      )}
    >
      {/* The polished chamfer where the band meets the glass. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[2.5rem] ring-1 ring-inset ring-white/10"
      />

      {/* Side hardware — silent switch, the two volume keys, and power opposite.
          2px proud of the band. At this size nobody reads them as buttons; they
          just stop the silhouette being a plain rounded rectangle. Percent
          offsets, so they hold position at any frame height. */}
      <span aria-hidden className="pointer-events-none absolute -left-[2px] top-[17%] h-[3.5%] w-[2px] rounded-l-sm bg-gradient-to-l from-border-strong to-bg-base" />
      <span aria-hidden className="pointer-events-none absolute -left-[2px] top-[25%] h-[7%] w-[2px] rounded-l-sm bg-gradient-to-l from-border-strong to-bg-base" />
      <span aria-hidden className="pointer-events-none absolute -left-[2px] top-[34%] h-[7%] w-[2px] rounded-l-sm bg-gradient-to-l from-border-strong to-bg-base" />
      <span aria-hidden className="pointer-events-none absolute -right-[2px] top-[29%] h-[11%] w-[2px] rounded-r-sm bg-gradient-to-r from-border-strong to-bg-base" />

      <div className="relative flex aspect-[390/844] h-full w-full flex-col overflow-hidden rounded-[2.3rem] bg-bg-base">
        {/* Glass. One oblique sheen from the top-left, clipped by the screen's
            own rounding — the giveaway that there is something reflective in
            front of the pixels. Under 5%, so it never fights the UI beneath it.
            `z-10` to sit over the content; `pointer-events-none` so the slider
            underneath still takes a drag. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-br from-white/[0.045] via-transparent to-transparent"
        />

        {/* Status bar. DARKER THAN THE SCREEN (Adrian, 2026-08-14) — it reads as
            part of the hardware rather than as the first row of the app, which
            also stops the island floating in the middle of the content. Pure
            black under the app's own `bg-base`, so the island (also black) sits
            in a band of its own colour instead of on a lighter rectangle. */}
        <div className="relative z-20 flex h-6 shrink-0 items-center justify-between bg-black px-4">
          <span className="font-mono text-[8px] tabular-nums text-foreground">
            {time}
          </span>

          {/* Dynamic Island. BLACK, not the bezel colour it used to be — the
              island is a cutout in the glass, so it has to be darker than the
              screen around it. In the bezel's grey it read as a sticker sitting
              on top of the display. */}
          {/* The ring is doing real work now the band behind it is also black:
              without it the island is black on black and simply disappears,
              which is what a real phone does with a dark app but costs a mock
              its most recognisable cue. A hairline edge is what the glass gives
              you in life anyway. */}
          <span
            aria-hidden
            className="absolute left-1/2 top-[3px] h-[1.05rem] w-[3.6rem] -translate-x-1/2 rounded-full bg-black ring-1 ring-inset ring-white/[0.07]"
          />

          {/* A REAL BATTERY, and reception (Adrian, 2026-08-14). This was two
              grey rectangles standing in for "some status icons"; at this size
              they read as smudges, and a smudge in the corner of a hero shot is
              the kind of thing that makes a mock look unfinished.

              Drawn from divs rather than taken from the Phosphor barrel on
              purpose. Those are APP iconography and render at light stroke
              weight under the icon provider; a status battery is device chrome
              with a specific silhouette — squared shell, terminal nub, solid
              fill — and a light-stroke pill next to it looks like neither. This
              is the same technique the island and home indicator already use. */}
          {/* SCALED TO THE PHONE, not to legibility (Adrian, 2026-08-14: "way
              smaller, that's not how a phone has it formatted").

              Apple's status battery is 27×13pt on a 390pt screen — 6.9% of the
              width. This frame renders around 177px wide, so the battery is
              ~12×6px and the bars are 1.5px. The first pass was drawn at a size
              you could comfortably read, which is exactly why it looked wrong:
              real status icons are almost too small to see, and any status bar
              you can actually read is a status bar drawn at the wrong scale.
              The time and the bar height came down with them for the same
              reason. */}
          <span aria-hidden className="flex items-end gap-[2px]">
            {/* Reception, four ascending bars. */}
            <span className="flex items-end gap-[1px]">
              <span className="block w-[1.5px] rounded-[0.5px] bg-foreground" style={{ height: "2px" }} />
              <span className="block w-[1.5px] rounded-[0.5px] bg-foreground" style={{ height: "3px" }} />
              <span className="block w-[1.5px] rounded-[0.5px] bg-foreground" style={{ height: "4px" }} />
              <span className="block w-[1.5px] rounded-[0.5px] bg-text-subtle" style={{ height: "5px" }} />
            </span>

            {/* Battery: shell, fill, terminal. */}
            <span className="relative ml-[2px] flex h-[6px] w-[11px] items-center rounded-[1.5px] border-[0.5px] border-text-muted p-[1px]">
              <span className="block h-full w-[64%] rounded-[0.5px] bg-foreground" />
              <span className="absolute -right-[2px] top-1/2 block h-[2.5px] w-[1px] -translate-y-1/2 rounded-r-[0.5px] bg-text-muted" />
            </span>
          </span>
        </div>

        {/* The app. `min-h-0` so a tall child scrolls or clips inside the phone
            rather than stretching it out of shape. */}
        <div className="relative min-h-0 flex-1">{children}</div>

        {/* Home indicator */}
        <div className="flex h-5 shrink-0 items-center justify-center">
          <span
            aria-hidden
            className="block h-[3px] w-24 rounded-full bg-text-subtle"
          />
        </div>
      </div>
    </div>
  );
}
