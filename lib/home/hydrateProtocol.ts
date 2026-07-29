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
  scheduleVersionFromRow,
  type ScheduleVersion,
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
  pullScheduleVersions,
  pushProtocolCompound,
} from "@/lib/home/protocolSync"
import { awaitCriticalSyncs, trackCriticalSync } from "@/lib/home/syncStatus"
import { injectionSiteToLocal } from "@/lib/db/types"
import type { DoseRow, InjectionSite } from "@/lib/db/types"
import { isCatalogueName } from "@/lib/compound-lookup"

/** Pull Postgres (canonical) + the jsonb mirror, merge with local, and write the
 *  merged set back into the device-local caches. */
export async function hydrateFromPostgres(userId: string): Promise<void> {
  if (!userId || userId === "anon") return
  // Let any in-flight delete / archive commit BEFORE reading. This pull overwrites
  // the local cache, so reading mid-delete brings the compound back — and the
  // merge's flush then re-pushes it, making the resurrection permanent. See
  // `awaitCriticalSyncs`.
  await awaitCriticalSyncs()
  const [pg, cloud, versions] = await Promise.all([
    pullProtocolStackAndLogs(),
    pullStackAndLogs(),
    pullScheduleVersions(),
  ])
  mergeAndSave(userId, pg, cloud, versions)
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
      // `dose_logs.dose_unit` is per-log in the schema, so the unit a dose was
      // recorded in survives the round-trip and the row can't be relabelled with
      // the compound's current unit (see DoseLog.unit).
      ...(r.doseUnit ? { unit: r.doseUnit } : {}),
      siteId,
      time24,
      inventoryItemId: r.inventoryItemId,
    }
    ;(out[dateKey] ??= {})[r.compoundId] = log
  }
  return out
}

/** One compound per name — the identity the app itself enforces (the add flow
 *  refuses a duplicate by name), so it's the right key when ids disagree. */
function nameKey(name: string): string {
  return name.trim().toLowerCase()
}

