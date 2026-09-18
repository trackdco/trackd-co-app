"use client";

import { useId, useRef, type ReactNode } from "react";

import { useInView } from "./use-in-view";

/*
 * The ink, generated once (a centreline with a thickness that swells and
 * tapers) and pasted as static paths. BRUSH is the shape that gets painted;
 * TRACE is the centreline the reveal travels along, so the ink appears in the
 * direction a hand would move. The second pair is a lighter return pass under
 * the tail, which is what stops it reading as a CSS border.
 *
 * Drawn in a 300 x 24 box and stretched to the word.
 */
const BRUSH_1 =
  "M5.0 17.6 L11.0 18.2 L16.9 18.5 L22.9 18.8 L28.9 19.0 L34.9 19.1 L40.9 19.3 L46.8 19.4 L52.8 19.6 L58.8 19.7 L64.8 19.7 L70.8 19.8 L76.8 19.8 L82.7 19.8 L88.7 19.8 L94.7 19.8 L100.7 19.7 L106.7 19.7 L112.7 19.6 L118.7 19.4 L124.6 19.3 L130.6 19.1 L136.6 18.9 L142.6 18.7 L148.6 18.4 L154.6 18.2 L160.6 17.9 L166.5 17.6 L172.5 17.3 L178.5 16.9 L184.5 16.6 L190.5 16.2 L196.4 15.8 L202.4 15.4 L208.4 15.0 L214.4 14.6 L220.4 14.2 L226.3 13.7 L232.3 13.3 L238.3 12.8 L244.2 12.3 L250.2 11.9 L256.2 11.4 L262.2 10.9 L268.1 10.3 L274.1 9.8 L280.1 9.5 L286.0 9.1 L292.0 8.8 L292.0 7.9 L286.0 8.2 L280.0 8.5 L274.0 8.8 L268.0 9.0 L262.1 9.1 L256.1 9.3 L250.1 9.5 L244.1 9.7 L238.1 10.0 L232.1 10.2 L226.1 10.5 L220.1 10.8 L214.2 11.0 L208.2 11.3 L202.2 11.6 L196.2 11.8 L190.2 12.1 L184.3 12.4 L178.3 12.6 L172.3 12.9 L166.3 13.1 L160.4 13.3 L154.4 13.5 L148.4 13.8 L142.4 14.0 L136.5 14.1 L130.5 14.3 L124.5 14.5 L118.5 14.6 L112.6 14.8 L106.6 14.9 L100.6 15.0 L94.7 15.1 L88.7 15.2 L82.7 15.3 L76.7 15.4 L70.8 15.5 L64.8 15.5 L58.8 15.6 L52.8 15.7 L46.9 15.7 L40.9 15.8 L34.9 15.9 L28.9 15.9 L23.0 16.0 L17.0 16.2 L11.0 16.3 L5.0 16.8Z";
const TRACE_1 =
  "M5.0 17.2 L28.9 17.5 L52.8 17.6 L76.8 17.6 L100.7 17.4 L124.6 16.9 L148.5 16.1 L172.4 15.1 L196.3 13.8 L220.2 12.5 L244.2 11.0 L268.1 9.6 L292.0 8.4";
const BRUSH_2 =
  "M268.0 12.6 L263.0 12.3 L258.0 12.3 L253.0 12.2 L248.0 12.2 L243.0 12.3 L238.0 12.3 L233.0 12.4 L228.0 12.5 L222.9 12.7 L217.9 12.9 L212.9 13.1 L207.9 13.4 L202.9 13.7 L197.9 14.0 L192.9 14.4 L187.9 14.7 L182.9 15.2 L177.9 15.6 L172.9 16.1 L167.9 16.6 L162.9 17.1 L158.0 17.6 L153.0 18.1 L148.0 18.8 L148.0 19.2 L153.0 19.0 L158.0 18.8 L163.1 18.5 L168.1 18.2 L173.1 17.9 L178.1 17.6 L183.1 17.3 L188.1 17.0 L193.1 16.8 L198.1 16.5 L203.1 16.3 L208.1 16.0 L213.1 15.8 L218.1 15.6 L223.1 15.3 L228.0 15.1 L233.0 14.9 L238.0 14.7 L243.0 14.5 L248.0 14.2 L253.0 14.0 L258.0 13.7 L263.0 13.5 L268.0 13.0Z";
