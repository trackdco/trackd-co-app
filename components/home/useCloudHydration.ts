"use client"

import { useEffect, useRef } from "react"

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
import type { DoseLog } from "@/lib/home/mockHomeData"
import {
  pullStackAndLogs,
  pushStackCompound,
  pushDoseLog,
} from "@/lib/home/syncActions"

/**
 * One-shot, on-mount hydration of the device-local **stack** and **dose-log**
 * stores from the user's Supabase account (see `lib/home/syncActions.ts`), so a
 * fresh PWA install (empty localStorage) restores the protocol, and an existing
 * device (data only in localStorage, from before this shipped) migrates its data
 * up to the cloud.
 *
 * Merge rule — union by id, cloud wins on conflict, nothing is lost either way:
 *   merged = cloud ∪ (local entries whose id ∉ cloud)
 * The local-only entries are pushed up so a returning user's existing data lands
 * in the cloud the first time this runs. The merged set is written back through
 * the stores' existing `save*` + `notify*` path, so `useSyncExternalStore`
 * re-reads it and the UI refreshes.
 *
 * Best-effort: signed out or any read error yields empty cloud shapes, which
 * leaves local untouched. Guarded to run once per signed-in user.
 *
 * Custom compounds hydrate separately, lazily, when the Add-to-Stack menu opens
 * (their store is local to that component) — see `add-to-stack-menu.tsx`.
 */
export function useCloudHydration(userId: string): void {
  const doneFor = useRef<string | null>(null)
  useEffect(() => {
    if (!userId || userId === "anon") return
    if (doneFor.current === userId) return
    doneFor.current = userId
    let cancelled = false

    void (async () => {
      const { stack, doseLogs } = await pullStackAndLogs()
      if (cancelled) return
      mergeStack(userId, stack)
      mergeLogs(userId, doseLogs)
    })()

    return () => {
      cancelled = true
    }
  }, [userId])
}

/** Union the cloud stack with any local-only compounds; persist + push the
 *  local-only ones up. No-op when there is nothing on either side. */
function mergeStack(userId: string, cloud: StackCompound[]): void {
  const local = loadStack(userId) ?? []
  const cloudIds = new Set(cloud.map((c) => c.id))
  const localOnly = local.filter((c) => !cloudIds.has(c.id))
  if (cloud.length === 0 && localOnly.length === 0) return
  saveStack(userId, [...cloud, ...localOnly])
  notifyStackChanged()
  for (const c of localOnly) void pushStackCompound(c)
}

/** Union the cloud dose logs with any local-only entries (keyed by day +
 *  compound); persist + push the local-only ones up. */
function mergeLogs(userId: string, cloud: DayLogs): void {
  const local = loadDoseLogs(userId)
  const merged: DayLogs = {}
  for (const [day, entries] of Object.entries(cloud)) {
    merged[day] = { ...entries }
  }
  const localOnly: Array<{ day: string; compoundId: string; log: DoseLog }> = []
  for (const [day, entries] of Object.entries(local)) {
    for (const [compoundId, log] of Object.entries(entries)) {
      if (merged[day]?.[compoundId]) continue // cloud already holds this one
      ;(merged[day] ??= {})[compoundId] = log
      localOnly.push({ day, compoundId, log })
    }
  }
  if (Object.keys(merged).length === 0) return
  saveDoseLogs(userId, merged)
  notifyDoseLogsChanged()
  for (const { day, compoundId, log } of localOnly) {
    void pushDoseLog(day, compoundId, log)
  }
}
