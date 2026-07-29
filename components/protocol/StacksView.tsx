"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import { Plus } from "@/components/icons"

import { CARD_EYEBROW, DATA_MONO } from "@/lib/ui-presets"
import { Container } from "@/components/containers"
import { StackEditSheet } from "@/components/protocol/StackEditSheet"
import { paletteColourVar } from "@/lib/palette"
import {
  deleteStack,
  getStacksSnapshot,
  stackedIds,
  subscribeStacks,
  upsertStack,
  EMPTY_STACKS,
  type Stack,
} from "@/lib/home/stacks"
import {
  formatTimeLabel,
  getStackSnapshot,
  subscribeStack,
  type StackCompound,
} from "@/lib/home/stack"
import { routesOf } from "@/lib/compound-categories"
import { COMPOUNDS } from "@/lib/compounds-catalogue"

const EMPTY_STACK: StackCompound[] = []

/**
 * Protocol → Stacks (Spec 05, steps 3–4). Creation, detail and editing all live
 * here; **logging never does** — that happens on the dashboard only.
 *
 * A stack card shows its members' containers in the STACK's colour, each member
 * with its dose, and the shared time below.
 */
export function StacksView({ userId }: { userId: string }) {
  const compounds = useSyncExternalStore(
    subscribeStack,
    () => getStackSnapshot(userId, EMPTY_STACK),
    () => EMPTY_STACK
  )
  const stacks = useSyncExternalStore(
    subscribeStacks,
    () => getStacksSnapshot(userId),
    () => EMPTY_STACKS
  )

  const [editing, setEditing] = useState<Stack | null>(null)
  const [creating, setCreating] = useState(false)

  const active = useMemo(() => compounds.filter((c) => !c.archived), [compounds])
  const byId = useMemo(() => new Map(active.map((c) => [c.id, c])), [active])

  /** Ids in a stack OTHER than the one being edited. */
  const unavailable = useMemo(() => {
    const all = stackedIds(stacks)
    if (editing) for (const id of editing.memberIds) all.delete(id)
    return all
  }, [stacks, editing])

  const open = creating || editing !== null

  return (
    <div className="space-y-5">
      {stacks.length === 0 ? (
        <div className="rounded-2xl bg-bg-surface p-5">
          <p className={CARD_EYEBROW}>Stacks</p>
          <p className="mt-3 text-sm text-text-muted">
            Group compounds you take at the same time so they log in one tap.
            Each one keeps its own schedule and history.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            disabled={active.length === 0}
            className="mt-4 text-sm text-foreground transition-colors disabled:text-text-subtle"
          >
            {active.length === 0 ? "Add a compound first" : "New stack"}
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {stacks.map((s) => (
              <StackCard
                key={s.id}
                stack={s}
                members={s.memberIds
                  .map((id) => byId.get(id))
                  .filter((c): c is StackCompound => Boolean(c))}
                onEdit={() => setEditing(s)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border-strong py-3 text-sm text-text-muted transition-colors hover:text-foreground"
          >
            <Plus className="h-4 w-4" aria-hidden /> New stack
          </button>
        </>
      )}

      <StackEditSheet
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false)
            setEditing(null)
          }
        }}
        stack={editing}
        compounds={active}
        unavailableIds={unavailable}
        onSave={(s) => {
          upsertStack(userId, s)
          setCreating(false)
          setEditing(null)
        }}
        onDelete={
          editing
            ? () => {
                deleteStack(userId, editing.id)
                setEditing(null)
              }
            : undefined
        }
      />
    </div>
  )
}

/** Containers in the stack colour, member names with doses, shared time below. */
function StackCard({
  stack,
  members,
  onEdit,
}: {
  stack: Stack
  members: StackCompound[]
  onEdit: () => void
}) {
  const colour = paletteColourVar(stack.colour)
  // The "shared time" the stack is taken at — the members' common scheduled
  // time when they agree, which is the whole reason they were grouped.
  const times = new Set(members.map((m) => m.schedule.timeOfDay))
  const sharedTime = times.size === 1 ? [...times][0] : null

  return (
    <button
      type="button"
      onClick={onEdit}
      className="w-full rounded-2xl bg-bg-surface p-5 text-left transition active:scale-[0.98]"
    >
      <div className="flex items-center justify-between gap-3">
        <p className={CARD_EYEBROW}>{stack.name}</p>
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: colour }}
          aria-hidden
        />
      </div>

      {/* A row of matching containers — what the stack colour exists for. */}
      <div className="mt-3 flex items-end gap-1.5">
        {members.map((m) => (
          <Container
            key={m.id}
            inventoryType={inventoryTypeOf(m)}
            category={m.category}
            stackColour={colour}
            fill={0.7}
            size={44}
          />
        ))}
      </div>

      <ul className="mt-4 divide-y divide-border-default">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {m.name}
            </span>
            <span className={DATA_MONO}>
              {m.dose} {m.unit}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-text-muted">
        {sharedTime !== null
          ? formatTimeLabel(sharedTime)
          : "Members have different times"}
      </p>
    </button>
  )
}

function inventoryTypeOf(c: StackCompound): string | null {
  const lower = c.name.toLowerCase()
  const cat = COMPOUNDS.find((x) => x.name.toLowerCase() === lower)
  if (!cat) return null
  const forms = routesOf(cat)
  return (forms.find((f) => f.route === c.method) ?? forms[0])?.inventoryType ?? null
}
