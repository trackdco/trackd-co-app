/**
 * The user's protocol "stack" — the per-compound dosing, schedule, and
 * injection-site rotation model (Context/Feature Specs/05-compound-rotation-
 * mechanics.md §3.1). Rotation is a property of each compound: the user picks
 * the sites and their cycle order once (in the add flow); the pointer advances
 * only when a dose is logged. There is no global rotation.
 *
 * Persisted device-local in `localStorage` keyed `trackd.stack.<userId>` — the
 * same interim pattern as the custom compounds (see `architecture.md` → Storage
 * Model). No backend this pass; migrates to Postgres `protocol_compounds` when
 * the cycle feature lands.
 *
 * Pure data + pure helpers + guarded storage only; no React, no other side
 * effects (Context/code-standards.md).
 */
import type { CompoundCategory } from "@/lib/compound-categories"

/**
 * How a compound is administered — taken verbatim from the compound database's
 * `route` (one fixed value per compound; multi-form compounds are separate
 * entries). The user does NOT choose it. Only `im`/`subq` have a site rotation.
 */
export type InjectionMethod = "im" | "subq" | "po" | "nasal"

/** When a compound is due. `daysOfWeek` is 0=Sun..6=Sat. */
export type Cadence =
  | { type: "daily" }
  | { type: "everyOtherDay" }
  | { type: "everyNDays"; n: number }
  | { type: "daysOfWeek"; days: number[] }

export interface Schedule {
  cadence: Cadence
  /** Default log time, 24h "HH:mm". */
  timeOfDay: string
  /** Cycle start, "YYYY-MM-DD". Anchors EOD / every-N-days and gates due dates. */
  startDate: string
}

/** Display label for a method (e.g. for the locked method on the add sheet). */
export function methodLabel(method: InjectionMethod): string {
  switch (method) {
    case "im":
      return "IM"
    case "subq":
      return "SubQ"
    case "po":
      return "Oral"
    case "nasal":
      return "Nasal"
  }
}

/** True for the two injectable methods that rotate through sites. */
export function isInjectable(method: InjectionMethod): boolean {
  return method === "im" || method === "subq"
}

/**
 * One compound in the user's active protocol.
 *  - `rotationSites` — ordered ticked site ids; **the order IS the cycle order**.
 *    Empty for oral compounds.
 *  - `rotationIndex` — internal pointer to the NEXT site. 0 for oral. Advanced
 *    only by logging a dose (never by date).
 */
export interface StackCompound {
  id: string
  name: string
  /** Drives the legend dot already used across the app. */
  category: CompoundCategory
  method: InjectionMethod
  dose: number
  unit: string
  schedule: Schedule
  rotationSites: string[]
  rotationIndex: number
  /** Archived = no longer dosed (hidden from present/future) but history kept.
   *  Reversible. Absent/false = active. */
  archived?: boolean
}

// `v2` bump: abandons any earlier-seeded device data so the app starts as a
// clean blank template (no demo compounds) for everyone.
const storageKey = (userId: string) => `trackd.stack.v2.${userId}`

/* ----------------------------------------------------------------- storage */

/**
 * Load the saved stack for this user, or `null` when nothing is stored, storage
 * is unavailable, or the value is unusable — callers fall back to the seed.
 * Every record is normalised so a corrupt / hand-edited entry can't crash the
 * Home screen (mirrors `loadCustoms` in the Add-to-Stack menu).
 */
export function loadStack(userId: string): StackCompound[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const out: StackCompound[] = []
    for (const item of parsed) {
      const c = normalizeCompound(item)
      if (c) out.push(c)
    }
    return out.length > 0 ? out : null
  } catch {
    return null
  }
}

/** Save the stack. Returns false if the write failed (quota full / disabled). */
export function saveStack(userId: string, stack: StackCompound[]): boolean {
  if (typeof window === "undefined") return false
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(stack))
    return true
  } catch {
    return false
  }
}

