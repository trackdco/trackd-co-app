"use client"

import { RotateCcw } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  CATEGORY_META,
  FALLBACK_CATEGORY_META,
} from "@/lib/compound-categories"
import { methodLabel, type StackCompound } from "@/lib/home/stack"

/**
 * Archived compounds — no longer dosed (hidden from the present/future log) but
 * their past entries are kept. Tap one to view its detail/history; "Reactivate"
 * puts it back into the active log.
 */
export function ArchivedCompounds({
  compounds,
  onOpen,
  onReactivate,
}: {
  compounds: StackCompound[]
  onOpen: (c: StackCompound) => void
  onReactivate: (id: string) => void
}) {
  return (
    <section className="rounded-2xl border border-border-default bg-bg-surface p-5">
      <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
        Archived
      </h2>
      <p className="mt-1 text-xs text-text-subtle">
        Not dosed anymore, but history is kept. Reactivate anytime.
      </p>
      <ul className="mt-3 overflow-hidden rounded-2xl bg-bg-surface-raised">
        {compounds.map((c, i) => {
          const meta = CATEGORY_META[c.category] ?? FALLBACK_CATEGORY_META
          return (
            <li key={c.id} className={cn(i > 0 && "border-t border-border-default")}>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => onOpen(c)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-input/40"
                >
                  <span
                    aria-hidden
                    className={cn("h-2 w-2 shrink-0 rounded-full opacity-60", meta.dot)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text-muted">
                      {c.name}
                    </span>
                    <span className="block truncate text-xs text-text-subtle">
                      {meta.label} · {methodLabel(c.method)}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onReactivate(c.id)}
                  className="mr-3 flex shrink-0 items-center gap-1.5 rounded-full border border-border-strong px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text-primary"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  Reactivate
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
