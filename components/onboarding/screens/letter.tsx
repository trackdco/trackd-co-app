"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CARD_EYEBROW } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

import { FlowCta, StepFrame } from "../chrome";
import { SIGNATURE_ART } from "../signatureArt";
import { useFlow } from "../flow-context";

/**
 * Screen 16 — the founder letter, then the hand-off.
 *
 * **The copy is Adrian and Angus's, verbatim** (given 2026-08-01). It is not
 * mine to tighten, so it has been set rather than edited. One thing to know:
 * it opens with an exclamation mark, which `ui-context.md` → Voice bans
 * outright. That ban is about the app's own system copy, where a chirpy tone
 * undermines an instrument; a signed letter from two founders is the one place
 * on the surface where a human is allowed to sound pleased. Flagged for Adrian
 * rather than silently overruled either way.
 *
 * ## The signatures
 *
 * Adrian wants his and Angus's real signatures here, in amber. That is why this
 * loads no handwriting font: the spec asks for Caveat, `ui-context.md` ships
 * exactly two faces, and a font is a poor imitation of a signature anyway. A
 * real signature is an ASSET, like the wordmark already is.
 *
 * WIRED 2026-08-01, from Adrian's real exports. They are INLINE SVG from a
 * generated module (`../signatureArt`), not files in `public/`, and that is
 * load-bearing rather than a preference: `next/image` renders an `<img>`, and
 * an `<img>` cannot inherit `currentColor` from its parent. The signatures
 * would have resolved their fill against their own default and rendered
 * near-black on a near-black canvas. Inline, the amber comes from the token on
 * the wrapper exactly as intended.
 *
 * They WRITE THEMSELVES ON, left to right, Angus then Adrian. See
 * `.animate-signature` in `globals.css` for why it is a wipe and not a
 * stroke-draw.
 *
 * The wipe starts when the block is SCROLLED INTO VIEW, not on mount. The
 * letter is long enough that on a phone the signatures sit below the fold
 * (measured at 402x700), so a mount-triggered animation finishes before anyone
 * reaches it and the whole thing is wasted on an empty viewport.
 */

/**
 * `lift` nudges a signature up off the shared baseline, in pixels.
 *
 * Both boxes are the same height and bottom-aligned, which is correct for the
 * BOXES and wrong for the ink: Adrian's has a large loop that sweeps to the
 * very bottom of its bounding box, so its written line sits about a tenth of
 * the box lower than Angus's and it reads as dropped (Adrian, 2026-08-01:
 * "Adrian's one is too low"). Aligning the boxes cannot fix that — the
 * difference is inside them.
 *
 * A per-signature offset rather than a cleverer alignment, because there is
 * nothing to align ON. Handwriting has no baseline the geometry knows about.
 */
const SIGNATURES = [
  { name: "Angus", art: SIGNATURE_ART.angus, delay: 220, lift: 0 },
  { name: "Adrian", art: SIGNATURE_ART.adrian, delay: 620, lift: 7 },
] as const;

const PARAGRAPH =
  "text-[1.0625rem] font-light leading-[1.7] tracking-[-0.01em] text-foreground";

export function LetterScreen() {
  const { finish } = useFlow();

  /**
   * Has the signature block been scrolled to?
   *
   * Set up in a ref CALLBACK, not an effect body — the same arrangement
   * `demo-body.tsx` uses, and for the same reason: it runs after layout, and a
   * `setState` in an effect body is what the lint rule rightly forbids.
   *
   * An observer rather than a scroll handler: it costs nothing while off
   * screen, it fires once, and it does not care WHICH element is scrolling. The
   * flow pins its chrome and scrolls the body, so the thing doing the scrolling
   * is not the window and a scroll listener would have to be told where to
   * listen.
   */
  const [written, setWritten] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);

  const attach = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) return;
    // No observer support: just let it write rather than leaving it invisible.
    if (typeof IntersectionObserver === "undefined") {
      setWritten(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setWritten(true);
        io.disconnect();
      },
      // Most of the block has to be showing, so it does not start writing while
      // only its first pixel is peeking over the fold.
      { threshold: 0.6 },
    );
    io.observe(node);
    observer.current = io;
  }, []);

  useEffect(() => () => observer.current?.disconnect(), []);

  return (
    <StepFrame footer={<FlowCta onClick={finish}>Enter Trackd</FlowCta>}>
      <div className="flex flex-1 flex-col justify-center">
        <div className="space-y-4">
          <p className={cn(CARD_EYEBROW, "text-accent-amber")}>
            To Trackd Co&apos;s newest user
          </p>

          <p className={PARAGRAPH}>
            Thank you for choosing Trackd Co! We built Trackd with one goal: to
            get your protocol out of a messy notes app and into something
            simple, effective, and built around how you <em>actually</em> track.
          </p>

          <p className={PARAGRAPH}>
            Log compounds, calculate reconstitution, track when stock runs out,
            manage cycle rotations, and monitor your progress through it all.
          </p>

          <p className={PARAGRAPH}>
            Our goal is to build the best compound tracker in the world, and
            you&apos;re actively helping us get there.
          </p>

          <p className={PARAGRAPH}>
            We&apos;re still early. Your feedback matters more than you know.
            We&apos;re just getting started, and we&apos;re glad to have you
            with us.
          </p>

          <div className="pt-2">
            <p className={cn(PARAGRAPH, "mb-2")}>Best,</p>

            {/* The signatures. Height is fixed so the block below cannot jump,
                and each `viewBox` is its own ink box, so the two sit on a
                shared baseline at a consistent weight instead of one being
                mysteriously smaller because its export had more whitespace. */}
            <div
              ref={attach}
              className="flex min-h-[5rem] items-end gap-11 text-accent-amber"
            >
              {SIGNATURES.map((sig) => (
                <svg
                  key={sig.name}
                  viewBox={sig.art.viewBox}
                  role="img"
                  aria-label={`${sig.name}'s signature`}
                  className={cn(
                    "h-14 w-auto shrink-0",
                    written ? "animate-signature" : "opacity-0",
                  )}
                  style={{
                    animationDelay: `${sig.delay}ms`,
                    // Not a Tailwind translate: the value is per-signature and
                    // measured, so it belongs with the art rather than as a
                    // class somebody later "tidies" to a round number.
                    transform: sig.lift ? `translateY(-${sig.lift}px)` : undefined,
                  }}
                >
                  {sig.art.paths.map((d, i) => (
                    <path key={i} d={d} fill="currentColor" />
                  ))}
                </svg>
              ))}
            </div>

            {/* Same tracked-uppercase treatment as the line below it, one notch
                bigger, in white (Adrian, 2026-08-01). */}
            <p className="text-[13px] font-sans uppercase tracking-[0.18em] text-foreground">
              Angus &amp; Adrian
            </p>
            <p className={cn(CARD_EYEBROW, "mt-1.5")}>Founders, Trackd Co</p>
          </div>
        </div>
      </div>
    </StepFrame>
  );
}
