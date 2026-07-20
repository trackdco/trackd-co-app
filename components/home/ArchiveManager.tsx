"use client"

import { useState, useSyncExternalStore } from "react"
import { Archive, ArrowCounterClockwise, Trash } from "@/components/icons"

import { cn } from "@/lib/utils"
import { CARD_EYEBROW } from "@/lib/ui-presets"
import { CategoryIcon } from "@/components/compounds/CategoryIcon"
import {
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
} from "@/lib/compound-categories"
import {
  archiveInStack,
  getStackSnapshot,
  methodLabel,
  removeFromStack,
  subscribeStack,
  type StackCompound,
} from "@/lib/home/stack"
import { removeCompoundLogs } from "@/lib/home/doseLog"
import { AddCompoundSheet } from "@/components/home/AddCompoundSheet"

const EMPTY: StackCompound[] = []

/**
 * The Archive menu (Profile). Lists the user's compounds split into Archived and
 * Active, with one tap to move a compound either way. Archiving stops it being
 * dosed in the present/future but keeps all its history; reactivating puts it
 * back in the log. The permanent-delete path lives here and ONLY here — an
 * archived compound is the one thing that can be erased: it removes the compound
 * and every dose ever logged for it, behind a two-step confirm. Reads the
 * device-local stack live (same store as the home).
 */
export function ArchiveManager({ userId }: { userId: string }) {
  const stack = useSyncExternalStore(
    subscribeStack,
    () => getStackSnapshot(userId, EMPTY),
    () => EMPTY
  )
  const archived = stack.filter((c) => c.archived)
  const active = stack.filter((c) => !c.archived)
  // Reactivation opens the pre-filled config sheet (reactivate mode) so the dose,
  // schedule and injection sites can be re-tuned before the compound resumes today.
  const [reactivateTarget, setReactivateTarget] = useState<StackCompound | null>(null)

  return (
    <>
      <div className="space-y-6">
        <Group
          title="Archived"
          empty="Nothing archived yet."
          compounds={archived}
          actionLabel="Reactivate"
          actionIcon={<ArrowCounterClockwise className="h-3.5 w-3.5" aria-hidden />}
          onActionDirect={(c) => setReactivateTarget(c)}
          onDelete={(id) => {
            removeFromStack(userId, id)
            removeCompoundLogs(userId, id)
          }}
          dim
        />
        <Group
          title="Active"
          empty="No active compounds."
          compounds={active}
          actionLabel="Archive"
          actionIcon={<Archive className="h-3.5 w-3.5" aria-hidden />}
          confirmText={(name) =>
            `Archive “${name}”? You can reactivate it any time from here.`
          }
          onAction={(id) => archiveInStack(userId, id, true)}
        />
      </div>

      {/* Reactivate → re-tune the compound, then it resumes from today. */}
      <AddCompoundSheet
        open={reactivateTarget !== null}
        compound={null}
        editCompound={reactivateTarget}
        userId={userId}
        onOpenChange={(o) => {
          if (!o) setReactivateTarget(null)
        }}
        onAdded={() => setReactivateTarget(null)}
      />
    </>
  )
}

function Group({
  title,
  empty,
  compounds,
  actionLabel,
  actionIcon,
  confirmText,
  onAction,
  onActionDirect,
  onDelete,
  dim,
}: {
  title: string
  empty: string
  compounds: StackCompound[]
  actionLabel: string
  actionIcon: React.ReactNode
  /** Inline-confirm action (Archive). Omitted when `onActionDirect` is used. */
  confirmText?: (name: string) => string
  onAction?: (id: string) => void
  /** Direct action with the full compound, bypassing the inline confirm
   *  (Reactivate → opens the config sheet). Takes precedence over `onAction`. */
  onActionDirect?: (c: StackCompound) => void
  /** When set, each row gets a permanent-delete affordance (Archived only). */
  onDelete?: (id: string) => void
  dim?: boolean
}) {
  // Which row is mid-confirm for the primary action (the drop-down appears in
  // place of the row).
  const [confirmId, setConfirmId] = useState<string | null>(null)
  // Which row is mid-delete and which step (1 = first confirm, 2 = last check).
  // The destructive path — only ever wired for the Archived group.
  const [deleteState, setDeleteState] = useState<{
    id: string
    step: 1 | 2
  } | null>(null)

  return (
    <section>
      <h3 className={cn("mb-2", CARD_EYEBROW)}>
        {title} {compounds.length > 0 && `(${compounds.length})`}
      </h3>
      {compounds.length === 0 ? (
        <p className="rounded-2xl bg-bg-surface px-4 py-5 text-center text-sm text-text-muted">
          {empty}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-2xl bg-bg-surface">
          {compounds.map((c, i) => {
            const meta = CATEGORY_META[c.category] ?? FALLBACK_CATEGORY_META
            const deleting = deleteState?.id === c.id
            return (
              <li
                key={c.id}
                className={cn("px-4 py-3", i > 0 && "hairline-t")}
              >
                {confirmId === c.id ? (
                  <div className="animate-shortcut-in rounded-xl border border-border-default bg-bg-surface-raised p-3">
                    <p className="text-sm text-foreground">{confirmText?.(c.name)}</p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        className="flex-1 rounded-lg border border-border-strong py-2 text-sm text-text-muted transition-colors hover:text-text-primary"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onAction?.(c.id)
                          setConfirmId(null)
                        }}
                        className="flex-1 rounded-lg bg-accent-primary py-2 text-sm font-medium text-bg-base transition-opacity hover:opacity-90"
                      >
                        {actionLabel}
                      </button>
                    </div>
                  </div>
                ) : deleting ? (
                  <div className="animate-shortcut-in rounded-xl border border-state-error/40 bg-state-error/10 p-3">
                    <p className="text-sm text-foreground">
                      {deleteState!.step === 1
                        ? `Delete “${c.name}” and ALL of its logged history? This can't be undone.`
                        : `Last check. This permanently erases every logged dose for “${c.name}”.`}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDeleteState(null)}
                        className="flex-1 rounded-lg border border-border-strong py-2 text-sm text-text-muted transition-colors hover:text-text-primary"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (deleteState!.step === 1) {
                            setDeleteState({ id: c.id, step: 2 })
                          } else {
                            onDelete?.(c.id)
                            setDeleteState(null)
                          }
                        }}
                        className="flex-1 rounded-lg bg-state-error py-2 text-sm font-medium text-text-primary transition-opacity hover:opacity-90"
                      >
                        {deleteState!.step === 1 ? "Continue" : "Delete forever"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <CategoryIcon
                      category={c.category}
                      className={cn("h-3.5 w-3.5", dim && "opacity-60")}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-medium",
                          dim ? "text-text-muted" : "text-foreground"
                        )}
                      >
                        {c.name}
                      </span>
                      <span className="block truncate text-xs text-text-subtle">
                        {meta.label} · {methodLabel(c.method)}
                      </span>
                    </span>
                    {onDelete && (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmId(null)
                          setDeleteState({ id: c.id, step: 1 })
                        }}
                        aria-label={`Delete ${c.name} permanently`}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:text-state-error"
                      >
                        <Trash className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteState(null)
                        if (onActionDirect) onActionDirect(c)
                        else setConfirmId(c.id)
                      }}
                      className="flex shrink-0 items-center gap-1.5 rounded-full border border-border-strong px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text-primary"
                    >
                      {actionIcon}
                      {actionLabel}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
