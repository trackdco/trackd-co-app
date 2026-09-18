/**
 * The "Join the movement" cards (spec 3-03 §3.3).
 *
 * ## ⚠️ EVERY CARD BELOW IS INVENTED. NOBODY SAID ANY OF IT.
 *
 * These were briefly three real people, quoted under changed initials, and the
 * section went live on that basis. Adrian's instruction on 2026-09-18 was that
 * "the reviews will just be fake reviews for now" and that the names should all
 * be different again, so they are placeholders once more and the names below
 * belong to nobody.
 *
 * `PLACEHOLDER_TESTIMONIALS` is therefore TRUE again and the section does not
 * render on trackdco.app. That is not a leftover to tidy up: it is the only
 * thing standing between invented testimonials and a live commercial page,
 * which is misleading conduct no matter how plausible the wording. Preview
 * deployments and local dev still show them, which is where they are useful.
 *
 * The verified tick and the five stars are back on the card for the same
 * reason and under the same condition: they are part of the mock. Both state
 * something nobody did, so if the gate is ever opened they come off again
 * unless a real verification step and a real rating exist by then.
 *
 * ## What it takes to open the gate
 *
 * Real people, their own words, each having seen their own line and agreed to
 * it. Then set the flag false, take the tick and the stars off unless they have
 * become true, and change the expectation in `testimonials.test.ts` in the
 * same commit.
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
    name: "Ryan T.",
    initials: "RT",
    quote:
      "Trackd works so well for me. I've been able to take all the thought out of what I'm running and just follow what I set for myself.",
  },
  {
    // Shortened at Adrian's request using only the words already here: the
    // clause about the calculator and how much to draw came out, because it
    // was the one sentence putting a dosing decision in a customer's mouth.
    name: "Mia L.",
    initials: "ML",
    quote:
      "I'm fairly new to peptides and I wanted to do them safely. Trackd has helped me track my reta without doubling up injection sites, and it helps me know when to reorder since I can track my stock. I'd highly recommend!!! :)",
  },
  {
    name: "Josh N.",
    initials: "JN",
    quote:
      "It's refreshing to have an app actually made by people who know ball and aren't just hopping on the peptide app bandwagon. I replaced my notes app in an afternoon and I won't be going back.",
  },
  {
    name: "Dean C.",
    initials: "DC",
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
