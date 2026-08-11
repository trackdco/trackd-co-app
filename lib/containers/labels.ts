/**
 * How a container is WORDED — the noun it is called by ("vial" / "bottle" /
 * "tub") and the amount-left line ("8.5 mL left", "60 caps left", "1 kg left").
 *
 * This exists because the wording was written six times and got it right twice.
 * `CompoundStorageCard` and `ProtocolScreen` both branched on `inventory_type`
 * correctly; `StockActionsSheet` and `LogDoseSheet` did not, and said "1000 mL
 * left" for a tub of creatine — a unit the thing has never been measured in.
 * Four other strings said "vial" outright ("Discard this vial", "Which vial this
 * dose comes off"), which is wrong for three quarters of the supplement
 * catalogue (Adrian, 2026-08-12: "we can't have it saying vial if it's not a
 * vial").
 *
 * **The noun is not a new taxonomy.** {@link containerFormFor} already answers
 * "which container is this" for the ARTWORK, and its three answers are already
 * the three English nouns. Wording therefore reads the same function the picture
 * does, so a compound can never be drawn as a tub and described as a vial in the
 * same row. Do not add a second mapping here — if the noun is wrong, the
 * container is wrong, and the fix belongs in `form.ts`.
 *
 * Pure helpers; no React, no side effects (code-standards.md).
 */
import {
  containerFormFor,
  type ContainerForm,
  type ContainerFormInput,
} from "@/lib/containers/form"
import { formatGrams } from "@/lib/protocol/vialFill"

/**
 * What to CALL this compound's container, mid-sentence: "vial", "bottle" or
 * "tub".
 *
 * A thin, deliberately-named alias over {@link containerFormFor} — the form
 * values are already the nouns, and naming the call site's intent is what stops
 * the next person hand-rolling `inventoryType === "bulk_powder" ? "tub" : …` for
 * the seventh time.
 */
export function containerNoun(input: ContainerFormInput): ContainerForm {
  return containerFormFor(input)
}

/** The same noun, capitalised, for a standalone value or the start of a
 *  sentence: "Vial", "Bottle", "Tub". */
export function containerNounTitle(input: ContainerFormInput): string {
  const noun = containerNoun(input)
  return noun.charAt(0).toUpperCase() + noun.slice(1)
}

/** The stock facts the amount-left line is worded from. A loose shape rather
 *  than `StockItem` so this stays pure and testable — the caller passes the
 *  three fields it reads and nothing else. */
export interface RemainingInput {
  inventoryType?: string | null
  /** The view's `remaining_display`, in the container's OWN measure. */
  remainingDisplay?: number | null
  /** `tab` or `capsule` for an oral; ignored otherwise. */
  totalAmountUnit?: string | null
}

/**
 * How much is physically left, worded as the container is read — "8.5 mL left",
 * "60 caps left", "1 kg left". Null when there is no figure to state, which the
 * caller words for itself (the Storage card says "Add stock"; the log sheet
 * omits the row entirely).
 *
 * Three units, because there are three containers:
 *  - a TUB is weighed. Grams up to a kilo, kilograms above it — the way the tub
 *    itself is labelled. See {@link formatGrams}; storage is grams throughout.
 *  - a BOTTLE is counted, in the unit it was STORED as. Using the stored
 *    `tab`/`capsule` rather than assuming tablets is what stops 60 capsules of
 *    NAC reading as "60 tabs left".
 *  - a VIAL is measured in millilitres.
 */
export function remainingLabel(stock: RemainingInput | null | undefined): string | null {
  const n = stock?.remainingDisplay
  if (stock == null || n == null) return null

  if (stock.inventoryType === "bulk_powder") return `${formatGrams(n)} left`

  if (stock.inventoryType === "oral_solid") {
    const one = n === 1
    const word =
      stock.totalAmountUnit === "capsule"
        ? one
          ? "cap"
          : "caps"
        : one
          ? "tab"
          : "tabs"
    return `${n} ${word} left`
  }

  return `${n} mL left`
}
