"use client"

/**
 * DEV-ONLY Protocol Cutover test harness (co-located with its route; not a product
 * component; removed when the cutover settles).
 *
 * Left = the device-local cache (the REAL `lib/home/stack.ts` / `doseLog.ts`
 * stores, the exact source Home reads). Right = Postgres (pulled via
 * `protocolSync`). Drive the buttons, then watch both sides agree:
 *   • Add a catalogue compound → appears locally AND in Postgres.
 *   • Log today → a `dose_logs` row; rotation index advances.
 *   • Archive / Delete → reflected both sides.
 *   • Run migration → backfills the device stores into Postgres.
 *   • Clear local cache → Home's data is gone locally, then Hydrate restores it
 *     FROM Postgres (proves Postgres is canonical).
 *   • A custom name (not in the catalogue) stays local-only (never in Postgres).
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"

import { createClient } from "@/lib/supabase/client"
import { COMPOUNDS } from "@/lib/compounds-catalogue"
import { sitesForMethod } from "@/lib/home/siteCatalog"
import { toDateKey } from "@/lib/home/mockHomeData"
import {
  advanceRotation,
  archiveInStack,
  getStackSnapshot,
  nextSiteId,
  removeFromStack,
  saveStack,
  notifyStackChanged,
  subscribeStack,
  upsertStack,
  type InjectionMethod,
  type StackCompound,
} from "@/lib/home/stack"
import {
  getDoseLogsSnapshot,
  logDose,
  removeCompoundLogs,
  saveDoseLogs,
  notifyDoseLogsChanged,
  subscribeDoseLogs,
  type DayLogs,
} from "@/lib/home/doseLog"
import { getActiveCycle } from "@/lib/db/cycles"
import { pullProtocolStackAndLogs } from "@/lib/home/protocolSync"
import { migrateDeviceState } from "@/lib/migration/migrateDeviceState"
import { hydrateFromPostgres } from "@/lib/home/hydrateProtocol"
import type { Cycle, DoseRow } from "@/lib/db/types"

const EMPTY_STACK: StackCompound[] = []
const EMPTY_LOGS: DayLogs = {}

function toMethod(route: string): InjectionMethod {
  if (route === "im" || route === "subq" || route === "po" || route === "nasal") return route
  return "po" // topical / unknown → oral (Home model has no topical)
}

export function ProtocolTestHarness() {
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [pick, setPick] = useState(COMPOUNDS[0]?.name ?? "")
  const [dose, setDose] = useState("100")
  const [pg, setPg] = useState<{ stack: StackCompound[]; doseRows: DoseRow[] } | null>(null)
  const [cycle, setCycle] = useState<Cycle | null>(null)
  const [lines, setLines] = useState<string[]>([])

  const log = useCallback((m: string) => {
    setLines((p) => [`${new Date().toLocaleTimeString()}  ${m}`, ...p].slice(0, 30))
  }, [])

  useEffect(() => {
    const supabase = createClient()
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null)
      setEmail(user?.email ?? null)
    })
  }, [])

  const stack = useSyncExternalStore(
    subscribeStack,
    () => (userId ? getStackSnapshot(userId, EMPTY_STACK) : EMPTY_STACK),
    () => EMPTY_STACK,
  )
  const logs = useSyncExternalStore(
    subscribeDoseLogs,
    () => (userId ? getDoseLogsSnapshot(userId) : EMPTY_LOGS),
    () => EMPTY_LOGS,
  )
  const localLogCount = useMemo(
    () => Object.values(logs).reduce((n, day) => n + Object.keys(day).length, 0),
    [logs],
  )

  const refreshPg = useCallback(async () => {
    if (!userId) return
    const [p, c] = await Promise.all([pullProtocolStackAndLogs(), getActiveCycle()])
    setPg(p)
    setCycle(c)
  }, [userId])

  // Initial Postgres pull on sign-in. setState runs after the await (inside the
  // async callback), not synchronously in the effect body.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void (async () => {
      const [p, c] = await Promise.all([pullProtocolStackAndLogs(), getActiveCycle()])
      if (!cancelled) {
        setPg(p)
        setCycle(c)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  // Re-pull Postgres shortly after a mutation so its fire-and-forget dual-write lands.
  const afterMutation = useCallback(() => {
    window.setTimeout(() => void refreshPg(), 900)
  }, [refreshPg])

  const addCompound = useCallback(() => {
    if (!userId) return
    const cat = COMPOUNDS.find((c) => c.name === pick)
    if (!cat) return
    const method = toMethod(cat.defaultRoute)
    const rotationSites = sitesForMethod(method).slice(0, 3).map((s) => s.id)
    const sc: StackCompound = {
      id: crypto.randomUUID(),
      name: cat.name,
      category: cat.category,
      method,
      dose: Number(dose) || 100,
      unit: cat.defaultUnit,
      schedule: { cadence: { type: "daily" }, timeOfDay: "09:00", startDate: toDateKey(new Date()) },
      rotationSites,
      rotationIndex: 0,
    }
    upsertStack(userId, sc)
    log(`added "${cat.name}" (${method}) → dual-writing Postgres…`)
    afterMutation()
  }, [userId, pick, dose, log, afterMutation])

  const addCustom = useCallback(() => {
    if (!userId) return
    const sc: StackCompound = {
      id: crypto.randomUUID(),
      name: `My Custom Blend ${Math.floor(Date.now() / 1000) % 1000}`,
      category: "peptide",
      method: "subq",
      dose: Number(dose) || 100,
      unit: "mcg",
      schedule: { cadence: { type: "daily" }, timeOfDay: "09:00", startDate: toDateKey(new Date()) },
      rotationSites: sitesForMethod("subq").slice(0, 2).map((s) => s.id),
      rotationIndex: 0,
    }
    upsertStack(userId, sc)
    log(`added CUSTOM "${sc.name}" → should stay LOCAL-only (never in Postgres)`)
    afterMutation()
  }, [userId, dose, log, afterMutation])

  const logToday = useCallback(
    (c: StackCompound) => {
      if (!userId) return
      const siteId = nextSiteId(c)
      logDose(userId, toDateKey(new Date()), c.id, {
        amount: String(c.dose),
        siteId,
        time24: "09:00",
      })
      if (siteId) upsertStack(userId, advanceRotation(c, siteId)) // advance rotation (as Home does)
      log(`logged "${c.name}"${siteId ? ` @ ${siteId} (rotation advances)` : ""}`)
      afterMutation()
    },
    [userId, log, afterMutation],
  )

  const toggleArchive = useCallback(
    (c: StackCompound) => {
      if (!userId) return
      archiveInStack(userId, c.id, !c.archived)
      log(`${c.archived ? "reactivated" : "archived"} "${c.name}"`)
      afterMutation()
    },
    [userId, log, afterMutation],
  )

  const del = useCallback(
    (c: StackCompound) => {
      if (!userId) return
      removeFromStack(userId, c.id)
      removeCompoundLogs(userId, c.id)
      log(`deleted "${c.name}" (cascades its dose logs)`)
      afterMutation()
    },
    [userId, log, afterMutation],
  )

  const runMigration = useCallback(async () => {
    if (!userId) return
    const r = await migrateDeviceState(userId, { force: true })
    log(
      r.ran
        ? `migration: ${r.compounds} compound(s), ${r.doseLogs} log(s), ${r.skippedCustom} custom skipped, ${r.failures} fail`
        : `migration skipped: ${r.reason}`,
    )
    await refreshPg()
  }, [userId, log, refreshPg])

  const clearLocal = useCallback(() => {
    if (!userId) return
    saveStack(userId, [])
    notifyStackChanged()
    saveDoseLogs(userId, {})
    notifyDoseLogsChanged()
    log("CLEARED the local cache (Postgres untouched) — now press Hydrate")
  }, [userId, log])

  const hydrate = useCallback(async () => {
    if (!userId) return
    await hydrateFromPostgres(userId)
    log("hydrated local cache FROM Postgres (+ merged customs)")
  }, [userId, log])

  if (!userId) {
    return (
      <main className="mx-auto max-w-md space-y-3 p-6 text-text-primary">
        <h1 className="font-display text-2xl">Protocol cutover test</h1>
        <p className="text-sm text-text-muted">
          You are signed out. Open <code className="text-foreground">/login</code> and sign in,
          then return here — the data layer reads your session.
        </p>
      </main>
    )
  }

  const btn =
    "rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary hover:bg-bg-surface-raised disabled:opacity-40"
  const pgIds = new Set((pg?.stack ?? []).map((c) => c.id))

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-5 text-text-primary">
      <header className="space-y-1">
        <h1 className="font-display text-2xl">Protocol cutover test</h1>
        <p className="text-xs text-text-muted">
          Signed in as {email ?? userId.slice(0, 8)} · active cycle:{" "}
          <span className="text-foreground">
            {cycle ? `${cycle.name} (${cycle.id.slice(0, 8)})` : "— (none yet; add a compound)"}
          </span>
        </p>
      </header>

      {/* Add + global actions */}
      <section className="space-y-2 rounded-2xl border border-border-default bg-bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-border-default bg-bg-input px-3 py-2 text-sm"
          >
            {COMPOUNDS.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} · {c.category}
              </option>
            ))}
          </select>
          <input
            value={dose}
            onChange={(e) => setDose(e.target.value)}
            inputMode="decimal"
            className="w-20 rounded-xl border border-border-default bg-bg-input px-3 py-2 text-sm"
            aria-label="dose"
          />
          <button className={btn} onClick={addCompound}>Add catalogue compound</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btn} onClick={addCustom}>Add a CUSTOM (stays local)</button>
          <button className={btn} onClick={() => void runMigration()}>Run migration (force)</button>
          <button className={btn} onClick={() => void refreshPg()}>Refresh Postgres</button>
          <button className={btn} onClick={clearLocal}>Clear local cache</button>
          <button className={btn} onClick={() => void hydrate()}>Hydrate from Postgres</button>
        </div>
        <p className="text-[11px] text-text-subtle">
          Test the cutover: Add → both panels match. Clear local → left empties → Hydrate →
          left repopulates from Postgres. A custom appears LEFT only.
        </p>
      </section>

      {/* Side-by-side state */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2 rounded-2xl border border-border-default bg-bg-surface p-4">
          <h2 className="font-display text-lg">Local cache (Home reads this)</h2>
          <p className="text-[11px] text-text-muted">{stack.length} compounds · {localLogCount} dose logs</p>
          <ul className="space-y-2">
            {stack.map((c) => {
              const inPg = pgIds.has(c.id)
              return (
                <li key={c.id} className="rounded-xl border border-border-default/60 bg-bg-base p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-foreground">
                      {c.name}{c.archived ? " · archived" : ""}
                    </span>
                    <span className={inPg ? "text-accent-green" : "text-text-subtle"}>
                      {inPg ? "in PG" : "local-only"}
                    </span>
                  </div>
                  <div className="font-mono text-text-muted">
                    {c.dose}{c.unit} · {c.method} · rot {c.rotationIndex}/{c.rotationSites.length}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <button className={btn + " !px-2 !py-1"} onClick={() => logToday(c)}>Log today</button>
                    <button className={btn + " !px-2 !py-1"} onClick={() => toggleArchive(c)}>
                      {c.archived ? "Reactivate" : "Archive"}
                    </button>
                    <button className={btn + " !px-2 !py-1"} onClick={() => del(c)}>Delete</button>
                  </div>
                </li>
              )
            })}
            {stack.length === 0 && <li className="text-xs text-text-subtle">empty</li>}
          </ul>
        </div>

        <div className="space-y-2 rounded-2xl border border-border-default bg-bg-surface p-4">
          <h2 className="font-display text-lg">Postgres (canonical)</h2>
          <p className="text-[11px] text-text-muted">
            {pg?.stack.length ?? 0} compounds · {pg?.doseRows.length ?? 0} dose logs
          </p>
          <ul className="space-y-2">
            {(pg?.stack ?? []).map((c) => (
              <li key={c.id} className="rounded-xl border border-border-default/60 bg-bg-base p-2 text-xs">
                <div className="truncate font-medium text-foreground">
                  {c.name}{c.archived ? " · archived" : ""}
                </div>
                <div className="font-mono text-text-muted">
                  {c.dose}{c.unit} · {c.method} · rot {c.rotationIndex}/{c.rotationSites.length}
                </div>
              </li>
            ))}
            {(pg?.stack.length ?? 0) === 0 && <li className="text-xs text-text-subtle">empty</li>}
          </ul>
        </div>
      </section>

      <ol className="space-y-1 text-[11px] text-text-muted">
        {lines.map((l, i) => (
          <li key={i} className="font-mono">{l}</li>
        ))}
      </ol>

      <p className="text-[11px] text-text-subtle">
        Also open <code className="text-foreground">/dashboard</code> to use the real Home, then
        come back and Refresh Postgres to confirm it captured your changes.
      </p>
    </main>
  )
}
