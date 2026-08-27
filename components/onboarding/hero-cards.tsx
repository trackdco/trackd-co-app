"use client";

import { CARD_EYEBROW } from "@/lib/ui-presets";
import { cn } from "@/lib/utils";

/**
 * The four cards on the hook screen (Adrian, 2026-08-27).
 *
 * ## They are DRAWN, not captured, and that is the whole point
 *
 * The hook used to be a screenshot of the Notes app wiped against a screenshot
 * of the dashboard, inside a drawn phone. It failed for a reason worth writing
 * down, because it is not obvious from the code: both captures are near-black
 * with white text, so the "difference" the wipe existed to show was invisible,
 * and at the size the frame rendered (~177px wide in a 390 viewport) body copy
 * landed about 4px tall. The screen was two dark rectangles.
 *
 * These are simplified builds of real surfaces instead — markup and inline SVG
 * in the app's own tokens. Three things follow from that:
 *
 *   1. Everything is legible, because nothing is scaled down.
 *   2. It cannot go stale the way a capture does. A screenshot has to be
 *      re-taken when a screen changes (see `app-carousel.tsx`, which carries
 *      exactly that warning); these are components.
 *   3. No phone is drawn inside a phone. The device is already in their hand.
 *
 * ## One grid, four cards, and why the dose card is built the same way
 *
 * Every card is an eyebrow above a `graphic · label · figure` row. That
 * uniformity was arrived at by getting it wrong twice: first the dose card was
 * the only one WITHOUT a figure on the right, so it read short beside
 * `6.5 mL` / `9 d` / `83.9 kg`; then all four were flattened to a single row to
 * match, and they came out thin. The two-row build is where the height comes
 * from, and the dose card gets a figure (`250 mg`) so nothing looks like an
 * afterthought.
 *
 * ## Sites, not the calculator
 *
 * The fourth pillar was a syringe with a unit conversion on it. Adrian swapped
 * it for the site map: a body with a marker on it is a more distinctive thing
 * to put in front of a stranger than arithmetic, and it is the one feature no
 * competitor has. The calculator card is kept below, unused, because the swap
 * back is meant to be one line.
 */

/** A hairline vial with its liquid level, as the containers module draws it. */
function VialGlyph() {
  return (
    <svg width="21" height="34" viewBox="0 0 20 34" aria-hidden focusable="false">
      <rect x="6" y="1" width="8" height="3.4" rx="1" className="fill-border-strong" />
      <rect
        x="3.2"
        y="4.6"
        width="13.6"
        height="28"
        rx="3.4"
        fill="none"
        strokeWidth="1.2"
        className="stroke-border-strong"
      />
      {/* Roughly 60% full. A drawn level rather than a percentage, because the
          card is a picture of a vial and not a readout of one. */}
      <path
        d="M4.4 16 h11.2 v13.4 a2.2 2.2 0 0 1 -2.2 2.2 h-6.8 a2.2 2.2 0 0 1 -2.2 -2.2 z"
        className="fill-cat-anabolic"
        opacity="0.55"
      />
      <rect x="4.4" y="15.4" width="11.2" height="1.2" rx="0.6" className="fill-cat-anabolic" />
    </svg>
  );
}

/**
 * A torso with one site marked.
 *
 * Deliberately NOT the real body map (`demo-body.tsx`): that one is a region
 * map with hit targets and a sex-aware sprite behind it, and none of that
 * survives being drawn at 22px. This is a glyph of that idea.
 */
function BodyGlyph() {
  return (
    <svg width="22" height="34" viewBox="0 0 30 44" aria-hidden focusable="false">
      <g fill="none" strokeWidth="1.1" strokeLinejoin="round" className="stroke-border-strong">
        <circle cx="15" cy="4.4" r="3.4" />
        <path d="M9 10 h12 l2.6 10.5 -3.2 1.2 -0.8 8.3 h-11.2 l-0.8 -8.3 -3.2 -1.2 z" />
        <path d="M10.6 31 h3.6 l-0.6 11.6 h-3.6 z M15.8 31 h3.6 l0.6 11.6 h-3.6 z" />
      </g>
      {/* The one amber beat in the whole column. Mirror-front convention:
          screen-left is the user's left, same as the real site map. */}
      <circle cx="11.4" cy="22.6" r="2.4" className="fill-accent-amber" />
    </svg>
  );
}

/** A weight trend, in the neutral chart blue rather than anything evaluative. */
function SparkGlyph() {
  return (
    <svg width="34" height="22" viewBox="0 0 44 20" aria-hidden focusable="false">
      <defs>
        <linearGradient id="heroSpark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-line)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--chart-line)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M2 4 C 8 5, 12 8, 18 9.6 S 32 14, 42 16 L42 20 L2 20 Z" fill="url(#heroSpark)" />
      <path
        d="M2 4 C 8 5, 12 8, 18 9.6 S 32 14, 42 16"
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="stroke-chart-line"
      />
      <circle cx="42" cy="16" r="2.1" className="fill-chart-line" />
    </svg>
  );
}

