/**
 * The syringe the user last picked — remembered on the device, so they choose
 * once and it sticks until they change it (Adrian, 2026-07-30).
 *
 * A blocking "which syringe?" gate was built first and then dropped: the UNITS
 * figure is identical on every barrel (10 units is 10 units), so the size only
 * changes the fill PROPORTION in the picture and the over-capacity threshold.
 * That is not worth making the screen inert over, and `DEFAULT_SYRINGE_SIZE`
 * covers the never-chosen case.
 *
 * Persistence is best-effort by design. The caller holds the choice in its own
 * state too, so a refused write costs the user the memory of it and nothing
 * else. Never make the UI read back from here to learn what was just clicked:
 * that turns a full storage quota into a screen where the pills do nothing.
 *
 * Device-local and unsynced: a preference about equipment, not a record.
 * Pure data + guarded storage only; no React (`code-standards.md`).
 */

import { isSyringeSizeId, type SyringeSizeId } from "./syringe"

const KEY = "trackd.calculator.syringeSize"

/** Fires on every write so `useSyncExternalStore` subscribers re-read. */
export const SYRINGE_CHOICE_EVENT = "trackd:calculator-syringe-size-changed"

/**
 * The remembered size, or `null` when the user has never chosen on this device.
 * A stored value that is not a real id reads as null rather than being trusted,
 * so a retired size can never select a barrel that no longer exists.
 */
export function loadSyringeChoice(): SyringeSizeId | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(KEY)
    return isSyringeSizeId(raw) ? raw : null
  } catch {
    // Storage off (private mode, cookies disabled). Falls back to the default
    // size; the calculator works, it just cannot remember a preference.
    return null
  }
}

/**
 * Remember a choice, or clear it with `null`. Silent on failure, which is safe
 * ONLY because the caller does not depend on this having worked.
 */
export function recordSyringeChoice(id: SyringeSizeId | null): void {
  if (typeof window === "undefined") return
  try {
    if (id) window.localStorage.setItem(KEY, id)
    else window.localStorage.removeItem(KEY)
  } catch {
    /* refused (quota, blocked storage) — the caller's own state still applies */
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
