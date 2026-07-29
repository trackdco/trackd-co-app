/**
 * The colour a container is tinted. **No new colours are defined here** — every
 * value resolves to an existing `globals.css` token (Spec 01 · part two).
 *
 * Order of precedence:
 *  1. the stack's chosen colour, when the compound belongs to one (this is what
 *     produces a row of matching containers on a stack card),
 *  2. the compound's category colour, exactly as the small type icons already use,
 *  3. a neutral stone grey for a custom compound with no category — the existing
 *     `FALLBACK_CATEGORY_META` grey (`--text-muted`), not a fifth category hue.
 *
 * Values are returned as `var(--token)` strings because the artwork tints SVG
 * `fill`s, which Tailwind's `text-cat-*` utilities cannot reach.
 */

import { type CompoundCategory } from "@/lib/compound-categories"

/** Custom compound with no category. `--text-muted` is the warm stone grey the
 *  catalogue already falls back to, so this introduces nothing new. */
export const NEUTRAL_CONTAINER_COLOUR = "var(--text-muted)"

const CATEGORY_COLOUR: Record<CompoundCategory, string> = {
  anabolic: "var(--cat-anabolic)",
  oral: "var(--cat-oral)",
  sarm: "var(--cat-sarm)",
  peptide: "var(--cat-peptide)",
  ancillary: "var(--cat-ancillary)",
  thyroid: "var(--cat-thyroid)",
  supplement: "var(--cat-supplement)",
  stimulant: "var(--cat-stimulant)",
}

export interface ContainerColourInput {
  /** Catalogue category; absent or unknown on a custom compound. */
  category?: string | null
  /** The stack's colour, when this compound is in one. Overrides the category. */
  stackColour?: string | null
}

export function containerColour({
  category,
  stackColour,
}: ContainerColourInput = {}): string {
  if (stackColour) return stackColour
  return CATEGORY_COLOUR[category as CompoundCategory] ?? NEUTRAL_CONTAINER_COLOUR
}

/**
 * The meniscus / highlight shade — the resolved colour lifted toward white.
 * Computed rather than stored, so it tracks whatever colour it is given
 * (including a future stack colour) without a second table of hues.
 */
export function lightenContainerColour(colour: string): string {
  return `color-mix(in srgb, ${colour} 72%, white)`
}
