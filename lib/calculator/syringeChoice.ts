/**
 * The syringe the user says they are holding — remembered on the device.
 *
 * There is deliberately NO default (Adrian, 2026-07-30). The calculator's figure
 * is barrel-independent (10 units is 10 units on any syringe) but the GRAPHIC is
 * not: the same draw is a third of a 0.3 mL barrel and a fifth of a 0.5 mL one.
 * The whole argument for drawing a syringe is that people read the picture, so a
 * picture drawn against a barrel the user never confirmed is the one way this
 * screen could actively mislead. Nothing calculates until a size is chosen.
 *
 * Remembered, so the gate only asks once per device. Reset clears it, which is
 * also how you re-choose after switching barrels.
 *
 * Device-local and unsynced: it is a preference about equipment, not a record.
 * Pure data + guarded storage only; no React (`code-standards.md`).
 */

import { isSyringeSizeId, type SyringeSizeId } from "./syringe"

const KEY = "trackd.calculator.syringeSize"

/** Fires on every write so `useSyncExternalStore` subscribers re-read. */
export const SYRINGE_CHOICE_EVENT = "trackd:calculator-syringe-size-changed"

/**
 * The remembered size, or `null` when the user has never chosen (or chose and
 * then reset). A stored value that is not a real id reads as null rather than
 * being trusted, so a retired size can never select a barrel that no longer
 * exists.
 */
export function loadSyringeChoice(): SyringeSizeId | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(KEY)
    return isSyringeSizeId(raw) ? raw : null
  } catch {
    // Storage off (private mode, cookies disabled). The gate simply asks again
    // every visit, which is the safe direction to fail in.
    return null
  }
}

/** Remember a choice, or clear it with `null`. Silent on failure. */
export function recordSyringeChoice(id: SyringeSizeId | null): void {
  if (typeof window === "undefined") return
  try {
    if (id) window.localStorage.setItem(KEY, id)
    else window.localStorage.removeItem(KEY)
  } catch {
    /* storage refused — the choice still applies for this visit */
  }
  window.dispatchEvent(new CustomEvent(SYRINGE_CHOICE_EVENT))
}

/** Subscribe to changes, including from another tab (`storage`). */
export function subscribeSyringeChoice(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(SYRINGE_CHOICE_EVENT, cb)
  window.addEventListener("storage", cb)
  return () => {
    window.removeEventListener(SYRINGE_CHOICE_EVENT, cb)
    window.removeEventListener("storage", cb)
  }
}
