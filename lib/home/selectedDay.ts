/**
 * The day the user is currently parked on, published by whichever screen owns a
 * date selection (today the Home week strip) so that logging actions rendered
 * OUTSIDE that screen's tree can write to it.
 *
 * Why this exists: the quick-actions FAB is rendered once by the `(app)` shell,
 * not by `HomeScreen`, so it cannot receive the week strip's selected day as a
 * prop. It used to hardcode "today", which meant scrolling the strip back to
 * Tuesday and logging from the FAB wrote the dose to today — the exact
 * back-dating corruption `architecture.md` → Back-dating exists to prevent
 * ("the day the dashboard is parked on is the day you write to").
 *
 * Contract (Spec 01 · Dose & Schedule Integrity):
 *  - A screen WITH a date context publishes it while mounted and clears it on
 *    unmount, so the context never outlives the screen that owns it.
 *  - A consumer reads `getSelectedDayOrToday(todayKey)`: the published day when
 *    one exists, else today. There is no fallback to "now" when a day was
 *    supplied — that is the bug this module closes.
 *
 * Deliberately the SAME `useSyncExternalStore` shape as `stack.ts` / `doseLog.ts`
 * (subscribe + snapshot + a same-tab custom event), just held in memory rather
 * than `localStorage`: a transient UI selection is not state that should survive
 * a reload. Pure module state + pure helpers; no React.
 */
import type { DateKey } from "@/lib/home/mockHomeData"

const CHANGED_EVENT = "trackd:selected-day-changed"

/** The published day, or null when no screen currently owns a date selection. */
let selectedDay: DateKey | null = null

function notify() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT))
}

/**
 * Publish the day the owning screen is parked on. Called by the screen that owns
 * the selection; pass `null` on unmount so a stale day can never leak into a
 * later log made from another screen.
 */
export function setSelectedDay(key: DateKey | null): void {
  if (selectedDay === key) return
  selectedDay = key
  notify()
}

/** The published day, or null when nothing owns a selection right now. */
export function getSelectedDay(): DateKey | null {
  return selectedDay
}

/**
 * The day a logging action should write to: the published selection when a
 * screen owns one, else today. This is the ONLY resolution rule — a consumer
 * must never re-derive the target day from the clock.
 */
export function getSelectedDayOrToday(todayKey: DateKey): DateKey {
  return selectedDay ?? todayKey
}

export function subscribeSelectedDay(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(CHANGED_EVENT, callback)
  return () => window.removeEventListener(CHANGED_EVENT, callback)
}
