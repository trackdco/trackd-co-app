"use client"

import { CalendarDot, Plus, Syringe } from "@/components/icons"

import { CARD_EYEBROW } from "@/lib/ui-presets"

/**
 * The Home empty state — shown when the user has no compounds in their log yet
 * (a blank template). Explains, in three steps, how the log works and points to
 * the centre "+" to get started. Replaces the Today's Log card until the first
 * compound is added.
 */
export function EmptyLogCard() {
  return (
    <section className="rounded-2xl bg-bg-surface p-5">
      <h2 className={CARD_EYEBROW}>Start your log</h2>
      <p className="mt-2 text-sm text-text-muted">
        You haven&apos;t added any compounds yet. Here&apos;s how it works:
      </p>

      <ol className="mt-5 space-y-4">
        <Step
          n={1}
          icon={<Plus className="h-4 w-4" aria-hidden />}
          title="Add a compound"
          body="Tap the white + below → Add a compound. Search the catalogue or make your own. The method and unit come straight from the compound, no guessing."
        />
        <Step
          n={2}
          icon={<CalendarDot className="h-4 w-4" aria-hidden />}
          title="Set the dose & schedule"
          body="Enter the dose, choose how often and when it starts. For injectables you'll pick the site when you log each dose, from the body map."
        />
        <Step
          n={3}
          icon={<Syringe className="h-4 w-4" aria-hidden />}
          title="Log each dose"
          body="Tap the empty circle beside a compound to log it. For injectables, choose the site on the body map — each shows how long since you last used it."
        />
      </ol>

      <p className="mt-5 hairline-t pt-4 text-xs text-text-subtle">
        Everything is saved on this device for you only.
      </p>
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
      <span className="mt-0.5 w-4 shrink-0 text-center font-mono text-xs tabular-nums text-text-subtle">
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
