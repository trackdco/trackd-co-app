"use client"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { CARD_EYEBROW, DATA_MONO, SHEET_TITLE } from "@/lib/ui-presets"
import { Container } from "@/components/containers"
import { CategoryIcon } from "@/components/compounds/CategoryIcon"
import { paletteColourVar } from "@/lib/palette"
import { formatTimeLabel, cadenceLabel, type StackCompound } from "@/lib/home/stack"
import type { Stack } from "@/lib/home/stacks"

/**
 * Stack detail — **a view, not a form** (Spec 05 → Stack detail). Tapping a stack
 * shows what is in it; editing is a deliberate second step behind the Edit
 * button, so a tap can never start changing something.
 *
 * Shows the containers in the stack colour, each member with its dose and its own
 * schedule, and the shared time below. That every member lists its OWN dose and
 * cadence here is the point: the stack groups them, it does not govern them.
 */
export function StackDetailSheet({
  open,
  onOpenChange,
  stack,
  members,
  inventoryTypeOf,
  onEdit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  stack: Stack | null
  members: StackCompound[]
  inventoryTypeOf: (c: StackCompound) => string | null
  onEdit: () => void
}) {
  if (!stack) return null
  const colour = paletteColourVar(stack.colour)
  const times = new Set(members.map((m) => m.schedule.timeOfDay))
  const sharedTime = times.size === 1 ? [...times][0] : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl border-border-default bg-bg-surface"
      >
        <SheetHeader>
          {/* Edit sits beside the title, small and muted — a secondary
              affordance, not the sheet's headline action. The content is the
              display layer here (ui-context.md → titles recede, values lead). */}
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ background: colour }}
              aria-hidden
            />
            <SheetTitle className={`${SHEET_TITLE} min-w-0 flex-1 truncate`}>
              {stack.name}
            </SheetTitle>
            <button
              type="button"
              onClick={onEdit}
              className="shrink-0 text-sm text-text-muted transition-colors hover:text-text-primary active:text-text-primary"
            >
              Edit
            </button>
          </div>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-2">
          {/* The row of matching containers — what the stack colour is for. */}
          <div className="flex items-end gap-2">
            {members.map((m) => (
              <Container
                key={m.id}
                inventoryType={inventoryTypeOf(m)}
                category={m.category}
                stackColour={colour}
                fill={0.7}
                size={56}
              />
            ))}
          </div>

          <div className="space-y-2">
            <p className={CARD_EYEBROW}>
              {members.length} {members.length === 1 ? "compound" : "compounds"}
            </p>
            <ul className="divide-y divide-border-default rounded-2xl bg-bg-surface-raised">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <CategoryIcon category={m.category} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">
                      {m.name}
                    </span>
                    {/* Each member's OWN schedule — the stack governs none of it. */}
                    <span className="mt-0.5 block text-xs text-text-muted">
                      {cadenceLabel(m.schedule.cadence)}
                    </span>
                  </span>
                  <span className={DATA_MONO}>
                    {m.dose} {m.unit}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {sharedTime !== null && (
            <div className="space-y-1">
              <p className={CARD_EYEBROW}>Taken at</p>
              <p className="text-sm text-foreground">{formatTimeLabel(sharedTime)}</p>
            </div>
          )}

          <p className="text-xs text-text-muted">
            Log this stack from the dashboard. Each compound keeps its own
            schedule and history.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
