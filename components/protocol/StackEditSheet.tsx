"use client"

import { useState } from "react"

import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { SHEET_TITLE } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"
import { CategoryIcon } from "@/components/compounds/CategoryIcon"
import { Plus } from "@/components/icons"
import {
  PALETTE_COLOURS,
  PALETTE_LABELS,
  DEFAULT_PALETTE_COLOUR,
  paletteColourVar,
  type PaletteColour,
} from "@/lib/palette"
import {
  currentMemberIds,
  STACK_NAME_MAX,
  type Stack,
  type StackDraft,
} from "@/lib/home/stacks"
import type { StackCompound } from "@/lib/home/stack"

const LABEL = "text-xs font-medium uppercase tracking-[0.14em] text-text-muted"

/**
 * Create or edit a stack (Spec 05, steps 3–4). Name, colour, and members chosen
 * from the user's active compounds.
 *
 * **Only compounds not already in another stack are offered** — a compound
 * belongs to at most one stack, and the picker is where that reads as a fact
 * rather than an error. Members already in THIS stack stay selectable so they
 * can be removed.
 *
 * The sheet persists nothing; the caller writes it. Deleting is offered here
 * too, and ungroups the members without touching a single compound.
 */
export function StackEditSheet({
  open,
  onOpenChange,
  stack,
  compounds,
  unavailableIds,
  onSave,
  onDelete,
  fallbackName,
  onAddCompound,
  pendingMemberId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = creating. */
  stack: Stack | null
  /** The user's active compounds, in display order. */
  compounds: StackCompound[]
  /** Compound ids already in a DIFFERENT stack — not offerable. */
  unavailableIds: Set<string>
  onSave: (draft: StackDraft) => void
  onDelete?: () => void
  /** The name to use when the field is left blank — "Stack 3". */
  fallbackName: string
  /** Open the compound picker so a NEW compound can be created without leaving
   *  the stack being built. */
  onAddCompound?: () => void
  /** A compound just created through that flow — ticked into the draft. */
  pendingMemberId?: string | null
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl border-border-default bg-bg-surface"
      >
        <SheetHeader>
          <SheetTitle className={SHEET_TITLE}>
            {stack ? "Edit stack" : "New stack"}
          </SheetTitle>
        </SheetHeader>
        {open && (
          <StackForm
            key={stack?.id ?? "new"}
            stack={stack}
            compounds={compounds}
            unavailableIds={unavailableIds}
            onClose={() => onOpenChange(false)}
            onSave={onSave}
            onDelete={onDelete}
            fallbackName={fallbackName}
            onAddCompound={onAddCompound}
            pendingMemberId={pendingMemberId}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function StackForm({
  stack,
  compounds,
  unavailableIds,
  onClose,
  onSave,
  onDelete,
  fallbackName,
  onAddCompound,
  pendingMemberId,
}: {
  stack: Stack | null
  compounds: StackCompound[]
  unavailableIds: Set<string>
  onClose: () => void
  onSave: (draft: StackDraft) => void
  onDelete?: () => void
  fallbackName: string
  onAddCompound?: () => void
  pendingMemberId?: string | null
}) {
  const [name, setName] = useState(stack?.name ?? "")
  const [colour, setColour] = useState<PaletteColour>(
    stack?.colour ?? DEFAULT_PALETTE_COLOUR
  )
  // CURRENT members only — a past member left on a day that is now history and
  // must not be re-offered as though it were still in the stack.
  const [members, setMembers] = useState<string[]>(
    stack ? currentMemberIds(stack) : []
  )
  const [confirmDelete, setConfirmDelete] = useState(false)

  // A compound created from inside this sheet is ticked in automatically — the
  // whole point of adding from here is not having to go and find it afterwards.
  //
  // Adjusted DURING RENDER rather than in an effect (React's documented pattern
  // for reacting to a changed prop): an effect would paint once without the new
  // member and then again with it. Tracking the last handled id means a member
  // the user then unticks stays unticked, instead of being re-added every render.
  const [lastHandled, setLastHandled] = useState<string | null>(null)
  if (pendingMemberId && pendingMemberId !== lastHandled) {
    setLastHandled(pendingMemberId)
    setMembers((cur) =>
      cur.includes(pendingMemberId) ? cur : [...cur, pendingMemberId]
    )
  }

  // A member of THIS stack is always offerable (so it can be removed); one in
  // another stack is not.
  const offerable = compounds.filter(
    (c) => members.includes(c.id) || !unavailableIds.has(c.id)
  )

  // A blank name is allowed — it falls back to "Stack N" rather than blocking
  // the save. Only the membership genuinely has to be chosen.
  const trimmed = name.trim()
  const valid = members.length > 0

  function toggle(id: string) {
    setMembers((cur) =>
      cur.includes(id) ? cur.filter((m) => m !== id) : [...cur, id]
    )
  }

  function save() {
    if (!valid) return
    onSave({
      id: stack?.id ?? crypto.randomUUID(),
      name: (trimmed || fallbackName).slice(0, STACK_NAME_MAX),
      colour,
      memberIds: members,
    })
    onClose()
  }

  return (
    <div className="space-y-5 px-4 pb-2">
      <label className="space-y-1 block">
        <span className={LABEL}>Name</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={STACK_NAME_MAX}
          placeholder={fallbackName}
          className="h-11 rounded-xl border-border-default bg-bg-input dark:bg-bg-input"
        />
      </label>

      <div className="space-y-2">
        <p className={LABEL}>Colour</p>
        <div className="flex flex-wrap gap-2">
          {PALETTE_COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={PALETTE_LABELS[c]}
              aria-pressed={colour === c}
              onClick={() => setColour(c)}
              style={{ background: paletteColourVar(c) }}
              className={cn(
                "h-9 w-9 rounded-full transition active:scale-[0.94]",
                colour === c &&
                  "ring-2 ring-accent-primary ring-offset-2 ring-offset-bg-surface"
              )}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className={LABEL}>Compounds</p>
        {offerable.length === 0 ? (
          <p className="text-sm text-text-muted">
            Every compound is already in a stack. Add a new one below.
          </p>
        ) : (
          <div className="divide-y divide-border-default rounded-2xl bg-bg-surface-raised">
            {offerable.map((c) => {
              const on = members.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:scale-[0.99]"
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                      on
                        ? "border-accent-primary bg-accent-primary"
                        : "border-border-strong"
                    )}
                  >
                    {on && (
                      <span className="h-2 w-2 rounded-full bg-bg-base" aria-hidden />
                    )}
                  </span>
                  <CategoryIcon category={c.category} />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {c.name}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">
                    {c.dose} {c.unit}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Create a compound without leaving the stack. It is still a NORMAL
            compound with its own schedule and history — the stack just includes
            it — so this opens the same add flow, then ticks the result in. */}
        {onAddCompound && (
          <button
            type="button"
            onClick={onAddCompound}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-strong py-3 text-sm text-text-muted transition-colors hover:text-foreground"
          >
            <Plus className="h-4 w-4" aria-hidden /> Add a new compound
          </button>
        )}
      </div>

      {/* Delete — red, matching the compound delete treatment. Ungroups only. */}
      {stack && onDelete && (
        <div className="space-y-2">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-sm text-text-muted transition-colors hover:text-foreground"
            >
              Delete stack
            </button>
          ) : (
            <div className="space-y-3 rounded-2xl border border-accent-destructive p-4">
              <p className="text-sm text-foreground">
                Delete this stack? The compounds keep running.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="h-10 flex-1 rounded-xl border border-border-default text-sm text-text-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDelete()
                    onClose()
                  }}
                  className="h-10 flex-1 rounded-xl bg-accent-destructive text-sm font-medium text-foreground"
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <SheetFooter className="flex-row gap-2 px-0">
        <button
          type="button"
          onClick={onClose}
          className="h-11 flex-1 rounded-xl border border-border-default text-sm text-text-muted transition active:scale-[0.98]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!valid}
          className="h-11 flex-1 rounded-xl bg-accent-primary text-sm font-medium text-bg-base transition active:scale-[0.98] disabled:opacity-40"
        >
          Save
        </button>
      </SheetFooter>
    </div>
  )
}
