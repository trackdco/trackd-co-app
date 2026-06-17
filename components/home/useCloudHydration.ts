"use client"

import { useEffect, useRef } from "react"

import { hydrateFromPostgres } from "@/lib/home/hydrateProtocol"
import { migrateDeviceState } from "@/lib/migration/migrateDeviceState"

/**
 * Home flip (Protocol Cutover, Step 3): hydrate the device-local stack + dose-log
 * stores from **Postgres** (now the source of truth), merged with the jsonb mirror
 * / local cache so device-local **custom** compounds (which have no normalised
 * `protocol_compound`) stay visible. localStorage is demoted to an offline cache.
 *
 * On mount it first runs the one-time Step 2 **migration** (marker-guarded — the
 * "post-auth hook"), so a returning user's existing device data lands in Postgres
 * before the first read; then it pulls + reconciles (`hydrateFromPostgres`). It
 * re-syncs when connectivity is regained (re-pushing anything written offline,
 * idempotently) and on app focus. A failed/empty pull never wipes the cache.
 */
export function useCloudHydration(userId: string): void {
  const migratedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!userId || userId === "anon") return
    let cancelled = false

    void (async () => {
      if (migratedFor.current !== userId) {
        migratedFor.current = userId
        await migrateDeviceState(userId) // once, marker-guarded
      }
      if (!cancelled) await hydrateFromPostgres(userId)
    })()

    // Reconnect: re-push the whole local set to Postgres (idempotent) so anything
    // mutated offline — including dose logs — lands, then pull. Focus just re-reads.
    const onOnline = () => {
      void (async () => {
        await migrateDeviceState(userId, { force: true })
        if (!cancelled) await hydrateFromPostgres(userId)
      })()
    }
    const onFocus = () => void hydrateFromPostgres(userId)
    const onVisible = () => {
      if (document.visibilityState === "visible") void hydrateFromPostgres(userId)
    }
    window.addEventListener("online", onOnline)
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      cancelled = true
      window.removeEventListener("online", onOnline)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [userId])
}
