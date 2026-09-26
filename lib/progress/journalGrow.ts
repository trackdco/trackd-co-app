/**
 * THE JOURNAL OPENS UPWARDS (W52, Adrian 26 Sep: "I want it to open upwards
 * instead of downwards so that when I click it, I don't have to scroll down
 * again"). Home's journal is the last card; opening it (or a tile's panel in
 * it) used to grow it downwards, below the fold. Now the page follows the
 * growth frame by frame so the card's bottom stays where it was (or comes up to
 * the bottom of what can be seen): the card grows up from where it sits and its
 * contents slide up into view. Closing runs the same path back.
 *
 * The page math is pure, here; the frame loop is in `HomeJournal.tsx`.
 */

/** The part of the screen the card may use, top and bottom, in screen px. */
export interface Band {
  top: number;
  bottom: number;
}

/**
 * Where the card's bottom is held while it grows: where it was, or the bottom
 * of what can be seen when it started lower than that (behind the tab bar or
 * the +), so "nothing needs a scroll".
 */
export function growAnchor(startBottom: number, band: Band): number {
  return Math.min(startBottom, band.bottom);
}

/**
 * How far to scroll the page this frame (positive: down) so the card's bottom
 * is back on its anchor. Growing, it never scrolls so far that `keepTop` (the
 * top of what was just opened) rises out of view: a card taller than the
 * screen shows its top, and the rest is a scroll away as before. Shrinking, it
 * scrolls back up, never above the page's top.
 */
export function growScroll(p: { bottom: number; anchor: number; keepTop: number; bandTop: number; scrollY: number }): number {
  const d = p.bottom - p.anchor;
  if (d > 0) return Math.max(0, Math.min(d, p.keepTop - p.bandTop));
  if (d < 0) return Math.max(d, -Math.max(0, p.scrollY));
  return 0;
}

/**
 * The vertical part of an inline CSS `translate` ("0 12.5px"), which the page's
 * scroll settle writes on each card: the loop measures where the card is laid
 * out, not where the settle has nudged it, so the two never chase each other.
 */
export function translateY(translate: string | null | undefined): number {
  if (!translate) return 0;
  const parts = translate.trim().split(/\s+/);
  if (parts.length < 2) return 0;
  const y = Number.parseFloat(parts[1]);
  return Number.isFinite(y) && /px$/.test(parts[1]) ? y : 0;
}
