"use client"

import { CalendarClock, Plus, Syringe } from "lucide-react"

import { CARD_ICON_BADGE, CARD_TITLE } from "@/lib/ui-presets"

/**
 * The Home empty state — shown when the user has no compounds in their log yet
 * (a blank template). Explains, in three steps, how the log works and points to
 * the centre "+" to get started. Replaces the Today's Log card until the first
 * compound is added.
 */
export function EmptyLogCard() {
  return (
    <section className="rounded-2xl border border-border-default bg-bg-surface p-5">
      <span className={CARD_ICON_BADGE}>
        <Syringe className="h-5 w-5" aria-hidden />
      </span>

      <h2 className={`mt-4 ${CARD_TITLE}`}>
        Start your log
      </h2>
      <p className="mt-1 text-sm text-text-muted">
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
          icon={<CalendarClock className="h-4 w-4" aria-hidden />}
          title="Set the dose, schedule & sites"
          body="Enter the dose, choose how often and when it starts, and (for injectables) pick the injection sites you rotate through, arranged top-to-bottom in the order you'll use them."
        />
        <Step
          n={3}
          icon={<Syringe className="h-4 w-4" aria-hidden />}
          title="Log each dose"
          body="Tap a compound's + to log it. Trackd advances your rotation to the next site and keeps two compounds off the same spot on the same day."
        />
      </ol>

      <p className="mt-5 border-t border-border-default pt-4 text-xs text-text-subtle">
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
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-surface-raised font-mono text-xs text-accent-amber">
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
