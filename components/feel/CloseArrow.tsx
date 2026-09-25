"use client"

import { PRESS } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

/** The up arrow itself, for a caller that draws its own button. */
export function CloseArrowIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 14.5l6-6 6 6" />
    </svg>
  )
}

/**
 * THE ONE CLOSE ARROW (consistency fix #11; build-brief-final §2.4): a 30px
 * rounded square (radius 9) on the ghost surface with an up arrow, for
 * everything that opens in place (the log panel, the half-life card, a type
 * group, the Schedule). While `shown` is false it waits turned and small, and
 * spins in when its panel opens.
 *
 * A CaretRight is for "goes somewhere", never for this.
 */
export function CloseArrow({
  onClick,
  label = "Close",
  shown = true,
  className,
}: {
  onClick: () => void
  label?: string
  /** False while the thing it closes is shut: it waits turned and faded. */
  shown?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      tabIndex={shown ? 0 : -1}
      data-shown={shown ? "true" : "false"}
      className={cn(
        PRESS.icon,
        "close-arrow inst-ghost flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] text-foreground",
        className,
      )}
    >
      <CloseArrowIcon />
    </button>
  )
}
