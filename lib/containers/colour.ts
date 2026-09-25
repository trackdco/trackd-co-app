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

/** Every shade set B derives from a container's one colour. */
export interface ContainerShades {
  /** Top stop of the contents gradient; the bottom stop is the colour itself. */
  contentsTop: string
  /** The lit band on a liquid's surface. */
  meniscus: string
  /** A SOLID's body: the glass tinted with the colour (clear glass holds liquids). */
  tintedGlass: string
  /** The outline of a tinted body. */
  tintedEdge: string
  /** A screw cap's body. Its top band is the colour itself. */
  capBody: string
  /** A screw cap's outline. */
  capEdge: string
}

/**
 * The container colour mixed into white or into the container greys, in set
 * B's proportions (build-brief-final §3.14). Computed from whatever colour it is
 * given, so a stack colour shades exactly as a category colour does, and the
 * greys are `--container-*` tokens, so a palette retune carries them.
 */
export function containerShades(colour: string): ContainerShades {
  const mix = (percent: number, other: string) =>
    `color-mix(in srgb, ${colour} ${percent}%, ${other})`
  return {
    contentsTop: mix(80, "white"),
    meniscus: mix(60, "white"),
    tintedGlass: mix(30, "var(--container-glass)"),
    tintedEdge: mix(44, "var(--container-edge)"),
    capBody: mix(62, "var(--container-rule)"),
    capEdge: mix(40, "var(--container-edge)"),
  }
}
