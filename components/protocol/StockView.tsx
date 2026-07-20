"use client"

import { useCallback, useEffect, useState } from "react"
import { Package, Plus } from "@/components/icons"

import { CARD_ICON_BADGE, CARD_TITLE } from "@/lib/ui-presets"
import { listStock, deleteStockItem, type StockItem } from "@/lib/db/inventory"
import { AddStockSheet } from "@/components/protocol/AddStockSheet"
import { StockItemCard } from "@/components/protocol/StockItemCard"
import type { InventoryType } from "@/lib/db/types"

/**
 * The Stock view (Protocol Cutover, Step 5): the user's inventory on hand with
 * "stock left" — remaining + doses-remaining + projected-empty read straight from
 * `v_inventory_math` (never recomputed in TS). Add stock, refill (replaces the
 * compound's current vial — one card per compound), and delete (drops the stock;
 * logged doses survive). Runway is presented NEUTRALLY (no good/bad colour).
 * Reads require a connection; offline simply shows nothing new.
 */
export function StockView({
  userId,
  previewItems,
}: {
  userId: string
  /** Dev-only: render these instead of fetching (the `/preview/protocol` harness). */
  previewItems?: StockItem[]
}) {
  const signedOut = !userId || userId === "anon"
  // Initial state avoids a setState-in-effect: preview → the mock; signed out →
  // empty; otherwise null (loading) until the fetch below resolves.
  const [items, setItems] = useState<StockItem[] | null>(
    previewItems ?? (signedOut ? [] : null),
  )
  const [addOpen, setAddOpen] = useState(false)
  const [refillFor, setRefillFor] = useState<string | null>(null)
  const [refillType, setRefillType] = useState<InventoryType | null>(null)
  const [editItem, setEditItem] = useState<StockItem | null>(null)

  const refresh = useCallback(async () => {
    if (previewItems) return
    setItems(await listStock())
  }, [previewItems])

  useEffect(() => {
    if (previewItems || signedOut) return
    let cancelled = false
    void (async () => {
      const s = await listStock()
      if (!cancelled) setItems(s)
    })()
    return () => {
      cancelled = true
    }
  }, [signedOut, previewItems])

  function openAdd() {
    setEditItem(null)
    setRefillFor(null)
    setRefillType(null)
    setAddOpen(true)
  }
  function openRefill(protocolCompoundId: string, inventoryType: InventoryType) {
    setEditItem(null)
    setRefillFor(protocolCompoundId)
    setRefillType(inventoryType)
    setAddOpen(true)
  }
  function openEdit(item: StockItem) {
    setRefillFor(null)
    setRefillType(null)
    setEditItem(item)
    setAddOpen(true)
  }
  async function del(id: string) {
    await deleteStockItem(id)
    await refresh()
  }

  return (
    <section className="rounded-2xl border border-border-default bg-bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className={CARD_ICON_BADGE} aria-hidden>
            <Package className="h-5 w-5" />
          </span>
          <h2 className={CARD_TITLE}>Stock</h2>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent-amber/30 bg-accent-amber/10 px-3 py-1.5 text-sm font-medium text-accent-amber transition-colors hover:bg-accent-amber/20"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add
        </button>
      </div>

      {items === null ? (
        // Loading — shaped skeleton rows on --bg-surface-raised (States section:
        // no spinner/text for content areas; match the StockItemCard shape).
        <ul className="mt-4 space-y-2" aria-hidden>
          {[0, 1].map((i) => (
            <li
              key={i}
              className="animate-pulse rounded-xl border border-border-default bg-bg-surface-raised p-4 motion-reduce:animate-none"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="h-4 w-28 rounded-full bg-bg-input" />
                <div className="h-3 w-12 rounded-full bg-bg-input" />
              </div>
              <div className="mt-3 h-1.5 w-full rounded-full bg-bg-input" />
              <div className="mt-3 h-3 w-20 rounded-full bg-bg-input" />
            </li>
          ))}
        </ul>
      ) : items.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <StockItemCard
              key={item.id}
              item={item}
              onEdit={openEdit}
              onRefill={openRefill}
              onDelete={(id) => void del(id)}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-2xl bg-bg-surface-raised px-4 py-6 text-center text-sm text-text-muted">
          No stock yet. Tap <span className="text-accent-amber">Add</span> to log what you have on hand
          and see how long it lasts.
        </p>
      )}

      <AddStockSheet
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o)
          if (!o) setEditItem(null)
        }}
        userId={userId}
        refillFor={refillFor}
        refillType={refillType}
        editItem={editItem}
        onAdded={() => void refresh()}
      />
    </section>
  )
}
