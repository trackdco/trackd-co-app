"use client";

import type { CSSProperties } from "react";
import Image from "next/image";

import {
  Calculator,
  ChartLine,
  Package,
  Syringe,
} from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * The paywall hero: the real app on a phone, with what you get floating around
 * it (Adrian, 2026-08-01).
 *
 * The screen inside the phone is an ACTUAL SCREENSHOT of the dashboard, not a
 * drawing of one. `public/onboarding/app-home.png` is captured from
 * `/preview/home` (the dev harness that renders the real `HomeScreen` against
 * mock data), so it is the genuine article and it costs nothing at runtime.
 * **Recapture it when the dashboard changes** or this screen quietly goes
 * stale; the capture script lives with the review harness.
 *
 * The drift loops, and it is the only looping animation in the codebase; the
 * reasoning and the limits are in `globals.css` next to the keyframe. Every
 * decorative layer is `aria-hidden` and `pointer-events-none`, so none of it
 * can intercept a tap meant for the CTA.
 */

const FEATURES = [
  {
    label: "Unlimited cycles and stock",
    icon: Package,
    className: "-left-1 top-2",
    drift: { x: "5px", y: "-6px", ms: "8600ms" },
  },
  {
    label: "Reconstitution calculator",
    icon: Calculator,
    className: "-right-1 top-16",
    drift: { x: "-5px", y: "7px", ms: "10200ms" },
  },
  {
    label: "Injection site record",
    icon: Syringe,
    className: "-left-2 bottom-16",
    drift: { x: "6px", y: "6px", ms: "11400ms" },
  },
  {
    label: "Journal and bloodwork",
    icon: ChartLine,
    className: "-right-2 bottom-3",
    drift: { x: "-4px", y: "-8px", ms: "9200ms" },
  },
] as const;

export function PaywallHero() {
  return (
    <div className="relative mx-auto h-[19rem] w-full max-w-[22rem]">
      {/* A soft pool of light behind the phone, so it sits in space rather than
          on a flat field. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--accent-amber) 16%, transparent), transparent 70%)",
        }}
      />

      {/* The phone. */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 w-[10.5rem] -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] bg-bg-surface-raised p-[3px] shadow-[0_28px_60px_-22px_rgb(0_0_0/0.95)]"
      >
        <div className="overflow-hidden rounded-[1.6rem]">
          <Image
            src="/onboarding/app-home.png"
            alt=""
            width={1170}
            height={2280}
            priority
            className="h-auto w-full"
          />
        </div>
      </div>

      {/* What you get, orbiting it. */}
      {FEATURES.map((f) => {
        const Icon = f.icon;
        return (
          <div
            key={f.label}
            aria-hidden
            className={cn(
              "animate-flow-drift pointer-events-none absolute flex max-w-[8.5rem] items-center gap-2 rounded-full bg-bg-surface/90 px-3 py-2 backdrop-blur-sm",
              "shadow-[0_10px_26px_-14px_rgb(0_0_0/0.9)]",
              f.className,
            )}
            style={
              {
                "--drift-x": f.drift.x,
                "--drift-y": f.drift.y,
                "--drift-ms": f.drift.ms,
              } as CSSProperties
            }
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-accent-amber" />
            <span className="text-[10px] leading-tight text-foreground">
              {f.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
