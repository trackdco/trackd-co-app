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
  isTombstoned,
  loadDoseLogs,
  loadTombstones,
  parseSlotKey,
  saveDoseLogs,
  slotKey,
  notifyDoseLogsChanged,
  type DayLogs,
} from "@/lib/home/doseLog"
import { toDateKey, type DoseLog } from "@/lib/home/mockHomeData"
import { pushStackCompound, pullStackAndLogs } from "@/lib/home/syncActions"
import {
  archiveProtocolCompound,
  pullProtocolStackAndLogs,
  pullPauses,
  pullScheduleVersions,
  pushProtocolCompound,
} from "@/lib/home/protocolSync"
import { awaitCriticalSyncs, trackCriticalSync } from "@/lib/home/syncStatus"
import { injectionSiteToLocal } from "@/lib/db/types"
import type { DoseRow, InjectionSite } from "@/lib/db/types"
import { isCatalogueName } from "@/lib/compound-lookup"
import { pullStacks } from "@/lib/home/stackSync"
import { listOneOffLogs } from "@/lib/db/oneOffLogs"
import {
  loadOneOffTombstones,
  loadOneOffs,
  normalizeOneOff,
  notifyOneOffsChanged,
  saveOneOffs,
  type OneOffDays,
  type OneOffLog,
} from "@/lib/home/oneOffLogs"
import type { Pause } from "@/lib/home/pauses"
import {
  loadStacks,
  notifyStacksChanged,
  saveStacks,
  type Stack,
  type StackMembership,
} from "@/lib/home/stacks"

/** Pull Postgres (canonical) + the jsonb mirror, merge with local, and write the
 *  merged set back into the device-local caches. */
