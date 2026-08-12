/**
 * Fire one signal when a BURST of fire-and-forget writes has finished, and only
 * if something actually landed.
 *
 * Extracted from `doseLog.ts` so the rule can be tested. It is small, but it is
 * the part that decides whether the dashboard ever re-reads its stock figures,
 * and both second-round cold reviews found real defects in it while it was
 * inline and uncovered (2026-08-12). It also held module-global mutable state;
 * a factory keeps each caller's counting to itself.
 *
 * **Counted, not timed.** The obvious approach — debounce the subscriber on a
 * timer — does not work here. Every `"use server"` call is a Server Action, and
 * Next runs those strictly FIFO on one queue, so consecutive writes in a burst
 * are a full network round trip apart. Any delay short enough to feel instant is
 * far too short to span them, and a five-member stack made five duplicate reads.
 * Counting cannot be fooled by latency: a burst registers every write
 * synchronously, long before the first can resolve, so the count reaches zero
 * exactly once.
 *
 * Pure logic + timers; no React, no DOM (code-standards.md).
 */

/** What a tracked write reports. `skipped` is a legitimate no-op — a custom
 *  compound has no Postgres row — and is not a landing. */
export interface WriteResult {
  ok: boolean
  skipped?: boolean
}

export interface WriteCoalescer {
  /** Register a write. Call synchronously, before awaiting anything. */
  track(op: Promise<WriteResult>): void
  /** Writes still outstanding. Exposed for tests and diagnostics only. */
  pending(): number
}

/**
 * A write that never settles must not disarm the signal for the whole session.
 *
 * The count only falls when a promise resolves or rejects, and a Server Action
 * fetch has no client timeout anywhere — one stalled across a mobile-browser
 * suspend would pin the count above zero forever and the signal would never fire
 * again. That is the stale-figures bug this mechanism exists to fix, coming back
 * silently and permanently. Generous by design: a backstop against a hang, not a
 * latency budget.
 */
export const DEFAULT_WRITE_TIMEOUT_MS = 30_000

export function createWriteCoalescer(
  notify: () => void,
  timeoutMs: number = DEFAULT_WRITE_TIMEOUT_MS,
): WriteCoalescer {
  let pending = 0
  let anyLanded = false

  return {
    pending: () => pending,
    track(op: Promise<WriteResult>) {
      pending += 1
      let done = false

      const settle = (landed: boolean) => {
        // The watchdog and the promise race each other; whichever arrives first
        // owns the decrement. Without this the slower one double-counts and the
        // total goes permanently out of step.
        if (done) return
        done = true
        clearTimeout(watchdog)
        if (landed) anyLanded = true
        pending = Math.max(0, pending - 1)
        if (pending > 0) return
        // Read and clear together, in the same synchronous block the count
        // reaches zero in, so a burst that starts while this one finishes cannot
        // inherit the flag or lose its own.
        const landedAny = anyLanded
        anyLanded = false
        // Nothing reached the server — offline, or every write was a compound
        // with no row to write. Re-reading would learn nothing, and offline it
        // issues a request that cannot succeed.
        if (landedAny) notify()
      }

      const watchdog = setTimeout(() => settle(false), timeoutMs)
      // BOTH arms. A rejected write that only had a success handler would leak
      // the count, and the signal would never fire again.
      void op.then(
        (r) => settle(r.ok && !r.skipped),
        () => settle(false),
      )
    },
  }
}
