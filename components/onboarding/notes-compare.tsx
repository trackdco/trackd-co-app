"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { ArrowsLeftRight } from "@/components/icons";

/**
 * The Notes-vs-Trackd wipe (Spec 3-01 §9 Screen 0).
 *
 * Two panels stacked in the same box with a draggable divider over them: drag
 * left and you are back in the Notes app, drag right and it is Trackd. The
 * spec asks for a two-position slider; a continuous wipe is the same idea with
 * the seam under the user's thumb, which is what makes the contrast land.
 *
 * Accessible as a real slider: `role="slider"` with arrow-key support, so it is
 * operable without a pointer. The handle is the only interactive element; the
 * panels underneath are inert.
 *
 * **It slides itself until you touch it** (Adrian, 2026-07-31). A static seam
 * asks the user to work out that it is draggable; a moving one shows them both
 * panels and demonstrates the control in the same gesture. It is a one-shot
 * demonstration rather than ambient decoration: the first pointer or key from
 * the user stops it for good and hands the seam over, and it never restarts.
 * Under `prefers-reduced-motion` it never runs at all and simply sits at the
 * midpoint.
 */

/** Where the auto-sweep turns around, and how long a full there-and-back takes. */
const SWEEP_MIN = 28;
const SWEEP_MAX = 72;
const SWEEP_MS = 4200;

/**
 * THE LEFT PANEL IS A REAL SCREENSHOT NOW, AND IT NAMES COMPOUNDS
 * (Adrian, 2026-08-14 — "don't worry about the notes compounds thing").
 *
 * This panel used to be typeset from a `NOTES_LINES` array with every substance
 * name deliberately stripped, on the reasoning that the hook runs BEFORE the age
 * gate and is therefore a public promotional surface. That reasoning has not
 * changed and is not disproved — under the Therapeutic Goods Act the
 * restriction attaches to the advertisement, not to the age of who sees it, so
 * a gate is a product control and not the thing that makes naming a
 * prescription-only substance acceptable. It is recorded in full in
 * `progress-tracker.md` under Open Questions.
 *
 * Adrian was told that, twice, and has decided to ship his own note anyway. It
 * is his product and his call. **Do not silently revert this to the generic
 * copy** — if it goes back, it goes back because he says so.
 *
 * What WAS enforced, and must stay enforced: the note's Labcorp attachment
 * carries a patient surname and an account number, and both are opaquely
 * redacted in the file. That is third-party health data rather than a
 * regulatory judgment call, so it is not his to trade away. The redaction was
 * checked pixel-level before this shipped; the screenshot is flattened, so
 * there is nothing recoverable underneath. Any REPLACEMENT of this asset gets
 * the same check.
 *
 * The asset also carries a baked alpha fade over its bottom 14%, which
 * dissolves the half-cut lab card at the foot of the capture. That is in the
 * PNG rather than in CSS so the file is safe at any crop; the panel adds its
 * own fade on top for the edge you actually see.
 */
const NOTES_SRC = "/onboarding/notes-app.png";

/**
 * BOTH SIDES ARE REAL CAPTURES NOW (Adrian, 2026-08-14: "the after should be
 * the dashboard I've already uploaded").
 *
 * The right half used to be a hand-built list — four rows of "Compound 1 ·
 * 6.5 mL" typeset in the flow's own components. It was honest about the idea
 * and dishonest about the product: nothing in the actual app looks like that,
 * so the screen's promise was a drawing of software rather than the software.
 *
 * It is the paywall's own dashboard capture now, which means the wipe compares
 * two photographs of two real things and the second one is the thing you get.
 * Reusing the paywall asset is deliberate — one file, so the two surfaces can
 * never drift into showing different apps.
 */
const TRACKD_SRC = "/onboarding/app-dashboard.png";

