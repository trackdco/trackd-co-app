"use client"

import { useState, useSyncExternalStore } from "react"
import { Archive, RotateCcw } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
} from "@/lib/compound-categories"
import {
  archiveInStack,
  getStackSnapshot,
  methodLabel,
  subscribeStack,
  type StackCompound,
} from "@/lib/home/stack"

const EMPTY: StackCompound[] = []

/**
 * The Archive menu (Profile). Lists the user's compounds split into Archived and
 * Active, with one tap to move a compound either way. Archiving stops it being
 * dosed in the present/future but keeps all its history; reactivating puts it
 * back in the log. Reads the device-local stack live (same store as the home).
 */
export function ArchiveManager({ userId }: { userId: string }) {
  const stack = useSyncExternalStore(
    subscribeStack,
    () => getStackSnapshot(userId, EMPTY),
    () => EMPTY
  )
  const archived = stack.filter((c) => c.archived)
  const active = stack.filter((c) => !c.archived)

  return (
    <div className="space-y-6">
      <Group
        title="Archived"
        empty="Nothing archived yet."
        compounds={archived}
        actionLabel="Reactivate"
        actionIcon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}
        confirmText={(name) =>
          `Add “${name}” back to your log? You can archive it again any time.`
        }
        onAction={(id) => archiveInStack(userId, id, false)}
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
  dim,
}: {
  title: string
  empty: string
  compounds: StackCompound[]
  actionLabel: string
  actionIcon: React.ReactNode
  confirmText: (name: string) => string
  onAction: (id: string) => void
  dim?: boolean
}) {
  // Which row is mid-confirm (the drop-down appears in place of the row).
  const [confirmId, setConfirmId] = useState<string | null>(null)

  return (
    <section>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
        {title} {compounds.length > 0 && `(${compounds.length})`}
      </h3>
      {compounds.length === 0 ? (
        <p className="rounded-2xl border border-border-default bg-bg-surface px-4 py-5 text-center text-sm text-text-muted">
          {empty}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border-default bg-bg-surface">
          {compounds.map((c, i) => {
            const meta = CATEGORY_META[c.category] ?? FALLBACK_CATEGORY_META
            return (
              <li
                key={c.id}
                className={cn("px-4 py-3", i > 0 && "border-t border-border-default")}
              >
                {confirmId === c.id ? (
                  <div className="animate-shortcut-in rounded-xl border border-accent-amber/40 bg-accent-amber/10 p-3">
                    <p className="text-sm text-foreground">{confirmText(c.name)}</p>
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
                          onAction(c.id)
                          setConfirmId(null)
                        }}
                        className="flex-1 rounded-lg bg-accent-amber py-2 text-sm font-medium text-bg-base transition-opacity hover:opacity-90"
                      >
                        {actionLabel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        meta.dot,
                        dim && "opacity-60"
                      )}
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
                    <button
                      type="button"
                      onClick={() => setConfirmId(c.id)}
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
