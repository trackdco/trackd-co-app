/**
 * The user's remembered dose UNIT per compound (Spec 03 → per-compound unit
 * defaults). The catalogue's `default_unit` is the starting point; the moment the
 * user overrides it on the add form, that choice becomes their default for that
 * compound so they never re-set it.
 *
 * Keyed by lowercased compound name — the one identifier shared by the catalogue,
 * custom compounds and the device stack. Device-local and unsynced: it is a
 * preference, not a record, and it never changes a stored dose value (the compound
 * carries its own `unit`, and a logged dose carries the unit it was logged in).
 *
 * Pure data + guarded storage only; no React (Context/code-standards.md).
 */

const storageKey = (userId: string) => `trackd.unitPrefs.${userId}`

type UnitPrefs = Record<string, string>

function load(userId: string): UnitPrefs {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const out: UnitPrefs = {}
    for (const [name, unit] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof unit === "string" && unit) out[name] = unit
    }
    return out
  } catch {
    return {}
  }
}

/**
 * The unit this user last chose for a compound, or null when they never have.
 * `allowed` is the compound's unit family — a remembered unit outside it is
 * ignored rather than applied, so a catalogue change (mg → iu, say) can never
 * leave a stale preference selecting a unit the form doesn't offer.
 */
export function loadUnitPref(
  userId: string,
  compoundName: string,
  allowed: readonly string[]
): string | null {
  const pref = load(userId)[compoundName.trim().toLowerCase()]
  return pref && allowed.includes(pref) ? pref : null
}

/** Remember the unit the user chose for this compound. Silent on failure. */
export function recordUnitPref(
  userId: string,
  compoundName: string,
  unit: string
): void {
  if (typeof window === "undefined") return
  const key = compoundName.trim().toLowerCase()
  if (!key || !unit) return
  try {
    const next = { ...load(userId), [key]: unit }
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next))
  } catch {
    // Storage full or disabled — ignore.
  }
}
