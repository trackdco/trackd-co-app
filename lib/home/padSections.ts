/**
 * THE ADD-COMPOUND PAD, ONE SECTION AT A TIME (Adrian's walk, W20).
 *
 * The Add compound sheet types every number on one Trakabl pad. It carried
 * every field on the sheet as a chip, so tapping Dose showed Volume and
 * Strength beside it, and Next walked from the dose into the stock. Now the
 * pad carries only the fields of the section it was opened in, the way the
 * "mL left" field already has a pad of its own: a dose shows Dose, Dose 2 and
 * so on; Stock on hand shows its own amounts (Volume and Strength, or Powder
 * and Water, Count and Strength each, Tub and Serving).
 *
 * Pure: the sheet passes its field ids; nothing here knows about React.
 */

/** Where a field sits on the sheet. An id this file does not know is a
 *  section of its own, so an unknown field never joins another's chain. */
export type PadSection = "dose" | "often" | "cycle" | "stock" | `own:${string}`

const STOCK_IDS = new Set([
  "stPowder",
  "stBac",
  "stMl",
  "stConc",
  "stCount",
  "stStrength",
  "stTubGrams",
  "stServingG",
])
const CYCLE_IDS = new Set(["cycleOn", "cycleOff", "cycleRounds"])

/** The section a pad field belongs to, by its id. */
export function padSectionOf(id: string): PadSection {
  if (id === "dose" || /^later-\d+$/.test(id)) return "dose"
  if (id === "everyN") return "often"
  if (CYCLE_IDS.has(id)) return "cycle"
  if (STOCK_IDS.has(id)) return "stock"
  return `own:${id}`
}

/**
 * The fields the pad carries: those in `section`, in the sheet's order. With
 * no section yet (the pad has never opened), none.
 */
export function fieldsInSection<T extends { id: string }>(fields: T[], section: PadSection | null): T[] {
  if (section === null) return []
  return fields.filter((f) => padSectionOf(f.id) === section)
}

/**
 * The section the pad shows: the open field's while one is open, and the
 * last one while it slides away (so the closing pad keeps showing the field
 * it was on, and never blanks or jumps to another section's first field).
 */
export function liveSection(activeId: string | null, last: PadSection | null): PadSection | null {
  return activeId === null ? last : padSectionOf(activeId)
}

/** The pad's announced name for a section. */
export function padSectionLabel(section: PadSection | null): string {
  switch (section) {
    case "dose":
      return "Dose"
    case "often":
      return "How often"
    case "cycle":
      return "Cycle"
    case "stock":
      return "Stock on hand"
    default:
      return "Compound numbers"
  }
}
