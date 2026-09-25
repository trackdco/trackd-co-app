"use client"

import { ThumbGroup } from "@/components/feel/SlidingThumb"
import { SolidIcon } from "@/components/feel/SolidIcon"
import { CATEGORY_META, type CompoundCategory } from "@/lib/compound-categories"
import { CATEGORY_GLYPH } from "@/lib/solidGlyphs"
import { PRESS } from "@/lib/ui-presets"
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
    <ThumbGroup
      selection={value}
      thumbClassName="inst-thumb"
      role="group"
      aria-label="Type"
      className={cn("type-rail flex gap-0.5 overflow-x-auto inst-rail p-[3px]", className)}
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
  )
}
