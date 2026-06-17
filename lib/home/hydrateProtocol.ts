/**
 * Hydrate the device-local stack + dose-log caches from Postgres (Protocol
 * Cutover, Step 3). Shared by `components/home/useCloudHydration.ts` (the real
 * Home mount) and the `/preview/protocol-test` harness, so there is one merge
 * implementation.
 *
 * Postgres is canonical; entries not in Postgres (customs / offline adds) are
 * layered on from the jsonb mirror ∪ local, and purely local-only ones are pushed
 * up (to Postgres if catalogue-backed, to the jsonb mirror otherwise) so nothing
 * is lost. A failed/empty pull returns empty shapes and never wipes the cache.
 *
 * Pure logic + guarded storage; no React.
 */
import {
  loadStack,
  saveStack,
  notifyStackChanged,
  type StackCompound,
} from "@/lib/home/stack"
import {
  loadDoseLogs,
  saveDoseLogs,
  notifyDoseLogsChanged,
  type DayLogs,
} from "@/lib/home/doseLog"
import { toDateKey, type DoseLog } from "@/lib/home/mockHomeData"
import { pushStackCompound, pullStackAndLogs } from "@/lib/home/syncActions"
import { pullProtocolStackAndLogs, pushProtocolCompound } from "@/lib/home/protocolSync"
import { injectionSiteToLocal } from "@/lib/db/types"
import type { DoseRow, InjectionSite } from "@/lib/db/types"

/** Pull Postgres (canonical) + the jsonb mirror, merge with local, and write the
 *  merged set back into the device-local caches. */
export async function hydrateFromPostgres(userId: string): Promise<void> {
  if (!userId || userId === "anon") return
  const [pg, cloud] = await Promise.all([
    pullProtocolStackAndLogs(),
    pullStackAndLogs(),
  ])
  mergeAndSave(userId, pg, cloud)
}

/** Fold raw Postgres dose rows into `DayLogs`, keyed by the DEVICE's local day +
 *  clock (the timezone only the client knows). */
function doseRowsToDayLogs(
  rows: DoseRow[],
  methodById: Map<string, StackCompound["method"]>
): DayLogs {
  const out: DayLogs = {}
  for (const r of rows) {
    const taken = new Date(r.takenAt)
    if (Number.isNaN(taken.getTime())) continue
    const dateKey = toDateKey(taken)
    const time24 = `${String(taken.getHours()).padStart(2, "0")}:${String(
      taken.getMinutes()
    ).padStart(2, "0")}`
    const siteId = injectionSiteToLocal(
      r.injectionSite as InjectionSite | null,
      methodById.get(r.compoundId) ?? "po"
    )
    const log: DoseLog = { amount: r.amount, siteId, time24 }
    ;(out[dateKey] ??= {})[r.compoundId] = log
  }
  return out
}

function mergeAndSave(
  userId: string,
  pg: { stack: StackCompound[]; doseRows: DoseRow[] },
  cloud: { stack: StackCompound[]; doseLogs: DayLogs }
): void {
  const local = loadStack(userId) ?? []
  const localLogs = loadDoseLogs(userId)

  // STACK: Postgres canonical, then non-Postgres extras (customs / offline adds)
  // from the cloud mirror ∪ local, deduped by id.
  const pgIds = new Set(pg.stack.map((c) => c.id))
  const seen = new Set(pgIds)
  const extras: StackCompound[] = []
  for (const c of [...cloud.stack, ...local]) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    extras.push(c)
  }
  const mergedStack = [...pg.stack, ...extras]
  saveStack(userId, mergedStack)
  notifyStackChanged()

  // Flush local compounds Postgres doesn't have yet (offline adds), and back up
  // purely local-only ones to the jsonb mirror. pushProtocolCompound resolves
  // catalogue vs custom server-side: a custom no-ops after one indexed lookup and
  // stays device-local; a catalogue offline-add gets written. Idempotent.
  const cloudIds = new Set(cloud.stack.map((c) => c.id))
  for (const c of local) {
    if (pgIds.has(c.id)) continue
    void pushProtocolCompound(c)
    if (!cloudIds.has(c.id)) void pushStackCompound(c)
  }

  // LOGS: Postgres logs (re-keyed to local days) + cloud ∪ local entries not
  // already present (custom compounds' logs, offline logs).
  const methodById = new Map(mergedStack.map((c) => [c.id, c.method]))
  const merged: DayLogs = {}
  for (const [day, entries] of Object.entries(doseRowsToDayLogs(pg.doseRows, methodById))) {
    merged[day] = { ...entries }
  }
  for (const src of [cloud.doseLogs, localLogs]) {
    for (const [day, entries] of Object.entries(src)) {
      for (const [compoundId, log] of Object.entries(entries)) {
        if (merged[day]?.[compoundId]) continue
        ;(merged[day] ??= {})[compoundId] = log
      }
    }
  }
  saveDoseLogs(userId, merged)
  notifyDoseLogsChanged()
}
