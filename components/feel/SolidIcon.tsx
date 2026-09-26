import { useId } from "react"

import { GLYPHS, type GlyphName, type GlyphPart } from "@/lib/solidGlyphs"

/**
 * A SOLID mark (build-brief-final §3.2, §3.6): one filled glyph on a 24 grid
 * with a vertical gradient, lighter at the top. The look's icon style, used for
 * the nav, the dose row's and journal's tiles, button icons, Protocol's tiles
 * and the half-life mark.
 *
 * - `tone="on"`: the button gradient (active nav, a tile's icon, a button icon).
 * - `tone="off"`: the same shape a step down (inactive nav).
 * - `hue`: a colour (`var(--cat-peptide)`), lifted 30% toward white at the top.
 *   Category and tile marks keep their colour; everything else is monochrome.
 *
 * Decorative by default; pass `title` when the icon is the only label.
 */
export function SolidIcon({
  name,
  size = 20,
  tone = "on",
  hue,
  title,
  className,
}: {
  name: GlyphName
  size?: number
  tone?: "on" | "off"
  hue?: string
  title?: string
  className?: string
}) {
  // Whatever React's id format ("«r1»", ":r1:"), keep only characters that
  // are safe in `url(#…)` everywhere, as the containers do.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const top = hue
    ? `color-mix(in srgb, ${hue} 70%, white)`
    : tone === "on"
      ? "var(--glyph-on-top)"
      : "var(--glyph-off-top)"
  const bottom = hue ?? (tone === "on" ? "var(--glyph-on-bottom)" : "var(--glyph-off-bottom)")
  const paint = `url(#g${id})`
  const parts: readonly GlyphPart[] = GLYPHS[name]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ flex: "0 0 auto" }}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id={`g${id}`} gradientUnits="userSpaceOnUse" x1="0" y1="2" x2="0" y2="22">
          <stop offset="0" style={{ stopColor: top }} />
          <stop offset="1" style={{ stopColor: bottom }} />
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
          <path
            key={i}
            d={p.d}
            fill={paint}
            fillRule="evenodd"
            fillOpacity={p.o}
            transform={p.t}
          />
        ),
      )}
    </svg>
  )
}
