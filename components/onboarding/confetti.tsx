"use client";

import { useMemo } from "react";

/**
 * The celebration burst (Spec 3-01 §9 Screens 4 and 11).
 *
 * This is a ONE-SHOT ENTRANCE, not ambient motion. `ui-context.md` → Motion
 * bans "floating particles" as decorative; the line between the two is whether
 * it keeps going after you have looked at it. This fires once, over ~2.2s, and
 * is gone. It also collapses to nothing under `prefers-reduced-motion` via the
 * shared opt-out in `globals.css`.
 *
 * `pointer-events-none` is not optional: the spec records that a decorative
 * overlay intercepting a tap has already bitten this prototype once.
 */

const PIECE_COUNT = 18;

/** It waits for Kyle to land before it fires. Confetti that arrives with the
 *  screen competes with him; confetti that arrives after him celebrates him. */
const START_DELAY_MS = 620;

/** Deterministic pseudo-random in 0…1, so the burst is identical on every
 *  render and cannot differ between the server and the client (a hydration
 *  mismatch is what `Math.random()` in render buys you). */
function scatter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function Confetti({ fire = true }: { fire?: boolean }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECE_COUNT }, (_, i) => {
        const a = scatter(i + 1);
        const b = scatter(i + 101);
        const c = scatter(i + 201);
        return {
          left: 6 + a * 88,
          drift: (b - 0.5) * 160,
          fall: 220 + c * 260,
          spin: 180 + b * 540,
          delay: START_DELAY_MS + a * 520,
          // Slower, and spread wider. Adrian: "slow is premium".
          duration: 3200 + c * 1400,
          width: 4 + b * 4,
          height: 8 + c * 8,
          // Amber is the brand beat and this is the moment it is for.
          opacity: 0.5 + c * 0.5,
        };
      }),
    [],
  );

  if (!fire) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          className="animate-flow-confetti absolute top-0 block rounded-[1px] bg-accent-amber"
          style={
            {
              left: `${p.left}%`,
              width: p.width,
              height: p.height,
              opacity: p.opacity,
              animationDelay: `${p.delay}ms`,
              animationDuration: `${p.duration}ms`,
              "--drift": `${p.drift}px`,
              "--fall": `${p.fall}px`,
              "--spin": `${p.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
