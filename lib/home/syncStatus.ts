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

// Don't nag: at most one notice per cooldown window, however many writes fail.
// A burst (logging several doses) or a sustained bad-network session shows the
// banner once, not on every action. Resets on page reload.
const NOTICE_COOLDOWN_MS = 60_000
let lastNotifiedAt = 0

function notifySyncFailed(): void {
  if (typeof window === "undefined") return
  const now = Date.now()
  if (now - lastNotifiedAt < NOTICE_COOLDOWN_MS) return
  lastNotifiedAt = now
  window.dispatchEvent(new CustomEvent(SYNC_FAILED_EVENT))
}

export function subscribeSyncFailed(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(SYNC_FAILED_EVENT, callback)
  return () => window.removeEventListener(SYNC_FAILED_EVENT, callback)
}

/**
 * ⚠️ THE READ-ONLY SIGNAL, WHICH IS NOT A SYNC FAILURE (05 §3.9, Q85).
 *
 * ## The defect this closes
 *
 * Sixteen gated writes returned a `readOnly` boolean and only ONE sheet read it.
 * Every other refusal fell through to {@link notifySyncFailed} — so a lapsed user
 * tapped to log a dose, the server refused, and the app said **"Saved on your
 * device. Still syncing to your account. We'll keep trying."**
 *
 * All three sentences are false. Nothing was saved, nothing is syncing, and
 * nothing will be retried. Worse, it invites the user to wait, and it hides the
 * one fact they need: they are read-only and nothing was lost.
 *
 * **The syncing notice is for a state where a RETRY IS MEANINGFUL.** A lapsed
 * account's is not. So a KNOWN read-only refusal is routed here instead, and
 * `ReadOnlyProvider` opens the approved pop-up.
 *
 * ⚠️ `refusal: "unknown"` deliberately does NOT come here. That is the entitlement
 * read having FAILED — the user is refused, but we do not know they have lapsed,
 * and telling them "You're not on a plan at the moment" would be a claim the
 * server cannot back. It keeps the syncing notice, which is the one branch where
 * trying again is genuinely worth offering.
 */
export const READ_ONLY_REFUSED_EVENT = "trackd:read-only-refused"

function notifyReadOnly(): void {
  if (typeof window === "undefined") return
  // No cooldown, deliberately. The syncing notice is throttled because it is a
  // nag about a transient condition; this one is the answer to an action the
  // user just took, and swallowing it would leave a tap doing nothing at all.
  window.dispatchEvent(new CustomEvent(READ_ONLY_REFUSED_EVENT))
}

export function subscribeReadOnlyRefused(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(READ_ONLY_REFUSED_EVENT, callback)
  return () => window.removeEventListener(READ_ONLY_REFUSED_EVENT, callback)
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
  op: Promise<{ ok: boolean; skipped?: boolean; refusal?: "read-only" | "unknown" }>
): Promise<void> {
  try {
    const r = await op
    /**
     * ⚠️ THE ONE PLACE FIFTEEN REFUSALS ARE ROUTED. Not fifteen call sites each
     * deciding, which is how one of them ends up wrong and nobody notices — and
     * is exactly what happened to the boolean this replaces.
     *
     * A KNOWN read-only refusal is not a sync failure and must never render the
     * syncing notice. `"unknown"` falls through to it on purpose: see
     * {@link READ_ONLY_REFUSED_EVENT}.
     */
    if (r.refusal === "read-only") {
      notifyReadOnly()
      return
    }
    if (!r.ok && !r.skipped && looksOnline()) notifySyncFailed()
  } catch {
    if (looksOnline()) notifySyncFailed()
  }
}

/* ------------------------------------------------- in-flight critical writes */

/**
 * Destructive writes currently in flight (delete / archive).
 *
 * Hydration re-pulls Postgres on mount, focus, visibility change and reconnect,
 * and OVERWRITES the local cache with what it gets. A pull that overlaps a
 * delete therefore reads the compound as still present — the delete simply
 * hadn't committed yet — writes it back into localStorage, and the merge's flush
 * then re-pushes it to Postgres. The compound resurrects itself, and closing the
 * app right after deleting (the natural thing to do) is exactly when the overlap
 * is most likely. So hydration waits for these to settle first.
 *
 * Only destructive writes are tracked. An overlapping ADD is harmless — the pull
 * missing it just means the merge keeps the local copy and re-pushes it, which is
 * already the offline-add path.
 */
const inFlightCritical = new Set<Promise<unknown>>()

/** Run a destructive cloud write, tracked so hydration can wait for it. */
export function trackCriticalSync(
  op: Promise<{ ok: boolean; skipped?: boolean; refusal?: "read-only" | "unknown" }>
): Promise<void> {
  const tracked = trackSync(op).finally(() => inFlightCritical.delete(tracked))
  inFlightCritical.add(tracked)
  return tracked
}

/** Settle every in-flight destructive write. Never rejects — `trackSync` already
 *  swallows and reports failures; this only orders the pull after them. */
export async function awaitCriticalSyncs(): Promise<void> {
  while (inFlightCritical.size > 0) {
    await Promise.allSettled([...inFlightCritical])
  }
}
