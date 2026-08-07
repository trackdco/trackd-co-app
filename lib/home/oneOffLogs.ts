/**
 * One-off logs — something taken once, off-plan (Spec w2b-13, Step 8).
 *
 * Device-local, keyed `trackd.oneoff.v1.<userId>`, mirroring the dose-log store
 * so both behave the same offline.
 *
 * **A one-off references the CATALOGUE, never a protocol row.** That single
 * decision is what lets it appear in history while counting toward nothing:
 * consistency, the runway, stock and the compound picker all read
 * `protocol_compounds` / `dose_logs`, and this is neither — so it is excluded
 * from all four by absence rather than by four filters somebody has to remember.
 * See `supabase/protocol/020`'s header before changing what it points at.
 *
 * Pure data + pure helpers + guarded storage only; no React
 * (`Context/code-standards.md`).
 */
import { combineLocalDateTime } from "@/lib/home/mockHomeData"
import { deleteOneOffLog, upsertOneOffLog } from "@/lib/db/oneOffLogs"
import { trackCriticalSync, trackSync } from "@/lib/home/syncStatus"


/** A unit a one-off may be recorded in. Wider than `dose_unit` — a scoop is a
 *  real way to measure something you took once, and the enum has no business
 *  learning it, because the enum guards inventory maths a one-off never touches. */
export const ONE_OFF_UNITS = [
  "g",
  "mg",
  "mcg",
  "iu",
  "ml",
  "tab",
  "capsule",
  "scoop",
] as const

export type OneOffUnit = (typeof ONE_OFF_UNITS)[number]

export interface OneOffLog {
  /**
   * A RANDOM uuid, generated on the client — the only such id in the app.
   *
   * Everywhere else the id is derived from its own fields so a replay overwrites
   * in place. Here there is nothing to derive it from that would not collide
   * with a legitimate second entry: two one-offs of the same thing on the same
   * day must both survive. Held from the moment of writing and reused on every
   * replay, which is what preserves idempotency without a deterministic key.
   */
  id: string
  /** What it was. Always present, and what every surface displays. */
  label: string
  /** The catalogue compound's NAME when it is one, so history can draw the
   *  right container and category. Absent for a user's own compound, whose
   *  identity lives on the device. */
  compoundName?: string
  /** Its category, for the container's colour. Absent when unknown. */
  category?: string
  /** How it is taken, for resolving which container to draw. */
  method?: string
  amount?: string
  unit?: OneOffUnit
  /** The DEVICE's local day, "YYYY-MM-DD". */
  loggedFor: string
  /** 24h "HH:mm", or "" when unset. */
  time24: string
  note?: string
}

/** `{ "YYYY-MM-DD": OneOffLog[] }` — a LIST per day, not a map, because two
 *  entries of the same thing on the same day are both legitimate. */
export type OneOffDays = Record<string, OneOffLog[]>

const EMPTY: OneOffDays = {}
const storageKey = (userId: string) => `trackd.oneoff.v1.${userId}`

function isUnit(v: unknown): v is OneOffUnit {
  return typeof v === "string" && (ONE_OFF_UNITS as readonly string[]).includes(v)
}

/** Guard one stored record. A row with no id or no label is unusable — it could
 *  neither be displayed nor deleted — so it drops rather than being repaired. */
export function normalizeOneOff(raw: unknown): OneOffLog | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  if (typeof o.id !== "string" || !o.id) return null
  const label = typeof o.label === "string" ? o.label.trim() : ""
  if (!label) return null
  if (typeof o.loggedFor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.loggedFor)) {
    return null
  }
  return {
    id: o.id,
    label,
    ...(typeof o.compoundName === "string" && o.compoundName
      ? { compoundName: o.compoundName }
      : {}),
    ...(typeof o.category === "string" && o.category ? { category: o.category } : {}),
    ...(typeof o.method === "string" && o.method ? { method: o.method } : {}),
    ...(typeof o.amount === "string" && o.amount ? { amount: o.amount } : {}),
    ...(isUnit(o.unit) ? { unit: o.unit } : {}),
    loggedFor: o.loggedFor,
    time24: typeof o.time24 === "string" ? o.time24 : "",
    ...(typeof o.note === "string" && o.note ? { note: o.note } : {}),
  }
}

