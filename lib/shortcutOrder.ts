/**
 * Local-device persistence for the Shortcuts menu card order.
 *
 * The one carve-out to the placeholders' "no persistence" rule (see the feature
 * spec §6): only the ordered array of item ids is saved, device-local, never
 * synced — no user/cloud DB, no placeholder-input persistence. Uses the same
 * browser `localStorage` + per-user `trackd.*.<userId>` key convention as the
 * "Make your own" custom compounds (see `architecture.md` → Storage Model).
 */

const storageKey = (userId: string) => `trackd.shortcutOrder.${userId}`

/**
 * Load the saved card order for this user. Returns the id array, or `null` when
 * nothing is stored, storage is unavailable, or the stored value is unusable —
 * callers fall back to the default order in `shortcutItems.ts`.
 */
export function loadShortcutOrder(userId: string): string[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const ids = parsed.filter((id): id is string => typeof id === "string")
    return ids.length > 0 ? ids : null
  } catch {
    return null
  }
}

/**
 * Save the card order for this user. Returns false if the write failed (storage
 * full or disabled); the in-memory order still stands for the session.
 */
export function saveShortcutOrder(userId: string, ids: string[]): boolean {
  if (typeof window === "undefined") return false
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(ids))
    return true
  } catch {
    return false
  }
}
