/**
 * Has this session's first cloud hydration finished? (feel pass §1)
 *
 * Home could not tell "not loaded yet" from "no compounds": the server snapshot
 * is always the empty seed stack, `loadStack` reads a stored `[]` as `null`, and
 * `useCloudHydration` exposed nothing. So the first-run instructions showed on
 * every cold load, for seconds on a fresh device, to people with a full
 * protocol.
 *
 * This is the missing signal, per user, for the life of the page:
 *
 * - `pending` — the first pull has not come back. Home shows a skeleton, unless
 *   the device already has a stack to show.
 * - `done` — it came back. An empty stack now really is empty.
 * - `failed` — it errored, or took too long. Home falls back to whatever the
 *   device has rather than waiting forever; the retry on focus/online still runs.
 *
 * Once `done` it stays `done` for the page's life: a revisit to Home shows the
 * screen at once, never a skeleton.
 *
 * In memory on purpose. A cold launch is exactly when the device's copy might
 * be stale, so nothing about a previous session is trusted here.
 */

export type HydrationState = "pending" | "done" | "failed"

const states = new Map<string, HydrationState>()
const EVENT = "trackd:hydration"

/** An account with nothing to pull ("anon", the dev preview) is never pending. */
export function getHydrationState(userId: string): HydrationState {
  if (!userId || userId === "anon") return "done"
  return states.get(userId) ?? "pending"
}

export function setHydrationState(userId: string, next: HydrationState): void {
  const cur = states.get(userId)
  // `done` is final: a later failed re-sync (on focus, offline) must not turn a
  // loaded screen back into a fallback.
  if (cur === next || cur === "done") return
  states.set(userId, next)
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT))
}

export function subscribeHydrationState(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(EVENT, callback)
  return () => window.removeEventListener(EVENT, callback)
}

/** For tests: forget every user. */
export function resetHydrationStates(): void {
  states.clear()
}
