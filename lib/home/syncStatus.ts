/**
 * A same-tab signal that a best-effort cloud write FAILED while the device looked
 * online — so the app shell can show a brief, non-blocking "didn't sync" notice.
 *
 * WHY: the canonical Postgres writes are fire-and-forget (`void push…`) so the UI
 * stays instant and offline-tolerant. Without this, a write that fails while the
 * user is *online* (a server/RLS error, a 5xx) is swallowed — the user sees a
 * green tick and assumes their dose/compound is safely in the cloud when it only
 * lives on the device. This surfaces that case. OFFLINE failures are deliberately
 * NOT signalled: they're expected, and `useCloudHydration`'s reconnect re-sync
 * re-pushes everything (idempotently) when connectivity returns.
 *
 * Pure event glue + a guarded await helper; no React.
 */
export const SYNC_FAILED_EVENT = "trackd:sync-failed"

function notifySyncFailed(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(SYNC_FAILED_EVENT))
}

export function subscribeSyncFailed(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(SYNC_FAILED_EVENT, callback)
  return () => window.removeEventListener(SYNC_FAILED_EVENT, callback)
}

/** True when we have no reason to believe the device is offline. */
function looksOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine
}

/**
 * Await a best-effort cloud write and flag a sync failure if it didn't land while
 * we appear online. `skipped` is a no-op (e.g. a custom compound that's meant to
 * stay device-local), never a failure. Returns nothing — callers keep using it as
 * fire-and-forget (`void trackSync(push…())`).
 */
export async function trackSync(
  op: Promise<{ ok: boolean; skipped?: boolean }>
): Promise<void> {
  try {
    const r = await op
    if (!r.ok && !r.skipped && looksOnline()) notifySyncFailed()
  } catch {
    if (looksOnline()) notifySyncFailed()
  }
}
