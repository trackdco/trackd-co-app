"use client"

import { Archive, RefreshCw } from "lucide-react"

import { formatDateKeyShort } from "@/lib/home/stack"
import type { StockItem } from "@/lib/db/inventory"
import type { InventoryType } from "@/lib/db/types"

/** One inventory item: a fullness bar + how much is left + the runway, all read
 *  from `v_inventory_math` (never recomputed). Everything is NEUTRAL — no red/
 *  green/amber good-or-bad colouring (health-data / stock-level rule). Refill = a
 *  new vial; archive = mark empty/discarded (no hard delete). */
export function StockItemCard({
  item,
  onRefill,
  onArchive,
}: {
  item: StockItem
  onRefill: (protocolCompoundId: string, inventoryType: InventoryType) => void
  onArchive: (id: string) => void
}) {
  const remaining =
    item.remainingDisplay == null
      ? "—"
      : item.inventoryType === "oral_solid"
        ? `${item.remainingDisplay} left`
        : `${item.remainingDisplay} mL left`

  // Fullness 0–100% (remaining / total), the calm neutral supply gauge.
  const fill =
    item.totalBase && item.totalBase > 0 && item.remainingBase != null
      ? Math.max(0, Math.min(100, (item.remainingBase / item.totalBase) * 100))
      : null

  const runway: string[] = []
  if (item.dosesRemaining != null) runway.push(`~${item.dosesRemaining} doses`)
  if (item.estEmptyDate) runway.push(`runs dry ${formatDateKeyShort(item.estEmptyDate)}`)

  return (
    <li className="rounded-xl border border-border-default bg-bg-base p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium text-foreground">{item.compoundName}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">{remaining}</span>
          </div>

          {/* Fullness bar — neutral fill, shrinks as the vial is used. */}
          {fill != null && (
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-surface-raised"
              role="progressbar"
              aria-valuenow={Math.round(fill)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${item.compoundName} stock`}
            >
              <div
                className="h-full rounded-full bg-foreground/80 transition-[width] duration-500 ease-out"
                style={{ width: `${fill}%` }}
              />
            </div>
          )}

          {runway.length > 0 && (
            <span className="mt-1.5 block text-xs text-text-muted">{runway.join(" · ")}</span>
          )}
        </div>

        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onRefill(item.protocolCompoundId, item.inventoryType)}
            aria-label={`Refill ${item.compoundName}`}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-foreground"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onArchive(item.id)}
            aria-label={`Archive ${item.compoundName}`}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-bg-surface-raised hover:text-foreground"
          >
            <Archive className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </li>
  )
}
