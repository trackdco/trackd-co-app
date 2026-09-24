"use client"

import Link from "next/link"
import { useId, type ReactNode } from "react"

import { cn } from "@/lib/utils"
import { PRESS } from "@/lib/ui-presets"

/**
 * Protocol's foot (Adrian, 2026-09-24): three B2 tall grey tiles, the GLASS icon
 * carrying the colour (Sorbet: Stacks blue, Cycles pink, Stock gold). Each one
 * pushes its own page. The icons draw every vial from ONE vial at one size on
 * one baseline, so the loop's vial is the rack's vial and the levels' vial.
 * Ported from the foot-icon preview's `V`, `rackI`, `loopI` and `levelsI`.
 */

/** One glass vial on the 40-unit grid: clear body, coloured liquid, grey cap. */
function Vial({ x, level, grad, base = 34 }: { x: number; level: number; grad: string; base?: number }) {
  const w = 8
  const h = 22
  const y = base - h
  const cap = 3.2
  const by = y + cap + 1
  const bh = h - cap - 1
  const lh = Math.max(0, (bh - 1.6) * level)
  return (
    <g>
      <rect x={x + 1.4} y={y} width={w - 2.8} height={cap} rx={1.1} fill="var(--text-muted)" />
      <rect
        x={x}
        y={by}
        width={w}
        height={bh}
        rx={2.2}
        fill="color-mix(in srgb, var(--text-primary) 7%, transparent)"
        stroke="color-mix(in srgb, var(--text-primary) 36%, transparent)"
        strokeWidth={0.9}
      />
      {lh > 0 && <rect x={x + 0.9} y={by + bh - 0.8 - lh} width={w - 1.8} height={lh} rx={1.6} fill={`url(#${grad})`} />}
    </g>
  )
}

function Icon({ hue, size, children }: { hue: string; size: number; children: (grad: string) => ReactNode }) {
  const grad = `ft${useId().replace(/:/g, "")}`
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={`color-mix(in srgb, ${hue} 74%, var(--accent-primary))`} />
          <stop offset="1" stopColor={hue} />
        </linearGradient>
      </defs>
      {children(grad)}
    </svg>
  )
}

/** Stacks: a rack of three vials. */
export function RackIcon({ size = 46 }: { size?: number }) {
  const hue = "var(--blend-1)"
  return (
    <Icon hue={hue} size={size}>
      {(g) => (
        <>
          <Vial x={7} level={0.6} grad={g} />
          <Vial x={16} level={0.6} grad={g} />
          <Vial x={25} level={0.6} grad={g} />
          <rect x={3} y={28} width={34} height={8} rx={2.5} fill={`url(#${g})`} />
        </>
      )}
    </Icon>
  )
}

/** Cycles: a vial in a loop of seven arcs, five lit. */
export function LoopIcon({ size = 46 }: { size?: number }) {
  const hue = "var(--blend-3)"
  const r = 16.5
  const C = 2 * Math.PI * r
  const seg = C / 7
  return (
    <Icon hue={hue} size={size}>
      {(g) => (
        <>
          {Array.from({ length: 7 }, (_, i) => (
            <circle
              key={i}
              cx={20}
              cy={20}
              r={r}
              fill="none"
              stroke={i < 5 ? `url(#${g})` : hue}
              strokeOpacity={i < 5 ? 1 : 0.3}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeDasharray={`${(seg - 3.4).toFixed(2)} ${(C - seg + 3.4).toFixed(2)}`}
              strokeDashoffset={(-i * seg).toFixed(2)}
              transform="rotate(-90 20 20)"
            />
          ))}
          <Vial x={16} level={0.6} grad={g} base={31} />
        </>
      )}
    </Icon>
  )
}

/** Stock: three vials at different levels. */
export function LevelsIcon({ size = 46 }: { size?: number }) {
  return (
    <Icon hue="var(--blend-2)" size={size}>
      {(g) => (
        <>
          <Vial x={7} level={0.9} grad={g} />
          <Vial x={16} level={0.5} grad={g} />
          <Vial x={25} level={0.18} grad={g} />
        </>
      )}
    </Icon>
  )
}

/**
 * The three tiles. `base` is where the pages live: `/protocol` in the app, the
 * preview's own path on `/preview/protocol`.
 */
export function FootTiles({ base = "/protocol" }: { base?: string }) {
  const tiles: { href: string; label: string; icon: ReactNode }[] = [
    { href: `${base}/stacks`, label: "Stacks", icon: <RackIcon /> },
    { href: `${base}/cycles`, label: "Cycles", icon: <LoopIcon /> },
    { href: `${base}/stock`, label: "Stock", icon: <LevelsIcon /> },
  ]
  return (
    <nav aria-label="Stacks, cycles and stock" className="grid grid-cols-3 gap-2">
      {tiles.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          className={cn(
            PRESS.card,
            "flow-card flex min-h-[128px] flex-col items-center justify-between gap-4 rounded-[22px] bg-bg-surface px-1.5 pt-[22px] pb-4 text-xs text-foreground",
          )}
        >
          {t.icon}
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