/**
 * A logged dose: a filled white mark, which is what `ui-context.md` prescribes
 * for a SETTLED state. The tick draws itself once, after the card has landed.
 */
function LoggedTick() {
  return (
    <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-accent-primary">
      <svg width="15" height="15" viewBox="0 0 18 18" aria-hidden focusable="false">
        <path
          d="M4 9.3 L7.5 12.9 L14 5.6"
          fill="none"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-hero-tick stroke-bg-base"
        />
      </svg>
    </span>
  );
}

/**
 * The syringe, kept for the swap back.
 *
 * The barrel's liquid sits against the NEEDLE end with the plunger pushed in
 * behind it, which is the way a drawn syringe actually looks and was wrong in
 * the first two drafts. `scale-x-[-1]` points the needle left.
 */
export function SyringeGlyph() {
  return (
    <svg
      width="34"
      height="17"
      viewBox="0 0 60 16"
      aria-hidden
      focusable="false"
      className="scale-x-[-1]"
    >
      <rect
        x="9"
        y="4"
        width="36"
        height="8"
        rx="1.6"
        fill="none"
        strokeWidth="1"
        className="stroke-border-strong"
      />
      <rect x="30" y="4.7" width="14.4" height="6.6" rx="1" className="fill-cat-anabolic" opacity="0.62" />
      <g strokeWidth="0.8" className="stroke-border-strong">
        <line x1="16" y1="4" x2="16" y2="7" />
        <line x1="23" y1="4" x2="23" y2="7" />
        <line x1="30" y1="4" x2="30" y2="7" />
        <line x1="37" y1="4" x2="37" y2="7" />
      </g>
      <rect x="28.2" y="3.6" width="2.4" height="8.8" rx="0.6" className="fill-border-strong" />
      <rect x="2.5" y="7.2" width="26" height="1.6" rx="0.8" className="fill-border-strong" />
      <rect x="0" y="3.6" width="3" height="8.8" rx="1" className="fill-border-strong" />
      <line x1="45" y1="8" x2="56" y2="8" strokeWidth="1.3" className="stroke-border-strong" />
      <line x1="56" y1="8" x2="59.5" y2="8" strokeWidth="0.8" className="stroke-text-subtle" />
    </svg>
  );
}

function HeroCard({
  eyebrow,
  glyph,
  label,
  value,
  unit,
  delay,
}: {
  eyebrow: string;
  glyph: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  delay: number;
}) {
  return (
    <div
      // `aria-hidden`: the whole column is a picture of the app, and a screen
      // reader walking four fake dose readings before the headline would be
      // reading out data this user does not have. The headline says what the
      // screen is.
      aria-hidden
      className={cn(
        "animate-hero-card flow-card hero-card flex w-full flex-col rounded-[18px] bg-bg-surface",
        // Sizing lives in `globals.css` under `@container flow`, NOT in a
        // height media query. On a phone those measure different boxes — the
        // media query sees the viewport with the toolbars counted in, this
        // element is `100svh` without them, and the gap between the two is
        // ~175px on a 16 Pro. See `.flow-viewport`.
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className={cn(CARD_EYEBROW, "text-[9px] tracking-[0.17em]")}>{eyebrow}</p>
      <div className="grid grid-cols-[36px_1fr_auto] items-center gap-[13px]">
        <span className="grid w-9 place-items-center">{glyph}</span>
        <span className="min-w-0">
          <p className="truncate text-sm leading-tight tracking-[-0.01em] text-foreground">
            {label}
          </p>
        </span>
        <span className="hero-value font-mono font-light leading-none tracking-[-0.03em] tabular-nums text-foreground">
          {value}
          <small className="text-[0.46em] tracking-normal text-text-muted">{unit}</small>
        </span>
      </div>
    </div>
  );
}

/**
 * The column. Cards land staggered, each with a little overshoot so it reads as
 * arriving rather than appearing — a ONE-SHOT entrance, which is the side of
 * the motion rule this belongs on.
 */
export function HeroCards() {
  return (
    <div className="hero-stack flex w-full flex-col">
      <HeroCard
        eyebrow="Anabolics"
        glyph={<LoggedTick />}
        label="Testosterone Enanthate"
        value="250"
        unit="mg"
        delay={120}
      />
      <HeroCard
        eyebrow="Stock"
        glyph={<VialGlyph />}
        label="28 days left"
        value="6.5"
        unit="mL"
        delay={250}
      />
      <HeroCard
        eyebrow="Sites"
        glyph={<BodyGlyph />}
        label="Left abdomen"
        value="9"
        unit="d rested"
        delay={380}
      />
      <HeroCard
        eyebrow="Progress"
        glyph={<SparkGlyph />}
        label="Down 2.5kg"
        value="83.9"
        unit="kg"
        delay={510}
      />
    </div>
  );
}
