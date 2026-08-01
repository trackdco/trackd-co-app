"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
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
 * The motion loops until the user swipes it, and then it stops for good — a
 * ring that keeps turning under a thumb that just moved it fights the person
 * using it. Looping is sanctioned here and nowhere in the app proper (see
 * `globals.css` beside the keyframe), and it all freezes under
 * `prefers-reduced-motion`.
 *
 * The phones and the labels are `aria-hidden` and `pointer-events-none`, so
 * none of them can eat a tap. Pointer events live on the RING WRAPPER (for the
 * swipe) and on the dots; both sit above the CTA, never over it.
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
      { text: "Log a dose", icon: Syringe, className: "left-1 top-1", drift: ["5px", "-6px", "8600ms"] },
      { text: "What's due today", icon: ListChecks, className: "right-1 top-14", drift: ["-5px", "7px", "10200ms"] },
      { text: "Next dose", icon: CalendarDots, className: "left-1 bottom-12", drift: ["6px", "6px", "11400ms"] },
      { text: "Injection sites", icon: Drop, className: "right-1 bottom-1", drift: ["-4px", "-8px", "9200ms"] },
    ],
  },
  {
    id: "protocol",
    src: "/onboarding/app-protocol.png",
    caption: "Everything in one place",
    labels: [
      { text: "Compounds", icon: TestTube, className: "left-1 top-1", drift: ["5px", "-7px", "9000ms"] },
      { text: "Stacks", icon: Package, className: "right-1 top-14", drift: ["-6px", "6px", "10800ms"] },
      { text: "Cycles", icon: CalendarDots, className: "left-1 bottom-12", drift: ["6px", "5px", "11000ms"] },
      { text: "Stock on hand", icon: Flask, className: "right-1 bottom-1", drift: ["-4px", "-7px", "9600ms"] },
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
      { text: "Powder and water", icon: Flask, className: "left-1 top-1", drift: ["5px", "-6px", "8800ms"] },
      { text: "Dose in units", icon: Calculator, className: "right-1 top-14", drift: ["-5px", "7px", "10400ms"] },
      { text: "Drawn to scale", icon: Syringe, className: "left-1 bottom-12", drift: ["6px", "6px", "11600ms"] },
      { text: "Any syringe size", icon: Scales, className: "right-1 bottom-1", drift: ["-4px", "-8px", "9400ms"] },
    ],
  },
  {
    id: "progress",
    src: "/onboarding/app-progress.png",
    caption: "See it change over time",
    labels: [
      { text: "Progress photos", icon: ImageSquare, className: "left-1 top-1", drift: ["5px", "-7px", "8400ms"] },
      { text: "Weight", icon: Scales, className: "right-1 top-14", drift: ["-6px", "6px", "10600ms"] },
      { text: "Bloodwork", icon: ChartLine, className: "left-1 bottom-12", drift: ["6px", "5px", "11200ms"] },
      { text: "Journal", icon: ClipboardText, className: "right-1 bottom-1", drift: ["-4px", "-8px", "9800ms"] },
    ],
  },
];

/** How far a thumb must travel before it counts as a swipe rather than a tap. */
const SWIPE_MIN_PX = 40;

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
  { x: "50%", scale: 0.72, opacity: 0.26, z: 20 },
  { x: "0%", scale: 0.6, opacity: 0, z: 10 },
  { x: "-50%", scale: 0.72, opacity: 0.26, z: 20 },
];

export function PaywallHero() {
  const [index, setIndex] = useState(0);
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
  );
  /**
   * The user has taken the ring over by swiping it (Adrian, 2026-08-01: "I
   * should also be able to swipe the carousel").
   *
   * Once they have, the auto-advance stops for good. A carousel that keeps
   * turning under a thumb that just moved it fights the person using it, and
   * this is the same rule the hook's compare slider follows: the sweep is a
   * demonstration, and the first real gesture ends it.
   */
  const [taken, setTaken] = useState(false);

  // The ring keeps ADVANCING under `prefers-reduced-motion`; what it stops
  // doing is MOVING (`TURN_MS` collapses to 0 below, and the CSS transitions
  // are already `motion-reduce:transition-none`).
  //
  // Stopping the advance entirely was measured to strand 12 of the 16 labels
  // and 3 of the 4 screenshots at `opacity: 0` — a reduced-motion user saw a
  // quarter of the pitch unless they found the dots. The setting asks for less
  // motion, not less content, and a cut is not motion.
  useEffect(() => {
    if (taken) return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % SLIDES.length),
      SLIDE_MS,
    );
    return () => window.clearInterval(id);
  }, [taken]);

  const step = (delta: number) => {
    setTaken(true);
    setIndex((i) => (i + delta + SLIDES.length) % SLIDES.length);
  };

  /** Horizontal swipe. Tracked on the wrapper, which is the only thing here
   *  that accepts pointer events; the phones and labels are all inert. */
  const drag = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const from = drag.current;
    drag.current = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    // A real horizontal swipe: far enough to be deliberate, and more sideways
    // than vertical so it never steals a scroll of the screen underneath.
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return;
    step(dx < 0 ? 1 : -1);
  };

  const active = SLIDES[index];

  return (
    // `shrink-0`: this is a fixed-height ring inside a flex column, and without
    // it a short viewport squeezed it toward nothing. Adrian could not see the
    // carousel AT ALL on his phone (2026-08-01) — not clipped, compressed.
    <div className="w-full shrink-0">
      {/* The caption. Given room to breathe above and below (Adrian,
          2026-08-01): at `mb-3` it was crowding the top of the phone and read
          as a label stuck to it rather than as a line about it. */}
      <div className="mb-5 flex h-5 items-center justify-center [@media(max-height:700px)]:mb-2" aria-hidden>
        <p
          key={active.id}
          className={cn(CARD_EYEBROW, "animate-flow-caption")}
          style={{ animationDuration: reduced ? "0ms" : `${CAPTION_MS}ms` }}
        >
          {active.caption}
        </p>
      </div>

      {/* Sized so the phone reads as the hero of the screen. The page scrolls,
          so this does not have to fight the plan cards for room. */}
      <div
        className="relative mx-auto h-[13.5rem] w-full max-w-[22rem] shrink-0 touch-pan-y select-none"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; }}
      >
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
                transitionDuration: reduced ? "0ms" : `${TURN_MS}ms`,
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
                  "paywall-label animate-flow-drift pointer-events-none absolute z-40 flex items-center gap-1.5 rounded-full bg-bg-surface/75 px-2.5 py-1.5 backdrop-blur-md",
                  "transition-opacity ease-[var(--motion-ease)] motion-reduce:transition-none",
                  on ? "opacity-100" : "opacity-0",
                  l.className,
                )}
                style={
                  {
                    transitionDuration: reduced ? "0ms" : `${CAPTION_MS}ms`,
                    "--drift-x": l.drift[0],
                    "--drift-y": l.drift[1],
                    "--drift-ms": l.drift[2],
                  } as CSSProperties
                }
              >
                <LabelIcon className="h-3 w-3 shrink-0 text-accent-amber" />
                <span className="leading-tight text-foreground">
                  {l.text}
                </span>
              </div>
            );
          }),
        )}
      </div>

      {/* Same again below: the dots were sitting on the phone's feet. */}
      <div className="mt-6 mb-2 flex items-center justify-center gap-1.5 [@media(max-height:700px)]:mt-3">
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