function mergeAndSave(
  userId: string,
  pg: { stack: StackCompound[]; doseRows: DoseRow[] },
  cloud: { stack: StackCompound[]; doseLogs: DayLogs },
  versionRows: Awaited<ReturnType<typeof pullScheduleVersions>> = {}
): void {
  const local = loadStack(userId) ?? []
  const localLogs = loadDoseLogs(userId)
  const pgIds = new Set(pg.stack.map((c) => c.id))

  // STACK: Postgres is canonical for MEMBERSHIP, but the local `archived` flag
  // wins when it diverges. An archive / reactivate done OFFLINE never reached
  // Postgres, so the pull still shows the compound active — without this, the
  // pull resurrects a compound the user just archived (a confirmed bug). Keep the
  // local intent and push it up so Postgres converges (idempotent; a no-op for
  // customs). Single-device assumption — a true cross-device archive conflict
  // would need an offline outbox / tombstones, which is out of beta scope.
  //
  // Matched by id FIRST, then by NAME. The name fallback is the other half of the
  // ghost-compound fix (Spec 01 · steps 2–3): a compound's Postgres id can drift
  // from its client id (`pushProtocolCompound` reuses an existing row's id), and
  // an id-only join then finds no local counterpart for the pulled row — so the
  // local "archived" record was treated as an unrelated extra, dropped by the
  // name de-dupe below, and the compound came back ACTIVE. Matching by name keeps
  // the user's intent and re-pushes it, and records the id change so the
  // compound's logs follow it instead of orphaning.
  const localById = new Map(local.map((c) => [c.id, c]))
  const localByName = new Map<string, StackCompound>()
  for (const c of local) {
    if (!localByName.has(nameKey(c.name))) localByName.set(nameKey(c.name), c)
  }
  /** local id → Postgres id, for compounds matched by name rather than by id. */
  const idRemap = new Map<string, string>()

  const reconciledPgRaw = pg.stack.map((c) => {
    let loc = localById.get(c.id)
    if (!loc) {
      const byName = localByName.get(nameKey(c.name))
      // Only adopt a local record that isn't itself a distinct Postgres row.
      if (byName && !pgIds.has(byName.id)) {
        loc = byName
        idRemap.set(byName.id, c.id)
      }
    }
    // The pulled row carries NO schedule history — `protocol_compounds` holds one
    // current rule, and versions live in their own table (pulled separately). Carry
    // the device's trail across so it survives a hydration that returns no
    // versions, which is every hydration until supabase/protocol/005 is applied.
    // Without this the local history is replaced by a row that has none, and an
    // alteration recorded before the migration is silently lost on next load.
    const history = loc?.scheduleHistory
    const merged = history?.length ? { ...c, scheduleHistory: history } : c
    if (loc && Boolean(loc.archived) !== Boolean(c.archived)) {
      // CRITICAL, not plain: this push converges Postgres onto the local delete
      // intent, so the NEXT hydration must wait for it (`awaitCriticalSyncs` at the
      // top). Tracked as ordinary it isn't in `inFlightCritical`, so a hydration
      // fired moments later on focus/reconnect reads the pre-push state and writes
      // the compound back active — the exact resurrection this file's own gating
      // exists to prevent. `archiveInStack` wraps the identical call the same way.
      void trackCriticalSync(
        archiveProtocolCompound(c.id, c.name, Boolean(loc.archived))
      )
      return { ...merged, archived: loc.archived }
    }
    return merged
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
  const seen = new Set(pgIds)
  const seenNames = new Set(reconciledPg.map((c) => nameKey(c.name)))
  const extras: StackCompound[] = []
  const pushExtra = (c: StackCompound, dropStaleCatalogue: boolean): void => {
    if (seen.has(c.id)) return
    // A local record that was matched to a Postgres row by name is already
    // represented by that row (under the Postgres id) — it is not an extra.
    if (idRemap.has(c.id)) return
    seen.add(c.id)
    const name = nameKey(c.name)
    if (seenNames.has(name)) return // a same-name compound is already canonical
    if (dropStaleCatalogue && isCatalogueName(c.name)) return // stale mirror leftover
    seenNames.add(name)
    extras.push(c)
  }
  for (const c of local) pushExtra(c, false)
  for (const c of cloud.stack) pushExtra(c, true)
  // Schedule versions (Spec 01). Postgres is canonical for a day it has a version
  // for; a day only the device knows about is KEPT rather than dropped. Both
  // halves matter: supabase/protocol/005 may not be applied yet (every pull then
  // returns nothing, and clobbering would discard the user's alteration history),
  // and an alteration made offline hasn't reached Postgres either. Versions are
  // only ever added or replaced, never deleted, so a union can't resurrect
  // anything the user removed.
  const mergedStack = [...reconciledPg, ...extras].map((c) => {
    const rows = versionRows[c.id] ?? []
    const local = c.scheduleHistory ?? []
    if (rows.length === 0 && local.length === 0) return c
    const byDay = new Map<string, ScheduleVersion>()
    for (const v of local) byDay.set(v.effectiveFrom, v)
    for (const r of rows) {
      const v = scheduleVersionFromRow(r)
      byDay.set(v.effectiveFrom, v) // Postgres wins the day it knows about
    }
    const scheduleHistory = [...byDay.values()].sort((a, b) =>
      a.effectiveFrom.localeCompare(b.effectiveFrom)
    )
    return { ...c, scheduleHistory }
  })
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
    // Already reconciled onto a Postgres row under a different id — re-pushing it
    // would mint a SECOND row for the same compound.
    if (idRemap.has(c.id)) continue
    if (isCatalogueName(c.name)) {
      void pushProtocolCompound(c)
    } else if (!cloudIds.has(c.id)) {
      void pushStackCompound(c)
    }
  }

  // LOGS: Postgres logs (re-keyed to local days) + cloud ∪ local entries not
  // already present (custom compounds' logs, offline logs).
  //
  // Device-side logs are re-keyed through `idRemap` first. A compound's logs are
  // keyed by its compound id, so when the stack entry adopts the Postgres id its
  // history has to follow — otherwise the logs are stranded under an id no
  // compound has any more: invisible in Today's Log, but still counted by the
  // week strip's "something was logged that day". Same-key collisions keep the
  // entry already under the Postgres id (it came from the canonical store).
  const remapLogs = (src: DayLogs): DayLogs => {
    if (idRemap.size === 0) return src
    const out: DayLogs = {}
    for (const [day, entries] of Object.entries(src)) {
      const dayOut: Record<string, DoseLog> = {}
      for (const [compoundId, log] of Object.entries(entries)) {
        const key = idRemap.get(compoundId) ?? compoundId
        if (dayOut[key] && key !== compoundId) continue
        dayOut[key] = log
      }
      out[day] = dayOut
    }
    return out
  }

  const methodById = new Map(mergedStack.map((c) => [c.id, c.method]))
  const merged: DayLogs = {}
  for (const [day, entries] of Object.entries(doseRowsToDayLogs(pg.doseRows, methodById))) {
    merged[day] = { ...entries }
  }
  for (const src of [remapLogs(cloud.doseLogs), remapLogs(localLogs)]) {
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
