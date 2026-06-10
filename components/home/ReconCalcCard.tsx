"use client"

import { Calculator, ChevronRight } from "lucide-react"

interface ReconCalcCardProps {
  onOpenCalculator: () => void
}

/**
 * The last card in the scroll (bottom-most, NOT sticky): a plain entry point
 * into the reconstitution calculator screen. Neutral styling — no amber — so
 * the week strip's selected day stays the screen's single accent.
 */
export function ReconCalcCard({ onOpenCalculator }: ReconCalcCardProps) {
  return (
    <button
      type="button"
      onClick={onOpenCalculator}
      className="flex w-full items-center gap-4 rounded-2xl border border-border-default bg-bg-surface p-5 text-left transition-colors hover:bg-bg-surface-raised/40"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bg-surface-raised text-text-primary">
        <Calculator className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-foreground">
          Reconstitution Calculator
        </p>
        <p className="truncate text-sm text-text-muted">
          Work out your draw: mg, mL, and units
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-text-subtle" aria-hidden />
    </button>
  )
}
