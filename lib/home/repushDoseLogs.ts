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
import { loadDoseLogs, parseSlotKey } from "@/lib/home/doseLog"
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
  const compoundById = new Map(stack.map((c) => [c.id, c]))

  for (const [dateKey, day] of Object.entries(logs)) {
    for (const [key, log] of Object.entries(day)) {
      // PARSED. The store's keys are slot keys (`abc#1` for the evening dose),
      // and looking one up as a bare compound id missed — so every dose after
      // the first was silently skipped and never reached Postgres at all. That
      // is exactly the offline loss this module exists to repair, reintroduced
      // for multi-dose compounds.
      const { compoundId, slot } = parseSlotKey(key)
      const method = compoundById.get(compoundId)?.method
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
          false,
          // The name, so a compound whose Postgres id has drifted from its client
          // id still re-pushes. This path exists to recover doses logged offline;
          // without it the diverged ones would be dropped a second time.
          compoundById.get(compoundId)?.name ?? null,
          // NOT device-recorded. A replay cannot tell a day the device captured
          // at log time from one an earlier session derived from `taken_at`, and
          // `supabase/protocol/012` forbids writing a guessed day: doing so makes
          // it permanent and stops the fallback correcting itself. Live logging
          // still stamps the day, which is the only place that legitimately can.
          false,
          slot
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
