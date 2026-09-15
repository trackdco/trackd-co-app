/**
 * THE FIVE FEATURE GLYPHS.
 *
 * Drawn in the same hand as `components/onboarding/hero-cards.tsx`: 1.1-1.2px
 * strokes on `--border-strong`, one amber fill where and only where the app
 * itself would put one. Phosphor would have been the lazier choice and would
 * have read as a generic icon set; these are pictures of the things the app
 * actually holds, which is what the flow's cards do.
 */

export function VialGlyph() {
  return (
    <svg width="21" height="30" viewBox="0 0 20 34" aria-hidden focusable="false">
      <rect x="6" y="1" width="8" height="3.4" rx="1" className="fill-border-strong" />
      <rect x="3.2" y="4.6" width="13.6" height="28" rx="3.4" fill="none" strokeWidth="1.2" className="stroke-border-strong" />
      <path d="M4.4 18 h11.2 v11.4 a2.2 2.2 0 0 1 -2.2 2.2 h-6.8 a2.2 2.2 0 0 1 -2.2 -2.2 z" className="fill-cat-anabolic" opacity="0.55" />
      <rect x="4.4" y="17.4" width="11.2" height="1.2" rx="0.6" className="fill-cat-anabolic" />
    </svg>
  );
}

export function BodyGlyph() {
  return (
    <svg width="22" height="30" viewBox="0 0 30 44" aria-hidden focusable="false">
      <g fill="none" strokeWidth="1.1" strokeLinejoin="round" className="stroke-border-strong">
        <circle cx="15" cy="4.4" r="3.4" />
        <path d="M9 10 h12 l2.6 10.5 -3.2 1.2 -0.8 8.3 h-11.2 l-0.8 -8.3 -3.2 -1.2 z" />
        <path d="M10.6 31 h3.6 l-0.6 11.6 h-3.6 z M15.8 31 h3.6 l0.6 11.6 h-3.6 z" />
      </g>
      {/* Mirror-front convention: screen-left is the user's left, as the real
          site map has it. */}
      <circle cx="11.4" cy="22.6" r="2.4" className="fill-accent-amber" />
    </svg>
  );
}

export function SyringeGlyph() {
  return (
    <svg width="34" height="24" viewBox="0 0 44 24" aria-hidden focusable="false">
      <g fill="none" strokeWidth="1.2" strokeLinecap="round" className="stroke-border-strong">
        <path d="M2 12 h7" />
        <rect x="9" y="6.5" width="26" height="11" rx="1.6" />
        <path d="M35 9 h4 M37 6.5 v11" />
        <path d="M15 6.5 v3 M19 6.5 v3 M23 6.5 v3 M27 6.5 v3 M31 6.5 v3" strokeWidth="0.9" />
      </g>
      {/* The drawn volume, the calculator's one amber beat. */}
      <rect x="9.6" y="7.1" width="11" height="9.8" rx="1.2" className="fill-accent-amber" opacity="0.5" />
    </svg>
  );
}

export function SparkGlyph() {
  return (
    <svg width="34" height="22" viewBox="0 0 44 20" aria-hidden focusable="false">
      <defs>
        <linearGradient id="landingSpark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-line)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--chart-line)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M2 16 C 10 14, 14 9, 22 7.4 S 34 4, 42 3" fill="none" strokeWidth="1.5" strokeLinecap="round" className="stroke-chart-line" />
      <path d="M2 16 C 10 14, 14 9, 22 7.4 S 34 4, 42 3 L42 20 L2 20 Z" fill="url(#landingSpark)" />
      <circle cx="42" cy="3" r="2.1" className="fill-chart-line" />
    </svg>
  );
}

export function BellGlyph() {
  return (
    <svg width="22" height="26" viewBox="0 0 24 28" aria-hidden focusable="false">
      <g fill="none" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="stroke-border-strong">
        <path d="M5 19 c2.4 -1.6 2.2 -4.2 2.2 -7.2 a4.8 4.8 0 0 1 9.6 0 c0 3 -0.2 5.6 2.2 7.2 z" />
        <path d="M12 4.6 v-2" />
        <path d="M9.6 22.4 a2.6 2.6 0 0 0 4.8 0" />
      </g>
    </svg>
  );
}
