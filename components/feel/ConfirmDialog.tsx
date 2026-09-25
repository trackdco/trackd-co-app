"use client"

import { PopDialog } from "@/components/feel/PopDialog"
import { GHOST_BUTTON, PRESS } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

/**
 * THE ONE CONFIRM (consistency fix #5, build-brief-final §3.9, §3.10): the
 * pop-up, a question, at most one line on what happens, then Cancel and a red
 * action. Used wherever something is deleted or ended.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  line,
  confirmLabel,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  line?: string
  confirmLabel: string
  onConfirm: () => void
}) {
  return (
    <PopDialog open={open} onClose={onClose} title={title} role="alertdialog">
      {line ? <p className="mt-2 text-[13.5px] leading-snug text-text-muted">{line}</p> : null}
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onClose} className={cn(GHOST_BUTTON, "flex-1 py-2.5")}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            onClose()
            onConfirm()
          }}
          className={cn(
            PRESS.button,
            "flex flex-1 items-center justify-center rounded-lg bg-accent-destructive py-2.5 text-sm font-medium text-text-primary",
          )}
        >
          {confirmLabel}
        </button>
      </div>
    </PopDialog>
  )
}
