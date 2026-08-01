"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Image from "next/image";

import {
  Calculator,
  CalendarDots,
  ChartLine,
  ClipboardText,
  Drop,
  Flask,
  ImageSquare,
  ListChecks,
  Package,
  Scales,
  Syringe,
  TestTube,
  type Icon,
} from "@/components/icons";
import { CARD_EYEBROW } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

/**
 * The paywall hero: four real screens of the app on a rotating RING (Adrian,
 * 2026-08-01).
 *
 * Not a cross-fade in a fixed frame, which is what this was first and what he
 * corrected. Four phones exist at once in four positions, and the whole ring
 * turns by one place:
 *
 *        back (behind, hidden)
 *   left        FRONT        right
 *
 *   front -> left     left -> back
 *   right -> front    back -> right
 *
 * So you always see the current screen flanked by the one that just left and
 * the one about to arrive, both dimmed and scaled back. It is the movement
 * that sells it: a card sliding into the middle reads as an app you are being
 * shown through, where a cross-fade reads as a slideshow.
 *
 * Every screen is an actual capture of the app from the `/preview/*` harness,
 * not a drawing of one. **Recapture the PNGs when a screen changes** or this
 * quietly goes stale; the script hides the preview badge and strips the name
 * out of the greeting, because this is shown to strangers and must not greet
 * them as somebody else.
 *
 * The motion loops. That is sanctioned here and nowhere in the app proper (see
 * `globals.css` beside the keyframe). Everything is `aria-hidden` and
 * `pointer-events-none` except the dots, so none of it can eat a tap meant for
 * the CTA, and it all freezes under `prefers-reduced-motion`.
 */

interface Slide {
  id: string;
  src: string;
  caption: string;
  labels: { text: string; icon: Icon; className: string; drift: [string, string, string] }[];
}

const SLIDES: Slide[] = [
  {
    id: "home",
    src: "/onboarding/app-home.png",
    caption: "Track the protocol",
    labels: [
      { text: "Log a dose", icon: Syringe, className: "left-0 top-2", drift: ["5px", "-6px", "8600ms"] },
      { text: "What's due today", icon: ListChecks, className: "right-0 top-16", drift: ["-5px", "7px", "10200ms"] },
      { text: "Next dose", icon: CalendarDots, className: "left-0 bottom-14", drift: ["6px", "6px", "11400ms"] },
      { text: "Injection sites", icon: Drop, className: "right-0 bottom-2", drift: ["-4px", "-8px", "9200ms"] },
    ],
  },
  {
    id: "protocol",
    src: "/onboarding/app-protocol.png",
    caption: "Everything in one place",
    labels: [
      { text: "Compounds", icon: TestTube, className: "left-0 top-2", drift: ["5px", "-7px", "9000ms"] },
      { text: "Stacks", icon: Package, className: "right-0 top-16", drift: ["-6px", "6px", "10800ms"] },
      { text: "Cycles", icon: CalendarDots, className: "left-0 bottom-14", drift: ["6px", "5px", "11000ms"] },
      { text: "Stock on hand", icon: Flask, className: "right-0 bottom-2", drift: ["-4px", "-7px", "9600ms"] },
    ],
  },
  {
    id: "calculator",
    src: "/onboarding/app-calculator.png",
    // NOT "never do the maths". Adrian killed that and he was right: for a
    // dosing tool it reads as "do not check your work", which is the last
    // thing this app should ever imply. This states what it does and stops.
    caption: "Powder to units",
    labels: [
      { text: "Powder and water", icon: Flask, className: "left-0 top-2", drift: ["5px", "-6px", "8800ms"] },
      { text: "Dose in units", icon: Calculator, className: "right-0 top-16", drift: ["-5px", "7px", "10400ms"] },
      { text: "Drawn to scale", icon: Syringe, className: "left-0 bottom-14", drift: ["6px", "6px", "11600ms"] },
      { text: "Any syringe size", icon: Scales, className: "right-0 bottom-2", drift: ["-4px", "-8px", "9400ms"] },
    ],
  },
  {
    id: "progress",
    src: "/onboarding/app-progress.png",
    caption: "See it change over time",
    labels: [
      { text: "Progress photos", icon: ImageSquare, className: "left-0 top-2", drift: ["5px", "-7px", "8400ms"] },
      { text: "Weight", icon: Scales, className: "right-0 top-16", drift: ["-6px", "6px", "10600ms"] },
      { text: "Bloodwork", icon: ChartLine, className: "left-0 bottom-14", drift: ["6px", "5px", "11200ms"] },
      { text: "Journal", icon: ClipboardText, className: "right-0 bottom-2", drift: ["-4px", "-8px", "9800ms"] },
    ],
  },
];

const SLIDE_MS = 4600;
/** The turn. Slow on purpose: the movement IS the thing being watched. */
const TURN_MS = 900;
/** The caption's cross-fade, longer again so it never snaps. */
const CAPTION_MS = 1200;

