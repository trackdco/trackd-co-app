/**
 * "Recently used" — the short row of compounds at the top of the compound picker
 * (Spec 03). Device-local, same guarded-`localStorage` pattern as the stack and
 * dose-log stores; nothing about it is worth syncing, because it is a convenience
 * ordering rather than user data (losing it costs a scroll, not a record).
 *
 * Stores lowercased compound NAMES, most recent first, because a name is the one
 * identifier shared by the catalogue module, the custom compounds and the device
 * stack — ids differ between them.
 *
 * Pure data + guarded storage only; no React (Context/code-standards.md).
 */

/** How many the picker shows. Adrian's call (2026-07-29): 5 fits a phone row
 *  without scrolling and covers a typical run. */
export const RECENT_LIMIT = 5

const storageKey = (userId: string) => `trackd.recentCompounds.${userId}`

/** Most-recently-added names first, lowercased, capped. Empty when the user has
 *  never added anything — the picker omits the section entirely rather than
 *  showing an empty state. */
export function loadRecentCompounds(userId: string): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: string[] = []
    for (const item of parsed) {
      if (typeof item !== "string") continue
      const name = item.trim().toLowerCase()
      if (name && !out.includes(name)) out.push(name)
      if (out.length >= RECENT_LIMIT) break
    }
    return out
  } catch {
    return []
  }
}

/** Record a compound as just-added: moves it to the front, de-duplicates, and
 *  trims to {@link RECENT_LIMIT}. Silent on a storage failure — a lost recent is
 *  not worth interrupting an add for. */
export function recordRecentCompound(userId: string, name: string): void {
  if (typeof window === "undefined") return
  const key = name.trim().toLowerCase()
  if (!key) return
  try {
    const next = [key, ...loadRecentCompounds(userId).filter((n) => n !== key)].slice(
      0,
      RECENT_LIMIT
    )
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next))
  } catch {
    // Storage full or disabled — ignore.
  }
}
