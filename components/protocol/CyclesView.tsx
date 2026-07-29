"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import { Plus } from "@/components/icons"

import { CARD_EYEBROW } from "@/lib/ui-presets"
import { CategoryIcon } from "@/components/compounds/CategoryIcon"
import { CycleCard } from "@/components/protocol/CycleCard"
import { CycleRuleSheet } from "@/components/protocol/CycleRuleSheet"
import { CycleDetailSheet } from "@/components/protocol/CycleDetailSheet"
import {
  getStackSnapshot,
  setCompoundCycle,
  subscribeStack,
  type StackCompound,
} from "@/lib/home/stack"
import { isVialForm } from "@/lib/containers/form"
import { routesOf } from "@/lib/compound-categories"
import { COMPOUNDS } from "@/lib/compounds-catalogue"
import type { CycleRule } from "@/lib/protocol/cycleRule"

const EMPTY_STACK: StackCompound[] = []

function todayKey(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * Protocol → Cycles (Spec 06, step 7) — one of the two entry points for creating
 * a cycle, for a compound already running. The other is inside add-compound; both
 * write through `setCompoundCycle`, so there is one implementation.
 *
 * Cycled compounds render as cycle cards; the rest are offered a plus. Cycles are
 * never named, so nothing here asks for one.
 */
export function CyclesView({ userId }: { userId: string }) {
  const stack = useSyncExternalStore(
    subscribeStack,
    () => getStackSnapshot(userId, EMPTY_STACK),
    () => EMPTY_STACK
  )
  // Tapping a cycle VIEWS it; editing is a deliberate second step from there.
  const [viewing, setViewing] = useState<StackCompound | null>(null)
  const [editing, setEditing] = useState<StackCompound | null>(null)
  const today = todayKey()

  const active = useMemo(() => stack.filter((c) => !c.archived), [stack])
  const cycled = active.filter((c) => c.cycle)
  const uncycled = active.filter((c) => !c.cycle)

  /** The compound's inventory form — drives its container and gates the
   *  vial-runs-out end condition. */
  const inventoryTypeOf = (c: StackCompound): string | null => {
    const lower = c.name.toLowerCase()
    const cat = COMPOUNDS.find((x) => x.name.toLowerCase() === lower)
    if (!cat) return null
    // The form for the route this compound is actually taken by, falling back to
    // the catalogue default — the same signal `canStock` reads.
    const forms = routesOf(cat)
    const match = forms.find((f) => f.route === c.method)
    return (match ?? forms[0])?.inventoryType ?? null
  }

  function save(compound: StackCompound, cycle: CycleRule | null) {
    setCompoundCycle(userId, compound.id, cycle)
  }

  if (active.length === 0) {
    return (
      <div className="rounded-2xl bg-bg-surface p-5">
        <p className={CARD_EYEBROW}>Cycles</p>
        <p className="mt-3 text-sm text-text-muted">
          Add a compound first. A cycle sits on top of its schedule and switches
          it on and off.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {cycled.length > 0 && (
        <section className="space-y-3">
          <h2 className={CARD_EYEBROW}>Running on a cycle</h2>
          <div className="space-y-3">
            {cycled.map((c) => (
              <CycleCard
                key={c.id}
                compound={c}
                cycle={c.cycle!}
                todayKey={today}
                inventoryType={inventoryTypeOf(c)}
                onEdit={() => setViewing(c)}
              />
            ))}
          </div>
        </section>
      )}

      {uncycled.length > 0 && (
        <section className="space-y-3">
          <h2 className={CARD_EYEBROW}>No cycle</h2>
          <div className="divide-y divide-border-default rounded-2xl bg-bg-surface px-5">
            {uncycled.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setEditing(c)}
                className="flex w-full items-center gap-3 py-3 text-left transition active:scale-[0.98]"
              >
                <CategoryIcon category={c.category} />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {c.name}
                </span>
                <Plus className="h-4 w-4 shrink-0 text-text-subtle" aria-hidden />
              </button>
            ))}
          </div>
        </section>
      )}

      <CycleDetailSheet
        open={viewing !== null}
        onOpenChange={(o) => !o && setViewing(null)}
        compound={viewing}
        cycle={viewing?.cycle ?? null}
        todayKey={today}
        inventoryType={viewing ? inventoryTypeOf(viewing) : null}
        onEdit={() => {
          setEditing(viewing)
          setViewing(null)
        }}
      />

      <CycleRuleSheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        compoundName={editing?.name ?? ""}
        cycle={editing?.cycle ?? null}
        vialTracked={editing ? isVialForm(inventoryTypeOf(editing)) : false}
        onSave={(cycle) => {
          if (editing) save(editing, cycle)
          setEditing(null)
        }}
      />
    </div>
  )
}
