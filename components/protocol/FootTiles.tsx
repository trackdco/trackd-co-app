"use client"

import Link from "next/link"

import { SolidIcon } from "@/components/feel/SolidIcon"
import type { GlyphName } from "@/lib/solidGlyphs"
import { cn } from "@/lib/utils"
import { PRESS } from "@/lib/ui-presets"

/**
 * Protocol's foot (build-brief-final §3.7): THREE tall tiles, Stacks, Cycles
 * and Half-life, each pushing its own page. Stock is no longer a tile: it lives
 * on the compounds row and in each compound's sheet. The marks are Solid, in
 * their colours (round three, `PMK8`): three stacked bars, a seven-part ring
 * (five on, two off), the curve.
 */
const TILES: { slug: string; label: string; glyph: GlyphName; hue: string }[] = [
  { slug: "stacks", label: "Stacks", glyph: "tileStacks", hue: "var(--blend-1)" },
  { slug: "cycles", label: "Cycles", glyph: "tileCycles", hue: "var(--blend-3)" },
  { slug: "half-life", label: "Half-life", glyph: "halfLife", hue: "var(--chart-line)" },
]

export function FootTiles({ base = "/protocol" }: { base?: string }) {
  return (
    <nav aria-label="Stacks, cycles and half-life" className="grid grid-cols-3 gap-2">
      {TILES.map((t) => (
        <Link
          key={t.slug}
          href={`${base}/${t.slug}`}
          className={cn(
            PRESS.card,
            "inst-card flex min-h-[128px] flex-col items-center justify-between gap-4 px-1.5 pt-[24px] pb-4 text-[13px] text-foreground",
          )}
        >
          <SolidIcon name={t.glyph} size={36} hue={t.hue} />
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