export function loadOneOffs(userId: string): OneOffDays {
  if (typeof window === "undefined") return EMPTY
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return EMPTY
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return EMPTY
    const out: OneOffDays = {}
    for (const [day, list] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue
      const kept = list
        .map(normalizeOneOff)
        .filter((l): l is OneOffLog => l !== null)
      if (kept.length > 0) out[day] = kept
    }
    return out
  } catch {
    return EMPTY
  }
}

export function saveOneOffs(userId: string, days: OneOffDays): boolean {
  if (typeof window === "undefined") return false
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(days))
    return true
  } catch {
    return false
  }
}

const CHANGED_EVENT = "trackd:oneoff-changed"

export function notifyOneOffsChanged(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT))
}

export function subscribeOneOffs(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(CHANGED_EVENT, callback)
  window.addEventListener("storage", callback)
  return () => {
    window.removeEventListener(CHANGED_EVENT, callback)
    window.removeEventListener("storage", callback)
  }
}

// Stable snapshot for useSyncExternalStore — cached by the raw stored string.
let cache: { userId: string; raw: string | null; value: OneOffDays } | null = null

export function getOneOffsSnapshot(userId: string): OneOffDays {
  if (typeof window === "undefined") return EMPTY
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(storageKey(userId))
  } catch {
    raw = null
  }
  if (cache && cache.userId === userId && cache.raw === raw) return cache.value
  const value = loadOneOffs(userId)
  cache = { userId, raw, value }
  return value
}

/* ------------------------------------------------------------------ reads */

/** Every one-off on a day, earliest first. */
export function oneOffsOn(days: OneOffDays, dateKey: string): OneOffLog[] {
  return [...(days[dateKey] ?? [])].sort((a, b) =>
    (a.time24 || "99:99").localeCompare(b.time24 || "99:99")
  )
}

/** Does this day have any? What the calendar's distinct mark is drawn from. */
export function hasOneOffOn(days: OneOffDays, dateKey: string): boolean {
  return (days[dateKey]?.length ?? 0) > 0
}

/** One entry per distinct label in `[from, to]`, with how many times it appears.
 *  What a block's look-back lists under its own heading. */
export function oneOffsInWindow(
  days: OneOffDays,
  from: string,
  to: string
): { label: string; count: number; compoundName?: string; category?: string; method?: string }[] {
  const byLabel = new Map<
    string,
    { label: string; count: number; compoundName?: string; category?: string; method?: string }
  >()
  for (const [day, list] of Object.entries(days)) {
    if (day < from || day > to) continue
    for (const l of list) {
      const key = l.label.toLowerCase()
      const seen = byLabel.get(key)
      if (seen) seen.count += 1
      else {
        byLabel.set(key, {
          label: l.label,
          count: 1,
          ...(l.compoundName ? { compoundName: l.compoundName } : {}),
          ...(l.category ? { category: l.category } : {}),
          ...(l.method ? { method: l.method } : {}),
        })
      }
    }
  }
  // Most-taken first, then alphabetical — the same ranking the retrospective's
  // tracked compounds use, so the two lists read as one page.
  return [...byLabel.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label)
  )
}

/**
 * Distinct labels used in the last `days` days, most recent first — the recents
 * chips on the sheet.
 *
 * A convenience, not a suggestion engine: it offers back what you have actually
 * logged, which is the whole reason a one-off can be two taps the second time.
 */
