"use client"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Container } from "@/components/containers"
import { Plus, Trash } from "@/components/icons"
import { cn } from "@/lib/utils"
import { DATA_MONO, SHEET_TITLE } from "@/lib/ui-presets"
import { inventoryTypeForCompound } from "@/lib/containers/form"
import type { OneOffLog } from "@/lib/home/oneOffLogs"

/**
 * A day's OFF-PLAN entries, and the way to add one.
 *
 * It is a sheet rather than a section of the day sheet (Adrian, 2026-08-07):
 * most days have none, so a permanent "Also taken" block was a heading earning
 * its space on the rare day and wasting it on every other. It hangs off the "⋯"
 * beside Running, with the count on the button so opening it is never a
 * surprise.
 *
 * Nothing here counts toward anything — see `lib/home/oneOffLogs.ts`.
 */
export function OneOffDaySheet({
  open,
  onOpenChange,
  dateLabel,
  logs,
  onAdd,
  onRemove,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The day, worded — the sheet is about one day and should say which. */
  dateLabel: string
  logs: OneOffLog[]
  onAdd: () => void
  onRemove: (id: string) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-h-[80dvh] overflow-y-auto rounded-t-3xl border-border-default bg-bg-surface"
      >
        <SheetHeader>
          <SheetTitle className={SHEET_TITLE}>Also logged</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          <p className={DATA_MONO}>{dateLabel}</p>

          {logs.length === 0 ? (
            <p className="rounded-2xl bg-bg-surface-raised px-4 py-5 text-center text-sm text-text-muted">
              Nothing off-plan logged on this day.
            </p>
          ) : (
            <ul>
              {logs.map((o) => (
                <li
                  key={o.id}
                  className="hairline-t flex min-h-12 items-center gap-3 border-border-default"
                >
                  <Container
                    name={o.compoundName ?? o.label}
                    inventoryType={inventoryTypeForCompound(
                      o.compoundName ?? o.label,
                      o.method ?? "po"
                    )}
                    category={o.category ?? "supplement"}
                    size={28}
                    className="shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">
                      {o.label}
                    </span>
                    {o.note && (
                      <span className="block truncate text-xs text-text-subtle">
                        {o.note}
                      </span>
                    )}
                  </span>
                  <span className={cn(DATA_MONO, "shrink-0")}>
                    {o.amount ? `${o.amount}${o.unit ?? ""}` : (o.unit ?? "")}
                  </span>
                  {/* A HARD delete, unlike everything else in the app. A one-off
                      carries no history anything depends on and will be mis-typed
                      constantly, so the honest verb is the one the user means. */}
                  <button
                    type="button"
                    onClick={() => onRemove(o.id)}
                    aria-label={`Remove ${o.label}`}
                    className="shrink-0 p-1 text-text-subtle transition-colors hover:text-accent-destructive"
                  >
                    <Trash className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={onAdd}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-primary px-4 py-3 text-sm font-medium text-bg-base transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Log something else
          </button>

          <p className="text-xs leading-relaxed text-text-subtle">
            These are recorded on their own. They do not affect your stock, your
            schedule or your consistency.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
