/**
 * Offline-first local cache for the canonical Postgres model (Protocol Cutover,
 * Step 1). This is the **instant read/write layer**: the UI reads from here and
 * writes are optimistic to here, then `lib/sync/syncEngine.ts` pushes them to
 * Postgres when a connection is available and pulls + reconciles on focus.
 *
 * It mirrors the live home stores' `useSyncExternalStore` pattern (`lib/home/
 * stack.ts`) but is a SEPARATE store under its own localStorage keys — Step 1 must
 * not touch the live `trackd.stack.*` / `trackd.doselog.*` stores. The Home flip
 * (Step 3) is what repoints the UI onto this cache.
 *
 * Conflict policy: last-write-wins (single-user, single-device assumption). Offline
 * writes are recorded in an **outbox** of pending ops the engine drains on
 * reconnect; ids are client-generated so a re-flush upserts idempotently.
 *
 * Pure data + guarded storage only; no React (code-standards.md).
 */
import type {
  Cycle,
  CycleInsert,
  DoseLog,
  DoseLogInsert,
  ProtocolCompound,
  ProtocolCompoundInsert,
} from "@/lib/db/types"

/** A mutation made locally that has not yet been confirmed against Postgres. The
 *  engine replays these in order; each maps to one `lib/db/*` call. */
export type PendingOp =
  | { opId: string; entity: "protocolCompound"; action: "upsert"; payload: ProtocolCompoundInsert }
  | { opId: string; entity: "protocolCompound"; action: "delete"; id: string }
  | { opId: string; entity: "doseLog"; action: "upsert"; payload: DoseLogInsert }
  | { opId: string; entity: "doseLog"; action: "delete"; id: string }
  | { opId: string; entity: "cycle"; action: "update"; id: string; patch: Partial<Omit<CycleInsert, "id">> }

export interface DbCacheState {
  cycle: Cycle | null
  compounds: ProtocolCompound[]
  doseLogs: DoseLog[]
  outbox: PendingOp[]
}

const EMPTY: DbCacheState = { cycle: null, compounds: [], doseLogs: [], outbox: [] }
const storageKey = (userId: string) => `trackd.dbcache.v1.${userId}`

/* ----------------------------------------------------------------- storage */

export function loadCache(userId: string): DbCacheState {
  if (typeof window === "undefined") return EMPTY
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<DbCacheState>
    return {
      cycle: parsed.cycle ?? null,
      compounds: Array.isArray(parsed.compounds) ? parsed.compounds : [],
      doseLogs: Array.isArray(parsed.doseLogs) ? parsed.doseLogs : [],
      outbox: Array.isArray(parsed.outbox) ? parsed.outbox : [],
    }
  } catch {
    return EMPTY
  }
}

function saveCache(userId: string, state: DbCacheState): boolean {
  if (typeof window === "undefined") return false
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

/* ------------------------------------------ useSyncExternalStore integration */

const CHANGED_EVENT = "trackd:dbcache-changed"

export function notifyCacheChanged() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT))
}

export function subscribeCache(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(CHANGED_EVENT, callback)
  window.addEventListener("storage", callback)
  return () => {
    window.removeEventListener(CHANGED_EVENT, callback)
    window.removeEventListener("storage", callback)
  }
}

// Stable snapshot for useSyncExternalStore — cached by the raw stored string.
let cache: { userId: string; raw: string | null; value: DbCacheState } | null = null

export function getCacheSnapshot(userId: string): DbCacheState {
  if (typeof window === "undefined") return EMPTY
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(storageKey(userId))
  } catch {
    raw = null
  }
  if (cache && cache.userId === userId && cache.raw === raw) return cache.value
  const value = loadCache(userId)
  cache = { userId, raw, value }
  return value
}

/* ------------------------------------------------------- optimistic mutators */
// Each applies to the local cache instantly AND records a pending op for the
// engine to push. Returns nothing — reads come back through the snapshot.

function commit(userId: string, next: DbCacheState) {
  saveCache(userId, next)
  notifyCacheChanged()
}

