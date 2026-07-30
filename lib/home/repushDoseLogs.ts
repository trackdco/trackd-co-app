/**
 * Re-push every dose log the device holds to Postgres.
 *
 * This exists because a dose logged OFFLINE never reached Postgres at all. The
 * reconnect handler called `migrateDeviceState(userId, { force: true })`, but that
 * function checks the durable cloud flag BEFORE honouring `force`, and the flag is
 * set during every user's first session — so for every existing user the forced
 * re-push was a no-op. Nothing else pushes dose logs on reconnect
 * (`hydrateFromPostgres` re-pushes compounds only) and there is no outbox, so the
 * doses stayed device-only and died with the next reinstall.
 *
 * **The fix is deliberately NOT to make `force` bypass that guard.** The guard is
 * load-bearing: re-running the full migration re-seeds the stack from the stale
 * jsonb mirror and resurrects deleted compounds, which is a bug that has already
 * been fixed once. This does the narrow thing the reconnect actually needs — push
 * the logs, touch nothing else.
 *
 * Idempotent: every write upserts on a deterministic id derived from
 * (user, day, compound), so re-pushing a log that already landed is a no-op. Safe
 * to call on every reconnect.
 */
import { loadDoseLogs } from "@/lib/home/doseLog"
import { loadStack } from "@/lib/home/stack"
import { pushProtocolDoseLog } from "@/lib/home/protocolSync"
import { combineLocalDateTime } from "@/lib/home/mockHomeData"

export interface RepushResult {
  pushed: number
  failed: number
}

export async function repushDoseLogs(userId: string): Promise<RepushResult> {
  const out: RepushResult = { pushed: 0, failed: 0 }
  if (!userId || userId === "anon") return out

  const logs = loadDoseLogs(userId)
  const stack = loadStack(userId) ?? []
  if (stack.length === 0) return out
  const methodById = new Map(stack.map((c) => [c.id, c.method]))

  for (const [dateKey, day] of Object.entries(logs)) {
    for (const [compoundId, log] of Object.entries(day)) {
      const method = methodById.get(compoundId)
      // A compound the device no longer knows about can't be resolved server-side
      // either, so skip rather than guess a route.
      if (!method) continue
      try {
        // `false` for the vial resolution: a re-push is replaying history, and the
        // link (or the deliberate absence of one) was already decided when the
        // dose was logged. Resolving now could attach a vial bought since.
        const res = await pushProtocolDoseLog(
          compoundId,
          dateKey,
          log,
          combineLocalDateTime(dateKey, log.time24),
          method,
          false
        )
        if (res.ok) out.pushed += 1
        else out.failed += 1
      } catch {
        out.failed += 1
      }
    }
  }
  return out
}