export function NotesCompare() {
  const [position, setPosition] = useState(50);
  const [auto, setAuto] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);

  // The demonstration sweep. A sine so it eases at both ends instead of
  // ping-ponging, which reads mechanical.
  useEffect(() => {
    if (!auto) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const start = performance.now();
    const mid = (SWEEP_MIN + SWEEP_MAX) / 2;
    const amp = (SWEEP_MAX - SWEEP_MIN) / 2;

    const tick = (now: number) => {
      const elapsed = now - start;
      // TWO SWEEPS, then it stops. It used to loop forever, which meant a user
      // who parked on the first screen got a React state update and a re-render
      // of the whole comparison every frame, indefinitely. Two passes is enough
      // to show both panels and that the seam moves.
      if (elapsed >= SWEEP_MS * 2) {
        setPosition(mid);
        setAuto(false);
        return;
      }
      const t = (elapsed % SWEEP_MS) / SWEEP_MS;

      /**
       * IT SETTLES INTO THE MIDDLE RATHER THAN STOPPING ON IT (Adrian, on his
       * phone, 2026-08-05: "I don't want it to just stop straight away").
       *
       * The sine already ENDED on the midpoint — sin(2π) is 0, so the last
       * frame and the resting position were the same number and nothing
       * jumped. What was wrong was the speed it got there at: a sine is at its
       * FASTEST as it crosses zero, so the seam arrived at the middle at full
       * travel and was cut dead on the same frame. Correct position, no
       * deceleration.
       *
       * So the amplitude is damped to nothing across the second pass. The first
       * shows the full range at full speed; the second draws in like a pendulum
       * losing energy. Velocity at the end is exactly zero rather than
       * approximately so: d/dt of `amp·E(t)·sin(2πt)` is
       * `amp·[E'·sin + E·2π·cos]`, and at the final frame `sin(2π) = 0` and
       * `E = 0` kill both terms whatever `E'` is doing.
       */
      const decayFrom = SWEEP_MS;
      const p = Math.max(0, (elapsed - decayFrom) / (SWEEP_MS * 2 - decayFrom));
      const envelope = 1 - p * p;

      setPosition(mid + amp * envelope * Math.sin(t * Math.PI * 2));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [auto]);

  /** The user has taken over. Never give the sweep back. */
  const takeOver = useCallback(() => setAuto(false), []);

  const setFromClientX = useCallback((clientX: number) => {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    if (rect.width === 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(6, Math.min(94, pct)));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    takeOver();
    e.currentTarget.setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons === 0) return;
    setFromClientX(e.clientX);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    takeOver();
    const step = e.shiftKey ? 10 : 4;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPosition((p) => Math.max(6, p - step));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setPosition((p) => Math.min(94, p + step));
    } else if (e.key === "Home") {
      e.preventDefault();
      setPosition(6);
    } else if (e.key === "End") {
      e.preventDefault();
      setPosition(94);
    }
  };

  return (
    // `h-full` all the way down. The box below is `h-full`, and a percentage
    // height resolves against its PARENT — so while this wrapper was auto-height
    // the box computed to zero and the phone rendered as an empty black slab
    // with a working slider nobody could see.
    <div className="h-full">
      {/* The two side labels used to live here as eyebrows. They are now the
          floating cards outside the phone (`hook.tsx`), which say the same
          thing and carry their own points, so keeping both would have labelled
          each side twice. The slider carries its own `aria-label`; it briefly
          had a visually-hidden label AND that, and `aria-labelledby` wins, so
          the better of the two strings never reached anyone. */}
      <div
        ref={boxRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        className="relative h-full w-full touch-none select-none overflow-hidden bg-bg-base"
      >
        {/* Panel A — the Notes app, as an actual capture of Adrian's own note.
            Still deliberately ugly, but ugly the way a real one is rather than
            the way a designer imagines one is: lines crossed out, a dose he is
            not sure he logged, question marks where a figure should be.

            `object-top` because the argument lives at the TOP of the note — the
            day-by-day list that contradicts itself. The panel is roughly square
            and the capture is a tall phone screen, so its foot is out of frame
            by design.

            Explicit dimensions rather than `fill`, the same lesson as
            `app-carousel.tsx`: `fill` wanted a resolved ancestor height it did
            not have, and the images came back empty. */}
        <div className="absolute inset-0" aria-hidden>
          <Image
            src={NOTES_SRC}
            alt=""
            width={1189}
            height={2187}
            sizes="280px"
            priority
            className="h-full w-full object-cover object-top"
          />
          {/* THE FADE (Adrian, 2026-08-14). The capture is a phone screen inside
              a phone screen, so its foot still lands mid-line however tall the
              frame gets. Without this the note is guillotined and reads as a
              rendering bug rather than as a screen continuing past its edge.
              Shallower than it was — the frame is full height now, so there is
              far more note in view and less needs hiding. It fades to the
              panel's own ground, and Panel B clips OVER it, so it never bleeds
              onto the right half. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/5 bg-gradient-to-t from-bg-base via-bg-base/60 to-transparent" />
        </div>
        {/* Panel B — Trackd, the paywall's own dashboard capture. Clipped to
            the wipe rather than cross-faded: the seam is the point.

            Same `object-top` and explicit dimensions as Panel A, so the two
            halves scale identically and the seam lines up across them. No fade
            on this side — the dashboard capture already ends on its own tab
            bar, which is a real edge rather than a cut. */}
        <div
          className="absolute inset-0 bg-bg-base"
          style={{ clipPath: `inset(0 0 0 ${position}%)` }}
          aria-hidden
        >
          <Image
            src={TRACKD_SRC}
            alt=""
            width={688}
            height={1504}
            sizes="280px"
            priority
            className="h-full w-full object-cover object-top"
          />
        </div>

        {/* The seam */}
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-accent-amber"
          style={{ left: `${position}%` }}
          aria-hidden
        />

        {/* A quiet nudge, only while the sweep is still running. */}
        {auto ? (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-[9px] font-sans uppercase tracking-[0.18em] text-text-subtle"
          >
            Drag
          </span>
        ) : null}

        {/* The handle. The one amber beat on this screen: it is the live thing. */}
        <button
          type="button"
          role="slider"
          aria-label="Drag to compare a Notes app with Trackd"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position)}
          aria-valuetext={`${Math.round(position)} percent Trackd`}
          onKeyDown={onKeyDown}
          className="absolute top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent-amber text-bg-base shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
          style={{ left: `${position}%` }}
        >
          <ArrowsLeftRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
