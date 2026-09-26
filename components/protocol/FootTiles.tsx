"use client"

import Link from "next/link"

import { SolidIcon } from "@/components/feel/SolidIcon"
import { ExplainerButton, type ExplainerTopic } from "@/components/protocol/Explainer"
import type { GlyphName } from "@/lib/solidGlyphs"
import { cn } from "@/lib/utils"
import { HIT_20, PRESS } from "@/lib/ui-presets"

/**
 * Protocol's foot (build-brief-final §3.7): Stacks, Cycles and Half-life, each
 * pushing its own page. The marks are Solid, in their colours (round three,
 * `PMK8`): three stacked bars, a seven-part ring (five on, two off), the curve.
 *
 * Stacked, one full-width button each (Adrian's walk of the preview, W50: side
 * by side, the page read too small). Each carries a small "?" that opens the
 * same explainer as its page title's. It sits at the button's trailing edge,
 * where a row's info button goes: the leading edge holds the mark, and there
 * the "?" has its whole 44-point reach clear of the words. On a laptop the
 * three sit side by side again, since a 900px-wide button reads as a banner.
 */
const TILES: { slug: ExplainerTopic; label: string; glyph: GlyphName; hue: string }[] = [
  { slug: "stacks", label: "Stacks", glyph: "tileStacks", hue: "var(--blend-1)" },
  { slug: "cycles", label: "Cycles", glyph: "tileCycles", hue: "var(--blend-3)" },
  { slug: "half-life", label: "Half-life", glyph: "halfLife", hue: "var(--chart-line)" },
]

export function FootTiles({ base = "/protocol" }: { base?: string }) {
  return (
    <nav aria-label="Stacks, cycles and half-life" className="flex flex-col gap-2 desktop:grid desktop:grid-cols-3">
      {TILES.map((t) => (
        // The press is the WRAPPER's, so the "?" moves with its button; the
        // "?" presses on its own.
        <div key={t.slug} className={cn(PRESS.card, "relative")}>
          <Link
            href={`${base}/${t.slug}`}
            className="inst-card flex min-h-[68px] items-center gap-3.5 pr-14 pl-4 text-[16px] text-foreground"
          >
            <SolidIcon name={t.glyph} size={34} hue={t.hue} />
            {t.label}
          </Link>
          <ExplainerButton
            topic={t.slug}
            className={cn(HIT_20, "absolute top-1/2 right-4 h-5 w-5 -translate-y-1/2 text-[11px]")}
          />
        </div>
      ))}
    </nav>
  )
}
