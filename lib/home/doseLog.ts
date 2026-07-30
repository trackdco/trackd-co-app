/**
 * Device-local persistence for logged doses, keyed `trackd.doselog.v1.<userId>`.
 *
 * Shape: `{ "YYYY-MM-DD": { compoundId: DoseLog } }` — only actual logs are kept
 * (an un-logged dose is simply absent). This is what makes "look back" history
 * survive reloads and powers the rest hint. Archiving a compound (see
 * `lib/home/stack.ts`) stops it appearing in present/future, but its past entries
 * stay here untouched. Mirrors the stack store's `useSyncExternalStore` pattern.
 *
 * Pure data + pure helpers + guarded storage only; no React (Context/code-standards.md).
 */
import { combineLocalDateTime, type DoseLog } from "@/lib/home/mockHomeData"
import { pushDoseLog, deleteDoseLog } from "@/lib/home/syncActions"
import { loadStack } from "@/lib/home/stack"
import {
  pushProtocolDoseLog,
  deleteProtocolDoseLog,
} from "@/lib/home/protocolSync"
import { trackCriticalSync, trackSync } from "@/lib/home/syncStatus"

export type DayLogs = Record<string, Record<string, DoseLog>>

const EMPTY: DayLogs = {}
/* ------------------------------------------------------------- tombstones */

/**
 * Days+compounds the user has UN-LOGGED but whose delete may not have reached
 * Postgres yet.
 *
 * Making the delete a critical sync closed the race where a pull overlapped an
 * in-flight delete, but not the offline case: hydration seeds from the pulled
 * rows unconditionally and there is no local-wins reconciliation for logs (there
 * is one for compounds). So unticking a dose with no network, then reconnecting,
 * pulled the row straight back — the tick refilled with its original amount, time
 * and site, and nothing retried the delete.
 *
 * A tombstone records the user's INTENT so the pull can be filtered by it. It is
 * removed as soon as the delete is confirmed, and expires on its own so a
 * tombstone whose delete never lands can't suppress a legitimate re-log forever.
 */
const TOMBSTONE_TTL_MS = 14 * 24 * 60 * 60 * 1000

const tombstoneKey = (userId: string) => `trackd.doselog.tombstones.v1.${userId}`

/** `${dateKey}|${compoundId}` → epoch ms the un-log happened. */
type Tombstones = Record<string, number>

export function loadTombstones(userId: string): Tombstones {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(tombstoneKey(userId))
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const now = Date.now()
    const out: Tombstones = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      // Drop expired and malformed entries on read, so the store self-prunes.
      if (typeof v !== "number" || !Number.isFinite(v)) continue
      if (now - v > TOMBSTONE_TTL_MS) continue
      out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function saveTombstones(userId: string, t: Tombstones): void {
  try {
    window.localStorage.setItem(tombstoneKey(userId), JSON.stringify(t))
  } catch {
    /* storage full / off — the delete still happened locally */
  }
}

export function tombstoneId(dateKey: string, compoundId: string): string {
  return `${dateKey}|${compoundId}`
}

/** True when this dose was un-logged and the delete is not yet confirmed. */
export function isTombstoned(
  tombstones: Tombstones,
  dateKey: string,
  compoundId: string
): boolean {
  return Object.hasOwn(tombstones, tombstoneId(dateKey, compoundId))
}

function addTombstone(userId: string, dateKey: string, compoundId: string): void {
  const t = loadTombstones(userId)
  t[tombstoneId(dateKey, compoundId)] = Date.now()
  saveTombstones(userId, t)
}

/** The delete landed, so the intent no longer needs recording. */
function clearTombstone(userId: string, dateKey: string, compoundId: string): void {
  const t = loadTombstones(userId)
  if (!Object.hasOwn(t, tombstoneId(dateKey, compoundId))) return
  delete t[tombstoneId(dateKey, compoundId)]
  saveTombstones(userId, t)
}

/** Logging the same dose again cancels any pending un-log for it. */
function dropTombstoneOnRelog(
  userId: string,
  dateKey: string,
  compoundId: string
): void {
  clearTombstone(userId, dateKey, compoundId)
}

const storageKey = (userId: string) => `trackd.doselog.v1.${userId}`

function isDoseLog(v: unknown): v is DoseLog {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return typeof o.amount === "string" && typeof o.time24 === "string"
}

/** Load the saved logs for this user (normalised); `{}` when none/unusable. */
export function loadDoseLogs(userId: string): DayLogs {
  if (typeof window === "undefined") return EMPTY
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return EMPTY
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return EMPTY
    const out: DayLogs = {}
    for (const [dateKey, day] of Object.entries(parsed as Record<string, unknown>)) {
      if (!day || typeof day !== "object") continue
      const dayOut: Record<string, DoseLog> = {}
      for (const [id, log] of Object.entries(day as Record<string, unknown>)) {
        if (isDoseLog(log)) {
          dayOut[id] = {
            amount: log.amount,
            // The unit the dose was recorded in, preserved so history isn't
            // relabelled when the compound's unit changes (see DoseLog.unit).
            ...(typeof log.unit === "string" && log.unit ? { unit: log.unit } : {}),
            // The user's own note. It was missing from this list, which made the
            // whole feature write-only: the sheet reads the logged dose back
            // THROUGH here, so re-opening one showed an empty box, saving it
            // again wrote `note: null` over what was in Postgres, and the
            // reconnect re-push (which also reads through here) wiped every note
            // in the user's history on a single network flap.
            ...(typeof log.note === "string" && log.note ? { note: log.note } : {}),
            siteId: typeof log.siteId === "string" ? log.siteId : null,
            time24: log.time24,
            // `undefined` is a MEANINGFUL third state here, not just "missing" (see
            // DoseLog): a vial id = an explicit pick, `null` = an explicit "Not
            // tracked", absent = undecided → the server resolves the vial for the
            // dose's date. `JSON.stringify` drops an undefined value, so the KEY's
            // absence is what carries "undecided" across a reload — flattening it to
            // null here used to destroy that, and re-opening such a dose then read as
            // "Not tracked" and UNLINKED its vial on update.
            ...("inventoryItemId" in log
              ? {
                  inventoryItemId:
                    typeof log.inventoryItemId === "string"
                      ? log.inventoryItemId
                      : null,
                }
              : {}),
          }
        }
      }
      if (Object.keys(dayOut).length > 0) out[dateKey] = dayOut
    }
    return out
  } catch {
    return EMPTY
  }
}