export function recentOneOffLabels(
  store: OneOffDays,
  todayKey: string,
  withinDays = 30,
  max = 6
): OneOffLog[] {
  const cutoff = shiftKey(todayKey, -withinDays)
  const seen = new Set<string>()
  const out: OneOffLog[] = []
  for (const day of Object.keys(store).sort().reverse()) {
    if (day < cutoff) continue
    for (const l of store[day]) {
      const key = l.label.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(l)
      if (out.length >= max) return out
    }
  }
  return out
}

/** `YYYY-MM-DD` n days from `key`, in UTC so no local offset applies. */
function shiftKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/* -------------------------------------------------------------- mutators */

/**
 * Record one. Writes localStorage synchronously, wakes the store, then pushes —
 * the house pattern, so the entry is on screen before the network is consulted.
 *
 * The TOMBSTONE for deletes is on the same 14-day TTL as the dose log's, and for
 * the same reason: hydration seeds from the pulled rows unconditionally, so a
 * delete made offline would otherwise be undone by the next pull.
 */
export function addOneOff(userId: string, log: OneOffLog): boolean {
  const cur = loadOneOffs(userId)
  const day = [...(cur[log.loggedFor] ?? []).filter((l) => l.id !== log.id), log]
  if (!saveOneOffs(userId, { ...cur, [log.loggedFor]: day })) return false
  notifyOneOffsChanged()
  void trackSync(
    upsertOneOffLog({
      id: log.id,
      compoundName: log.compoundName ?? null,
      label: log.label,
      amount: log.amount ? Number(log.amount) : null,
      unit: log.unit ?? null,
      loggedFor: log.loggedFor,
      takenAtIso: combineLocalDateTime(log.loggedFor, log.time24),
      note: log.note ?? null,
    })
  )
  return true
}

/**
 * Remove one. CRITICAL sync, not ordinary: a delete that loses its race with a
 * pull comes straight back, and a one-off will be mis-typed constantly, so this
 * is the path that has to be reliable.
 */
export function removeOneOff(userId: string, dateKey: string, id: string): boolean {
  const cur = loadOneOffs(userId)
  const day = (cur[dateKey] ?? []).filter((l) => l.id !== id)
  const next = { ...cur }
  if (day.length === 0) delete next[dateKey]
  else next[dateKey] = day
  if (!saveOneOffs(userId, next)) return false
  addOneOffTombstone(userId, id)
  notifyOneOffsChanged()
  void trackCriticalSync(
    deleteOneOffLog(id).then((res) => {
      if (res.ok && !res.skipped) clearOneOffTombstone(userId, id)
      return res
    })
  )
  return true
}

/* ----------------------------------------------------------- tombstones */

const TOMBSTONE_TTL_MS = 14 * 24 * 60 * 60 * 1000
const tombKey = (userId: string) => `trackd.oneoff.tombstones.v1.${userId}`

/** Ids the user has deleted whose delete may not have reached Postgres yet.
 *  Self-pruning: an entry older than the TTL is dropped on read, so a delete
 *  that never lands cannot suppress a legitimate re-entry forever. */
export function loadOneOffTombstones(userId: string): Record<string, number> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(tombKey(userId))
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const now = Date.now()
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v !== "number" || !Number.isFinite(v)) continue
      if (now - v > TOMBSTONE_TTL_MS) continue
      out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function saveOneOffTombstones(userId: string, t: Record<string, number>): void {
  try {
    window.localStorage.setItem(tombKey(userId), JSON.stringify(t))
  } catch {
    /* storage full / off — the delete still happened locally */
  }
}

function addOneOffTombstone(userId: string, id: string): void {
  const t = loadOneOffTombstones(userId)
  t[id] = Date.now()
  saveOneOffTombstones(userId, t)
}

function clearOneOffTombstone(userId: string, id: string): void {
  const t = loadOneOffTombstones(userId)
  if (!Object.hasOwn(t, id)) return
  delete t[id]
  saveOneOffTombstones(userId, t)
}
