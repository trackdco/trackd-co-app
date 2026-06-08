/**
 * Compound taxonomy: the category union, the per-category display label + legend
 * dot colour, and the option lists for the "Make your own" form.
 *
 * The dot colours are an **organisational legend** (a UI-accent use of the
 * palette tokens), never a health-data value — so the "categorical, never
 * evaluative" invariant is untouched. Colours are limited to the ui-context
 * palette (no new hex); related categories share a hue.
 */

export type CompoundCategory =
  | "anabolic"
  | "oral"
  | "sarm"
  | "peptide"
  | "ancillary"
  | "thyroid"
  | "supplement"
  | "stimulant"

export interface Compound {
  name: string
  category: CompoundCategory
  aliases: string[]
  defaultUnit: string
  defaultRoute: string
  defaultInventoryType: string
  halfLifeHours: number | null
}

interface CategoryMeta {
  label: string
  dot: string
}

// One distinct, muted hue per category (tokens defined in globals.css).
export const CATEGORY_META: Record<CompoundCategory, CategoryMeta> = {
  anabolic: { label: "Anabolics", dot: "bg-cat-anabolic" },
  oral: { label: "Orals", dot: "bg-cat-oral" },
  sarm: { label: "SARMs", dot: "bg-cat-sarm" },
  peptide: { label: "Peptides", dot: "bg-cat-peptide" },
  ancillary: { label: "Ancillaries", dot: "bg-cat-ancillary" },
  thyroid: { label: "Thyroid", dot: "bg-cat-thyroid" },
  supplement: { label: "Supplements", dot: "bg-cat-supplement" },
  stimulant: { label: "Stimulants", dot: "bg-cat-stimulant" },
}

// Neutral fallback for a missing/unknown category (e.g. a hand-edited or stale
// localStorage entry) so a row renders harmlessly instead of crashing.
export const FALLBACK_CATEGORY_META: CategoryMeta = {
  label: "Other",
  dot: "bg-text-muted",
}

// Option lists for the "Make your own" form — mirror the catalogue's own enums.
export const CATEGORY_OPTIONS: { value: CompoundCategory; label: string }[] = (
  Object.entries(CATEGORY_META) as [CompoundCategory, CategoryMeta][]
).map(([value, meta]) => ({ value, label: meta.label }))

export const UNIT_OPTIONS = [
  { value: "mg", label: "mg" },
  { value: "mcg", label: "mcg" },
  { value: "iu", label: "iu" },
  { value: "g", label: "g" },
  { value: "capsule", label: "capsule" },
] as const

export const ROUTE_OPTIONS = [
  { value: "im", label: "IM" },
  { value: "subq", label: "SubQ" },
  { value: "po", label: "Oral" },
  { value: "nasal", label: "Nasal" },
] as const

export const INVENTORY_TYPE_OPTIONS = [
  { value: "reconstituted", label: "Reconstituted" },
  { value: "preconcentrated", label: "Oil (pre-mixed)" },
  { value: "oral_solid", label: "Tabs / caps" },
] as const