export function saveDoseLogs(userId: string, logs: DayLogs): boolean {
  if (typeof window === "undefined") return false
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(logs))
    return true
  } catch {
    return false
  }
}

const CHANGED_EVENT = "trackd:doselog-changed"

function notify() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT))
}

/**
 * Dispatch the same-tab change signal so a sibling (the Home screen) re-reads.
 * Exposed for the cloud-hydration pass, which writes the store directly via
 * `saveDoseLogs` and then needs to wake `useSyncExternalStore` the same way the
 * mutators do. (`saveDoseLogs` is intentionally silent; the mutators notify.)
 */
export function notifyDoseLogsChanged() {
  notify()
}

export function subscribeDoseLogs(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(CHANGED_EVENT, callback)
  window.addEventListener("storage", callback)
  return () => {
    window.removeEventListener(CHANGED_EVENT, callback)
    window.removeEventListener("storage", callback)
  }
}

// Stable snapshot for useSyncExternalStore — cached by the raw stored string.
let cache: { userId: string; raw: string | null; value: DayLogs } | null = null

export function getDoseLogsSnapshot(userId: string): DayLogs {
  if (typeof window === "undefined") return EMPTY
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(storageKey(userId))
  } catch {
    raw = null
  }
  if (cache && cache.userId === userId && cache.raw === raw) return cache.value
  const value = loadDoseLogs(userId)
  cache = { userId, raw, value }
  return value
}

/* ----------------------------------------------------------------- mutators */

export function logDose(
  userId: string,
  dateKey: string,
  compoundId: string,
  log: DoseLog
) {
  // Re-logging the same dose cancels any pending un-log for it, or the tombstone
  // would suppress the row the user just re-created.
  dropTombstoneOnRelog(userId, dateKey, compoundId)
  const cur = loadDoseLogs(userId)
  const next: DayLogs = {
    ...cur,
    [dateKey]: { ...(cur[dateKey] ?? {}), [compoundId]: log },
  }
  saveDoseLogs(userId, next)
  notify()
  void pushDoseLog(dateKey, compoundId, log) // jsonb mirror (also backs up customs)
  // Postgres (canonical). Needs the compound's method (to map the injection site)
  // and the device-local taken_at instant; no-op for a custom compound. The final
  // `true` lets the server resolve the vial when the client hadn't (the Stock list
  // loads async, and a back-dated log deliberately leaves it undecided) — it links
  // whichever vial the compound was drawing from at `taken_at`, so the runway
  // decrements without a back-dated dose retro-linking to a vial bought since.
  // The NAME goes too: the Postgres id is resolved from it when the derived id has
  // drifted, which is the difference between the dose syncing and being silently
  // dropped.
  const onDevice = (loadStack(userId) ?? []).find((c) => c.id === compoundId)
  const method = onDevice?.method ?? "po"
  void trackSync(
    pushProtocolDoseLog(
      compoundId,
      dateKey,
      log,
      combineLocalDateTime(dateKey, log.time24),
      method,
      true,
      onDevice?.name ?? null
    )
  )
}

export function unlogDose(userId: string, dateKey: string, compoundId: string) {
  const cur = loadDoseLogs(userId)
  const day = { ...(cur[dateKey] ?? {}) }
  delete day[compoundId]
  const next = { ...cur }
  if (Object.keys(day).length === 0) delete next[dateKey]
  else next[dateKey] = day
  saveDoseLogs(userId, next)
  notify()
  void deleteDoseLog(dateKey, compoundId)
  // CRITICAL, not ordinary: `hydrateFromPostgres` awaits only critical syncs, so
  // an un-log tracked as ordinary let a pull that overlapped it read the row as
  // still present and write it straight back. Unticking then backgrounding the app
  // refilled the tick, with its original amount, time and site.
  addTombstone(userId, dateKey, compoundId)
  // The name, for the same reason as `logDose` — and it matters more here: a delete
  // aimed at a derived id that no row has still reports ok, so the tombstone would
  // clear on a delete that removed nothing and the next pull would resurrect the
  // dose the user just unticked.
  const name = (loadStack(userId) ?? []).find((c) => c.id === compoundId)?.name ?? null
  void trackCriticalSync(
    deleteProtocolDoseLog(compoundId, dateKey, name).then((res) => {
      // Only drop the tombstone once Postgres has actually forgotten the dose.
      if (res.ok && !res.skipped) clearTombstone(userId, dateKey, compoundId)
      return res
    })
  )
}

// There is deliberately NO "erase every logged dose for a compound" here (Spec 02):
// a compound has two states, active and deleted, and deleting keeps every logged
// dose. The only verb that touches a single day's entry is `unlogDose` above.
