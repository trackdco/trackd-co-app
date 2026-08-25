"use client";

/**
 * THE SAVE OFFER'S COUNTDOWN, as a split-flap face (Adrian, 2026-08-25).
 *
 * It replaces a single amber `font-mono` line. The clock it draws is REAL — it
 * counts from the server's `shownAt` and the server refuses a claim past the same
 * ten minutes — which is the only reason a countdown belongs on a cancel screen
 * at all. A countdown to nothing here is the one thing regulators actually look
 * for, and this one expires the offer it is counting.
 *
 * ## ⚠️ IT HOLDS NO COPY AND FORMATS NO TIME
 *
 * `value` arrives already formatted by `formatRemaining`, which is where MM:SS is
 * decided and is already under test. This splits a string into characters and
 * draws them; it has no idea what a minute is. The two cannot drift because there
 * is nothing here to drift.
 *
 * ## ⚠️ REDUCED MOTION COLLAPSES THE CHROME, NOT JUST THE FLIP
 *
 * Handled in `globals.css` rather than with a JS media query, deliberately: a
 * `matchMedia` read cannot run on the server, so the first paint would be the
 * full split-flap for everybody and the collapse would arrive a frame later — a
 * flash of exactly the motion the setting asks to avoid.
 */
export function FlipClock({ value, label }: { value: string; label: string }) {
  const chars = [...value];
  return (
    <div className="mt-4">
      <div
        className="flex items-center justify-center gap-1.5"
        role="timer"
        /**
         * ⚠️ `aria-live="off"` AND A TEXT LABEL, matching what this replaces.
         * A ten-minute countdown announced every second is unusable with a
         * screen reader on; the `aria-label` states the remaining time once,
         * and the visible digits carry it for everybody else.
         */
        aria-live="off"
        aria-label={`${value} remaining`}
      >
        {chars.map((c, i) =>
          c === ":" ? (
            <span
              key={`sep-${i}`}
              className="px-0.5 text-2xl font-semibold text-accent-amber"
              aria-hidden
            >
              :
            </span>
          ) : (
            <span
              key={`d-${i}`}
              /**
               * ⚠️ KEYED ON THE DIGIT AND THE POSITION. React re-mounts the node
               * when the digit changes, which is what re-runs the flip; a key of
               * position alone would update the text in place and never animate.
               */
              className="flip-face animate-flip-tick relative flex h-12 w-9 items-center justify-center rounded-lg text-2xl font-semibold tabular-nums text-accent-amber"
              aria-hidden
            >
              {c}
              {/* The hinge, dead centre. `-translate-y-1/2` rather than a
                  half-height box, so it stays on the seam at any face height. */}
              <span className="flip-hinge pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2" />
            </span>
          ),
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-text-subtle">{label}</p>
    </div>
  );
}
