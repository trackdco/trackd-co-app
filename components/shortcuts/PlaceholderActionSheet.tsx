"use client"

import { TriangleAlert } from "lucide-react"

import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"

interface PlaceholderActionSheetProps {
  open: boolean
  onClose: () => void
  title: string
  /** Optional disclaimer block — only the reconstitution calculator passes one. */
  warning?: string
}

/**
 * One shared placeholder sheet for every not-yet-built Shortcuts action.
 *
 * It shows the action's title, a single **non-functional** text field (visual
 * only — no state, no save, nothing persists anywhere), and, when a `warning`
 * is passed, a restrained disclaimer block. This is deliberately a stub: linking
 * an action to its real section later means giving the menu a real handler and
 * dropping this sheet for that item (see `shortcutItems.ts`).
 */
export function PlaceholderActionSheet({
  open,
  onClose,
  title,
  warning,
}: PlaceholderActionSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 rounded-t-3xl border-t border-border-default bg-bg-surface p-0 shadow-lg"
      >
        {/* Header — close on the left, title centred (mirrors Add to Stack). */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 pt-4 pb-3">
          <SheetClose className="justify-self-start text-base text-text-muted transition-colors hover:text-text-primary">
            Close
          </SheetClose>
          <SheetTitle className="justify-self-center text-base font-semibold text-foreground">
            {title}
          </SheetTitle>
          <span aria-hidden className="justify-self-end" />
        </div>

        <SheetDescription className="sr-only">
          {title} — a placeholder. Nothing here is saved yet.
        </SheetDescription>

        <div className="space-y-4 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
          {/* Non-functional field — visual only. Uncontrolled, never read or saved. */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium tracking-wider text-text-muted uppercase">
              {title}
            </span>
            <Input
              type="text"
              placeholder="Coming soon…"
              aria-label={`${title} (placeholder, not yet functional)`}
              className="h-12 rounded-xl border-border-default bg-bg-input text-base placeholder:text-text-muted dark:bg-bg-input"
            />
          </label>

          <p className="px-1 text-xs leading-relaxed text-text-subtle">
            This section isn&apos;t built yet — nothing you type here is saved.
          </p>

          {warning && (
            <div className="flex gap-3 rounded-xl border border-border-default bg-bg-input p-3">
              <TriangleAlert
                className="mt-0.5 h-4 w-4 shrink-0 text-text-muted"
                aria-hidden
              />
              <p className="text-sm leading-relaxed text-text-muted">{warning}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
