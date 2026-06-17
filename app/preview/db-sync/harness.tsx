"use client"

/**
 * DEV-ONLY throwaway client harness for the Step 1 data + sync layer. Co-located
 * with its route (not a product component) and removed before the Home flip.
 *
 * Flow it exercises:
 *   1. Pull → ensures/loads the active "Current" cycle (RLS-scoped to you).
 *   2. Queue a test protocol_compound to the cache WITHOUT flushing ("offline").
 *   3. Flush → pushes the queued write to Postgres; pull reconciles it back.
 *   4. Queue + flush a dose_log against that compound.
 *   5. Delete the test compound (cascades its dose log) + flush.
 * The live cache snapshot (cycle / compounds / dose logs / outbox length) renders
 * via useSyncExternalStore so you can watch optimistic writes and the outbox drain.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react"

import { createClient } from "@/lib/supabase/client"
import {
  cacheDeleteCompound,
  cacheUpsertCompound,
  cacheUpsertDoseLog,
  getCacheSnapshot,
  subscribeCache,
  type DbCacheState,
} from "@/lib/sync/cache"
import { flush, pull, reconcile } from "@/lib/sync/syncEngine"
import { migrateDeviceState } from "@/lib/migration/migrateDeviceState"
import { toDateKey } from "@/lib/home/mockHomeData"

const EMPTY: DbCacheState = { cycle: null, compounds: [], doseLogs: [], outbox: [] }

export function DbSyncHarness() {
  const [userId, setUserId] = useState<string | null>(null)
  const [compoundId, setCompoundId] = useState<string | null>(null)
  const [testPcId, setTestPcId] = useState<string | null>(null)
  const [lines, setLines] = useState<string[]>([])

  const log = useCallback((msg: string) => {
    setLines((prev) => [`${new Date().toLocaleTimeString()}  ${msg}`, ...prev].slice(0, 40))
  }, [])

  // Identity + a real catalogue compound id (the read-only `compounds` table).
  useEffect(() => {
    const supabase = createClient()
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)
      const { data } = await supabase.from("compounds").select("id, name").limit(1).maybeSingle()
      if (data) {
        setCompoundId(data.id as string)
        log(`catalogue compound: ${(data as { name: string }).name}`)
      }
      log(user ? `signed in as ${user.id}` : "SIGNED OUT — sign in locally to exercise the live round-trip")
    })()
  }, [log])

  const snap = useSyncExternalStore(
    subscribeCache,
    () => (userId ? getCacheSnapshot(userId) : EMPTY),
    () => EMPTY,
  )

  const doPull = useCallback(async () => {
    if (!userId) return log("no user")
    const ok = await pull(userId)
    log(ok ? "pull ok — cycle + compounds + dose logs reconciled" : "pull returned no server truth (offline / signed out)")
  }, [userId, log])

  const queueCompound = useCallback(() => {
    if (!userId || !compoundId || !snap.cycle) return log("need user + catalogue compound + cycle (pull first)")
    const id = crypto.randomUUID()
    setTestPcId(id)
    cacheUpsertCompound(userId, {
      id,
      cycle_id: snap.cycle.id,
      compound_id: compoundId,
      dose_amount: 100,
      dose_unit: "mg",
      route: "subq",
      schedule_type: "every_day",
      times_per_day: 1,
      dose_times: ["08:00:00"],
      first_dose_on: toDateKey(new Date()),
    })
    log(`queued test compound ${id.slice(0, 8)} (cache only — not yet pushed)`)
  }, [userId, compoundId, snap.cycle, log])

  const queueDoseLog = useCallback(() => {
    if (!userId || !testPcId) return log("queue a compound first")
    const id = crypto.randomUUID()
    cacheUpsertDoseLog(userId, {
      id,
      protocol_compound_id: testPcId,
      dose_amount: 100,
      dose_unit: "mg",
      injection_site: "abdomen_left",
    })
    log(`queued test dose log ${id.slice(0, 8)} (cache only)`)
  }, [userId, testPcId, log])

  const doFlush = useCallback(async () => {
    if (!userId) return
    const n = await flush(userId)
    log(`flush pushed ${n} op(s) to Postgres`)
  }, [userId, log])

  const doReconcile = useCallback(async () => {
    if (!userId) return
    await reconcile(userId)
    log("reconcile (flush + pull) done")
  }, [userId, log])

  const deleteCompound = useCallback(() => {
    if (!userId || !testPcId) return log("no test compound")
    cacheDeleteCompound(userId, testPcId)
    log(`queued delete of compound ${testPcId.slice(0, 8)} — flush to apply`)
  }, [userId, testPcId, log])

  const runMigration = useCallback(async () => {
    if (!userId) return log("no user")
    const r = await migrateDeviceState(userId, { force: true })
    log(
      r.ran
        ? `migration: ${r.compounds} compound(s), ${r.doseLogs} dose log(s), ${r.skippedCustom} custom skipped, ${r.failures} fail`
        : `migration skipped: ${r.reason}`,
    )
    if (userId) await pull(userId)
  }, [userId, log])

  const btn = "rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-surface-raised"

  return (
    <main className="mx-auto max-w-md space-y-4 p-5 text-text-primary">
      <h1 className="font-display text-xl">DB sync harness (dev-only)</h1>
      <p className="text-xs text-text-muted">
        Step 1 verification. Sign in locally first. Pull → queue (offline) → flush → reconcile.
      </p>

      <div className="grid grid-cols-1 gap-2">
        <button className={btn} onClick={() => void doPull()}>1 · Pull (ensure active cycle + read)</button>
        <button className={btn} onClick={queueCompound}>2 · Queue test compound (cache only)</button>
        <button className={btn} onClick={() => void doFlush()}>3 · Flush outbox → Postgres</button>
        <button className={btn} onClick={queueDoseLog}>4 · Queue test dose log (cache only)</button>
        <button className={btn} onClick={() => void doReconcile()}>5 · Reconcile (flush + pull)</button>
        <button className={btn} onClick={deleteCompound}>6 · Queue delete of test compound</button>
        <button className={btn} onClick={() => void runMigration()}>7 · Run device migration (force) + pull</button>
      </div>

      <div className="rounded-xl border border-border-default bg-bg-surface p-3 text-xs">
        <div className="font-mono">
          cycle: {snap.cycle ? `${snap.cycle.name} (${snap.cycle.id.slice(0, 8)})` : "—"}
        </div>
        <div className="font-mono">compounds: {snap.compounds.length} · dose logs: {snap.doseLogs.length}</div>
        <div className="font-mono">outbox (pending writes): {snap.outbox.length}</div>
      </div>

      <ol className="space-y-1 text-xs text-text-muted">
        {lines.map((l, i) => (
          <li key={i} className="font-mono">{l}</li>
        ))}
      </ol>
    </main>
  )
}
