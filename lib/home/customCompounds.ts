/**
 * Where "Make your own" compounds live on the device, and what other screens
 * may read from them. The Add-to-Stack menu owns the records (create, edit,
 * delete, the cloud mirror); this module owns the KEY, so a second reader —
 * the half-life card, which needs a custom compound's optional half-life —
 * reads the same records rather than a copy of the key that could drift.
 *
 * Pure reads with guarded storage; no React (code-standards.md).
 */

/** The device key for a user's custom compounds. */
export const customCompoundsKey = (userId: string) => `trackd.customCompounds.${userId}`

/**
 * Each custom compound's half-life in hours, by lower-cased name. Only those
 * with one; an empty map when storage is unavailable or unreadable, which reads
 * as "no half-life" rather than failing the screen.
 */
export function customHalfLives(userId: string): Map<string, number> {
  const out = new Map<string, number>()
  if (typeof window === "undefined") return out
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(customCompoundsKey(userId)) ?? "[]")
    if (!Array.isArray(parsed)) return out
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue
      const c = item as Record<string, unknown>
      if (typeof c.name !== "string") continue
      const hl = c.halfLifeHours
      if (typeof hl === "number" && Number.isFinite(hl) && hl > 0) out.set(c.name.trim().toLowerCase(), hl)
    }
  } catch {
    // Unreadable storage: no half-lives, and the screen carries on.
  }
  return out
}
