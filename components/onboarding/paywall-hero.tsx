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
import { cn } from "@/lib/utils";

/**
 * The paywall hero: a carousel of the REAL app, four screens deep (Adrian,
 * 2026-08-01).
 *
 * Each screen is an actual capture of the app, not a drawing of one, taken
 * from the `/preview/*` harness (which renders the real components against
 * mock data). Four labels orbit the phone naming what that screen does, and a
 * caption above it says the one thing that screen is for. All three change
 * together, on a long cross-fade, and it advances on its own.
 *
 * **Recapture the PNGs when a screen changes** or this quietly goes stale. The
 * capture script lives with the review harness (`shot-screens.mjs`): it hides
 * the preview badge and strips the name out of the greeting, because this is
 * shown to strangers and must not greet them as someone else.
 *
 * The motion loops. That is sanctioned here and nowhere in the app proper; the
 * reasoning is in `globals.css` beside the keyframe. Every layer is
 * `aria-hidden` and `pointer-events-none`, so none of it can eat a tap meant
 * for the CTA, and the whole thing freezes under `prefers-reduced-motion`.
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
      { text: "Log a dose", icon: Syringe, className: "-left-2 top-4", drift: ["5px", "-6px", "8600ms"] },
      { text: "What's due today", icon: ListChecks, className: "-right-2 top-20", drift: ["-5px", "7px", "10200ms"] },
      { text: "Next dose", icon: CalendarDots, className: "-left-3 bottom-20", drift: ["6px", "6px", "11400ms"] },
      { text: "Injection sites", icon: Drop, className: "-right-3 bottom-6", drift: ["-4px", "-8px", "9200ms"] },
    ],
  },
  {
    id: "protocol",
    src: "/onboarding/app-protocol.png",
    caption: "Build the plan",
    labels: [
      { text: "Compounds", icon: TestTube, className: "-left-2 top-4", drift: ["5px", "-7px", "9000ms"] },
      { text: "Stacks", icon: Package, className: "-right-2 top-20", drift: ["-6px", "6px", "10800ms"] },
      { text: "Cycles", icon: CalendarDots, className: "-left-3 bottom-20", drift: ["6px", "5px", "11000ms"] },
      { text: "Stock on hand", icon: Flask, className: "-right-3 bottom-6", drift: ["-4px", "-7px", "9600ms"] },
    ],
  },
  {
    id: "calculator",
    src: "/onboarding/app-calculator.png",
    caption: "Never do the maths",
    labels: [
      { text: "Powder and water", icon: Flask, className: "-left-2 top-4", drift: ["5px", "-6px", "8800ms"] },
      { text: "Dose in units", icon: Calculator, className: "-right-2 top-20", drift: ["-5px", "7px", "10400ms"] },
      { text: "Drawn to scale", icon: Syringe, className: "-left-3 bottom-20", drift: ["6px", "6px", "11600ms"] },
      { text: "Any syringe size", icon: Scales, className: "-right-3 bottom-6", drift: ["-4px", "-8px", "9400ms"] },
    ],
  },
  {
    id: "progress",
    src: "/onboarding/app-progress.png",
    caption: "See it change over time",
    labels: [
      { text: "Progress photos", icon: ImageSquare, className: "-left-2 top-4", drift: ["5px", "-7px", "8400ms"] },
      { text: "Weight", icon: Scales, className: "-right-2 top-20", drift: ["-6px", "6px", "10600ms"] },
      { text: "Bloodwork", icon: ChartLine, className: "-left-3 bottom-20", drift: ["6px", "5px", "11200ms"] },
      { text: "Journal", icon: ClipboardText, className: "-right-3 bottom-6", drift: ["-4px", "-8px", "9800ms"] },
    ],
  },
];

/** Long enough to read the caption and take in the screen. */
const SLIDE_MS = 4200;
/** The cross-fade. Deliberately slow: Adrian asked for a long, eased fade. */
const FADE_MS = 1100;

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

  return (
    <div className="w-full">
      {/* The caption. Its own cross-fade, keyed so it replays per slide. */}
      <div className="mb-3 flex h-5 items-center justify-center" aria-hidden>
        <p
          key={SLIDES[index].id}
          className="text-[10px] font-sans uppercase tracking-[0.18em] text-text-muted"
          style={{ animation: `flow-caption ${FADE_MS}ms var(--motion-ease) both` }}
        >
          {SLIDES[index].caption}
        </p>
      </div>

      <div className="relative mx-auto h-[19rem] w-full max-w-[22rem]">
        {/* A pool of light behind the phone so it sits in space. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--accent-amber) 16%, transparent), transparent 70%)",
          }}
        />

        {/* The phone. One frame, the screens cross-fading inside it, so the
            device itself never moves. */}
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 w-[10.5rem] -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] bg-bg-surface-raised p-[3px] shadow-[0_28px_60px_-22px_rgb(0_0_0/0.95)]"
        >
          <div className="relative aspect-[390/760] overflow-hidden rounded-[1.6rem]">
            {SLIDES.map((slide, i) => (
              <Image
                key={slide.id}
                src={slide.src}
                alt=""
                fill
                sizes="180px"
                priority={i === 0}
                className={cn(
                  "object-cover object-top transition-opacity ease-[var(--motion-ease)] motion-reduce:transition-none",
                  i === index ? "opacity-100" : "opacity-0",
                )}
                style={{ transitionDuration: `${FADE_MS}ms` }}
              />
            ))}
          </div>
        </div>

        {/* The labels for the current screen. */}
        {SLIDES.map((slide) =>
          slide.labels.map((l) => {
            const LabelIcon = l.icon;
            const on = slide.id === SLIDES[index].id;
            return (
              <div
                key={`${slide.id}-${l.text}`}
                aria-hidden
                className={cn(
                  "animate-flow-drift pointer-events-none absolute flex max-w-[8.5rem] items-center gap-2 rounded-full bg-bg-surface/90 px-3 py-2 backdrop-blur-sm",
                  "shadow-[0_10px_26px_-14px_rgb(0_0_0/0.9)]",
                  "transition-opacity ease-[var(--motion-ease)] motion-reduce:transition-none",
                  on ? "opacity-100" : "opacity-0",
                  l.className,
                )}
                style={
                  {
                    transitionDuration: `${FADE_MS}ms`,
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

      {/* Where you are in the loop. Also the only affordance saying it moves. */}
      <div className="mt-2 flex items-center justify-center gap-1.5">
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
