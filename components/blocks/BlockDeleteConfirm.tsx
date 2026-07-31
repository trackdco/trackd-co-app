"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"

import { deleteBlockAction } from "@/app/(app)/blocks/actions"

/**
 * Deleting a block, permanently (Adrian, 2026-07-31).
 *
 * The ONLY hard delete in the app, and the copy has to earn that. Everything
 * else the user can remove is soft: a compound keeps its logged doses, because
 * erasing it would restate what they actually did. A block owns no such record —
 * it is a named window over data held in other tables — so removing it removes a
 * label and nothing else. The confirm says exactly that, because "this cannot be
 * undone" on its own invites the reasonable fear that the doses go with it.
 *
 * Same portal + `z-[60]` treatment as the sign-out confirm: `position: fixed`
 * inside a transformed ancestor is contained by it, which drops a modal behind
 * the fixed bottom nav.
 */
export function BlockDeleteConfirm({
  open,
  onOpenChange,
  blockId,
  blockName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  blockId: string
  blockName: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  // A fresh open is a fresh attempt: a failure from last time must not greet the
  // user on the next one. Adjusted during render rather than in an effect, which
  // would paint the stale error for a frame first.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setError(null)
  }

  async function confirm() {
    if (busy) return
    setBusy(true)
    setError(null)
    const res = await deleteBlockAction(blockId)
    if (!res.ok) {
      setError(res.error ?? "Could not delete the block.")
      setBusy(false)
      return
    }
    // Back to the list: the page behind this one is the block that no longer
    // exists, and leaving the user on it would render an empty retrospective.
    onOpenChange(false)
    setBusy(false)
    router.replace("/blocks")
    router.refresh()
  }

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-overlay-backdrop p-6 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
      onClick={() => !busy && onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="block-delete-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs rounded-3xl border border-border-default bg-bg-surface p-5 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
      >
        <h2 id="block-delete-title" className="text-base font-medium text-foreground">
          Delete {blockName}?
        </h2>
        <p className="mt-1.5 text-sm text-text-muted">
          The block and its target go for good. Every dose, weigh-in, photo and
          note you recorded while it ran is kept.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-state-error">
            {error}
          </p>
        )}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="flex-1 rounded-xl border border-border-strong py-2.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="flex-1 rounded-xl bg-accent-destructive py-2.5 text-sm font-medium text-text-primary transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
