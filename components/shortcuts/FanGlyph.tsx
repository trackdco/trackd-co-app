"use client"

import { useId } from "react"

import { SolidIcon } from "@/components/feel/SolidIcon"
import { GLYPHS, type GlyphName, type GlyphPart } from "@/lib/solidGlyphs"
import { cn } from "@/lib/utils"

/**
 * A fan item's mark (W45). Plain, it is the Solid mark in the button gradient.
 * Lit (the item under the finger, drawn white), it is the same glyph inverted:
 * dark on white, a step lighter at the foot, as the final check draws it
 * (`plus7.js`, `pIcon7(…, on)`; its base over its raised, in the Deeper black
 * palette's tokens). The two sit on top of each other and cross-fade in step
 * with the square's own 90ms turn to white.
 *
 * `data-fan-glyph` is what the wiggle animates, so both marks move together.
 */
export function FanGlyph({ name, hot, size = 20 }: { name: GlyphName; hot: boolean; size?: number }) {
  return (
    <span data-fan-glyph className="relative grid place-items-center">
      <SolidIcon
        name={name}
        size={size}
        className={cn("transition-opacity duration-[90ms] ease-out", hot && "opacity-0")}
      />
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 grid place-items-center transition-opacity duration-[90ms] ease-out",
          !hot && "opacity-0",
        )}
      >
        <InvertedGlyph name={name} size={size} />
      </span>
    </span>
  )
}

function InvertedGlyph({ name, size }: { name: GlyphName; size: number }) {
  const id = useId().replace(/:/g, "")
  const paint = `url(#fi${id})`
  const parts: readonly GlyphPart[] = GLYPHS[name]
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flex: "0 0 auto" }}>
      <defs>
        <linearGradient id={`fi${id}`} gradientUnits="userSpaceOnUse" x1="0" y1="2" x2="0" y2="22">
          <stop offset="0" style={{ stopColor: "var(--bg-base)" }} />
          <stop offset="1" style={{ stopColor: "var(--bg-surface-raised)" }} />
        </linearGradient>
      </defs>
      {parts.map((p, i) =>
        p.s ? (
          <path
            key={i}
            d={p.s}
            fill="none"
            stroke={paint}
            strokeWidth={p.w ?? 2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={p.o}
          />
        ) : (
          <path key={i} d={p.d} fill={paint} fillRule="evenodd" fillOpacity={p.o} transform={p.t} />
        ),
      )}
    </svg>
  )
}
