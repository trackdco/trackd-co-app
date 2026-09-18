/**
 * The "Join the movement" cards (spec 3-03 §3.3).
 *
 * ## What these are, precisely
 *
 * Each card is a real customer's opinion, given to Adrian directly, written up
 * by him and published under an ALIAS. The names below belong to nobody: the
 * people behind them gave their feedback in conversation and have not been
 * asked to put their names on a website, and Adrian's decision (2026-09-19) is
 * that he is not going to ask them. Anonymising someone who told you what they
 * think is ordinary practice and is his call to make.
 *
 * What that does NOT stretch to, and why this file has no tick and no stars:
 *
 * - A "Verified" tick claims a checking step happened. None does.
 * - Five filled stars claim a rating. Nobody gave a number.
 *
 * Those are claims about our process rather than about what a customer thinks,
 * which is a different kind of statement from an aliased quote, and they are
 * the part a regulator would actually pick at. Adrian settled it on 2026-09-19:
 * the quotes go live, those two stay off. Both are still in git if a real
 * verification step and a real rating ever exist.
 *
 * ## ⚠️ The fourth card is the weakest of the four
 *
 * Dean C. began life as "Michael H.", written to build the carousel against at
 * a point when Adrian described it as invented rather than as someone's real
 * opinion. He has since asked for it to stay. If it is not standing on a real
 * conversation the way the other three are, it is the one to pull.
 *
 * ## The gate
 *
 * `PLACEHOLDER_TESTIMONIALS` is false, so `showTestimonials` renders the
 * section everywhere, production included. Set it back to true the moment a
 * card stops standing on something a real person actually said.
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
