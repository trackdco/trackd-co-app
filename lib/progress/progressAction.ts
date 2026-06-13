/**
 * A tiny client-only signal so another surface (the global "+" menu, or the
 * Calendar) can ask the Progress screen to open one of its real flows — the
 * **Journal** compose (Write / Markers), a specific day's **Journal** entry, or
 * the **Bloodwork** gallery — without duplicating their server-fetched data. The
 * caller invokes `requestProgressAction(...)` and then navigates to `/progress`;
 * the matching section subscribes, opens its sheet, and clears the signal. A
 * monotonic `id` makes a repeat request of the same action re-fire. Module state
 * survives client (SPA) navigation and resets on a full reload — fine, it's only
 * a transient "open this now" nudge, never persisted.
 */
export type ProgressAction =
  | "journal-compose"
  | "journal-open"
  | "bloodwork-gallery"
  | "photos-gallery";

export interface ProgressActionSignal {
  action: ProgressAction;
  id: number;
  /** Optional target — e.g. the 'YYYY-MM-DD' day for `journal-open`. */
  date?: string;
}

let pending: ProgressActionSignal | null = null;
let counter = 0;
const listeners = new Set<() => void>();

export function requestProgressAction(
  action: ProgressAction,
  date?: string,
): void {
  counter += 1;
  pending = { action, id: counter, date };
  for (const l of listeners) l();
}

export function peekProgressAction(): ProgressActionSignal | null {
  return pending;
}

/** Clear the signal once a section has handled it (no-ops if already replaced). */
export function clearProgressAction(id: number): void {
  if (pending?.id === id) pending = null;
}

export function subscribeProgressAction(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