export async function hydrateFromPostgres(userId: string): Promise<void> {
  if (!userId || userId === "anon") return
  // Let any in-flight delete / archive commit BEFORE reading. This pull overwrites
  // the local cache, so reading mid-delete brings the compound back — and the
  // merge's flush then re-pushes it, making the resurrection permanent. See
  // `awaitCriticalSyncs`.
  await awaitCriticalSyncs()
  const [pg, cloud, versions, stacks, pauses, oneOffs] = await Promise.all([
    pullProtocolStackAndLogs(),
    pullStackAndLogs(),
    pullScheduleVersions(),
    pullStacks(),
    pullPauses(),
    listOneOffLogs(),
  ])
  const idRemap = mergeAndSave(userId, pg, cloud, versions, pauses)
  hydrateStacks(userId, stacks, idRemap)
  hydrateOneOffs(userId, oneOffs)
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
    // THE STORED DAY WINS, then the day the DEVICE recorded, and only then a
    // derivation. Deriving a day from an instant answers with whatever timezone
    // the phone is in right now, so flying between them re-bucketed every past
    // dose — and because the device mirror keeps the original day, the merge
    // below then showed one dose on two adjacent days. A day is a fact about
    // where you were standing, so it is read, not recomputed.
    //
    // After `supabase/protocol/012` nulled the column, EVERY pre-existing row
    // takes this fallback, which is what made the re-bucketing reachable for the
    // whole of history rather than a handful of rows. `recoveredDay` reads the
    // original day back out of the row's own id (see `DoseRow.recoveredDay`);
    // `takenAt` remains the last resort for a row whose id predates that scheme.
    const dateKey = r.loggedFor ?? r.recoveredDay ?? toDateKey(taken)
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
      // A skipped dose must not read back as one that was taken.
      ...(r.status === "skipped" ? { status: "skipped" as const } : {}),
      ...(r.note ? { note: r.note } : {}),
      siteId,
      time24,
      inventoryItemId: r.inventoryItemId,
    }
    // ⚠️ Keyed by SLOT. Writing `r.compoundId` alone put both of a day's doses
    // on the same key, so the later row silently overwrote the earlier one — and
    // on a fresh device, where there is no local copy to merge against, the
    // second dose of every multi-dose day was lost outright.
    ;(out[dateKey] ??= {})[slotKey(r.compoundId, r.slotIndex)] = log
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
  versionRows: Awaited<ReturnType<typeof pullScheduleVersions>> = {},
  pauseRows: Awaited<ReturnType<typeof pullPauses>> = {}
): Map<string, string> {
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
    let merged = history?.length ? { ...c, scheduleHistory: history } : c
    // Same reasoning for the CYCLE: a pull from a database without the 006
    // columns returns a row carrying none, so overwriting with it would erase a
    // cycle the user just set. Postgres wins when it actually knows one; the
    // device's own cycle survives when it does not.
    if (!merged.cycle && loc?.cycle) merged = { ...merged, cycle: loc.cycle }
    // PAUSES, same bargain as the cycle and the version trail. Postgres is
    // canonical when it returns any — a reinstall must get the user's pauses
    // back — and the device's own survive when it returns none, which is every
    // hydration until `supabase/protocol/018` is applied. Without the fallback,
    // pausing a compound and reopening the app would silently un-pause it.
    // ⚠️ MERGED BY ID, not replaced. Taking the server's list wholesale undid a
    // Resume made offline: the local row said "ends yesterday", the push had not
    // landed, and the pull's still-open row overwrote it — silently pausing the
    // compound again, indefinitely. Same for a pause created offline.
    //
    // The server wins for an id both hold (it is what actually persisted);
    // local-only ids are kept, because the server has simply not heard of them
    // yet. This is the same bargain the dose logs make two blocks below.
    const pulledPauses = pauseRows[c.id] ?? []
    const byPauseId = new Map<string, Pause>()
    for (const p of loc?.pauses ?? []) byPauseId.set(p.id, p)
    for (const p of pulledPauses) {
      byPauseId.set(p.id, {
        id: p.id,
        startedOn: p.startedOn,
        endsOn: p.endsOn,
        ...(p.groupId ? { groupId: p.groupId } : {}),
      })
    }
    if (byPauseId.size > 0) {
      merged = { ...merged, pauses: [...byPauseId.values()] }
    }
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
  /** Does the device hold any dose for this compound, on any day? */
  const hasAnyLog = (id: string): boolean =>
    Object.values(localLogs).some((day) =>
      Object.keys(day ?? {}).some((k) => parseSlotKey(k).compoundId === id),
    )
  /**
   * Did the pull actually SAY anything? A failed read fast-fails to an empty
   * shape rather than throwing, so "Postgres does not have this compound" and
   * "we could not reach Postgres" arrive here identically. The prune below is
   * the one rule that deletes a device record outright, so it is the one rule
   * that must be able to tell them apart, and a pull carrying no compounds at
   * all is not evidence of anything.
   */
  const pullSpoke = pg.stack.length > 0
  const pushExtra = (c: StackCompound, dropStaleCatalogue: boolean): void => {
    if (seen.has(c.id)) return
    // A local record that was matched to a Postgres row by name is already
    // represented by that row (under the Postgres id) — it is not an extra.
    if (idRemap.has(c.id)) return
    seen.add(c.id)
    const name = nameKey(c.name)
    if (seenNames.has(name)) return // a same-name compound is already canonical
    if (dropStaleCatalogue && isCatalogueName(c.name)) return // stale mirror leftover
    /**
     * DELETED, never dosed, and Postgres has no row for it. Nothing about this
     * record is worth carrying: it holds no history, it can never be logged
     * against again, and the flush above deliberately will not re-create it.
     *
     * Keeping it was not harmless. A compound deleted before the app wrote
     * dated stops has no way to say WHEN it stopped, and one added with a
     * back-dated start describes days that were never tracked — so a record
     * with nothing behind it went on drawing rows in the schedule's past weeks
     * on a device that had already been told, by the only source that knows, to
     * forget it. Adrian had eleven of these.
     */
    if (pullSpoke && c.archived && !hasAnyLog(c.id)) return
    seenNames.add(name)
    extras.push(c)
  }
  for (const c of local) pushExtra(c, false)
  for (const c of cloud.stack) pushExtra(c, true)
  // Schedule versions (Spec 01). Postgres is canonical for a day it has a version
  // for; a day only the device knows about is KEPT rather than dropped. Both
  // halves matter: supabase/protocol/005 may not be applied yet (every pull then
  // returns nothing, and clobbering would discard the user's alteration history),
  // and an alteration made offline hasn't reached Postgres either.
  //
  // ⚠️ A UNION, WHICH IS ONLY SAFE BECAUSE THE PUSH SWEEPS. Versions ARE removed:
  // `recordScheduleVersion` drops every version dated after the one it records,
  // and this merge would happily pull a dropped one back. That is not theoretical
  // — a back-dated re-add drops the delete's stop, and while Postgres still held
  // it the next hydration restored it here and the compound stopped being due in
  // the app, forever. `sweepSupersededVersions` (protocolSync.ts) deletes them on
  // the way out so there is nothing stale left to re-merge; if that sweep is ever
  // removed, this union becomes a resurrection.
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
    /**
     * DELETED, never logged, and Postgres has never heard of it. There is
     * nothing to flush: the flush exists to rescue an offline ADD, and this is
     * the opposite of one.
     *
     * It also has to be skipped, not merely pointless. Pushing it MINTS a row
     * for a compound the user deleted, which is how a record removed at the
     * database comes back the next time the app opens — the device would keep
     * re-creating it forever, and nothing at the far end could tell the
     * difference between that and a genuine add.
     *
     * A deleted compound WITH doses on it still flushes, because its logs need
     * a row to hang off: `dose_logs.protocol_compound_id` is a foreign key, and
     * dropping the compound would strand the user's history.
     */
    if (c.archived && !hasAnyLog(c.id)) continue
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
  // Doses the user UN-LOGGED whose delete may not have reached Postgres. Without
  // this, unticking offline and reconnecting pulled the row straight back — the
  // tick refilled with its original amount, time and site, and nothing retried the
  // delete. The tombstone records the intent so the pull can be filtered by it.
  const tombstones = loadTombstones(userId)
  const merged: DayLogs = {}
  for (const [day, entries] of Object.entries(doseRowsToDayLogs(pg.doseRows, methodById))) {
    for (const [key, log] of Object.entries(entries)) {
      // PARSED, because a tombstone carries the slot: testing the raw key
      // against slot 0's tombstone meant un-logging the EVENING dose offline
      // never suppressed it, and it came back keyed as the morning one.
      const { compoundId, slot } = parseSlotKey(key)
      if (isTombstoned(tombstones, day, compoundId, slot)) continue
      ;(merged[day] ??= {})[key] = log
    }
  }
  for (const src of [remapLogs(cloud.doseLogs), remapLogs(localLogs)]) {
    for (const [day, entries] of Object.entries(src)) {
      for (const [compoundId, log] of Object.entries(entries)) {
        // A tombstoned dose stays gone from every source, not just the pull.
        const parsed = parseSlotKey(compoundId)
        if (isTombstoned(tombstones, day, parsed.compoundId, parsed.slot)) continue
        const already = merged[day]?.[compoundId]
        if (already) {
          /**
           * The Postgres row wins the dose itself, but NOT the injection site.
           *
           * `dose_logs.injection_site` is a coarse 13-value enum: 22 of the 36
           * pickable sites have no member and collapse to `other`, which reads
           * back as `null`. So a dose logged into "Trap - Left" came back with no
           * site at all, and "Front Quad - Left" came back as "Outer Quad - Left"
           * — a different muscle, silently, within seconds of logging.
           *
           * The GRANULAR siteId is preserved verbatim in the device store and its
           * jsonb mirror, which is exactly what the injection-site recency view
           * reads. So where the pulled row has no site and a local/mirror record
           * for the same dose does, the local one is kept. It is strictly more
           * information about the same event, never a conflicting fact.
           */
          if (already.siteId == null && log.siteId != null) {
            merged[day]![compoundId] = { ...already, siteId: log.siteId }
          }
          continue
        }
        ;(merged[day] ??= {})[compoundId] = log
      }
    }
  }
  saveDoseLogs(userId, merged)
  notifyDoseLogsChanged()
  return idRemap
}