/**
 * Where a slide sits, by its distance from the active one.
 * 0 front · 1 right · 2 back · 3 left — so advancing by one moves
 * front→left, right→front, back→right, left→back, exactly as described.
 */
const RING = [
  { x: "0%", scale: 1, opacity: 1, z: 30 },
  { x: "54%", scale: 0.78, opacity: 0.42, z: 20 },
  { x: "0%", scale: 0.6, opacity: 0, z: 10 },
  { x: "-54%", scale: 0.78, opacity: 0.42, z: 20 },
];

export function PaywallHero() {
  const [index, setIndex] = useState(0);
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
  );

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % SLIDES.length),
      SLIDE_MS,
    );
    return () => window.clearInterval(id);
  }, [reduced]);

  const active = SLIDES[index];

  return (
    // `shrink-0`: this is a fixed-height ring inside a flex column, and without
    // it a short viewport squeezed it toward nothing. Adrian could not see the
    // carousel AT ALL on his phone (2026-08-01) — not clipped, compressed.
    <div className="w-full shrink-0">
      {/* The caption. Given room to breathe above and below (Adrian,
          2026-08-01): at `mb-3` it was crowding the top of the phone and read
          as a label stuck to it rather than as a line about it. */}
      <div className="mb-5 flex h-5 items-center justify-center" aria-hidden>
        <p
          key={active.id}
          className={cn(CARD_EYEBROW, "animate-flow-caption")}
          style={{ animationDuration: `${CAPTION_MS}ms` }}
        >
          {active.caption}
        </p>
      </div>

      {/* Sized so the trial CTA clears the fold. It was 19rem, which pushed the
          primary action 145px below the bottom of a 390x844 phone — you had to
          scroll to find the button the whole screen exists for. Then 15rem,
          which held until the tick list and the extra caption/dot spacing went
          in on 2026-08-01 and put it 21px under again (measured at 360, 390 and
          430). This screen's budget is fixed: anything added below the ring has
          to come out of the ring. */}
      <div className="relative mx-auto h-[13.5rem] w-full max-w-[22rem] shrink-0">
        {/* A pool of light under the front phone. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--accent-amber) 16%, transparent), transparent 70%)",
          }}
        />

        {/* The ring. Four phones, always all four, moving between positions. */}
        {SLIDES.map((slide, i) => {
          const pos = RING[(i - index + SLIDES.length) % SLIDES.length];
          return (
            <div
              key={slide.id}
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 w-[7.75rem] rounded-[1.5rem] bg-bg-surface-raised p-[3px] shadow-[0_28px_60px_-22px_rgb(0_0_0/0.95)] transition-all ease-[var(--motion-ease)] motion-reduce:transition-none"
              style={{
                transitionDuration: `${TURN_MS}ms`,
                transform: `translate(-50%, -50%) translateX(${pos.x}) scale(${pos.scale})`,
                opacity: pos.opacity,
                zIndex: pos.z,
              }}
            >
              <div className="relative aspect-[390/760] overflow-hidden rounded-[1.35rem]">
                <Image
                  src={slide.src}
                  alt=""
                  fill
                  sizes="180px"
                  // All four are on screen at once in the ring, so all four are
                  // above the fold. Priority on one of them is a lie the
                  // LCP heuristic calls out.
                  priority
                  className="object-cover object-top"
                />
              </div>
            </div>
          );
        })}

        {/* The labels belong to whichever screen is at the front. */}
        {SLIDES.map((slide) =>
          slide.labels.map((l) => {
            const LabelIcon = l.icon;
            const on = slide.id === active.id;
            return (
              <div
                key={`${slide.id}-${l.text}`}
                aria-hidden
                className={cn(
                  "animate-flow-drift pointer-events-none absolute z-40 flex max-w-[8rem] items-center gap-2 rounded-full bg-bg-surface/90 px-3 py-2 backdrop-blur-sm",
                  "shadow-[0_10px_26px_-14px_rgb(0_0_0/0.9)]",
                  "transition-opacity ease-[var(--motion-ease)] motion-reduce:transition-none",
                  on ? "opacity-100" : "opacity-0",
                  l.className,
                )}
                style={
                  {
                    transitionDuration: `${CAPTION_MS}ms`,
                    "--drift-x": l.drift[0],
                    "--drift-y": l.drift[1],
                    "--drift-ms": l.drift[2],
                  } as CSSProperties
                }
              >
                <LabelIcon className="h-3.5 w-3.5 shrink-0 text-accent-amber" />
                <span className="text-[10px] leading-tight text-foreground">
                  {l.text}
                </span>
              </div>
            );
          }),
        )}
      </div>

      {/* Same again below: the dots were sitting on the phone's feet. */}
      <div className="mt-6 mb-2 flex items-center justify-center gap-1.5">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.id}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show ${slide.caption}`}
            className={cn(
              "h-1.5 rounded-full transition-all duration-[var(--motion-base)] ease-[var(--motion-ease)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
              i === index ? "w-5 bg-accent-amber" : "w-1.5 bg-border-strong",
            )}
          />
        ))}
      </div>
    </div>
  );
}
