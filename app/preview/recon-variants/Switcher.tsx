"use client"

import { useState } from "react"

import { ReconCalculator } from "@/components/calculator/ReconCalculator"
import { cn } from "@/lib/utils"

import { CompactCalculator, FocusCalculator } from "./variants"

type VariantId = "shipped" | "compact" | "focus"

const VARIANTS: { id: VariantId; label: string; note: string }[] = [
  {
    id: "shipped",
    label: "Shipped",
    note: "What is on the branch now. Inputs sit below the fold.",
  },
  {
    id: "compact",
    label: "Compact",
    note: "Same order, tightened. List-row inputs, one figures strip. Inputs clear the fold.",
  },
  {
    id: "focus",
    label: "Focus",
    note: "Readout pinned to the top, inputs directly under it. Inverts the spec's page order.",
  },
]

/**
 * DEV-ONLY. Flip between the spec 07 layouts on a real phone without rebuilding.
 * The chooser deliberately sits INSIDE the phone frame rather than in a toolbar,
 * so what is being judged is the layout at its real width.
 */
export function Switcher() {
  const [variant, setVariant] = useState<VariantId>("compact")
  const active = VARIANTS.find((v) => v.id === variant) ?? VARIANTS[0]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-full border border-border-default bg-bg-input p-0.5">
        {VARIANTS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={variant === v.id}
            onClick={() => setVariant(v.id)}
            className={cn(
              "rounded-full py-1.5 text-xs font-medium transition-colors duration-300 ease-out",
              variant === v.id
                ? "bg-bg-surface-raised text-foreground"
                : "text-text-muted",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
      <p className="px-1 text-xs leading-relaxed text-text-subtle">{active.note}</p>

      {variant === "shipped" ? <ReconCalculator /> : null}
      {variant === "compact" ? <CompactCalculator /> : null}
      {variant === "focus" ? <FocusCalculator /> : null}
    </div>
  )
}
