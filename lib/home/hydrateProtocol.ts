/**
 * Hydrate the device-local stack + dose-log caches from Postgres (Protocol
 * Cutover, Step 3). Used by `components/home/useCloudHydration.ts` (the real
 * Home mount) as the single merge implementation.
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
import {
  archiveProtocolCompound,
  pullProtocolStackAndLogs,
  pushProtocolCompound,
} from "@/lib/home/protocolSync"
import { injectionSiteToLocal } from "@/lib/db/types"
import type { DoseRow, InjectionSite } from "@/lib/db/types"
import { isCatalogueName } from "@/lib/compound-lookup"

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
    const log: DoseLog = {
      amount: r.amount,
      siteId,
      time24,
      inventoryItemId: r.inventoryItemId,
    }
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

  // STACK: Postgres is canonical for MEMBERSHIP, but the local `archived` flag
  // wins when it diverges. An archive / reactivate done OFFLINE never reached
  // Postgres, so the pull still shows the compound active — without this, the
  // pull resurrects a compound the user just archived (a confirmed bug). Keep the
  // local intent and push it up so Postgres converges (idempotent; a no-op for
  // customs). Single-device assumption — a true cross-device archive conflict
  // would need an offline outbox / tombstones, which is out of beta scope.
  const localById = new Map(local.map((c) => [c.id, c]))
  const reconciledPgRaw = pg.stack.map((c) => {
    const loc = localById.get(c.id)
    if (loc && Boolean(loc.archived) !== Boolean(c.archived)) {
      void archiveProtocolCompound(c.id, Boolean(loc.archived))
      return { ...c, archived: loc.archived }
    }
    return c
  })

  // Defence in depth against the duplicate-compound bug: the Postgres pull is
  // already de-duped server-side, but never render the same compound (by name)
  // twice even if a stale row slips through — keep the active one.
  const pgByName = new Map<string, StackCompound>()
  for (const c of reconciledPgRaw) {
    const name = c.name.trim().toLowerCase()
    const cur = pgByName.get(name)
    if (!cur || (cur.archived && !c.archived)) pgByName.set(name, c)
  }
  const reconciledPg = [...pgByName.values()]

  // Non-Postgres extras, deduped by id AND by name (one compound per name — a
  // same-name Postgres compound is canonical, so a stale device/mirror copy is
  // dropped). Two sources, with DIFFERENT trust:
  //  - `local` (this device's cache): freshest intent — an offline add we keep and
  //    re-push below. Kept whether catalogue or custom.
  //  - `cloud.stack` (the jsonb mirror): kept for CUSTOM compounds only. Postgres is
  //    canonical for catalogue compounds, so a catalogue entry the mirror still holds
  //    but Postgres doesn't is a stale leftover (deleted here, or a failed sync on
  //    another device) and must NOT resurrect — that was the reinstall "deleted
  //    compounds came back" bug (the mirror outlives a PWA delete; Postgres is truth).
  const pgIds = new Set(pg.stack.map((c) => c.id))
  const seen = new Set(pgIds)
  const seenNames = new Set(reconciledPg.map((c) => c.name.trim().toLowerCase()))
  const extras: StackCompound[] = []
  const pushExtra = (c: StackCompound, dropStaleCatalogue: boolean): void => {
    if (seen.has(c.id)) return
    seen.add(c.id)
    const name = c.name.trim().toLowerCase()
    if (seenNames.has(name)) return // a same-name compound is already canonical
    if (dropStaleCatalogue && isCatalogueName(c.name)) return // stale mirror leftover
    seenNames.add(name)
    extras.push(c)
  }
  for (const c of local) pushExtra(c, false)
  for (const c of cloud.stack) pushExtra(c, true)
  const mergedStack = [...reconciledPg, ...extras]
  saveStack(userId, mergedStack)
  notifyStackChanged()

  // Flush local compounds Postgres doesn't have yet (offline adds). A catalogue
  // compound is pushed to Postgres here; a CUSTOM one is backed up to the jsonb
  // mirror (its durable metadata store — the mirror is customs-only, so we no
  // longer write catalogue copies there, which was the resurrection source). A
  // custom's protocol_compounds row (for vials/runway) is created on demand when a
  // vial is added (AddStockSheet / AddCompoundSheet) and by the stack mutators'
  // own dual-write — it doesn't need to be forced from this hydration flush.
  const cloudIds = new Set(cloud.stack.map((c) => c.id))
  for (const c of local) {
    if (pgIds.has(c.id)) continue
    if (isCatalogueName(c.name)) {
      void pushProtocolCompound(c)
    } else if (!cloudIds.has(c.id)) {
      void pushStackCompound(c)
    }
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
