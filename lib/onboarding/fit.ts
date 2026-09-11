/**
 * Fitting the onboarding flow to a SHORT phone.
 *
 * Every flow screen was laid out against Adrian's handset, whose box is 700px
 * tall once Safari's bars are counted. An iPhone SE in Safari has 548px. The CTA
 * is pinned (`ui-context.md` → "a full-screen flow is PINNED"), so on the SE the
 * whole shortfall used to come out of the scroll port: Kyle, the answer ticks,
 * the cost total and the hook's own headline all sat underneath the button, and
 * the one screen whose job is "you're in" cut its last line in half with no fade
 * to say there was more (Adrian, on his dad's SE, 2026-09-11).
 *
 * ## The shortfall is paid for by the art and the air, never by the words
 *
 * A length written as `fit(tall, short)` is `tall` on a box of
 * {@link FIT_TALL_PX} or more, `short` on a box of {@link FIT_SHORT_PX} or less,
 * and moves in a straight line between. So:
 *
 * - **A handset at 700px or taller renders exactly as before.** Not "close":
 *   `--flow-short` is `0px` there and every `fit()` resolves to its `tall`
 *   figure, which is the value the screen was tuned at.
 * - **Type never shrinks.** Only images, mock-ups and spacing take a `fit()`.
 *   A smaller phone is not a reason to make a sentence harder to read.
 * - **It keeps going to a ZOOMED SE, then stops.** An SE with Display Zoom on
 *   is 454px in Safari, and it is a setting people who want bigger text turn
 *   on. So the same line carries on past 548 to {@link FIT_FLOOR_PX}; below
 *   that (a phone on its side) nothing gets any smaller and the scroll port
 *   does what it always did. CSS clamps any padding that would go negative.
 *
 * ## Why this is not the height branch the hook's comment warns about
 *
 * `globals.css` records two attempts to branch on height that broke on a real
 * phone: a media query, which measures a DIFFERENT box from the one this flow is
 * laid out in, and a size container, which Safari mishandled. `--flow-short` is
 * neither. It is written in `svh`, and `.flow-viewport` is `100svh` tall, so the
 * number it reads and the box it sizes are the same length by construction.
 * Nothing is contained, and no branch is taken: it is one continuous value.
 */

/** The box every flow screen was tuned against: Adrian's handset in Safari. */
export const FIT_TALL_PX = 700;

/** Where a `fit()` reaches its `short` figure: an iPhone SE in Safari. */
export const FIT_SHORT_PX = 548;

/** Where it stops moving: the same SE with Display Zoom turned on. */
export const FIT_FLOOR_PX = 454;

/**
 * A length for an inline `style`: `tall` px on a tall box, `short` px on an SE.
 *
 * `floor` stops it there on a zoomed SE instead of carrying on down the line.
 * Give one to anything that stops working below a size rather than merely
 * getting tighter: a tap target (44px is the house minimum), or a gap whose
 * whole job is to be seen. Art and plain air take none.
 *
 * It only moves inside `.flow-viewport`, which is where `--flow-short` is
 * defined. Anywhere else the variable falls back to `0px` and this is `tall`.
 */
export function fit(tall: number, short: number, floor?: number): string {
  if (tall === short) return `${tall}px`;
  const perPx = (tall - short) / (FIT_TALL_PX - FIT_SHORT_PX);
  // Rounded so the style attribute stays readable; 5 places is well under a
  // hundredth of a pixel across the whole range.
  const length = `calc(${tall}px - var(--flow-short, 0px) * ${Number(perPx.toFixed(5))})`;
  return floor === undefined ? length : `max(${floor}px, ${length})`;
}
