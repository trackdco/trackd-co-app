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
 * `CompoundForm` (Adrian's call, 2026-07-29) — an oral anabolic gets a bottle.
 *
 * **Among SUPPLEMENTS that split was wrong for three quarters of the catalogue**
 * (Adrian, on his own phone, 2026-07-31): every `supplement` drew a tub, so
 * vitamin C and vitamin D3 — tablets and softgels, which is how essentially
 * everyone buys them — were pictured as scoops of powder. Category cannot tell
 * creatine from cholecalciferol because both are `supplement`.
 *
 * The catalogue already carries the signal that can: the DOSE UNIT. A supplement
 * measured in **grams** is a powder you scoop (whey, creatine, collagen,
 * glutamine, EAA, BCAA, taurine, citrulline, beta-alanine — 9 of the 84). One
 * measured in mg, mcg, iu or capsules is a tablet, capsule or softgel. That is a
 * fact already in `compounds.csv`, so this needs no migration and no new column;
 * it just stops throwing the information away.
 */

import {
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
  routesOf,
  type CompoundCategory,
} from "@/lib/compound-categories"
import { COMPOUNDS } from "@/lib/compounds-catalogue"
import type { InventoryType } from "@/lib/db/types"

export type ContainerForm = "vial" | "bottle" | "tub"

/** The four `inventory_type` values, as a type guard. Lives here because this is
 *  the module that answers "what form is this compound", and a second copy is
 *  exactly how the container resolvers drifted apart twice before (see
 *  `inventoryTypeForCompound`). Anything unrecognised — a hand-edited device
 *  record, a value from a future migration — falls through to the name+route
 *  derivation rather than being trusted. */
export function isInventoryForm(v: unknown): v is InventoryType {
  return (
    v === "reconstituted" ||
    v === "preconcentrated" ||
    v === "oral_solid" ||
    v === "bulk_powder"
  )
}

/**
 * The compound's OWN stated form, when it has one
 * (`protocol_compounds.inventory_form`, `supabase/protocol/023`). It wins over
 * every derivation below, because it is the only input here that is a fact
 * rather than an inference: the catalogue knows how a compound is usually sold,
 * and this knows what is on the user's shelf.
 *
 * `bulk_powder` is the reason this exists. No route implies it — creatine is
 * `po`, exactly like a capsule — so the powder/tablet split among supplements
 * had to be guessed from the catalogue's dose unit (grams are scooped). That
 * guess stays as the fallback and is right for the catalogue's 84 compounds; it
 * cannot be right for a compound the catalogue has never seen.
 */
function statedForm(inventoryType?: string | null): ContainerForm | null {
  if (inventoryType === "bulk_powder") return "tub"
  return null
}

/**
 * ⚠️ KNOWN GAP, deliberately left (review, 2026-08-07).
 *
 * A user who explicitly states `oral_solid` for a gram-dosed supplement — "my
 * creatine is capsules" — still gets a TUB, because `isScoopedPowder` below
 * reads the catalogue's dose unit and overrules them.
 *
 * It is not fixable HERE. `inventoryTypeForCompound` returns the string
 * `"oral_solid"` whether it was stored or derived, so this function genuinely
 * cannot tell a stated form from a guessed one. Fixing it properly means adding
 * a `stated` flag to `ContainerFormInput` and threading it through all twelve
 * call sites.
 *
 * Left because the blast radius is worse than the bug: `isScoopedPowder` returns
 * TRUE for an unresolvable name, so every off-catalogue "make your own"
 * supplement currently draws a tub. Making `oral_solid` mean "bottle"
 * unconditionally would silently reclassify all of them, which is the exact
 * reclassification that comment was written to prevent.
 *
 * Narrow in practice: `014` retyped every gram-dosed catalogue supplement to
 * `bulk_powder`, so the derivation now answers correctly on its own for all 13.
 * Only a deliberate override lands here.
 */

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

/**
 * Can stock be recorded for this form at all? True for all four, which is the
 * point: it used to be `isVialForm`, and that was not a claim about vials but a
 * claim about which fields the add-compound form happened to have (Spec 03).
 *
 * Kept as its own named function rather than inlined as `!!form`, because the
 * two questions are genuinely different and the codebase has already conflated
 * them once. `isVialForm` still means "is it a vial" and is still the right test
 * for anything about syringes, draws or reconstitution.
 */
export function isStockableForm(inventoryType?: string | null): boolean {
  return isInventoryForm(inventoryType)
}

export interface ContainerFormInput {
  /** `reconstituted | preconcentrated | oral_solid`, from the compound's route. */
  inventoryType?: string | null
  /** Catalogue category; absent or unknown on a custom compound. */
  category?: string | null
  /**
   * The compound's name, used to look its dose unit up in the catalogue and so
   * tell a scooped powder from a tablet. Optional: a decorative container (the
   * empty-state previews) has no compound behind it, and an off-catalogue
   * "make your own" supplement has no unit to read.
   */
  name?: string | null
}

/**
 * Is this supplement a POWDER? Answered from the catalogue's dose unit: grams
 * are scooped, everything else is counted out.
 *
 * An unresolvable name keeps the old answer (a tub) rather than silently
 * reclassifying every custom supplement someone has already added.
 */
function isScoopedPowder(name?: string | null): boolean {
  if (!name) return true
  const lower = name.trim().toLowerCase()
  const cat = COMPOUNDS.find((x) => x.name.toLowerCase() === lower)
  if (!cat) return true
  return cat.defaultUnit === "g"
}

export function containerFormFor({
  inventoryType,
  category,
  name,
}: ContainerFormInput): ContainerForm {
  // A stated form wins over every inference below it — see `statedForm`.
  const stated = statedForm(inventoryType)
  if (stated) return stated

  // A vial is a vial regardless of what it holds.
  if (isVialForm(inventoryType)) return "vial"

  const meta = CATEGORY_META[category as CompoundCategory] ?? FALLBACK_CATEGORY_META

  if (inventoryType === "oral_solid") {
    if (meta.form !== "supplement") return "bottle"
    return isScoopedPowder(name) ? "tub" : "bottle"
  }

  // No inventory form recorded (a legacy custom compound) — fall back to the
  // category's typical form rather than guessing a bottle.
  if (meta.form === "injectable") return "vial"
  if (meta.form !== "supplement") return "bottle"
  return isScoopedPowder(name) ? "tub" : "bottle"
}

/**
 * The inventory form for a compound the device store holds, resolved from the
 * catalogue by name + route.
 *
 * The device stack records what the user takes, not how it is packaged, so the
 * container artwork has to look the form up. **Every surface calls THIS
 * function; there are no private copies left.** That is the whole point of it,
 * and it has been got wrong twice:
 *
 *  1. Protocol's copy fell back to the ROUTE for an off-catalogue compound while
 *     the others returned null, so a custom subQ blend drew a vial on Protocol
 *     and a bottle on Home. Protocol's fallback was the better one and is now
 *     everyone's: a custom injectable is a vial because it is injected, not
 *     because the catalogue happens to list it.
 *  2. Consolidating onto that fallback then made a SURVIVING copy in
 *     `CompoundDetailSheet` disagree with it — on Home, where nothing had
 *     disagreed before, because both had returned null together. A custom
 *     supplement drew a vial in the row and a tub in the sheet you open from
 *     that row, one tap apart. The copy is gone; `containersHaveOneSource` in
 *     `geometry.test.ts` fails the build if a sixth one appears.
 *
 * ~~KNOWN GAP: an off-catalogue `nasal` compound resolves as injectable and draws
 * a vial, and the "Make your own" form's Inventory type answer is never read
 * back.~~ **CLOSED** by `supabase/protocol/023`: the answer is stored on
 * `protocol_compounds.inventory_form`, carried on `StackCompound.inventoryForm`,
 * and passed here as `stored`. The derivation below is unchanged and is still
 * what answers for every compound added before that migration — which is most of
 * them, so do not delete it.
 */
export function inventoryTypeForCompound(
  name: string,
  method: string,
  /** The compound's own stated form, when it has one. Wins outright: it is the
   *  user's answer about their own shelf, where everything below is an
   *  inference from a catalogue. */
  stored?: string | null,
): string | null {
  if (stored) return stored
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
