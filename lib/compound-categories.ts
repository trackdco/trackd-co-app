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

/** One way a compound can be taken — a route paired with its inventory form
 *  (e.g. Glutathione: subQ → reconstituted, oral → tabs/caps). */
export interface RouteForm {
  /** im | subq | po | nasal */
  route: string
  /** reconstituted | preconcentrated | oral_solid */
  inventoryType: string
}

export interface Compound {
  name: string
  category: CompoundCategory
  aliases: string[]
  defaultUnit: string
  defaultRoute: string
  defaultInventoryType: string
  /** Every route this compound can be taken by, default first. When there's more
   *  than one, the Add sheet shows a route picker. Omitted for single-route
   *  compounds (fall back to the default via `routesOf`); also absent on custom
   *  compounds saved before this field existed. */
  routes?: RouteForm[]
  /** The name people actually use when the listed (scientific) name isn't it —
   *  e.g. Oxandrolone → "Anavar". Set only on that curated subset; drives the
   *  "aka …" chip in search. Absent ⇒ no chip (the listed name is the known one). */
  commonName?: string
  halfLifeHours: number | null
}

/** A compound's selectable routes, default first. Falls back to the single
 *  default route when `routes` is absent (single-route or legacy custom). */
export function routesOf(c: Compound): RouteForm[] {
  if (c.routes && c.routes.length > 0) return c.routes
  return [{ route: c.defaultRoute, inventoryType: c.defaultInventoryType }]
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

// Units that measure the same thing can be swapped freely (a compound dosed in
// mg can be entered in mcg or g, etc.). `iu`, `ml` and counts stand alone.
const UNIT_FAMILIES: string[][] = [
  ["mcg", "mg", "g"], // mass
  ["iu"], // activity units
  ["ml"], // volume
  ["capsule", "tab"], // count
]

/**
 * The interchangeable units a compound can be measured in, given its default —
 * e.g. a mg compound (Tirzepatide) also offers mcg + g, so the Add sheet can show
 * a unit dropdown. Falls back to just the default for an unknown unit.
 */
export function unitOptionsFor(unit: string): string[] {
  return UNIT_FAMILIES.find((f) => f.includes(unit)) ?? [unit]
}

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
