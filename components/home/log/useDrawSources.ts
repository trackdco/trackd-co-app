"use client"

import { useEffect, useState } from "react"

import { subscribeDoseSynced } from "@/lib/home/doseLog"
import type { DrawSource } from "@/lib/home/draw"
import { resolveDrawSources } from "@/lib/home/protocolSync"

const NONE: Record<string, DrawSource> = {}

/**
 * The container behind each compound's dose on a day (Per-Dose Draw, Spec 21),
 * so a row outside Home still reads "20 UNITS" as Home's does. Read when the
 * day or the compounds change, and again once a dose has landed in Postgres
 * (the figures are derived from it). Trusted only for the exact day and set it
 * was read for: a draw priced against another day's vial is worse than none.
 */
export function useDrawSources(ids: string[], day: string, enabled: boolean): Record<string, DrawSource> {
  const key = `${day}|${[...ids].sort().join(",")}`
  const [state, setState] = useState<{ key: string; sources: Record<string, DrawSource> }>({ key: "", sources: NONE })
  useEffect(() => {
    if (!enabled || ids.length === 0) return
    let alive = true
    let latest = 0
    const read = () => {
      const n = ++latest
      resolveDrawSources(ids, day)
        .then((r) => {
          if (alive && n === latest) setState({ key, sources: r.sources })
        })
        // A failed read leaves the rows on their times; nothing to report.
        .catch(() => {})
    }
    read()
    const off = subscribeDoseSynced(read)
    return () => {
      alive = false
      off()
    }
    // `key` carries the day and the ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])
  return state.key === key ? state.sources : NONE
}
