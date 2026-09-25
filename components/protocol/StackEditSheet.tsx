"use client"

import { useCallback, useState } from "react"

import { BottomSheet } from "@/components/layout/BottomSheet"
import { ConfirmDialog } from "@/components/feel/ConfirmDialog"
import { NewItemCard } from "@/components/protocol/NewItemCard"
import { Input } from "@/components/ui/input"
import {
  CARD_EYEBROW,
  FIELD_LABEL,
  PRESS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from "@/lib/ui-presets"
import { cn } from "@/lib/utils"
import { formatDose } from "@/lib/format/dose"
import { CategoryIcon } from "@/components/compounds/CategoryIcon"
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

/** A group's heading ("Colour", "Compounds"): the eyebrow (consistency fix
 *  #14). The name field's label is `FIELD_LABEL` (fix #19). */
const GROUP = CARD_EYEBROW

/** "A keeps running." / "A and B keep running." / "A, B and C keep running." */
function keepRunningLine(names: string[]): string {
  if (names.length === 0) return "Its compounds keep running."
  if (names.length === 1) return `${names[0]} keeps running.`
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} keep running.`
}

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
 * too (when the caller passes `onDelete`), asks first through the one confirm,
 * and ungroups the members without touching a single compound.
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
  // THE ONE SHEET FRAME (consistency fix #1). The form owns the frame, so its
  // pinned footer can read the form. Each open starts a fresh form on the stack
  // it opened with, held while the sheet slides away. The compound list and a
  // just-created member stay live: the picker can add one while it is open.
  const [session, setSession] = useState(open ? 1 : 0)
  const [opened, setOpened] = useState({ stack, fallbackName })
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setSession((n) => n + 1)
      setOpened({ stack, fallbackName })
    }
  }
  if (session === 0) return null
  return (
    <StackForm
      key={session}
      open={open}
      onOpenChange={onOpenChange}
      stack={opened.stack}
      compounds={compounds}
      unavailableIds={unavailableIds}
      onSave={onSave}
      onDelete={onDelete}
      fallbackName={opened.fallbackName}
      onAddCompound={onAddCompound}
      pendingMemberId={pendingMemberId}
    />
  )
}

function StackForm({
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
  stack: Stack | null
  compounds: StackCompound[]
  unavailableIds: Set<string>
  onSave: (draft: StackDraft) => void
  onDelete?: () => void
  fallbackName: string
  onAddCompound?: () => void
  pendingMemberId?: string | null
}) {
  const onClose = () => onOpenChange(false)
  /**
   * The sheet must not focus the Name field as it opens: on a phone that
   * raises the keyboard over the form before anything is chosen (the old
   * sheet passed `onOpenAutoFocus={(e) => e.preventDefault()}`). The shared
   * frame has no prop for it yet, so its focus scope's own "focus on open"
   * event is cancelled from inside, once, as the body attaches (before the
   * scope's effect dispatches it).
   */
  const noAutoFocus = useCallback((el: HTMLElement | null) => {
    el?.closest('[data-slot="sheet-content"]')?.addEventListener(
      "focusScope.autoFocusOnMount",
      (e) => e.preventDefault(),
      { once: true },
    )
  }, [])
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
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={stack ? "Edit stack" : "New stack"}
      desktop="rail"
      footer={
        <>
          <button type="button" onClick={onClose} className={cn(SECONDARY_BUTTON, "flex-1")}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={!valid} className={cn(PRIMARY_BUTTON, "flex-1")}>
            Save
          </button>
        </>
      }
    >
      {/* The sections rise in as the sheet lands (feel pass §4). */}
      <div ref={noAutoFocus} data-sheet-body className="space-y-5 pb-2">
        <label className="block">
          <span className={FIELD_LABEL}>Name</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={STACK_NAME_MAX}
            placeholder={fallbackName}
            className="h-11 rounded-xl border-border-default bg-bg-input dark:bg-bg-input"
          />
        </label>

        <div className="space-y-2">
          <p className={GROUP}>Colour</p>
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
                  PRESS.tick,
                  "h-9 w-9 rounded-full transition",
                  colour === c &&
                    "ring-2 ring-accent-primary ring-offset-2 ring-offset-bg-surface"
                )}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className={GROUP}>Compounds</p>
          {offerable.length === 0 ? (
            <p className="text-sm text-text-muted">
              Every compound is already in a stack. Add a new one below.
            </p>
          ) : (
            <div className="inst-rows">
              {offerable.map((c) => {
                const on = members.includes(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    className={cn(PRESS.row, "flex w-full items-center gap-3 px-4 py-3 text-left")}
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
                      {formatDose(c.dose, c.unit)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Create a compound without leaving the stack. It is still a NORMAL
              compound with its own schedule and history — the stack just includes
              it — so this opens the same add flow, then ticks the result in. */}
          {/* The one hairline "New" card, never a dashed box (fix #21). */}
          {onAddCompound && (
            <div className="pt-1">
              <NewItemCard label="Add a new compound" onClick={onAddCompound} />
            </div>
          )}
        </div>

        {/* Delete: red, and it asks first through the one confirm (fix #5), in
            the Stacks page's words. Ungroups only. */}
        {stack && onDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className={cn(PRESS.text, "-my-2 flex min-h-11 items-center text-sm text-accent-destructive-on-surface")}
          >
            Delete stack
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this stack?"
        line={keepRunningLine(
          compounds.filter((c) => members.includes(c.id)).map((c) => c.name),
        )}
        confirmLabel="Delete stack"
        onConfirm={() => {
          onDelete?.()
          onClose()
        }}
      />
    </BottomSheet>
  )
}
