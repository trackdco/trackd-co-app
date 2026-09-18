/**
 * The "Join the movement" cards (spec 3-03 §3.3).
 *
 * ## These are real people, quoted under changed initials
 *
 * Ananth, Jasmine and Cam each told Adrian he could write a testimonial on
 * their behalf, and the surname initials here are NOT theirs: he changed every
 * one (2026-09-18) so a card cannot be tied back to a real account. That is
 * fine as long as the words stay the person's own honest opinion, which is the
 * only thing that makes a testimonial lawful to publish. If any of the three
 * later says their line is wrong, it comes down.
 *
 * ## ⚠️ THE FOURTH CARD IS MISSING ON PURPOSE. DO NOT WRITE ONE.
 *
 * There was a fourth, "Michael H.", and nobody said it. It was invented to
 * build the carousel against, and it is gone rather than live, because a
 * fabricated endorsement on a commercial page is misleading conduct no matter
 * how true it sounds. Its draft read:
 *
 *   "Found Trackd right before I started prepping for my bodybuilding show
 *    this coming November. I'm running a lot of compounds and the ease of
 *    adding to and tracking them was outstanding. Their 'Block' thing is also
 *    really cool too because I can see my progress photos, bloods and weight
 *    change all in that one period."
 *
 * Adrian is finding someone who will put their name to something like it. When
 * they do, add their OWN words here. Do not restore the draft above.
 *
 * ## The gate is open
 *
 * `PLACEHOLDER_TESTIMONIALS` is false, so `showTestimonials` renders the
 * section everywhere, production included. Set it back to true the moment any
 * card here stops being a real person's real opinion.
 */
export const PLACEHOLDER_TESTIMONIALS = false;

export interface Testimonial {
  name: string;
  /** Two letters for the avatar until real photos exist. */
  initials: string;
  quote: string;
}

export const TESTIMONIALS: readonly Testimonial[] = [
  {
    name: "Ananth P.",
    initials: "AP",
    quote:
      "Trackd works so well for me. I've been able to take all the thought out of what I'm running and just follow what I set for myself.",
  },
  {
    name: "Jasmine K.",
    initials: "JK",
    quote:
      "I'm fairly new to peptides and I wanted to do them safely. Trackd has helped me track my reta without doubling up injection sites, it helps me know when to reorder since I can track my stock, and the calculator helped me figure out how much to draw too. I'd highly recommend!!! :)",
  },
  {
    name: "Cam D.",
    initials: "CD",
    quote:
      "It's refreshing to have an app actually made by people who know ball and aren't just hopping on the peptide app bandwagon. I replaced my notes app in an afternoon and I won't be going back.",
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
