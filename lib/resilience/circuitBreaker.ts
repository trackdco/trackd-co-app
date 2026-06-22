/**
 * A small timeout + circuit-breaker combinator for guarding calls to a slow or
 * flaky external dependency. Trackd's only such dependency is Supabase (Auth /
 * Postgres / Storage); a hung call there is the one thing that can "drag down
 * unrelated parts of the app" — a request with no timeout blocks the serverless
 * function up to the platform limit, and many of those at once exhaust function
 * concurrency and the Postgres connection pool while everyone waits.
 *
 * `guard()` does two things:
 *
 *  1. TIMEOUT — races the work against `timeoutMs` so a hung dependency FAST-FAILS
 *     to the supplied fallback instead of blocking. This is the always-on
 *     protection.
 *  2. CIRCUIT BREAKER — after `failureThreshold` consecutive failures (timeouts or
 *     thrown errors) a named breaker OPENS and every call fast-fails to the
 *     fallback for `cooldownMs`, sparing the dependency (and the caller) repeated
 *     dead waits. After the cooldown it HALF-OPENS: one trial call decides whether
 *     to re-close (recovered) or re-open (still down).
 *
 * Honest caveat: on Vercel serverless each invocation may run on a fresh (cold)
 * instance, so breaker STATE is per-warm-instance, not global. The TIMEOUT is
 * therefore the primary, always-effective guard; the breaker adds value within a
 * warm instance and across the several dependency calls a single render fans out.
 * We deliberately do NOT introduce a shared store (Redis) for global breaker state
 * — overkill for a beta — so the trade-off is documented here rather than hidden.
 *
 * Pure module: no React, no Supabase import. The caller passes the work + a
 * type-safe fallback, so this never has to know what it is guarding.
 */

type BreakerState = "closed" | "open" | "half-open"

interface Breaker {
  failures: number
  state: BreakerState
  /** ms timestamp the breaker last tripped open. */
  openedAt: number
}

const breakers = new Map<string, Breaker>()

export interface GuardOptions<T> {
  /** Returned immediately when the breaker is open, or when the work times out /
   *  throws. Must be a safe, neutral value (e.g. an empty list) — never something
   *  that would be mistaken for real data. */
  fallback: T
  /** How long to wait for the work before fast-failing. Default 8s — well above
   *  Supabase's normal sub-second responses, so a slow mobile network won't trip
   *  it, but a genuine hang is cut short. */
  timeoutMs?: number
  /** Consecutive failures before the breaker opens. Default 4. */
  failureThreshold?: number
  /** How long the breaker stays open (fast-failing) before a trial call. Default 15s. */
  cooldownMs?: number
  /** Optional hook for logging/metrics when the breaker opens. */
  onOpen?: (name: string) => void
}

/** Reject `p` if it has not settled within `ms`. The underlying work may still
 *  complete in the background (we don't abort the socket) — harmless here because
 *  every guarded write is idempotent and every guarded read is discarded on
 *  timeout. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      }
    )
  })
}

/**
 * Run `work` behind a named circuit breaker + timeout. Resolves with the work's
 * result on success, or `options.fallback` on timeout / error / open circuit.
 * Never rejects — the caller always gets a usable value.
 */
export async function guard<T>(
  name: string,
  work: () => Promise<T>,
  options: GuardOptions<T>
): Promise<T> {
  const {
    fallback,
    timeoutMs = 8000,
    failureThreshold = 4,
    cooldownMs = 15000,
    onOpen,
  } = options

  const b = breakers.get(name) ?? { failures: 0, state: "closed" as BreakerState, openedAt: 0 }
  // Persist the shared object NOW (before any await) so concurrent callers on the
  // same warm instance mutate one breaker, not separate throwaways — otherwise a
  // burst of failures each starts from 0 and the breaker never trips.
  breakers.set(name, b)
  const now = Date.now()

  if (b.state === "open") {
    if (now - b.openedAt < cooldownMs) {
      return fallback // fast-fail: don't even touch the dependency
    }
    b.state = "half-open" // cooldown elapsed — THIS caller becomes the single trial
  } else if (b.state === "half-open") {
    // A trial is already in flight (state was persisted before its await, and JS
    // runs to the await synchronously) — don't pile on; fast-fail until it settles.
    return fallback
  }

  try {
    const result = await withTimeout(work(), timeoutMs)
    // Recovered (or never broken) — reset.
    b.failures = 0
    b.state = "closed"
    return result
  } catch {
    b.failures += 1
    // Trip open on a failed half-open trial (still down) or once consecutive
    // failures cross the threshold. (`b.state` is never "open" here — an open
    // breaker within cooldown already returned the fallback above.)
    if (b.state === "half-open" || b.failures >= failureThreshold) {
      b.state = "open"
      b.openedAt = Date.now() // stamp at trip time, not call start
      onOpen?.(name)
    }
    return fallback
  }
}

/** Test/diagnostic helper — clears all breaker state. Not used in app flows. */
export function resetBreakers() {
  breakers.clear()
}