const TRACE_2 =
  "M268.0 12.8 L258.0 13.0 L248.0 13.2 L238.0 13.5 L228.0 13.8 L218.0 14.2 L208.0 14.7 L198.0 15.3 L188.0 15.9 L178.0 16.6 L168.0 17.4 L158.0 18.2 L148.0 19.0";

/**
 * A word underlined by hand, drawn when it scrolls into view (spec 3-03 §3.3).
 *
 * ⚠️ NOT A WIDTH TRANSITION. Adrian asked for it to read "like a hand drawing
 * it", so the ink is a tapered brush shape revealed through a mask whose stroke
 * travels the centreline: the line thickens and thins as it goes, and a lighter
 * second pass comes back under the tail after the first has landed.
 *
 * Amber, and one of the page's three amber beats (with the call to action and
 * the FAQ vials). Under reduced motion it is simply there.
 */
/**
 * The second stroke of the "double" variant: the SAME ink as the first, laid
 * shorter and lower rather than the tail-only return pass. Shifted rather than
 * redrawn, so there is one set of path data to keep true to the hand.
 * translate(34 17) insets it at both ends and drops it clear of the first;
 * scale(0.74 0.72) shortens it and thins the brush to match the shorter run.
 *
 * ⚠️ THE GAP IS THE WHOLE POINT, AND IT IS MEASURED IN PIXELS, NOT UNITS. The
 * box is only about 11px tall on a phone, so a unit here is under half a pixel:
 * the first attempt sat 7 units down and the two strokes landed 2px apart,
 * which Adrian read on an iPhone as there being no second underline at all.
 * There was one; it was touching the first. 17 units puts roughly 7px between
 * them at phone size, which is the point they read as two. Anything that closes
 * this gap again undoes the feature, so measure it in a browser at 390px wide
 * rather than trusting the numbers to look right in the source.
 */
const DOUBLE_SHIFT = "translate(34 17) scale(0.74 0.72)";

export function HandUnderline({
  children,
  variant = "tail",
}: {
  children: ReactNode;
  /** "tail" is one pass with a lighter return under its end. "double" is two
   *  full strokes, the second shorter and set lower (Adrian, 2026-09-18). */
  variant?: "tail" | "double";
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const drawn = useInView(ref, { threshold: 0.9 });
  // Stripped to characters a `url(#…)` reference can never trip on.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const m1 = `${id}-ink-1`;
  const m2 = `${id}-ink-2`;
  const double = variant === "double";
  const shift = double ? DOUBLE_SHIFT : undefined;

  return (
    <span ref={ref} className="relative inline-block whitespace-nowrap">
      {children}
      <svg
        aria-hidden
        focusable="false"
        viewBox="0 0 300 24"
        preserveAspectRatio="none"
        data-drawn={drawn ? "" : undefined}
        className="lp-ink pointer-events-none absolute -left-[3%] top-[78%] h-[0.34em] w-[106%] overflow-visible"
      >
        <defs>
          <mask id={m1} maskUnits="userSpaceOnUse" x="-10" y="-10" width="320" height="44">
            <path
              d={TRACE_1}
              pathLength={1}
              className="lp-ink-stroke"
              fill="none"
              stroke="white"
              strokeWidth={10}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </mask>
          <mask id={m2} maskUnits="userSpaceOnUse" x="-10" y="-10" width="320" height="44">
            <path
              d={double ? TRACE_1 : TRACE_2}
              transform={shift}
              pathLength={1}
              className="lp-ink-stroke lp-ink-stroke-2"
              fill="none"
              stroke="white"
              strokeWidth={double ? 10 : 8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </mask>
        </defs>
        <path d={BRUSH_1} mask={`url(#${m1})`} className="fill-accent-amber" />
        <path
          d={double ? BRUSH_1 : BRUSH_2}
          transform={shift}
          mask={`url(#${m2})`}
          className="fill-accent-amber"
          opacity={double ? 0.85 : 0.75}
        />
      </svg>
    </span>
  );
}
