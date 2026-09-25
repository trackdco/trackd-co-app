"use client"

import { CalendarDot, Plus, Syringe } from "@/components/icons"

import { CARD_EYEBROW, PRIMARY_BUTTON } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

/**
 * The Home empty state — shown when the user has no compounds in their log yet
 * (a blank template). Explains, in three steps, how the log works, and ends in
 * the one action that fixes it (consistency fix #24): "Add compound", which
 * opens the compound picker. Replaces the Today's Log card until the first
 * compound is added.
 *
 * No privacy line here: it is said once, in Profile (consistency fix #29).
 */
export function EmptyLogCard({ onAdd }: { onAdd: () => void }) {
  return (
    <section className="flow-card inst-card p-5">
      <h2 className={CARD_EYEBROW}>Start your log</h2>
      <p className="mt-2 text-sm text-text-muted">
        Here&apos;s how it works:
      </p>

      <ol className="mt-5 space-y-4">
        <Step
          n={1}
          icon={<Plus className="h-4 w-4" aria-hidden />}
          // Adrian's wording, approved in the feel pass (round 5).
          title="Start with a compound"
          body="Tap Add compound below. Find your compound in the catalogue, or create one."
        />
        <Step
          n={2}
          icon={<CalendarDot className="h-4 w-4" aria-hidden />}
          title="Set the dose & schedule"
          body="Enter the dose, choose how often and when it starts."
        />
        <Step
          n={3}
          icon={<Syringe className="h-4 w-4" aria-hidden />}
          title="Log each dose"
          // The Flow B gesture: the first tap opens the row (consistency fix #24).
          body="Tap a dose to open it, then Track."
        />
      </ol>

      <button type="button" onClick={onAdd} className={cn(PRIMARY_BUTTON, "mt-5 w-full")}>
        Add compound
      </button>
    </section>
  )
}

function Step({
  n,
  icon,
  title,
  body,
}: {
  n: number
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 w-4 shrink-0 text-center font-mono text-xs tabular-nums text-text-muted">
        {n}
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <span className="text-text-muted">{icon}</span>
          {title}
        </p>
        <p className="mt-0.5 text-sm leading-relaxed text-text-muted">{body}</p>
      </div>
    </li>
  )
}
