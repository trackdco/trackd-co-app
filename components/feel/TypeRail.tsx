"use client"

import { ThumbGroup } from "@/components/feel/SlidingThumb"
import { SolidIcon } from "@/components/feel/SolidIcon"
import { CATEGORY_META, type CompoundCategory } from "@/lib/compound-categories"
import { CATEGORY_GLYPH } from "@/lib/solidGlyphs"
import { HIT_Y_30, PRESS } from "@/lib/ui-presets"
import { cn } from "@/lib/utils"

const CATEGORY_ORDER = Object.keys(CATEGORY_META) as CompoundCategory[]

/** The categories present, in the app's category order. */
export function presentCategories(categories: readonly string[]): CompoundCategory[] {
  return CATEGORY_ORDER.filter((c) => categories.includes(c))
}

/**
 * THE TYPE CHIP RAIL (build-brief-final §3.3, §3.7): "All" (four squares) and
 * one chip per type you run, each a Solid category mark in its colour and its
 * name, on the Instrument rail with a white thumb. The same rail on Home's
 * half-life card and over Protocol's compounds. Hidden with one type or none:
 * a rail with a single choice is not a choice.
 *
 * The chips are drawn 30px tall and pressed at 44 (cold review D8): each
 * reaches 7px above and below itself (`HIT_Y_30`), which is 4px past the
 * rail. A scroll box clips whatever reaches past its edge, so the chips scroll
 * in a clear box 4px taller than the rail on each side (the room given back by
 * a negative margin), over the rail's drawing, which stands still behind them
 * as it did when the rail itself scrolled. The clear box's 15px corners follow
 * the rail's 11px ones where a chip slides out under an end. The caller's
 * `className` (its margins) goes on the outer box, which keeps the negative
 * margin from collapsing into them. Placed and drawn exactly as before.
 */
export function TypeRail({
  categories,
  value,
  onChange,
  className,
}: {
  categories: readonly string[]
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const cats = presentCategories(categories)
  if (cats.length < 2) return null
  return (
    <div className={cn("relative flow-root", className)}>
      <span aria-hidden className="inst-rail pointer-events-none absolute inset-0" />
      <div className="type-rail relative -my-1 overflow-x-auto rounded-[15px] py-1">
        <ThumbGroup
          selection={value}
          thumbClassName="inst-thumb"
          role="group"
          aria-label="Type"
          className="flex w-max min-w-full gap-0.5 p-[3px]"
        >
          {["all", ...cats].map((k) => {
            const on = value === k
            const label = k === "all" ? "All" : CATEGORY_META[k as CompoundCategory].label
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(k)}
                className={cn(
                  PRESS.pill,
                  HIT_Y_30,
                  "flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[12px] transition-colors duration-300",
                  on ? "text-bg-base" : "text-text-muted",
                )}
              >
                {k === "all" ? (
                  <SolidIcon name="all" size={14} {...(on ? { hue: "var(--bg-base)" } : { tone: "off" as const })} />
                ) : (
                  <SolidIcon name={CATEGORY_GLYPH[k] ?? "catPeptide"} size={14} hue={`var(--cat-${k})`} />
                )}
                {label}
              </button>
            )
          })}
        </ThumbGroup>
      </div>
    </div>
  )
}
