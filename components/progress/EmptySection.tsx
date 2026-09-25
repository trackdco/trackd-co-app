"use client"

import type { ReactNode } from "react"

import { Plus } from "@/components/icons"
import { CARD, CARD_EYEBROW, GHOST_BUTTON } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

/**
 * The small "+" at a card's top right or foot (build-brief-final §2.4: the
 * top-right "+" buttons are rounded rectangles at 10px). A ghost key, 32px to
 * look at and 44px to hit: the pseudo-element extends the target without
 * moving anything.
 */
export function CardPlus({
  label,
  onClick,
  className,
}: {
  label: string
  /** Handed the button, so a pad or sheet can give focus back to it. */
  onClick: (from: HTMLElement) => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={(e) => onClick(e.currentTarget)}
      aria-label={label}
      // `.inst-ghost` is unlayered and sets the ghost's 9px, so the 10px the
      // brief gives a "+" goes inline.
      style={{ borderRadius: "var(--r-lg)" }}
      // The ghost's own 44px floor is reached by the pseudo-element instead,
      // so the key itself stays 32px square.
      className={cn(
        GHOST_BUTTON,
        "relative h-8 min-h-0 w-8 shrink-0 p-0 before:absolute before:-inset-1.5 before:content-['']",
        className,
      )}
    >
      <Plus className="h-4 w-4" aria-hidden />
    </button>
  )
}

/**
 * A Progress section before it has anything in it (build-brief-final §3.15):
 * its eyebrow, a faint picture of what it becomes, "None yet" and a small plus
 * that starts adding. Consistency has no plus; its line says what starts it.
 */
export function EmptySection({
  title,
  preview,
  note = "None yet",
  add,
}: {
  title: string
  /** A quiet sketch of the filled card. Decoration only. */
  preview: ReactNode
  note?: string
  add?: { label: string; onClick: (from: HTMLElement) => void }
}) {
  return (
    <section aria-label={title} className={cn(CARD, "flex flex-col p-5")}>
      <h2 className={CARD_EYEBROW}>{title}</h2>
      <div aria-hidden className="my-4 flex min-h-10 flex-1 items-center">
        {preview}
      </div>
      <div className="flex min-h-8 items-center justify-between gap-2">
        <p className="text-[12px] leading-snug text-text-muted">{note}</p>
        {add ? <CardPlus label={add.label} onClick={add.onClick} /> : null}
      </div>
    </section>
  )
}

/* The sketches: token colours only, and never text. */

/** A weight line still to be drawn. */
export function WeightSketch() {
  return (
    <svg viewBox="0 0 100 30" className="w-full" aria-hidden>
      <path
        d="M2 22 C20 20 30 14 48 16 S78 10 98 8"
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth={2}
        strokeDasharray="4 4"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function Bar({ w }: { w: string }) {
  return <span className="block h-1.5 rounded-[3px] bg-border-default" style={{ width: w }} />
}

/** An entry's first lines. */
export function JournalSketch() {
  return (
    <span className="flex w-full flex-col gap-1.5">
      <Bar w="90%" />
      <Bar w="60%" />
    </span>
  )
}

/** A panel's rows: a name and a figure. */
export function BloodsSketch() {
  return (
    <span className="flex w-full flex-col gap-1.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="flex justify-between">
          <Bar w="46%" />
          <Bar w="22%" />
        </span>
      ))}
    </span>
  )
}

/** A week of days, none of them logged yet. */
export function DaysSketch() {
  return (
    <span className="flex w-full gap-1">
      {Array.from({ length: 7 }, (_, i) => (
        <span
          key={i}
          className="block aspect-square flex-1 rounded-full shadow-[inset_0_0_0_1.4px_var(--border-strong)]"
        />
      ))}
    </span>
  )
}
