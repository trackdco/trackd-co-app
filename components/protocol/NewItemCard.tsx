"use client"

import { Plus } from "@/components/icons"

/**
 * The "New stack" / "New cycle" affordance: a normal surface card holding a
 * DARKER INSET panel with a centred plus (Adrian's call, replacing a dashed
 * text button).
 *
 * It matches the rhythm of the cards above it and reads as an empty slot waiting
 * to be filled, rather than a link that happens to sit under some cards. Both
 * sections use it so Stacks and Cycles end up identical.
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
      className="w-full rounded-2xl bg-bg-surface p-3 text-left transition active:scale-[0.98] disabled:active:scale-100"
    >
      <span className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-bg-base py-6">
        <Plus
          className={disabled ? "h-5 w-5 text-text-subtle" : "h-5 w-5 text-text-muted"}
          aria-hidden
        />
        <span
          className={
            disabled ? "text-sm text-text-subtle" : "text-sm text-text-muted"
          }
        >
          {disabled && hint ? hint : label}
        </span>
      </span>
    </button>
  )
}
