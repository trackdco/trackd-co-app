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
 * shorter and lower. The offset is BAKED INTO THE COORDINATES here rather than
 * applied as an SVG transform, and that is not a style preference.
 *
 * ⚠️ A `transform` ON MASK CONTENT IS NOT RELIABLE. The first attempt drew this
 * stroke by putting transform="translate(34 17) scale(0.74 0.72)" on both the
 * brush and the path inside its reveal mask. The brush moved; the mask content
 * did not, so the mask went on revealing the band where the FIRST stroke lives
 * and clipped the second away completely. The result is the cruel one: the
 * element is in the DOM, getBoundingClientRect returns a sensible box in the
 * right place, and nothing is painted. Adrian said three times that there was
 * no second underline and he was right every time; a bounding box is not paint.
 * Proven by giving the path fill:red (invisible) and then removing its mask
 * (the red stroke appeared exactly where it should).
 *
 * So: generated once as x' = 34 + 0.74x, y' = 17 + 0.72y over BRUSH_1 and
 * TRACE_1, and pasted. To move it, regenerate both together with the same
 * mapping. Never reach for a transform attribute here.
 */
const BRUSH_1B =
  "M37.7 29.7 L42.1 30.1 L46.5 30.3 L50.9 30.5 L55.4 30.7 L59.8 30.8 L64.3 30.9 L68.6 31.0 L73.1 31.1 L77.5 31.2 L82.0 31.2 L86.4 31.3 L90.8 31.3 L95.2 31.3 L99.6 31.3 L104.1 31.3 L108.5 31.2 L113.0 31.2 L117.4 31.1 L121.8 31.0 L126.2 30.9 L130.6 30.8 L135.1 30.6 L139.5 30.5 L144.0 30.2 L148.4 30.1 L152.8 29.9 L157.2 29.7 L161.6 29.5 L166.1 29.2 L170.5 29.0 L175.0 28.7 L179.3 28.4 L183.8 28.1 L188.2 27.8 L192.7 27.5 L197.1 27.2 L201.5 26.9 L205.9 26.6 L210.3 26.2 L214.7 25.9 L219.1 25.6 L223.6 25.2 L228.0 24.8 L232.4 24.4 L236.8 24.1 L241.3 23.8 L245.6 23.6 L250.1 23.3 L250.1 22.7 L245.6 22.9 L241.2 23.1 L236.8 23.3 L232.3 23.5 L228.0 23.6 L223.5 23.7 L219.1 23.8 L214.6 24.0 L210.2 24.2 L205.8 24.3 L201.3 24.6 L196.9 24.8 L192.5 24.9 L188.1 25.1 L183.6 25.4 L179.2 25.5 L174.7 25.7 L170.4 25.9 L165.9 26.1 L161.5 26.3 L157.1 26.4 L152.7 26.6 L148.3 26.7 L143.8 26.9 L139.4 27.1 L135.0 27.2 L130.6 27.3 L126.1 27.4 L121.7 27.5 L117.3 27.7 L112.9 27.7 L108.4 27.8 L104.1 27.9 L99.6 27.9 L95.2 28.0 L90.8 28.1 L86.4 28.2 L82.0 28.2 L77.5 28.2 L73.1 28.3 L68.7 28.3 L64.3 28.4 L59.8 28.4 L55.4 28.4 L51.0 28.5 L46.6 28.7 L42.1 28.7 L37.7 29.1Z";
const TRACE_1B =
  "M37.7 29.4 L55.4 29.6 L73.1 29.7 L90.8 29.7 L108.5 29.5 L126.2 29.2 L143.9 28.6 L161.6 27.9 L179.3 26.9 L196.9 26.0 L214.7 24.9 L232.4 23.9 L250.1 23.0";

export function HandUnderline({
  children,
  variant = "double",
}: {
  children: ReactNode;
  /**
   * "double" draws two full strokes, the second shorter and set lower, and is
   * the default. "single" draws one stroke and nothing else.
   *
   * ⚠️ There was a third, "tail": one pass with a lighter return under its END
   * only, which is how this was first drawn. It is gone, and it is worth
   * knowing why rather than reinventing it. On "Join the movement" at 390px its
   * return pass measured 64px against the first stroke's 152px and sat INSIDE
   * it vertically, so it read as one line with a thickened end. Adrian looked
   * at that on an iPhone and said there was no underline there at all. If you
   * want one stroke, use "single", which is honest about being one.
   */
  variant?: "single" | "double";
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const drawn = useInView(ref, { threshold: 0.9 });
  // Stripped to characters a `url(#…)` reference can never trip on.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const m1 = `${id}-ink-1`;
  const m2 = `${id}-ink-2`;
  const single = variant === "single";

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
          {single ? null : (
            <mask id={m2} maskUnits="userSpaceOnUse" x="-10" y="-10" width="320" height="60">
              <path
                d={TRACE_1B}
                pathLength={1}
                className="lp-ink-stroke lp-ink-stroke-2"
                fill="none"
                stroke="white"
                strokeWidth={10}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </mask>
          )}
        </defs>
        <path d={BRUSH_1} mask={`url(#${m1})`} className="fill-accent-amber" />
        {single ? null : (
          <path
            d={BRUSH_1B}
            mask={`url(#${m2})`}
            className="fill-accent-amber"
            opacity={0.85}
          />
        )}
      </svg>
    </span>
  );
}
