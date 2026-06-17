/**
 * Sync engine for the canonical Postgres model (Protocol Cutover, Step 1). Drives
 * the offline-first loop between `lib/sync/cache.ts` (the instant local read/write
 * layer) and Postgres (the source of truth), via the RLS-scoped `lib/db/*` data
 * access.
 *
 *   - push  (`flush`)     — drain the outbox of offline writes to Postgres
 *   - pull  (`pull`)      — read the active cycle + its compounds + dose logs,
 *                           reconcile into the cache (last-write-wins)
 *   - triggers            — re-sync when connectivity is regained (`online`) and
 *                           on app focus (`visibilitychange` / `focus`)
 *
 * Conflict policy is last-write-wins (single-user, single-device assumption). A
 * pull that comes back empty because we are offline / signed out NEVER clears the
 * cache — only a real server read reconciles it. Re-flushing is idempotent (ids
 * are client-generated; the data layer upserts on the primary key).
 *
 * No React; guarded for SSR (code-standards.md). Step 1 ships this layer but wires
 * nothing into the UI — the Home flip (Step 3) is what mounts it.
 */
import { ensureActiveCycle, updateCycle } from "@/lib/db/cycles"
import {
  deleteProtocolCompound,
  listProtocolCompounds,
  upsertProtocolCompound,
} from "@/lib/db/protocolCompounds"
import {
  deleteDoseLog,
  listDoseLogs,
  upsertDoseLog,
} from "@/lib/db/doseLogs"
import {
  applyServerSnapshot,
  clearOps,
  getOutbox,
  type PendingOp,
} from "@/lib/sync/cache"

function isOnline(): boolean {
  if (typeof navigator === "undefined") return true
  return navigator.onLine
}

/** Dispatch one pending op to its `lib/db/*` call. Returns whether it succeeded
 *  (so the caller can drop it from the outbox; failures stay queued). */
async function applyOp(op: PendingOp): Promise<boolean> {
  switch (op.entity) {
    case "protocolCompound":
      return op.action === "upsert"
        ? (await upsertProtocolCompound(op.payload)) !== null
        : (await deleteProtocolCompound(op.id)).ok
    case "doseLog":
      return op.action === "upsert"
        ? (await upsertDoseLog(op.payload)) !== null
        : (await deleteDoseLog(op.id)).ok
    case "cycle":
      return (await updateCycle(op.id, op.patch)) !== null
  }
}

/**
 * Push every queued offline write to Postgres, in order. Confirmed ops are
 * dropped from the outbox; ones that fail (offline / a transient error) stay
 * queued for the next flush. Returns the count flushed.
 */
export async function flush(userId: string): Promise<number> {
  if (!userId || userId === "anon") return 0
  const ops = getOutbox(userId)
  if (ops.length === 0) return 0
  const done: string[] = []
  for (const op of ops) {
    try {
      if (await applyOp(op)) done.push(op.opId)
    } catch (e) {
      console.error("sync flush op failed", op, e)
    }
  }
  clearOps(userId, done)
  return done.length
}

/**
 * Read the active cycle + its compounds + dose logs and reconcile them into the
 * cache. A null cycle (signed out / offline / error) is treated as "no server
 * truth available" and leaves the cache untouched — it never wipes local data.
 */
export async function pull(userId: string): Promise<boolean> {
  if (!userId || userId === "anon") return false
  const cycle = await ensureActiveCycle()
  if (!cycle) return false
  const [compounds, doseLogs] = await Promise.all([
    listProtocolCompounds(cycle.id),
    listDoseLogs(),
  ])
  applyServerSnapshot(userId, { cycle, compounds, doseLogs })
  return true
}

/** Flush pending writes, then pull + reconcile. The full re-sync. */
export async function reconcile(userId: string): Promise<void> {
  if (!isOnline()) return
  await flush(userId)
  await pull(userId)
}

/**
 * Start background sync for a signed-in user: an initial reconcile, then re-sync
 * whenever connectivity is regained and on app focus. Returns a stop function
 * that removes the listeners.
 */
export function startSync(userId: string): () => void {
  if (typeof window === "undefined" || !userId || userId === "anon") {
    return () => {}
  }

  const onOnline = () => void reconcile(userId)
  const onFocus = () => {
    if (isOnline()) void reconcile(userId)
  }
  const onVisibility = () => {
    if (document.visibilityState === "visible" && isOnline()) void reconcile(userId)
  }

  window.addEventListener("online", onOnline)
  window.addEventListener("focus", onFocus)
  document.addEventListener("visibilitychange", onVisibility)

  void reconcile(userId)

  return () => {
    window.removeEventListener("online", onOnline)
    window.removeEventListener("focus", onFocus)
    document.removeEventListener("visibilitychange", onVisibility)
  }
}