/**
 * Fold the pulled stacks into the device store — the half that was missing, and
 * why a stack did not survive a reinstall.
 *
 * **The device is authoritative.** The server contributes exactly two things: the
 * real start date when ours is only a migration guess, and any membership we have
 * never heard of. It used to be the other way round — a fully-resolving pull
 * replaced the local stack outright — and that silently reverted every stack edit
 * made offline (nothing re-pushes stacks on reconnect), deleted any member the
 * push could not send (an unmigrated custom), and, once `023`'s backfill landed,
 * overwrote real join dates with the stack's creation day.
 *
 * Two things follow from it:
 *  - **Local member ids follow `idRemap`.** `mergeAndSave` can re-point a
 *    compound's local id at its Postgres row; a stack still holding the old id
 *    would render with no members.
 *  - **A stack with no local counterpart is kept even when its members do not
 *    resolve.** This list is what the next `pushStacks` mirrors back up, so
 *    dropping it deletes the stack — and its whole dated history — from Postgres.
 *    Resolvability is no longer a gate anywhere here.
 *
 * An empty pull is NO NEWS, never "the user deleted everything".
 */
export function placedElsewhere(local: Stack[], exceptStackId: string): Set<string> {
  const out = new Set<string>()
  for (const s of local) {
    if (s.id === exceptStackId) continue
    for (const m of s.members) {
      if (m.to === undefined) out.add(m.compoundId)
    }
  }
  return out
}

