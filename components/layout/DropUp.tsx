"use client"

import { useId, type ReactNode } from "react"

import { CaretDown } from "@/components/icons"
import { DROPUP_COUNT, DROPUP_TRIGGER } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

/**
 * THE DROP-UP — a sheet's secondary offer, folded away until asked for.
 *
 * Adrian, 2026-09-11, from a four-state prototype: "I like eyebrow. More
 * discreet, yet still noticeable if you're looking."
 *
 * ## What it is for, and the rule for when to reach for it
 *
 * A sheet should lead with ONE job. "Log weight" carried a weight field AND a
 * row of pose tiles; "Progress photos" carried tiles AND a weight field. Both
 * read as forms rather than as the single thing you opened them to do. This is
 * the second thing, tucked behind one line.
 *
 * Use it for a genuinely OPTIONAL secondary action on a sheet that already has
 * a primary one. Do not use it to hide a required field, and do not stack two
 * of them: a sheet needing two drop-ups is a sheet doing three jobs.
 *
 * ## Why the eyebrow, and why the target stays 44px
 *
 * The trigger is `CARD_EYEBROW`'s treatment, which is the same small tracked
 * label every card title in the app already uses, so it reads as a heading you
 * could open rather than a button competing with Save. Discretion is spent on
 * the PAINT only: `min-h-11` keeps Apple's 44px floor whatever the type does.
 * A control that is quiet to look at and small to hit is two different
 * decisions, and only the first one was asked for.
 *
 * ## Motion
 *
 * The panel grows on `grid-template-rows` (the idiom the week strip and the
 * calculator's warning already use) and its items arrive staggered via
 * `.animate-dropup-item` with `--dropup-i` set per item. 26ms between items,
 * which is `GROW_FIELD`'s interval rather than a second one invented here.
 * Opening is 320ms and closing is 220ms: getting out of the way should not be
 * a performance. Both collapse under `prefers-reduced-motion`.
 *
 * ## Two things that break silently if you change them
 *
 * 1. **The panel stays MOUNTED and is `inert` when closed.** Unmounting it
 *    would give the grid-rows transition no previous height to run from, so it
 *    would jump; `inert` is what keeps its controls out of the tab order while
 *    it is shut. Same pairing as Home's collapsible week strip.
 * 2. **The count is NOT amber.** Amber means "this needs you now"
 *    (ui-context → "amber marks what's live"). A tally of photos already
 *    attached is a settled state, and settled reads white or muted.
 */
export function DropUp({
  label,
  open,
  onOpenChange,
  count,
  children,
  className,
}: {
  /** The one line. Sentence case, no trailing punctuation. */
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** How many are attached, shown only when non-zero. */
  count?: number
  children: ReactNode
  className?: string
}) {
  const panelId = useId()

  return (
    <div className={cn("hairline-t mt-4", className)} data-dropup-open={open}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        className={DROPUP_TRIGGER}
      >
        <span className="flex-1 text-left">{label}</span>
        {count ? (
          <span
            className={cn(
              DROPUP_COUNT,
              // Explicit, not a `group-data-` variant. See the preset's note:
              // the variant version was never generated and the count never
              // brightened.
              open ? "text-foreground" : "text-text-muted",
            )}
          >
            {count}
          </span>
        ) : null}
        <CaretDown
          aria-hidden
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform duration-300 ease-motion motion-reduce:transition-none",
            // Closed points UP, because the panel opens upward out of the foot
            // of the sheet. It is a drop-UP.
            open ? "rotate-0" : "rotate-180",
          )}
        />
      </button>

      <div
        id={panelId}
        className="-mx-1.5 grid transition-[grid-template-rows] ease-motion motion-reduce:transition-none"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          // Out of the way faster than into it.
          transitionDuration: open ? "320ms" : "220ms",
        }}
      >
        {/*
          `inert` rather than unmounted: see the note above.

          ⚠️ THE CLIP BOX NEEDS SLACK ON THREE SIDES, and it had none.

          `overflow-hidden` is what makes the grid-rows collapse work, and it
          clips at the padding box. With content flush to that edge, anything a
          child paints OUTSIDE its own border box was sheared off: the
          photo-remove badge overhangs its tile by 4px (`-top-1 -right-1`) and
          came out sliced flat across the top, and the weight field's 3px
          `focus-visible` ring was cut on three sides, which is the keyboard
          user's only indication of where they are.

          The slack is added by widening the CLIP region (`-mx-1.5` on the grid,
          eating into the sheet's own `px-6`) and restoring the content's
          alignment with matching padding inside it. Padding the clip element
          itself would not work: the grid row collapses to `0fr` but padding
          still paints, so the panel would never fully close.
        */}
        <div className="overflow-hidden" inert={!open}>
          <div className="px-1.5 pt-1.5 pb-4">{children}</div>
        </div>
      </div>
    </div>
  )
}
