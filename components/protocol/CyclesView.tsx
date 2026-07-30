"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import { NewItemCard } from "@/components/protocol/NewItemCard"
import { Container } from "@/components/containers"
import { paletteColourVar } from "@/lib/palette"
import { CategoryIcon } from "@/components/compounds/CategoryIcon"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

import { CARD_EYEBROW, SHEET_TITLE } from "@/lib/ui-presets"
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
export function CyclesView({
  userId,
  previewStack,
}: {
  userId: string
  /** Dev-preview-only: render without the device store. */
  previewStack?: StackCompound[]
}) {
  const liveStack = useSyncExternalStore(
    subscribeStack,
    () => getStackSnapshot(userId, EMPTY_STACK),
    () => EMPTY_STACK
  )
  const stack = previewStack ?? liveStack
  // Tapping a cycle VIEWS it; editing is a deliberate second step from there.
  const [viewing, setViewing] = useState<StackCompound | null>(null)
  const [editing, setEditing] = useState<StackCompound | null>(null)
  // "New cycle" asks WHICH compound first — the old flow listed every uncycled
  // compound permanently on the page instead.
  const [picking, setPicking] = useState(false)
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

  return (
    <div className="space-y-5">
      <h2 className={`${CARD_EYEBROW} px-1`}>Cycles</h2>

      {cycled.length > 0 && (
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
      )}

      {/* Mirrors Stacks exactly. The old "No cycle" list of every uncycled
          compound had no equivalent in Stacks and made this section far taller
          than it earned; picking a compound now happens inside the flow. */}
      <NewItemCard
        label="New cycle"
        onClick={() => setPicking(true)}
        disabled={uncycled.length === 0}
        hint={
          active.length === 0
            ? "Add a compound first"
            : "Every compound is on a cycle"
        }
        description={
          cycled.length === 0
            ? "Run a compound on and off. Off days disappear from your log."
            : undefined
        }
        preview={
          cycled.length === 0 ? (
            <span className="flex items-center gap-3">
              <Container
                inventoryType="oral_solid"
                category="sarm"
                stackColour={paletteColourVar("moss")}
                fill={0.7}
                size={40}
              />
              {/* The rhythm a cycle makes: on days filled, off days hollow. */}
              <span className="flex items-center gap-1">
                {[1, 1, 1, 0, 0, 1, 1, 1, 0, 0].map((on, i) => (
                  <span
                    key={i}
                    className={
                      on
                        ? "h-2 w-2 rounded-full bg-accent-primary"
                        : "h-2 w-2 rounded-full border border-border-strong"
                    }
                  />
                ))}
              </span>
            </span>
          ) : undefined
        }
      />

      {/* Choose the compound, then the rule. Only compounds not already on a
          cycle are offered — one cycle governs exactly one compound. */}
      <Sheet open={picking} onOpenChange={setPicking}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-y-auto rounded-t-3xl border-border-default bg-bg-surface"
        >
          <SheetHeader>
            <SheetTitle className={SHEET_TITLE}>New cycle</SheetTitle>
            <p className="text-sm text-text-muted">
              Which compound should run on a cycle?
            </p>
          </SheetHeader>
          <ul className="divide-y divide-border-default px-4 pb-4">
            {uncycled.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPicking(false)
                    setEditing(c)
                  }}
                  className="flex w-full items-center gap-3 py-3 text-left transition active:scale-[0.99]"
                >
                  <CategoryIcon category={c.category} />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {c.name}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">
                    {c.dose} {c.unit}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>

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
