"use client"

import { useState } from "react"

import { BottomSheet } from "@/components/layout/BottomSheet"
import { ConfirmDialog } from "@/components/feel/ConfirmDialog"
import { Container } from "@/components/containers"
import { Plus, Trash } from "@/components/icons"
import { cn } from "@/lib/utils"
import { DATA_MONO, PRESS, PRIMARY_BUTTON } from "@/lib/ui-presets"
import { formatDose } from "@/lib/format/dose"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import type { OneOffLog } from "@/lib/home/oneOffLogs"

/** An off-plan amount in the one dose format when it is a number. */
function amountOf(o: OneOffLog): string {
  const n = Number.parseFloat(o.amount ?? "")
  if (o.amount && Number.isFinite(n)) return formatDose(n, o.unit)
  return o.amount ? `${o.amount}${o.unit ? ` ${o.unit}` : ""}` : (o.unit ?? "")
}

/**
 * A day's OFF-PLAN entries, and the way to add one.
 *
 * A sheet rather than a section of the day sheet (Adrian, 2026-08-07): most
 * days have none. It opens from the "⋯" beside Also logged, on the one sheet
 * frame (consistency fix #1), in place of the day sheet rather than over it.
 * Removing one asks first (consistency fix #5).
 *
 * Nothing here counts toward anything — see `lib/home/oneOffLogs.ts`.
 */
export function OneOffDaySheet({
  open,
  onOpenChange,
  dateLabel,
  logs,
  onAdd,
  onRemove,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The day, worded — the sheet is about one day and should say which. */
  dateLabel: string
  logs: OneOffLog[]
  onAdd: () => void
  onRemove: (id: string) => void
}) {
  const [removing, setRemoving] = useState<OneOffLog | null>(null)
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Also logged"
      desktop="rail"
      // No field focused on open, so no keyboard springs up over the sheet.
      onOpenAutoFocus={(e) => e.preventDefault()}
    >
      <div className="space-y-3 pb-1">
        <p className={DATA_MONO}>{dateLabel}</p>

        {/* The sections rise in as the sheet lands (feel pass §4). */}
        <div data-sheet-body className="space-y-3">
          {logs.length === 0 ? (
            <p className="inst-rows px-4 py-5 text-center text-sm text-text-muted">Nothing else logged on this day.</p>
          ) : (
            <ul>
              {logs.map((o) => (
                <li key={o.id} className="hairline-t flex min-h-12 items-center gap-3 border-border-default">
                  <Container
                    name={o.compoundName ?? o.label}
                    inventoryType={inventoryTypeForCompound(o.compoundName ?? o.label, o.method ?? "po")}
                    category={o.category ?? "supplement"}
                    size={28}
                    className="shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{o.label}</span>
                    {o.note && <span className="block truncate text-xs text-text-muted">{o.note}</span>}
                  </span>
                  <span className={cn(DATA_MONO, "shrink-0")}>{amountOf(o)}</span>
                  {/* A HARD delete: a one-off carries no history anything
                      depends on. It asks first, like every delete. */}
                  <button
                    type="button"
                    onClick={() => setRemoving(o)}
                    aria-label={`Delete ${o.label}`}
                    className={cn(PRESS.icon, "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:text-foreground")}
                  >
                    <Trash className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button type="button" onClick={onAdd} className={cn(PRIMARY_BUTTON, "w-full")}>
            <Plus className="h-4 w-4" aria-hidden />
            Log something else
          </button>

          {/* One short line (consistency fix #29). */}
          <p className="text-xs leading-relaxed text-text-muted">Not counted in stock or consistency.</p>
        </div>
      </div>
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Delete ${removing?.label ?? "this entry"}?`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (removing) onRemove(removing.id)
        }}
      />
    </BottomSheet>
  )
}