/** Add a new compound, or replace the existing one with the same id. Persists +
 *  notifies. Returns false if the write failed. */
export function upsertStack(userId: string, compound: StackCompound): boolean {
  const cur = loadStack(userId) ?? []
  const exists = cur.some((c) => c.id === compound.id)
  const next = exists
    ? cur.map((c) => (c.id === compound.id ? compound : c))
    : [...cur, compound]
  const ok = saveStack(userId, next)
  if (ok) notifyStackChanged()
  return ok
}

/** Archive (stop dosing, keep history) or reactivate a compound. */
export function archiveInStack(
  userId: string,
  id: string,
  archived: boolean
): boolean {
  const cur = loadStack(userId) ?? []
  const ok = saveStack(
    userId,
    cur.map((c) => (c.id === id ? { ...c, archived } : c))
  )
  if (ok) notifyStackChanged()
  return ok
}

/** Permanently remove a compound from the stack (the hard-delete path). Persists
 *  + notifies. Its logged history is cleared separately (see doseLog). */
export function removeFromStack(userId: string, id: string): boolean {
  const cur = loadStack(userId) ?? []
  const ok = saveStack(
    userId,
    cur.filter((c) => c.id !== id)
  )
  if (ok) notifyStackChanged()
  return ok
}

/**
 * A same-tab signal that the stack changed, so a sibling (the Home screen) can
 * re-read it without a full reload. `storage` events only fire across tabs, so
 * we dispatch our own.
 */
export const STACK_CHANGED_EVENT = "trackd:stack-changed"

export function notifyStackChanged() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(STACK_CHANGED_EVENT))
}

/* --------------------------------------- useSyncExternalStore integration */

/**
 * Subscribe to stack changes — same-tab (our custom event) and cross-tab (the
 * native `storage` event). Pairs with `getStackSnapshot` for `useSyncExternalStore`.
 */
export function subscribeStack(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(STACK_CHANGED_EVENT, callback)
  window.addEventListener("storage", callback)
  return () => {
    window.removeEventListener(STACK_CHANGED_EVENT, callback)
    window.removeEventListener("storage", callback)
  }
}

// `useSyncExternalStore` requires a STABLE snapshot reference between reads when
// nothing changed, or it loops. We cache by the raw stored string and only build
// a fresh array when that string (or the user) changes.
let snapshotCache: {
  userId: string
  raw: string | null
  value: StackCompound[]
} | null = null

/**
 * The current stack for `useSyncExternalStore`'s client snapshot: the stored
 * stack, or `fallback` (the seed) when nothing is stored. Returns the same
 * reference until the underlying storage actually changes.
 */
export function getStackSnapshot(
  userId: string,
  fallback: StackCompound[]
): StackCompound[] {
  if (typeof window === "undefined") return fallback
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(storageKey(userId))
  } catch {
    raw = null
  }
  if (snapshotCache && snapshotCache.userId === userId && snapshotCache.raw === raw) {
    return snapshotCache.value
  }
  const value = loadStack(userId) ?? fallback
  snapshotCache = { userId, raw, value }
  return value
}

/* ----------------------------------------------------------- rotation engine */

/** True for an injectable compound with at least one rotation site. */
export function hasRotation(c: StackCompound): boolean {
  return isInjectable(c.method) && c.rotationSites.length > 0
}

/** Keep the pointer in range after the sites array is edited. */
export function clampIndex(c: StackCompound): StackCompound {
  const len = c.rotationSites.length
  if (len === 0) return c.rotationIndex === 0 ? c : { ...c, rotationIndex: 0 }
  const idx = ((c.rotationIndex % len) + len) % len
  return idx === c.rotationIndex ? c : { ...c, rotationIndex: idx }
}

