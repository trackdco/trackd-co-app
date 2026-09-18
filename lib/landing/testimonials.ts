/**
 * The "Join the movement" cards (spec 3-03 §3.3).
 *
 * ## ⚠️ TODO(3-03): THE GATE STAYS SHUT UNTIL ALL FOUR ARE APPROVED
 *
 * Adrian's copy pass (2026-09-18) replaced the invented quotes with real ones,
 * but they are not yet quotable:
 *
 * - **Ananth R., Jasmine M. and Cam W. are real people** who told Adrian he
 *   could write a testimonial on their behalf. Permission to write one is NOT
 *   the same as the words being their honest opinion, which is what a
 *   testimonial has to be. Each of the three has to see their own line and say
 *   yes to it before the section renders anywhere public.
 * - **Cam W. is a display name, not theirs** (Adrian, 2026-09-18). The real
 *   person is happy to be quoted; the name they gave collided with a founder's,
 *   which would have read as the founder reviewing his own product.
 * - **Michael H. is invented.** Adrian is finding someone who will put their
 *   name to roughly that. Until then it is the single thing keeping the flag
 *   below set, and it must not ship.
 *
 * ## The guard, so "must be approved" is not only a comment
 *
 * `PLACEHOLDER_TESTIMONIALS` is true while ANY of the four is unapproved, and
 * `showTestimonials` refuses to render them in a PRODUCTION build on Vercel.
 * Preview deployments and local dev still show them, which is where they are
 * useful. Production renders no reviews section at all and the header drops its
 * "Reviews" item with it, so nothing on the live site is ever labelled or shown
 * as a placeholder. When the yeses are in and Michael H. is replaced, set the
 * flag to false in the same change and the section ships.
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
    name: "Ananth R.",
    initials: "AR",
    quote:
      "Trackd works so well for me. I've been able to take all the thought out of what I'm running and just follow what I set for myself.",
  },
  {
    name: "Jasmine M.",
    initials: "JM",
    quote:
      "I'm fairly new to peptides and I wanted to do them safely. Trackd has helped me track my reta without doubling up injection sites, it helps me know when to reorder since I can track my stock, and the calculator helped me figure out how much to draw too. I'd highly recommend!!! :)",
  },
  {
    name: "Cam W.",
    initials: "CW",
    quote:
      "It's refreshing to have an app actually made by people who know ball and aren't just hopping on the peptide app bandwagon. I replaced my notes app in an afternoon and I won't be going back.",
  },
  {
    // ⚠️ INVENTED. Nobody said this. See the note at the top of this file.
    name: "Michael H.",
    initials: "MH",
    quote:
      'Found Trackd right before I started prepping for my bodybuilding show this coming November. I\'m running a lot of compounds and the ease of adding to and tracking them was outstanding. Their "Block" thing is also really cool too because I can see my progress photos, bloods and weight change all in that one period.',
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
