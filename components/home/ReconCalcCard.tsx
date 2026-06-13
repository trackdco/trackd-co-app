"use client"

import { Calculator, ChevronRight } from "lucide-react"

import { CARD_ICON_BADGE, CARD_TITLE } from "@/lib/ui-presets"

interface ReconCalcCardProps {
  onOpenCalculator: () => void
}

/**
 * The last card in the scroll (bottom-most, NOT sticky): a plain entry point
 * into the reconstitution calculator screen. Shares the calm-editorial card
 * chrome — an amber icon badge + a serif white title — so it reads as one
 * system with the Weight / Today's Log cards above it.
 */
export function ReconCalcCard({ onOpenCalculator }: ReconCalcCardProps) {
  return (
    <button
      type="button"
      onClick={onOpenCalculator}
      className="flex w-full items-center gap-4 rounded-2xl border border-border-default bg-bg-surface p-5 text-left transition-colors hover:bg-bg-surface-raised/40"
    >
      <span className={CARD_ICON_BADGE} aria-hidden>
        <Calculator className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={CARD_TITLE}>Reconstitution Calculator</p>
        <p className="truncate text-sm text-text-muted">
          Work out your draw: mg, mL, and units
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-text-subtle" aria-hidden />
    </button>
  )
}