/** The site id the next dose should go into, or null when there's no rotation. */
export function nextSiteId(c: StackCompound): string | null {
  if (!hasRotation(c)) return null
  const len = c.rotationSites.length
  const idx = ((c.rotationIndex % len) + len) % len
  return c.rotationSites[idx] ?? null
}

/**
 * Advance the pointer to the slot AFTER the site actually logged (§3.7): find
 * the logged site in `rotationSites`, set index = (thatIndex + 1) % length.
 * Deterministic from the logged site, so editing a log re-derives correctly
 * (no double-advance). A site not in the list (or no rotation) leaves it as-is.
 */
export function advanceRotation(
  c: StackCompound,
  loggedSiteId: string | null
): StackCompound {
  if (!hasRotation(c) || !loggedSiteId) return c
  const i = c.rotationSites.indexOf(loggedSiteId)
  if (i < 0) return c
  const rotationIndex = (i + 1) % c.rotationSites.length
  return rotationIndex === c.rotationIndex ? c : { ...c, rotationIndex }
}

/* ------------------------------------------------- per-day site resolution */

/**
 * The site a compound resolves to on a given day: the site it was LOGGED at if
 * logged, otherwise its real next rotation site. **No auto-dodging** — this is
 * exactly what the rotation says, even if it clashes with another compound. The
 * app observes clashes and flags them; it never silently moves the user (per the
 * "tracking, not coaching" decision). Null for oral / nasal / no rotation.
 */
export function resolvedDaySite(
  c: StackCompound,
  loggedSiteId: string | null
): string | null {
  if (!hasRotation(c)) return null
  return loggedSiteId ?? nextSiteId(c)
}

/* ---------------------------------------------------------------- schedule */

/**
 * Whether a compound is due on a given local date. Nothing is due before the
 * start date; EOD / every-N-days count FROM the start date (so "every other day
 * from Tuesday" = Tue/Thu/Sat…). Deterministic and stable across renders.
 */
export function isDueOn(schedule: Schedule, date: Date): boolean {
  const start = parseDateKey(schedule.startDate)
  const dayN = daysSinceEpoch(date)
  if (start && dayN < daysSinceEpoch(start)) return false
  const anchor = start ? daysSinceEpoch(start) : 0
  const { cadence } = schedule
  switch (cadence.type) {
    case "daily":
      return true
    case "everyOtherDay":
      return mod(dayN - anchor, 2) === 0
    case "everyNDays":
      return cadence.n > 0 ? mod(dayN - anchor, cadence.n) === 0 : false
    case "daysOfWeek":
      return cadence.days.includes(date.getDay())
  }
}

/** The next `count` due dates on/after `from` (local), as "YYYY-MM-DD" keys. */
export function upcomingDoseDates(
  schedule: Schedule,
  from: Date,
  count: number
): string[] {
  const out: string[] = []
  const start = parseDateKey(schedule.startDate)
  let cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  if (start && cursor.getTime() < start.getTime()) {
    cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  }
  for (let i = 0; i < 400 && out.length < count; i++) {
    if (isDueOn(schedule, cursor)) out.push(toDateKeyLocal(cursor))
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
  }
  return out
}

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MON_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/** "2026-06-16" → "Tue 16 Jun". Falls back to the raw key if unparseable. */
export function formatDateKeyShort(key: string): string {
  const d = parseDateKey(key)
  if (!d) return key
  return `${DOW_SHORT[d.getDay()]} ${d.getDate()} ${MON_SHORT[d.getMonth()]}`
}

/** A short human label for a cadence, e.g. "Every other day", "Mon · Thu". */
export function cadenceLabel(cadence: Cadence): string {
  switch (cadence.type) {
    case "daily":
      return "Daily"
    case "everyOtherDay":
      return "Every other day"
    case "everyNDays":
      return `Every ${cadence.n} days`
    case "daysOfWeek": {
      const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      const days = [...cadence.days].sort((a, b) => a - b)
      return days.length ? days.map((d) => names[d] ?? "").join(" · ") : "No days"
    }
  }
}

