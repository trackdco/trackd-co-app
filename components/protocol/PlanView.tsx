"use client"

import { useState, useSyncExternalStore } from "react"
import { CalendarRange, MoreHorizontal, Plus } from "lucide-react"

import { cn } from "@/lib/utils"
import { CARD_TITLE } from "@/lib/ui-presets"
import {
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
  type CompoundCategory,
} from "@/lib/compound-categories"
import {
  cadenceLabel,
  getStackSnapshot,
  hasRotation,
  nextSiteId,
  subscribeStack,
  type StackCompound,
} from "@/lib/home/stack"
import { siteLabel } from "@/lib/home/siteCatalog"
import { AddToStackMenu } from "@/components/navigation/add-to-stack-menu"
import { AddCompoundSheet } from "@/components/home/AddCompoundSheet"
import { CycleHeader } from "@/components/protocol/CycleHeader"
import { CycleEditSheet } from "@/components/protocol/CycleEditSheet"
import type { Cycle } from "@/lib/db/types"

const EMPTY_STACK: StackCompound[] = []
const CATEGORY_ORDER = Object.keys(CATEGORY_META) as CompoundCategory[]

function formatDose(dose: number): string {
  return Number.isInteger(dose) ? String(dose) : dose.toFixed(2).replace(/0$/, "")
}

interface PlanGroup {
  cat: string
  label: string
  dot: string
  compounds: StackCompound[]
}

/** Group compounds by category (declared order; unknowns last) — mirrors the
 *  Home card's treatment so the two screens read as one system. */
function groupByCategory(items: StackCompound[]): PlanGroup[] {
  const byCat = new Map<string, StackCompound[]>()
  for (const c of items) {
    const arr = byCat.get(c.category)
    if (arr) arr.push(c)
    else byCat.set(c.category, [c])
  }
  const rank = (c: string) => {
    const i = CATEGORY_ORDER.indexOf(c as CompoundCategory)
    return i < 0 ? CATEGORY_ORDER.length : i
  }
  return [...byCat.keys()]
    .sort((a, b) => rank(a) - rank(b))
    .map((cat) => {
      const meta = CATEGORY_META[cat as CompoundCategory] ?? FALLBACK_CATEGORY_META
      return { cat, label: meta.label, dot: meta.dot, compounds: byCat.get(cat)! }
    })
}

/** One compound in the plan — the Home row treatment in a NON-logging mode: no
 *  tick; the whole row taps through to edit dose / schedule / rotation. */
function PlanRow({ c, onEdit }: { c: StackCompound; onEdit: (c: StackCompound) => void }) {
  const site = hasRotation(c) ? nextSiteId(c) : null
  return (
    <li>
      <button type="button" onClick={() => onEdit(c)} className="flex w-full items-center gap-3 py-2 text-left">
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
          <span className="mt-0.5 block truncate font-mono text-xs tabular-nums text-text-muted">
            {formatDose(c.dose)}{c.unit} · {cadenceLabel(c.schedule.cadence)}
            {site && <span className="text-accent-amber"> · ▸ {siteLabel(site)}</span>}
          </span>
        </div>
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted"
        >
          <MoreHorizontal className="h-5 w-5" />
        </span>
      </button>
    </li>
  )
}

/**
 * The Plan view (Protocol Cutover, Step 4): the active cycle's header (name,
 * Week X of N) over the compound list — the cycle builder. Reads the stack from
 * the (Postgres-backed) device cache so it matches Home exactly; adds reuse the
 * existing Add-to-Stack flow and edits reuse `AddCompoundSheet`, both writing
 * `protocol_compounds` via the store's dual-write. No "protocol" label is used for
 * the plan itself (the tab is named Protocol; this is the "Plan" / "Cycle").
 */
export function PlanView({
  userId,
  cycle,
  onCycleSaved,
}: {
  userId: string
  cycle: Cycle | null
  onCycleSaved: (cycle: Cycle) => void
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<StackCompound | null>(null)
  const [cycleEditOpen, setCycleEditOpen] = useState(false)

  const stack = useSyncExternalStore(
    subscribeStack,
    () => (userId && userId !== "anon" ? getStackSnapshot(userId, EMPTY_STACK) : EMPTY_STACK),
    () => EMPTY_STACK,
  )
  const active = stack.filter((c) => !c.archived)

  return (
    <div className="space-y-5">
      {cycle ? (
        <CycleHeader cycle={cycle} onEdit={() => setCycleEditOpen(true)} />
      ) : (
        <button
          type="button"
          onClick={() => setCycleEditOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-bg-surface p-5 text-left transition-colors hover:bg-bg-surface-raised"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent-amber/25 bg-accent-amber/10 text-accent-amber">
            <CalendarRange className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className={`${CARD_TITLE} block`}>Set up your cycle</span>
            <span className="mt-0.5 block text-sm text-text-muted">
              Name it and set a start date + length to track “Week X of N”.
            </span>
          </span>
        </button>
      )}

      <section className="rounded-2xl border border-border-default bg-bg-surface p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className={CARD_TITLE}>Compounds</h2>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent-amber/30 bg-accent-amber/10 px-3 py-1.5 text-sm font-medium text-accent-amber transition-colors hover:bg-accent-amber/20"
          >
            <Plus className="h-4 w-4" aria-hidden /> Add
          </button>
        </div>

        {active.length > 0 ? (
          <div className="mt-4">
            {groupByCategory(active).map((group) => (
              <div key={group.cat} className="mt-3 first:mt-2">
                <div className="flex items-center gap-2 px-1 pb-1">
                  <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", group.dot)} />
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
                    {group.label}
                  </span>
                  <span aria-hidden className="h-px flex-1 bg-border-default" />
                </div>
                <ul className="px-1">
                  {group.compounds.map((c) => (
                    <PlanRow key={c.id} c={c} onEdit={setEditTarget} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-2xl bg-bg-surface-raised px-4 py-6 text-center text-sm text-text-muted">
            No compounds yet. Tap <span className="text-accent-amber">Add</span> to build your cycle.
          </p>
        )}
      </section>

      <AddToStackMenu open={addOpen} onOpenChange={setAddOpen} userId={userId} />
      <AddCompoundSheet
        open={editTarget !== null}
        compound={null}
        editCompound={editTarget}
        userId={userId}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
        onAdded={() => setEditTarget(null)}
      />
      <CycleEditSheet
        open={cycleEditOpen}
        onOpenChange={setCycleEditOpen}
        cycle={cycle}
        onSaved={onCycleSaved}
      />
    </div>
  )
}
