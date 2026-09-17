/**
 * Whether Home's week strip is expanded, remembered between sessions and
 * defaulting to OPEN (Spec 02).
 *
 * A `useSyncExternalStore` source rather than state synced in an effect:
 * localStorage is an external store, the server has no access to it, and an
 * effect that reads it on mount both trips the set-state-in-effect rule and
 * paints once with the wrong state before correcting itself. The server snapshot
 * is the documented default, so hydration matches whenever the user hasn't
 * changed it.
 *
 * Shared with the dashboard's loading shell (feel pass §1), which has to draw the
 * strip the way the screen will, or every card jumps at the handoff.
 */
const STRIP_OPEN_KEY = "trackd.home.weekStripOpen"
const STRIP_OPEN_EVENT = "trackd:week-strip-open"

export function getStripOpen(): boolean {
  if (typeof window === "undefined") return true
  try {
    return window.localStorage.getItem(STRIP_OPEN_KEY) !== "0"
  } catch {
    return true // storage off — the default stands
  }
}

export function writeStripOpen(open: boolean): void {
  try {
    window.localStorage.setItem(STRIP_OPEN_KEY, open ? "1" : "0")
  } catch {
    /* storage full / off — the strip still works, it just won't be remembered */
  }
  window.dispatchEvent(new CustomEvent(STRIP_OPEN_EVENT))
}

export function subscribeStripOpen(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(STRIP_OPEN_EVENT, cb)
  window.addEventListener("storage", cb)
  return () => {
    window.removeEventListener(STRIP_OPEN_EVENT, cb)
    window.removeEventListener("storage", cb)
  }
}
