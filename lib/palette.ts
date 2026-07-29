/**
 * The twelve-colour user palette — the colours a user picks from when they
 * create a **cycle** (Spec 06) or a **stack** (Spec 05).
 *
 * Deep rather than pastel, none implying good or bad, none clashing with amber
 * or the `--cat-*` category hues. Values live as `--palette-*` tokens in
 * `globals.css` (the only place hex may appear) and are documented in
 * `ui-context.md`.
 *
 * Named neutrally on purpose: it started life as the cycle palette, but a stack
 * colour comes from the same twelve, and a token named for one feature reads
 * wrong in the other. A colour is stored as its NAME, never a hex value, so a
 * retune is a `globals.css` edit and never a data migration.
 *
 * Pure data; no React, no side effects (`code-standards.md`).
 */

export const PALETTE_COLOURS = [
  "slate",
  "steel",
  "teal",
  "moss",
  "olive",
  "bronze",
  "clay",
  "rosewood",
  "mauve",
  "plum",
  "indigo",
  "stone",
] as const

export type PaletteColour = (typeof PALETTE_COLOURS)[number]

export const PALETTE_LABELS: Record<PaletteColour, string> = {
  slate: "Slate",
  steel: "Steel",
  teal: "Teal",
  moss: "Moss",
  olive: "Olive",
  bronze: "Bronze",
  clay: "Clay",
  rosewood: "Rosewood",
  mauve: "Mauve",
  plum: "Plum",
  indigo: "Indigo",
  stone: "Stone",
}

export const DEFAULT_PALETTE_COLOUR: PaletteColour = "slate"

/** The CSS value for a palette colour — a token reference, never a literal. */
export function paletteColourVar(colour: PaletteColour): string {
  return `var(--palette-${colour})`
}

export function isPaletteColour(value: unknown): value is PaletteColour {
  return (
    typeof value === "string" &&
    (PALETTE_COLOURS as readonly string[]).includes(value)
  )
}
