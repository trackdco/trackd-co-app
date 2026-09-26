/**
 * The markers panel's small drawings, copied from the final-check page
 * (`final-check.html` PLUS, `markers8.js` TICK8, `markers6.js` REPEAT6 and
 * SEARCH6). All draw in `currentColor`.
 */

/** The thin + before a chip's name, "Create your own" and "Add more markers" (12px). */
export function PlusGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className="shrink-0">
      <path d="M6 2v8M2 6h8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The small tick a ticked chip shows in place of the +. TICK8 is drawn at 10px;
 * here it sits in the plus's 12px box (the view box widened to match), so a
 * tick never widens its chip and reflows the ones after it. It draws in.
 */
export function TickGlyph() {
  return (
    <svg width={12} height={12} viewBox="-1.2 -1.2 14.4 14.4" aria-hidden className="tick-draw shrink-0">
      <path
        d="M2.5 6.3l2.4 2.4 4.6-5"
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The circular arrows of "Use my last" (13px). */
export function RepeatGlyph() {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7" />
      <path d="M20 3.5v5.2h-5.2" />
      <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.3" />
      <path d="M4 20.5v-5.2h5.2" />
    </svg>
  );
}

/** The search field's magnifier (14px). */
export function SearchGlyph() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden
      className="shrink-0"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.6-4.6" />
    </svg>
  );
}

/** The x beside a row, and after one of your own markers while Yours is edited. */
export function CrossGlyph({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className="shrink-0">
      <path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
