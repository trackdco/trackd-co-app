"use client"

import { Plus } from "@/components/icons"
import { cn } from "@/lib/utils"

/**
 * The "New stack" / "New cycle" affordance: the same card shape as the ones
 * above it, drawn as a HAIRLINE OUTLINE rather than a filled surface (Adrian's
 * call — a dashed border reads as a placeholder, and a filled inset panel read
 * as a card inside a card).
 *
 * The hairline is the app's structural line everywhere else, so an empty slot
 * drawn with it belongs to the same system. It renders at true 0.5px via the
 * shared `hairline` utility rather than a 1px border, which reads chunky on a
 * phone.
 *
 * Used by both sections, so Stacks and Cycles are identical by construction.
 */
export function NewItemCard({
  label,
  onClick,
  disabled,
  hint,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  /** Shown instead of the label when the action is not yet available. */
  hint?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "hairline flex w-full items-center justify-center gap-2 rounded-2xl border-border-default py-5 transition",
        disabled
          ? "text-text-subtle"
          : "text-text-muted active:scale-[0.98] hover:text-foreground"
      )}
    >
      <Plus className="h-4 w-4" aria-hidden />
      <span className="text-sm">{disabled && hint ? hint : label}</span>
    </button>
  )
}
