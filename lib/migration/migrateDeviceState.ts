/**
 * One-time, per-user backfill of the interim device-local stack + dose logs into
 * the canonical Postgres model (Protocol Cutover, Step 2), so no beta user loses
 * data when Home flips onto Postgres (Step 3).
 *
 * Source = the live `localStorage` stores (`lib/home/stack.ts` / `doseLog.ts`)
 * UNIONed with the jsonb mirror tables (`pullStackAndLogs`, the durable
 * server-side fallback for an empty local cache). It writes through the SAME
 * `lib/home/protocolSync.ts` actions the live Home flip uses, so id resolution +
 * the catalogue lookup live in exactly one place and a migrated row and a later
 * live edit address the same primary key.
 *
 * IDEMPOTENT: `protocolSync` derives deterministic, stable ids, so a re-run
 * upserts the SAME rows — no duplicates, even across a PWA reinstall (device ids
 * are cloud-backed by the jsonb mirror, so they survive). A localStorage marker
 * additionally skips redundant work each login.
 *
 * SCOPE (per the cutover decisions): only catalogue compounds migrate; a name not
 * in the read-only catalogue is a custom "Make your own" compound (v1.5) and is
 * left device-local (`skippedCustom`), never deleted.
 *
 * Pure logic + guarded storage; no React.
 */
import { combineLocalDateTime } from "@/lib/home/mockHomeData"
import { loadStack, type StackCompound } from "@/lib/home/stack"
import { loadDoseLogs, type DayLogs } from "@/lib/home/doseLog"
import { pullStackAndLogs } from "@/lib/home/syncActions"
import { pushProtocolBatch } from "@/lib/home/protocolSync"
import type { BatchDoseEntry } from "@/lib/db/types"
import { hasMigratedInCloud, markMigratedInCloud } from "@/lib/db/migrationFlag"

export interface MigrationResult {
  ran: boolean
  reason?: string
  compounds: number
  doseLogs: number
  skippedCustom: number
  failures: number
}

const markerKey = (userId: string) => `trackd.migrated.v1.${userId}`

/** Whether this device has already run the migration for the user. */
export function hasMigrated(userId: string): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(markerKey(userId)) === "1"
  } catch {
    return false
  }
}

function setMigrated(userId: string) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(markerKey(userId), "1")
  } catch {
    /* storage disabled — deterministic ids keep a re-run idempotent anyway */
  }
}

/**
 * Run the migration. Best-effort: never throws. Skips when already migrated
 * (unless `force`), or when offline / signed out (so it retries next login).
 */
export async function migrateDeviceState(
  userId: string,
  opts?: { force?: boolean }
): Promise<MigrationResult> {
  const base: MigrationResult = {
    ran: false,
    compounds: 0,
    doseLogs: 0,
    skippedCustom: 0,
    failures: 0,
  }
  if (!userId || userId === "anon") return { ...base, reason: "no-user" }
  // Local fast-path: skip the network check when this device already migrated.
  if (!opts?.force && hasMigrated(userId)) return { ...base, reason: "already-migrated" }
  // Durable, reinstall-proof guard: once the user has EVER migrated (cloud flag on
  // their profile), never run again — a PWA reinstall wipes the local marker, and
  // re-running would re-seed the stack from the stale jsonb mirror and resurrect
  // deleted compounds. Cache the cloud truth back into the local marker.
  if (await hasMigratedInCloud()) {
    setMigrated(userId)
    return { ...base, reason: "already-migrated" }
  }

  try {
    // Source: local ∪ jsonb mirror (cloud wins; local-only entries included).
    const cloud = await pullStackAndLogs()
    const stack = unionStack(cloud.stack, loadStack(userId) ?? [])
    const logs = unionLogs(cloud.doseLogs, loadDoseLogs(userId))

    if (stack.length === 0) {
      setMigrated(userId) // nothing to copy — mark done so we don't re-pull each login
      void markMigratedInCloud() // ...and durably, so a reinstall doesn't re-run it
      return { ...base, ran: true, reason: "nothing-to-migrate" }
    }

    // Flatten the dose logs into the migration's transport shape, computing each
    // `takenAt` CLIENT-side (the server can't know the device timezone). The whole
    // backfill then goes in ONE batched server-action round-trip (chunked multi-row
    // upserts) instead of N+M individual writes that each re-auth + re-query.
    const doseEntries: BatchDoseEntry[] = []
    for (const [dateKey, day] of Object.entries(logs)) {
      for (const [compoundId, log] of Object.entries(day)) {
        doseEntries.push({
          clientCompoundId: compoundId,
          dateKey,
          amount: log.amount,
          siteId: log.siteId,
          takenAtIso: combineLocalDateTime(dateKey, log.time24),
        })
      }
    }

    const res = await pushProtocolBatch(stack, doseEntries)
    // Only mark done on a clean run — a transient failure retries next login (the
    // deterministic ids make the retry a no-op upsert for whatever already landed).
    const failures = res.ok ? 0 : 1
    if (failures === 0) {
      setMigrated(userId)
      void markMigratedInCloud() // durable so a reinstall never re-runs this
    }
    return {
      ran: true,
      compounds: res.compounds,
      doseLogs: res.doseLogs,
      skippedCustom: res.skippedCustom,
      failures,
    }
  } catch (e) {
    console.error("migrateDeviceState failed", e)
    return { ...base, reason: "error" }
  }
}

/* ----------------------------------------------------------------- internal */

function unionStack(cloud: StackCompound[], local: StackCompound[]): StackCompound[] {
  const ids = new Set(cloud.map((c) => c.id))
  return [...cloud, ...local.filter((c) => !ids.has(c.id))]
}

function unionLogs(cloud: DayLogs, local: DayLogs): DayLogs {
  const merged: DayLogs = {}
  for (const [day, entries] of Object.entries(cloud)) merged[day] = { ...entries }
  for (const [day, entries] of Object.entries(local)) {
    for (const [compoundId, log] of Object.entries(entries)) {
      if (merged[day]?.[compoundId]) continue
      ;(merged[day] ??= {})[compoundId] = log
    }
  }
  return merged
}
