import type { GlyphName } from "@/lib/solidGlyphs"

/**
 * The + fan's four items (build-brief-final §3.6), in fan order from the left
 * round to the top: Weight, Journal, Add compound, Add stock. No Calculator
 * (it is the middle tab) and no Log a dose (Home's rows do that). No UI here;
 * the arc itself is `lib/shortcuts/fan.ts`.
 */
export type ShortcutAction = "weight" | "journal" | "add-compound" | "add-stock"

export interface ShortcutItem {
  id: ShortcutAction
  label: string
  glyph: GlyphName
}

export const PLUS_ITEMS: ShortcutItem[] = [
  { id: "weight", label: "Weight", glyph: "menuWeight" },
  { id: "journal", label: "Journal", glyph: "menuJournal" },
  { id: "add-compound", label: "Add compound", glyph: "menuAddCompound" },
  { id: "add-stock", label: "Add stock", glyph: "menuAddStock" },
]