export function mergeStack(
  pulled: Stack,
  local: Stack,
  /** Compounds the device currently has in some OTHER stack. A pulled membership
   *  for one of those is a stale placement, not news. */
  placedElsewhere: ReadonlySet<string> = new Set()
): Stack {
  const base = adoptStart(local, pulled)
  const known = new Set(local.members.map((m) => m.compoundId))
  // `known` alone is not enough. Moving a compound between stacks ON THE DAY IT
  // JOINED prunes its span in the old stack to nothing (it covered no day), so
  // the device's record of the move is an ABSENCE — and the server's pre-move
  // open span was re-adopted as an extra. The compound was then open in two
  // stacks, and `dedupeMembership`'s same-day tie went to the older one, so the
  // move was undone and the stack the user had just built was emptied and hidden.
  const extra = pulled.members.filter(
    (m) =>
      !known.has(m.compoundId) &&
      // Only an OPEN pulled span can conflict with where the device has since
      // put the compound. A CLOSED one is history — it says where the compound
      // used to be — and suppressing it dropped real past grouping that the
      // next push then deleted from Postgres too.
      !(m.to === undefined && placedElsewhere.has(m.compoundId))
  )
  return extra.length === 0
    ? base
    : { ...base, members: [...base.members, ...extra] }
}

/**
 * Take the server's start date for a stack whose own is a migration guess, and
 * pull the guessed member spans back with it.
 *
 * A stack that knows its real start (`provisionalStart` absent) is returned
 * untouched — the device's date is then the authoritative one, and the server's
 * copy is what this device wrote. So is a stack whose SERVER date is itself a
 * guess: `pullStacks` marks the whole result provisional when it had to fall
 * back to the pre-023 select, and adopting a `created_at`-derived date over the
 * device's own would be trading one guess for another.
 *
 * The flag is cleared whenever a REAL server date has been seen, even if it is
 * not earlier than ours — otherwise the stack stays in the "omit effective_from"
 * push batch forever and the device could never mirror its date up at all.
 */
export function adoptStart(local: Stack, pulled: Stack): Stack {
  if (!local.provisionalStart || pulled.provisionalStart) return local
  const serverFrom = pulled.effectiveFrom
  const guessed = local.effectiveFrom
  const { provisionalStart, ...rest } = local
  void provisionalStart
  // A member the user ticked in ON the migration day carries the guessed date
  // honestly, so the date alone cannot say which spans to move — only the flag
  // `migrateLegacy` set on the ones it invented can.
  const undoGuess = (m: StackMembership): StackMembership => {
    if (m.provisionalFrom !== true) return m
    const { provisionalFrom, ...span } = m
    void provisionalFrom
    return serverFrom < span.from ? { ...span, from: serverFrom } : span
  }
  return {
    ...rest,
    effectiveFrom: serverFrom < guessed ? serverFrom : guessed,
    members: local.members.map(undoGuess),
  }
}

