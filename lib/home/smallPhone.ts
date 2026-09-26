/**
 * RULING 2 (26 Sep 2026): on a small iPhone Home drops "Good morning, <name>",
 * so the dose rows get its room.
 *
 * "Small" is the SE's box: 375 wide and at most 667 tall (548 in Safari with its
 * bars). Width as well as height, so a big phone in Safari with its bars showing
 * (about 390 by 660) keeps its greeting. Plain CSS, so the first paint is
 * already right and nothing jumps on hydration.
 *
 * Whole class names, because Tailwind only builds what it can read in the
 * source; `smallPhone.test.ts` reads the query back out of them.
 */
export const SMALL_PHONE_MAX_WIDTH = 380
export const SMALL_PHONE_MAX_HEIGHT = 700

/** Hides an element on a small phone. */
export const SMALL_PHONE_HIDDEN = "[@media(max-width:380px)_and_(max-height:700px)]:hidden"

/** For what sits under a hidden element: its top gap goes with it. */
export const SMALL_PHONE_NO_TOP = "[@media(max-width:380px)_and_(max-height:700px)]:mt-0"

/** The same test in code, for a viewport of `width` by `height` CSS pixels. */
export function isSmallPhone(width: number, height: number): boolean {
  return width <= SMALL_PHONE_MAX_WIDTH && height <= SMALL_PHONE_MAX_HEIGHT
}
