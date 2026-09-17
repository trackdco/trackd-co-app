/**
 * The "Join the movement" cards (spec 3-03 §3.3).
 *
 * ## ⚠️ TODO(3-03): EVERY QUOTE BELOW IS A PLACEHOLDER
 *
 * Nobody said these. They exist so the carousel can be built and looked at,
 * and they must be replaced with real, attributable reviews (with the
 * reviewer's permission) before this page reaches trackdco.app. A fabricated
 * testimonial on a live page is misleading conduct, and review flagged exactly
 * this on the last build.
 *
 * The names are deliberately first-name-and-initial rather than handles, so a
 * placeholder cannot collide with a real person's account.
 *
 * ## The guard, so "must be replaced" is not only a comment
 *
 * `PLACEHOLDER_TESTIMONIALS` is true while these are invented, and
 * `showTestimonials` refuses to render invented ones in a PRODUCTION build on
 * Vercel. Preview deployments and local dev still show them, which is where
 * they are useful. When real quotes land, set the flag to false in the same
 * change and the section ships.
 */
export const PLACEHOLDER_TESTIMONIALS = true;

export interface Testimonial {
  name: string;
  /** Two letters for the avatar until real photos exist. */
  initials: string;
  quote: string;
}

export const TESTIMONIALS: readonly Testimonial[] = [
  {
    name: "Jordan K.",
    initials: "JK",
    quote:
      "I ran my protocol out of a notes app for two years. This replaced it in an afternoon, and I actually open it.",
  },
  {
    name: "Sam R.",
    initials: "SR",
    quote:
      "The injection site map is the thing I did not know I needed. I can see what has rested without thinking about it.",
  },
  {
    name: "Priya D.",
    initials: "PD",
    quote:
      "Knowing how much is left in the vial, and the day it runs out, took a weekly worry off my plate.",
  },
  {
    name: "Luke T.",
    initials: "LT",
    quote:
      "Clean, quick, and it never tries to tell me what to take. It just keeps the record straight.",
  },
];

/**
 * Whether the section may render. Invented quotes never render on Vercel's
 * production environment; everything else (preview, dev, a local build) shows
 * them.
 */
export function showTestimonials(
  env: { VERCEL_ENV?: string } = { VERCEL_ENV: process.env.VERCEL_ENV },
  placeholder: boolean = PLACEHOLDER_TESTIMONIALS,
): boolean {
  if (!placeholder) return true;
  return env.VERCEL_ENV !== "production";
}

/**
 * Which card a carousel is showing: the one whose left edge is nearest the
 * scroll position. Pure, so the dots can be tested without a browser.
 *
 * `offsets` are each card's `offsetLeft` relative to the scroller, already
 * adjusted for the scroller's leading padding.
 *
 * ⚠️ `maxScroll` is what lets the LAST dot light. On a wide screen the
 * scroller runs out of room before the last card's edge reaches the scroll
 * position, so by distance alone the last card could never be "nearest" and
 * its dot would never turn on. At the end of the track, it is the last card.
 */
export function nearestIndex(
  scrollLeft: number,
  offsets: readonly number[],
  maxScroll?: number,
): number {
  if (offsets.length === 0) return 0;
  if (maxScroll !== undefined && maxScroll > 0 && scrollLeft >= maxScroll - 2) {
    return offsets.length - 1;
  }
  let best = 0;
  let bestDistance = Infinity;
  offsets.forEach((o, i) => {
    const d = Math.abs(o - scrollLeft);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  return best;
}
