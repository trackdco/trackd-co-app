"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import { NewItemCard } from "@/components/protocol/NewItemCard"

import { CARD_EYEBROW, DATA_MONO } from "@/lib/ui-presets"
import { Container } from "@/components/containers"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import { StackEditSheet } from "@/components/protocol/StackEditSheet"
import { StackDetailSheet } from "@/components/protocol/StackDetailSheet"
import { AddToStackMenu } from "@/components/navigation/add-to-stack-menu"
import { paletteColourVar } from "@/lib/palette"
import {
  activeStacks,
  currentMemberIds,
  deleteStack,
  getStacksSnapshot,
  stackedIds,
  subscribeStacks,
  upsertStack,
  nextStackName,
  EMPTY_STACKS,
  type Stack,
} from "@/lib/home/stacks"
import {
  formatTimeLabel,
  getStackSnapshot,
  subscribeStack,
  type StackCompound,
} from "@/lib/home/stack"

const EMPTY_STACK: StackCompound[] = []

/**
 * Protocol → Stacks (Spec 05, steps 3–4). Creation, detail and editing all live
 * here; **logging never does** — that happens on the dashboard only.
 *
 * A stack card shows its members' containers in the STACK's colour, each member
 * with its dose, and the shared time below.
 */
export function StacksView({
  userId,
  previewCompounds,
  previewStacks,
}: {
  userId: string
  /** Dev-preview-only: render without the device store (see /preview/protocol). */
  previewCompounds?: StackCompound[]
  previewStacks?: Stack[]
}) {
  const liveCompounds = useSyncExternalStore(
    subscribeStack,
    () => getStackSnapshot(userId, EMPTY_STACK),
    () => EMPTY_STACK
  )
  const liveStacks = useSyncExternalStore(
    subscribeStacks,
    () => getStacksSnapshot(userId),
    () => EMPTY_STACKS
  )
  const compounds = previewCompounds ?? liveCompounds
  const stacks = previewStacks ?? liveStacks

  // Tapping a stack VIEWS it; editing is a deliberate second step from there.
  const [viewing, setViewing] = useState<Stack | null>(null)
  const [editing, setEditing] = useState<Stack | null>(null)
  const [creating, setCreating] = useState(false)
  // Creating a compound from inside the stack editor. The editor stays MOUNTED
  // underneath so its half-filled draft survives; the new compound's id is
  // handed back and ticked in.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null)

  const active = useMemo(() => compounds.filter((c) => !c.archived), [compounds])
  const byId = useMemo(() => new Map(active.map((c) => [c.id, c])), [active])
  // Stacks that still group something THIS SCREEN CAN DRAW. Two ways a stack
  // fails that: its last member was deleted (it is kept in the store so the days
  // it grouped still read correctly, but it is over), or its members haven't
  // hydrated onto this device yet (`hydrateStacks` keeps such a stack rather than
  // deleting it from Postgres). Either way an empty card tells the user less than
  // no card, so neither is listed.
  const listed = useMemo(
    () =>
      activeStacks(stacks).filter((s) =>
        currentMemberIds(s).some((id) => byId.has(id))
      ),
    [stacks, byId]
  )

  /** Ids in a stack OTHER than the one being edited. */
  const unavailable = useMemo(() => {
    const all = stackedIds(stacks)
    if (editing) for (const id of currentMemberIds(editing)) all.delete(id)
    return all
  }, [stacks, editing])

  const open = creating || editing !== null

  return (
    <div className="space-y-5">
      <h2 className={`${CARD_EYEBROW} px-1`}>Stacks</h2>

      {listed.length > 0 && (
        <div className="space-y-3">
          {listed.map((s) => (
            <StackCard
              key={s.id}
              stack={s}
              members={currentMemberIds(s)
                .map((id) => byId.get(id))
                .filter((c): c is StackCompound => Boolean(c))}
              onOpen={() => setViewing(s)}
            />
          ))}
        </div>
      )}

      <NewItemCard
        label="New stack"
        onClick={() => setCreating(true)}
        disabled={active.length === 0}
        hint="Add a compound first"
        description={
          listed.length === 0
            ? "Compounds you take together, logged in one tap."
            : undefined
        }
        preview={
          listed.length === 0 ? (
            <span className="flex items-end -space-x-3">
              <Container inventoryType="preconcentrated" category="anabolic" stackColour={paletteColourVar("steel")} fill={0.7} size={40} />
              <Container inventoryType="reconstituted" category="peptide" stackColour={paletteColourVar("steel")} fill={0.55} size={40} />
              <Container inventoryType="reconstituted" category="peptide" stackColour={paletteColourVar("steel")} fill={0.8} size={40} />
            </span>
          ) : undefined
        }
      />

      <StackDetailSheet
        open={viewing !== null}
        onOpenChange={(o) => !o && setViewing(null)}
        stack={viewing}
        members={
          viewing
            ? currentMemberIds(viewing)
                .map((id) => byId.get(id))
                .filter((c): c is StackCompound => Boolean(c))
            : []
        }
        inventoryTypeOf={(c) => inventoryTypeForCompound(c.name, c.method, c.inventoryForm)}
        onEdit={() => {
          setEditing(viewing)
          setViewing(null)
        }}
      />

      <StackEditSheet
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false)
            setEditing(null)
            // The hand-off must die with the sheet. `StackForm` unmounts on
            // close, taking its "already handled" guard with it — so a leftover
            // id would be auto-ticked into the NEXT stack the user opens, and
            // saving that stack would steal the compound out of the first one.
            setPendingMemberId(null)
          }
        }}
        stack={editing}
        compounds={active}
        unavailableIds={unavailable}
        onSave={(s) => {
          // Names let the mirror resolve a member whose Postgres row id has
          // diverged from its client id; without them it would be dropped.
          upsertStack(
            userId,
            s,
            Object.fromEntries(active.map((c) => [c.id, c.name]))
          )
          setCreating(false)
          setEditing(null)
        }}
        /* All stacks, not just the listed ones: a retired stack still
           renders under its name on the days it grouped, so reusing its
           number would put two different "Stack 2"s in one history. */
        fallbackName={nextStackName(stacks)}
        onAddCompound={() => setPickerOpen(true)}
        pendingMemberId={pendingMemberId}
        onDelete={
          editing
            ? () => {
                deleteStack(userId, editing.id)
                setEditing(null)
              }
            : undefined
        }
      />
      <AddToStackMenu
        open={pickerOpen}
        onOpenChange={(o) => {
          setPickerOpen(o)
          // Cleared on OPEN, not on close. The picker fires onOpenChange(false)
          // before onAdded, so clearing on close would depend on that ordering
          // holding — and if it ever flipped, the new compound would be dropped
          // silently. Clearing on open is order-independent.
          if (o) setPendingMemberId(null)
        }}
        userId={userId}
        onAdded={(saved) => setPendingMemberId(saved.id)}
      />
    </div>
  )
}

/** Containers in the stack colour, member names with doses, shared time below. */
function StackCard({
  stack,
  members,
  onOpen,
}: {
  stack: Stack
  members: StackCompound[]
  onOpen: () => void
}) {
  const colour = paletteColourVar(stack.colour)
  // The "shared time" the stack is taken at — the members' common scheduled
  // time when they agree, which is the whole reason they were grouped.
  const times = new Set(members.map((m) => m.schedule.timeOfDay))
  const sharedTime = times.size === 1 ? [...times][0] : null

  return (
    <button
      type="button"
      onClick={onOpen}
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
            name={m.name}
            inventoryType={inventoryTypeForCompound(m.name, m.method, m.inventoryForm)}
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

      {/* The shared time, when there is genuinely one. Where members disagree the
          line is simply omitted — a stack does not own a time (that would make it
          a container, which the spec forbids), and naming one member's time for
          the group would be inventing a fact. */}
      {sharedTime !== null && (
        <p className="mt-3 text-xs text-text-muted">{formatTimeLabel(sharedTime)}</p>
      )}
    </button>
  )
}