/**
 * Sanitise a typed dose: digits + a single decimal point, capped at 5 whole
 * digits and 3 decimal places (precise enough for peptide dosing, bounded so a
 * fat-fingered entry can't run away).
 */
export function sanitizeDoseInput(raw: string): string {
  let v = raw.replace(/[^0-9.]/g, "")
  const dot = v.indexOf(".")
  if (dot !== -1) {
    v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, "")
  }
  const [int = "", dec] = v.split(".")
  const clampedInt = int.slice(0, 5)
  return v.includes(".") ? `${clampedInt}.${(dec ?? "").slice(0, 3)}` : clampedInt
}

/** "07:30" → "7:30 AM". Falls back to the raw string if it isn't HH:mm. */
export function formatTimeLabel(time24: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time24)
  if (!m) return time24
  let h = Number(m[1])
  const min = m[2]
  const period = h >= 12 ? "PM" : "AM"
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${min} ${period}`
}

/* ----------------------------------------------------------------- internal */

function mod(a: number, n: number): number {
  return ((a % n) + n) % n
}

/** Whole local days since the Unix epoch (DST-safe — uses the local midnight). */
function daysSinceEpoch(date: Date): number {
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.floor(midnight.getTime() / 86_400_000)
}

/** Parse a "YYYY-MM-DD" key to a local-midnight Date, or null if malformed. */
function parseDateKey(key: unknown): Date | null {
  if (typeof key !== "string") return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function toDateKeyLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

const METHODS: InjectionMethod[] = ["im", "subq", "po", "nasal"]

function normalizeCompound(item: unknown): StackCompound | null {
  if (!item || typeof item !== "object") return null
  const c = item as Record<string, unknown>
  if (typeof c.id !== "string" || typeof c.name !== "string") return null
  // Legacy "oral" route maps to the database's "po".
  const rawMethod = c.method === "oral" ? "po" : c.method
  const method = METHODS.includes(rawMethod as InjectionMethod)
    ? (rawMethod as InjectionMethod)
    : "po"
  const rotationSites = Array.isArray(c.rotationSites)
    ? c.rotationSites.filter((s): s is string => typeof s === "string")
    : []
  const rawIndex = typeof c.rotationIndex === "number" ? c.rotationIndex : 0
  return clampIndex({
    id: c.id,
    name: c.name,
    category: (typeof c.category === "string"
      ? c.category
      : "anabolic") as CompoundCategory,
    method,
    dose: typeof c.dose === "number" ? c.dose : 0,
    unit: typeof c.unit === "string" ? c.unit : "mg",
    schedule: normalizeSchedule(c.schedule),
    rotationSites: isInjectable(method) ? rotationSites : [],
    rotationIndex: rawIndex,
    archived: c.archived === true,
  })
}

function normalizeSchedule(raw: unknown): Schedule {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const timeOfDay = typeof s.timeOfDay === "string" ? s.timeOfDay : "09:00"
  // Legacy records have no start date; "1970-01-01" reads as "already started"
  // (always due) and keeps EOD/every-N anchored consistently.
  const startDate =
    parseDateKey(s.startDate) !== null ? (s.startDate as string) : "1970-01-01"
  const cad = s.cadence as Record<string, unknown> | undefined
  const type = cad?.type
  if (type === "everyOtherDay")
    return { cadence: { type }, timeOfDay, startDate }
  if (type === "everyNDays" && typeof cad?.n === "number")
    return { cadence: { type, n: cad.n }, timeOfDay, startDate }
  if (type === "daysOfWeek" && Array.isArray(cad?.days))
    return {
      cadence: {
        type,
        days: (cad.days as unknown[]).filter(
          (d): d is number => typeof d === "number"
        ),
      },
      timeOfDay,
      startDate,
    }
  return { cadence: { type: "daily" }, timeOfDay, startDate }
}
