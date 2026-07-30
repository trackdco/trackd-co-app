"use client"

import { useState } from "react"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { CARD_EYEBROW, DATA_MONO, SHEET_TITLE } from "@/lib/ui-presets"
import { setStockArchived, type StockItem } from "@/lib/db/inventory"

/**
 * What you can do to a vial you already have: refill it, correct the amounts you
 * typed, or discard it.
 *
 * This exists because merging the Stock tab away deleted `StockItemCard`, which
 * was the ONLY entry point to `updateStockItem` and `setStockArchived`. Both
 * data-layer functions survived with zero callers, so a mistyped vial could never
 * be corrected (every figure on the card stays wrong by whatever factor) and a
 * smashed one could never be discarded (it keeps reporting stock, and keeps
 * costing the user low-stock reminders). Neither is acceptable to lose.
 */
export function StockActionsSheet({
  open,
  onOpenChange,
  compoundName,
  stock,
  onRefill,
  onEditAmounts,
  onDiscarded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  compoundName: string
  stock: StockItem | null
  onRefill: () => void
  onEditAmounts: () => void
  /** Called after a successful discard so the caller can refetch. */
  onDiscarded: () => void
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [busy, setBusy] = useState(false)

  async function discard() {
    if (!stock) return
    setBusy(true)
    // Archive rather than delete: the doses already logged against this vial must
    // keep pointing at it, so its history stays intact (Invariant 8).
    const { ok } = await setStockArchived(stock.id, true)
    setBusy(false)
    if (ok) {
      onDiscarded()
      onOpenChange(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) setConfirmDiscard(false)
        onOpenChange(o)
      }}
    >
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl border-border-default bg-bg-surface"
      >
        <SheetHeader>
          <SheetTitle className={SHEET_TITLE}>{compoundName}</SheetTitle>
          {stock && (
            <p className={DATA_MONO}>
              {stock.remainingDisplay ?? "?"}
              {stock.inventoryType === "oral_solid" ? "" : " mL"} left
            </p>
          )}
        </SheetHeader>

        <div className="space-y-3 px-4 pb-2">
          <p className={CARD_EYEBROW}>Stock</p>
          <div className="divide-y divide-border-default rounded-2xl bg-bg-surface-raised">
            <Row label="Refill" hint="A new vial replaces this one" onClick={onRefill} />
            <Row
              label="Correct the amounts"
              hint="Fix a number you typed wrong"
              onClick={onEditAmounts}
            />
          </div>

          {!confirmDiscard ? (
            <button
              type="button"
              onClick={() => setConfirmDiscard(true)}
              className="text-sm text-text-muted transition-colors hover:text-foreground"
            >
              Discard this vial
            </button>
          ) : (
            <div className="space-y-3 rounded-2xl border border-accent-destructive p-4">
              <p className="text-sm text-foreground">
                Discard this vial? Doses already logged against it are kept.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDiscard(false)}
                  className="h-10 flex-1 rounded-xl border border-border-default text-sm text-text-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void discard()}
                  disabled={busy}
                  className="h-10 flex-1 rounded-xl bg-accent-destructive text-sm font-medium text-foreground disabled:opacity-50"
                >
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Row({
  label,
  hint,
  onClick,
}: {
  label: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col items-start px-4 py-3 text-left transition active:scale-[0.99]"
    >
      <span className="text-sm text-foreground">{label}</span>
      <span className="text-xs text-text-muted">{hint}</span>
    </button>
  )
}
