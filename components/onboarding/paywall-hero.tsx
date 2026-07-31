"use client";

import type { CSSProperties, ReactNode } from "react";

import { Vial } from "@/components/containers";
import { sparkGeometry } from "@/lib/progress/spark";
import { DATA_MONO } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

/**
 * The paywall hero: real fragments of the app, floating (Adrian, 2026-07-31).
 *
 * A generic phone mock-up here is a wasted screen. These are the actual pieces
 * the user has just been shown and is about to pay for, drawn with the app's own
 * components and tokens: a stock vial with a real fill, a consistency grid, a
 * weight sparkline off the same geometry helper the real card uses, and a
 * dose row. Proof, arranged as decoration.
 *
 * The drift is the one looping animation in the codebase; the reasoning and the
 * limits are in `globals.css` next to the keyframe. It is decorative, so the
 * whole thing is `aria-hidden` and `pointer-events-none` and cannot intercept a
 * tap meant for the CTA underneath.
 */

/** A floating fragment: position, drift vector, and how slow it drifts. */
function Fragment({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        "animate-flow-drift absolute rounded-2xl bg-bg-surface p-3 shadow-[0_10px_30px_-16px_rgba(0,0,0,0.9)]",
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}

const CONSISTENCY = [1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1];
const WEIGHT = [86.2, 86.0, 85.4, 85.6, 84.9, 84.4, 84.6, 83.9];

export function PaywallHero() {
  const spark = sparkGeometry(WEIGHT, 96, 34);

  return (
    <div
      aria-hidden
      className="pointer-events-none relative h-[15.5rem] w-full select-none"
    >
      {/* Stock. The one with a real fill, because that is the aha screen. */}
      <Fragment
        className="left-0 top-2 w-[8.5rem]"
        style={{ "--drift-x": "4px", "--drift-y": "-7px", "--drift-ms": "8200ms" } as CSSProperties}
      >
        <div className="flex items-center gap-2.5">
          <Vial colour="var(--cat-anabolic)" fill={0.62} size={40} />
          <div className="min-w-0">
            <p className="font-mono text-base font-light tabular-nums leading-none text-foreground">
              6.2
              <span className="ml-0.5 text-[10px] text-text-muted">mL</span>
            </p>
            <p className={cn(DATA_MONO, "mt-1 text-[9px]")}>12 doses left</p>
          </div>
        </div>
      </Fragment>

      {/* Consistency. */}
      <Fragment
        className="right-0 top-0 w-[7.75rem]"
        style={{ "--drift-x": "-5px", "--drift-y": "6px", "--drift-ms": "10400ms" } as CSSProperties}
      >
        <p className="text-[8px] font-sans uppercase tracking-[0.18em] text-text-subtle">
          Consistency
        </p>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {CONSISTENCY.map((on, i) => (
            <span
              key={i}
              className={cn(
                "aspect-square rounded-[2px]",
                on ? "bg-accent-primary/85" : "bg-bg-surface-raised",
              )}
            />
          ))}
        </div>
      </Fragment>

      {/* Weight, drawn by the same helper the real glance card uses. */}
      <Fragment
        className="left-3 bottom-1 w-[8.75rem]"
        style={{ "--drift-x": "6px", "--drift-y": "5px", "--drift-ms": "11800ms" } as CSSProperties}
      >
        <p className="text-[8px] font-sans uppercase tracking-[0.18em] text-text-subtle">
          Weight
        </p>
        <p className="mt-1 font-mono text-base font-light tabular-nums leading-none text-foreground">
          83.9
          <span className="ml-0.5 text-[10px] text-text-muted">kg</span>
        </p>
        <svg viewBox="0 0 96 34" className="mt-1.5 h-6 w-full" aria-hidden>
          <path
            d={spark.line}
            fill="none"
            stroke="var(--chart-trend)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </Fragment>

      {/* A due dose, with the amber ring: the app's own heartbeat. */}
      <Fragment
        className="right-2 bottom-6 w-[9rem]"
        style={{ "--drift-x": "-4px", "--drift-y": "-8px", "--drift-ms": "9400ms" } as CSSProperties}
      >
        <div className="flex items-center gap-2">
          <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-accent-amber" />
          <span className="min-w-0 flex-1 truncate text-[10px] text-foreground">
            Test E
          </span>
          <span className={cn(DATA_MONO, "shrink-0 text-[9px]")}>0.5 mL</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-accent-primary" />
          <span className="min-w-0 flex-1 truncate text-[10px] text-text-muted line-through decoration-text-subtle">
            Semaglutide
          </span>
        </div>
      </Fragment>
    </div>
  );
}