function newId(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

/** Materialise a full row from an insert payload for the optimistic cache; the
 *  server-authoritative row replaces it on the next pull. */
function materializeCompound(userId: string, p: ProtocolCompoundInsert): ProtocolCompound {
  const ts = nowIso()
  return {
    id: p.id,
    user_id: userId,
    cycle_id: p.cycle_id,
    compound_id: p.compound_id,
    dose_amount: p.dose_amount,
    dose_unit: p.dose_unit,
    route: p.route,
    schedule_type: p.schedule_type,
    days_of_week: p.days_of_week ?? null,
    interval_days: p.interval_days ?? null,
    times_per_day: p.times_per_day ?? 1,
    dose_times: p.dose_times ?? ["08:00:00"],
    first_dose_on: p.first_dose_on,
    end_date: p.end_date ?? null,
    is_active: p.is_active ?? true,
    rotation_sites: p.rotation_sites ?? [],
    rotation_index: p.rotation_index ?? 0,
    created_at: ts,
    updated_at: ts,
  }
}

function materializeDoseLog(userId: string, p: DoseLogInsert): DoseLog {
  return {
    id: p.id,
    user_id: userId,
    protocol_compound_id: p.protocol_compound_id,
    inventory_item_id: p.inventory_item_id ?? null,
    status: p.status ?? "taken",
    dose_amount: p.dose_amount,
    dose_unit: p.dose_unit,
    injection_site: p.injection_site ?? null,
    taken_at: p.taken_at ?? nowIso(),
    scheduled_for: p.scheduled_for ?? null,
    note: p.note ?? null,
    created_at: nowIso(),
  }
}

function upsertById<T extends { id: string }>(list: T[], row: T): T[] {
  return list.some((r) => r.id === row.id)
    ? list.map((r) => (r.id === row.id ? row : r))
    : [...list, row]
}

export function cacheUpsertCompound(userId: string, payload: ProtocolCompoundInsert) {
  const cur = loadCache(userId)
  commit(userId, {
    ...cur,
    compounds: upsertById(cur.compounds, materializeCompound(userId, payload)),
    outbox: [...cur.outbox, { opId: newId(), entity: "protocolCompound", action: "upsert", payload }],
  })
}

export function cacheDeleteCompound(userId: string, id: string) {
  const cur = loadCache(userId)
  commit(userId, {
    ...cur,
    compounds: cur.compounds.filter((c) => c.id !== id),
    doseLogs: cur.doseLogs.filter((l) => l.protocol_compound_id !== id),
    outbox: [...cur.outbox, { opId: newId(), entity: "protocolCompound", action: "delete", id }],
  })
}

export function cacheUpsertDoseLog(userId: string, payload: DoseLogInsert) {
  const cur = loadCache(userId)
  commit(userId, {
    ...cur,
    doseLogs: upsertById(cur.doseLogs, materializeDoseLog(userId, payload)),
    outbox: [...cur.outbox, { opId: newId(), entity: "doseLog", action: "upsert", payload }],
  })
}

export function cacheDeleteDoseLog(userId: string, id: string) {
  const cur = loadCache(userId)
  commit(userId, {
    ...cur,
    doseLogs: cur.doseLogs.filter((l) => l.id !== id),
    outbox: [...cur.outbox, { opId: newId(), entity: "doseLog", action: "delete", id }],
  })
}

/* --------------------------------------------------- reconcile from the server */

export function getOutbox(userId: string): PendingOp[] {
  return loadCache(userId).outbox
}

/** Remove ops the engine has confirmed against Postgres. */
export function clearOps(userId: string, opIds: string[]) {
  if (opIds.length === 0) return
  const cur = loadCache(userId)
  const remove = new Set(opIds)
  commit(userId, { ...cur, outbox: cur.outbox.filter((o) => !remove.has(o.opId)) })
}

/** Set the active cycle in the cache (from `ensureActiveCycle` / a pull). */
export function cacheSetCycle(userId: string, cycle: Cycle | null) {
  const cur = loadCache(userId)
  commit(userId, { ...cur, cycle })
}

/**
 * Replace the server-authoritative entities from a fresh pull, then RE-APPLY any
 * still-pending outbox ops on top so an un-flushed offline write is never clobbered
 * by a stale read (last-write-wins, local edits ahead of the server win until they
 * flush). The outbox itself is preserved.
 */
export function applyServerSnapshot(
  userId: string,
  snapshot: { cycle: Cycle | null; compounds: ProtocolCompound[]; doseLogs: DoseLog[] }
) {
  const cur = loadCache(userId)
  let compounds = [...snapshot.compounds]
  let doseLogs = [...snapshot.doseLogs]
  for (const op of cur.outbox) {
    if (op.entity === "protocolCompound" && op.action === "upsert")
      compounds = upsertById(compounds, materializeCompound(userId, op.payload))
    else if (op.entity === "protocolCompound" && op.action === "delete")
      compounds = compounds.filter((c) => c.id !== op.id)
    else if (op.entity === "doseLog" && op.action === "upsert")
      doseLogs = upsertById(doseLogs, materializeDoseLog(userId, op.payload))
    else if (op.entity === "doseLog" && op.action === "delete")
      doseLogs = doseLogs.filter((l) => l.id !== op.id)
  }
  commit(userId, { cycle: snapshot.cycle, compounds, doseLogs, outbox: cur.outbox })
}
