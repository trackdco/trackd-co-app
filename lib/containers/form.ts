/**
 * Which container a compound is drawn as — a vial for injectables, a bottle for
 * tablets and capsules, a tub for powders.
 *
 * **Selection is driven by FORM, not category** (Spec 01 · part two). The test is
 * the compound's inventory form — the same signal that gates the stock step in
 * `AddCompoundSheet` (`canStock`) — so a future oral anabolic renders a bottle
 * with no special-casing.
 *
 * The one place category is consulted: nothing in the data model says "powder".
 * `inventory_items` only knows `reconstituted | preconcentrated | oral_solid`, so
 * the bottle/tub split among orals falls back to the catalogue's existing
 * `CompoundForm` (Adrian's call, 2026-07-29) — creatine gets a tub, an oral
 * anabolic still gets a bottle.
 */

import {
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
  routesOf,
  type CompoundCategory,
} from "@/lib/compound-categories"
import { COMPOUNDS } from "@/lib/compounds-catalogue"

export type ContainerForm = "vial" | "bottle" | "tub"

/**
 * Does this inventory form come in a VIAL? The single test behind both the
 * container artwork and the stock step in `AddCompoundSheet` (Spec 03's
 * `canStock`), so the two can never disagree about what a vial is.
 *
 * Deliberately takes ONLY the inventory form — never a category — because this
 * is the question "is it a vial", not "what should we draw".
 */
export function isVialForm(inventoryType?: string | null): boolean {
  return inventoryType === "reconstituted" || inventoryType === "preconcentrated"
}

export interface ContainerFormInput {
  /** `reconstituted | preconcentrated | oral_solid`, from the compound's route. */
  inventoryType?: string | null
  /** Catalogue category; absent or unknown on a custom compound. */
  category?: string | null
}

export function containerFormFor({
  inventoryType,
  category,
}: ContainerFormInput): ContainerForm {
  // A vial is a vial regardless of what it holds.
  if (isVialForm(inventoryType)) return "vial"

  const meta = CATEGORY_META[category as CompoundCategory] ?? FALLBACK_CATEGORY_META

  if (inventoryType === "oral_solid") {
    return meta.form === "supplement" ? "tub" : "bottle"
  }

  // No inventory form recorded (a legacy custom compound) — fall back to the
  // category's typical form rather than guessing a bottle.
  if (meta.form === "injectable") return "vial"
  return meta.form === "supplement" ? "tub" : "bottle"
}

/**
 * The inventory form for a compound the device store holds, resolved from the
 * catalogue by name + route.
 *
 * The device stack records what the user takes, not how it is packaged, so the
 * container artwork has to look the form up. This lives here because FIVE
 * surfaces need it — the dashboard's stack row and day widgets, Protocol's
 * compound row, stacks and cycles views, the compound detail sheet, and the
 * Progress photo Running list — and private copies are exactly how two of them
 * end up drawing a different container for the same compound. That was not
 * hypothetical: Protocol's copy fell back to the ROUTE for an off-catalogue
 * compound while the others returned null, so a custom subQ blend drew a vial on
 * Protocol and a bottle on Home.
 *
 * Protocol's fallback was the better one and is now everyone's: a custom
 * injectable is a vial because it is injected, not because the catalogue happens
 * to list it.
 */
export function inventoryTypeForCompound(
  name: string,
  method: string,
): string | null {
  const lower = name.trim().toLowerCase()
  const cat = COMPOUNDS.find((x) => x.name.toLowerCase() === lower)
  if (cat) {
    const forms = routesOf(cat)
    const found =
      (forms.find((f) => f.route === method) ?? forms[0])?.inventoryType ?? null
    if (found) return found
  }
  // Off-catalogue (a "make your own" compound): the route is the only signal,
  // and it is a good one.
  return method === "po" ? "oral_solid" : "preconcentrated"
}
