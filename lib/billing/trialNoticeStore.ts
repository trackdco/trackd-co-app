/**
 * WHETHER THIS DEVICE HAS CLOSED THE TRIAL NOTICE — a device-local preference,
 * in the same `useSyncExternalStore` shape as the stack and dose stores.
 *
 * ## Why it is a store and not `useState` + an effect
 *
 * The value has to be read from `localStorage`, which only exists after mount,
 * and setting state inside an effect to reflect it is both a lint error
 * (`react-hooks/set-state-in-effect`) and a real double render on every load.
 * `useSyncExternalStore` reads the device directly and gives the server its own
 * snapshot, so SSR and the first client render agree without a flash.
 *
 * ## The rule this obeys, from `architecture.md`
 *
 * **A refused `localStorage` write must never break the screen.** Reading a
 * preference back OUT of storage to decide what to render is what bricked the
 * calculator's syringe gate when a device refused the write. So every access
 * here is wrapped, and every failure resolves to NOT DISMISSED — the direction
 * that keeps showing a notice about money rather than silently swallowing it.
 */

const KEY = "trackd.trialNotice.dismissed.v1";
const CHANGED_EVENT = "trackd:trial-notice-changed";

/** Same-tab (our own event) and cross-tab (the native `storage` event). */
export function subscribeTrialNotice(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGED_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGED_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/**
 * Dismissed in THIS session, whether or not the device would store it.
 *
 * Without this, a device that refuses `localStorage` (private mode, a blocked
 * origin, a full quota) would take the tap, fail the write, read back null and
 * re-render the banner exactly as it was — a close button that visibly does
 * nothing. Holding it in memory means the tap always works now, and the comment
 * on the write is honest that it only fails to persist to the NEXT load.
 */
let sessionDismissed: string | null = null;

/**
 * The reminder date this device has dismissed, or null.
 *
 * A plain string or null, so the snapshot reference is stable between reads by
 * construction and `useSyncExternalStore` cannot loop on it. (The stack store
 * needs a cache for exactly this reason; a primitive does not.)
 */
export function getTrialNoticeDismissed(): string | null {
  if (typeof window === "undefined") return null;
  if (sessionDismissed) return sessionDismissed;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    // Private mode, a blocked origin, a full quota. Not dismissed.
    return null;
  }
}

/**
 * The SERVER's snapshot. Always null: the server cannot read the device, and
 * claiming "dismissed" there would hide the notice for one render and then pop
 * it in on hydration.
 */
export function getTrialNoticeServerSnapshot(): null {
  return null;
}

/** Close the notice for one trial, identified by its promised reminder date. */
export function dismissTrialNotice(forDate: string): void {
  if (typeof window === "undefined") return;
  sessionDismissed = forDate;
  try {
    window.localStorage.setItem(KEY, forDate);
  } catch {
    // Refused. The notice comes back on the next load, which is the safe
    // direction for a notice about a charge.
  }
  // Fired even if the write failed, so the current render still responds to the
  // tap. The store is the source of truth for the NEXT load, not for this one.
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
}
