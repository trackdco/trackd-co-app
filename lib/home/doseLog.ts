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
import {
  pushDoseLog,
  deleteDoseLog,
  deleteCompoundLogs,
} from "@/lib/home/syncActions"
import { loadStack } from "@/lib/home/stack"
import {
  pushProtocolDoseLog,
  deleteProtocolDoseLog,
} from "@/lib/home/protocolSync"
import { trackSync } from "@/lib/home/syncStatus"

export type DayLogs = Record<string, Record<string, DoseLog>>

const EMPTY: DayLogs = {}
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
  const method = (loadStack(userId) ?? []).find((c) => c.id === compoundId)?.method ?? "po"
  void trackSync(
    pushProtocolDoseLog(
      compoundId,
      dateKey,
      log,
      combineLocalDateTime(dateKey, log.time24),
      method,
      true
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
  void trackSync(deleteProtocolDoseLog(compoundId, dateKey)) // Postgres (no-op for customs)
}

/** Erase every logged dose for a compound across all days (hard delete only). */
export function removeCompoundLogs(userId: string, compoundId: string) {
  const cur = loadDoseLogs(userId)
  const next: DayLogs = {}
  for (const [dateKey, day] of Object.entries(cur)) {
    const rest = { ...day }
    delete rest[compoundId]
    if (Object.keys(rest).length > 0) next[dateKey] = rest
  }
  saveDoseLogs(userId, next)
  notify()
  void deleteCompoundLogs(compoundId)
}
