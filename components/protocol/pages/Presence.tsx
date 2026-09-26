"use client"

import { useEffect, useState, type ReactNode } from "react"

import { Fold } from "@/components/protocol/pages/Subpage"

/**
 * A row or a group that folds open as it arrives and shut as it leaves, on
 * the Fold's own curves (420ms open, 280ms shut; what it holds fades with it).
 * The Cycles and Ended lists keep drawing a row that has left the data until
 * this has folded it away (`lib/protocol/cycleExits.ts`), so nothing below it
 * jumps.
 *
 * - `show`: open while true; folds shut when it turns false, and opens again
 *   from wherever it is if it turns back (an Undo inside the leave).
 * - `appear`: mounted shut, then opens a frame later (the Paused group a
 *   slide is about to land in). Only read when it mounts.
 *
 * Reduced motion: the Fold snaps (globals.css).
 */
export function Presence({ show, appear = false, children }: { show: boolean; appear?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(appear ? false : show)
  // Shutting needs no frame to wait for: follow at once.
  if (!show && open) setOpen(false)
  useEffect(() => {
    if (!show || open) return
    // Opening waits two frames, so the shut state paints first and the Fold
    // has something to open from.
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setOpen(true))
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [show, open])
  return <Fold open={open}>{children}</Fold>
}
