"use client"

import { useEffect, useRef, useState } from "react"
import { GripVertical, Plus, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { siteLabel, sitesForMethod } from "@/lib/home/siteCatalog"
import type { InjectionMethod } from "@/lib/home/stack"

const GAP_PX = 8

/**
 * The per-compound rotation builder used only inside the Add-to-protocol sheet
 * (Context/Feature Specs/05 §3.4.5). Shows EVERY site for the compound's method;
 * the user taps the ones they want to pin. **Tap order = cycle order**, and the
 * chosen sites can be dragged to rearrange that order. Emits the ordered id list.
 * Pointer-drag reorder reuses the Shortcuts-menu idiom — no new dependency.
 */
export function RotationPicker({
  method,
  selected,
  onChange,
}: {
  method: InjectionMethod
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const all = sitesForMethod(method)
  // Latest order, read inside the drag handlers without stale-closure risk.
  // Synced after commit (writing a ref during render isn't allowed).
  const selectedRef = useRef(selected)
  useEffect(() => {
    selectedRef.current = selected
  }, [selected])
  const dragRef = useRef<{ id: string; startY: number; rowH: number } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragDy, setDragDy] = useState(0)

  if (all.length === 0) return null

  const available = all.filter((s) => !selected.includes(s.id))

  function add(id: string) {
    onChange([...selectedRef.current, id])
  }
  function remove(id: string) {
    onChange(selectedRef.current.filter((x) => x !== id))
  }

  function onPointerDown(e: React.PointerEvent, id: string) {
    const el = e.currentTarget as HTMLElement
    const rowH = el.getBoundingClientRect().height + GAP_PX
    el.setPointerCapture(e.pointerId)
    dragRef.current = { id, startY: e.clientY, rowH }
    setDragId(id)
    setDragDy(0)
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    const cur = selectedRef.current
    const curIndex = cur.indexOf(d.id)
    if (curIndex === -1) return
    const step = d.rowH || 1
    const target = Math.max(
      0,
      Math.min(curIndex + Math.round((e.clientY - d.startY) / step), cur.length - 1)
    )
    if (target !== curIndex) {
      const next = [...cur]
      next.splice(curIndex, 1)
      next.splice(target, 0, d.id)
      onChange(next)
      // Re-anchor so the lifted row keeps tracking the finger after the reflow.
      d.startY += (target - curIndex) * step
    }
    setDragDy(e.clientY - d.startY)
  }
  function onPointerUp() {
    dragRef.current = null
    setDragId(null)
    setDragDy(0)
  }

  return (
    <div>
      {/* Chosen sites, in cycle order — draggable. */}
      {selected.length > 0 ? (
        <>
        <p className="mb-2 px-1 text-[11px] font-medium tracking-wider text-text-muted uppercase">
          Order you&apos;ll inject (top to bottom)
        </p>
        <ul className="space-y-2">
          {selected.map((id, i) => {
            const lifted = dragId === id
            return (
              <li
                key={id}
                style={
                  lifted
                    ? { transform: `translateY(${dragDy}px)`, zIndex: 10 }
                    : undefined
                }
                className={cn(
                  "relative flex items-center gap-3 rounded-xl border bg-bg-input px-3 py-2.5",
                  lifted
                    ? "border-accent-amber/60 shadow-lg"
                    : "border-border-default"
                )}
              >
                <button
                  type="button"
                  aria-label={`Drag ${siteLabel(id)} to reorder`}
                  onPointerDown={(e) => onPointerDown(e, id)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  className="shrink-0 cursor-grab touch-none text-text-muted active:cursor-grabbing"
                >
                  <GripVertical className="h-4 w-4" aria-hidden />
                </button>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-amber/15 font-mono text-[11px] text-accent-amber">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
                  {siteLabel(id)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(id)}
                  aria-label={`Remove ${siteLabel(id)}`}
                  className="shrink-0 text-text-muted transition-colors hover:text-state-error"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-border-strong px-3 py-3 text-xs text-text-subtle">
          Tap the sites below to add them, then drag to arrange them top-to-bottom
          in the order you&apos;ll inject.
        </p>
      )}

      {/* Remaining catalog sites — tap to add. */}
      {available.length > 0 && (
        <>
          <p className="mt-3 mb-2 px-1 text-[11px] font-medium tracking-wider text-text-muted uppercase">
            {selected.length > 0 ? "Add more sites" : "All sites (tap to add)"}
          </p>
          <div className="flex flex-wrap gap-2">
            {available.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => add(s.id)}
                className="flex items-center gap-1 rounded-full border border-border-default bg-bg-input px-3 py-1.5 font-mono text-sm text-text-muted transition-colors hover:text-text-primary"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