export function hydrateStacks(
  userId: string,
  pulled: Stack[],
  idRemap: Map<string, string>
): void {
  const local = loadStacks(userId)
  // Follow any id change first, so a local stack keeps pointing at its members.
  // Closed spans are remapped too — a past membership that still names a retired
  // id would silently stop matching, and the historical day would ungroup.
  const remapped = local.map((s) =>
    idRemap.size === 0
      ? s
      : {
          ...s,
          members: s.members.map((m) => ({
            ...m,
            compoundId: idRemap.get(m.compoundId) ?? m.compoundId,
          })),
        }
  )
  if (pulled.length === 0) {
    // No news from the server — but a remap may still have moved ids locally.
    if (idRemap.size > 0) {
      saveStacks(userId, remapped)
      notifyStacksChanged()
    }
    return
  }

  // Resolvability is no longer a gate here. It used to decide whether a pulled
  // stack was safe to adopt, but the merge below never adopts one wholesale — the
  // device's spans are kept whatever they reference, and a stack with no local
  // counterpart is kept whether its members resolve or not (dropping it deletes
  // it from Postgres on the next push). Nothing downstream renders an
  // unresolvable member: `partitionByStack` only groups ids that are actually due
  // that day, and Protocol lists only stacks it can draw.
  const localById = new Map(remapped.map((s) => [s.id, s]))

  const merged: Stack[] = []
  for (const p of pulled) {
    const loc = localById.get(p.id)
    localById.delete(p.id)
    if (!loc) {
      // Nothing local to defer to — a fresh device, or a stack created elsewhere.
      // KEEP IT even when its members don't resolve yet: this list is what the
      // next `pushStacks` mirrors back up, so dropping the stack deletes it, and
      // its whole dated history, from Postgres on the next edit. Nothing shows a
      // half-resolved stack to the user — `partitionByStack` skips it on any day
      // it has no members for, and Protocol lists only stacks with at least one
      // member it can actually draw.
      merged.push(p)
    } else if (p.provisionalStart) {
      // The pull came from a database without the 013 columns, so its dates were
      // INVENTED: every span reads as open (the old schema cannot say a
      // membership ended) and every start is the stack's creation day. Adopting
      // any of that would resurrect every compound the user has ever removed from
      // a stack. The device's copy is the only dated truth until the migration
      // runs, so it wins outright.
      merged.push(loc)
    } else {
      merged.push(mergeStack(p, loc, placedElsewhere(remapped, p.id)))
    }
  }
  for (const leftover of localById.values()) merged.push(leftover)

  saveStacks(userId, merged)
  notifyStacksChanged()
}


/**
 * Fold the pulled one-offs into the device store.
 *
 * Postgres is canonical, MINUS anything the user has deleted whose delete has
 * not landed yet — the same tombstone bargain the dose logs make. Without it,
 * deleting a one-off offline and reconnecting brings it straight back, because
 * hydration seeds from the pulled rows unconditionally.
 *
 * A pull that returns NOTHING leaves the device store alone: that is every
 * hydration until `supabase/protocol/020` is applied, and wiping the local
 * entries on the strength of an empty read would delete the only copy.
 */
function hydrateOneOffs(
  userId: string,
  rows: Awaited<ReturnType<typeof listOneOffLogs>>
): void {
  if (rows.length === 0) return
  const tombstoned = loadOneOffTombstones(userId)
  /**
   * ⚠️ MERGED, not replaced.
   *
   * Building `days` from the pulled rows alone and saving it DELETED every
   * one-off written offline: `addOneOff` pushes fire-and-forget, nothing retries
   * it, so an entry made without a network existed only on the device — and the
   * next hydration overwrote it with the server's list. Local entries the server
   * has never heard of are kept; a pulled row wins for an id they share, because
   * that is the one the server actually stored.
   */
  const local = loadOneOffs(userId)
  const byId = new Map<string, OneOffLog>()
  for (const list of Object.values(local)) {
    for (const l of list) if (!Object.hasOwn(tombstoned, l.id)) byId.set(l.id, l)
  }
  for (const r of rows) {
    if (Object.hasOwn(tombstoned, r.id)) continue
    const pulled = normalizeOneOff({
      id: r.id,
      label: r.label,
      compoundName: r.compoundName ?? undefined,
      amount: r.amount == null ? undefined : String(r.amount),
      unit: r.unit ?? undefined,
      loggedFor: r.loggedFor,
      // The stored instant back to a local clock time. The DAY comes from
      // `logged_for`, which the device vouched for; only the time is derived.
      time24: new Date(r.takenAtIso).toTimeString().slice(0, 5),
      note: r.note ?? undefined,
    })
    if (!pulled) continue
    // `category` and `method` are not columns on `one_off_logs` — they are
    // display facts derived from the catalogue. Carry the device's copy across
    // rather than blanking them, or every entry redraws as a generic supplement
    // after the first hydration.
    const had = byId.get(pulled.id)
    byId.set(pulled.id, {
      ...pulled,
      ...(had?.category ? { category: had.category } : {}),
      ...(had?.method ? { method: had.method } : {}),
    })
  }
  const days: OneOffDays = {}
  for (const l of byId.values()) (days[l.loggedFor] ??= []).push(l)
  if (saveOneOffs(userId, days)) notifyOneOffsChanged()
}
