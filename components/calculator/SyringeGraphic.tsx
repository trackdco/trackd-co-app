"use client"

import { useId } from "react"

import {
  AXIS_Y,
  BARREL_H,
  BARREL_R,
  BARREL_W,
  BARREL_X,
  BARREL_Y,
  LABEL_SIZE,
  LABEL_Y,
  TICK_ANCHOR,
  TICK_MAJOR,
  TICK_MINOR,
  VIEW_H,
  VIEW_W,
  barrelX,
  graduations,
  type SyringeSize,
} from "@/lib/calculator/syringe"

/** The needle, hub, flange, rod and thumb rest. Fixed geometry, shared by the
 *  real syringe and the ghost, so the two are the same object in two states. */
function Chrome() {
  return (
    <g fill="var(--bg-surface-raised)">
      <path
        d={`M4 ${AXIS_Y + 1} L10 ${AXIS_Y - 1} L46 ${AXIS_Y - 1} L46 ${AXIS_Y + 1} Z`}
        fill="var(--border-strong)"
      />
      <path
        d={`M46 ${AXIS_Y - 4} L62 ${AXIS_Y - 9} L62 ${AXIS_Y + 9} L46 ${AXIS_Y + 4} Z`}
      />
      <rect
        x={BARREL_X + BARREL_W}
        y={AXIS_Y - 22}
        width={6}
        height={44}
        rx={1.5}
      />
      <rect x={BARREL_X + BARREL_W + 6} y={AXIS_Y - 3} width={32} height={6} />
      <rect
        x={BARREL_X + BARREL_W + 38}
        y={AXIS_Y - 16}
        width={8}
        height={32}
        rx={2}
      />
    </g>
  )
}

/**
 * The syringe (spec 07). A number in a text field is easy to misread; a filled
 * barrel that matches the syringe in your hand is not.
 *
 * The barrel fills from the NEEDLE end, and its length is a fraction of the
 * SELECTED capacity — so the same ten units fill a fifth of a 0.5 mL barrel and
 * a tenth of a 1 mL one. That proportionality is the whole reason the graphic
 * exists, so the fraction and the scale both come from `lib/calculator/syringe`
 * (pure, tested) and nothing here re-derives them.
 *
 * The fill is a full-width rect scaled on its X axis rather than a rect whose
 * `width` changes: `transform` animates on the compositor and, unlike an
 * animated `width`, cannot leave a half-drawn rounded corner mid-transition. The
 * rounded barrel does the corner work via a clip path instead.
 *
 * Gradation ticks are drawn in `--bg-base`, the one colour that reads against
 * BOTH the amber fill and the empty barrel, so a single tick layer serves the
 * whole scale. The printed numbers sit below the barrel in `--text-muted` where
 * nothing can wash them out.
 */
export function SyringeGraphic({
  size,
  fill,
  label,
}: {
  size: SyringeSize
  /** 0…1 of the barrel, already clamped by `fillFraction`. */
  fill: number
  /** Spoken description of the draw, for anyone not looking at the picture. */
  label: string
}) {
  // Unique per instance: two graphics on one page must not share a clip path.
  const clipId = useId()
  const ticks = graduations(size)

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="w-full"
      role="img"
      aria-label={label}
    >
      <defs>
        <clipPath id={clipId}>
          <rect
            x={BARREL_X}
            y={BARREL_Y}
            width={BARREL_W}
            height={BARREL_H}
            rx={BARREL_R}
          />
        </clipPath>
      </defs>

      {/* Barrel wall. */}
      <rect
        x={BARREL_X}
        y={BARREL_Y}
        width={BARREL_W}
        height={BARREL_H}
        rx={BARREL_R}
        fill="var(--bg-input)"
      />

      {/* The draw. Scaled from the needle end, clipped to the barrel's radius. */}
      <g clipPath={`url(#${clipId})`}>
        <rect
          x={BARREL_X}
          y={BARREL_Y}
          width={BARREL_W}
          height={BARREL_H}
          fill="var(--accent-amber)"
          // The transition, transform-box and transform-origin all live in
          // `.transition-syringe-fill` (globals.css). Only the live scale factor
          // is inline: an inline `transition` would outrank the reduced-motion
          // opt-out, which is a rule that fails silently.
          className="transition-syringe-fill"
          style={{ transform: `scaleX(${fill})` }}
        />
      </g>

      {/* Gradations. Inside the barrel from the top edge, so they read over the
          fill; labelled ones get a longer tick plus an anchor below the wall
          tying the printed number to its mark. */}
      <g stroke="var(--bg-base)" strokeWidth={1}>
        {ticks.map((t) => {
          const x = barrelX(t.fraction)
          return (
            <line
              key={t.units}
              x1={x}
              y1={BARREL_Y}
              x2={x}
              y2={BARREL_Y + (t.labelled ? TICK_MAJOR : TICK_MINOR)}
            />
          )
        })}
      </g>

      {/* Barrel outline, drawn last so the fill and ticks sit inside it. */}
      <rect
        x={BARREL_X}
        y={BARREL_Y}
        width={BARREL_W}
        height={BARREL_H}
        rx={BARREL_R}
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth={1}
      />

      {/* Needle, hub, flange, rod and thumb rest — fixed geometry. The graphic
          is a gauge, not a simulation: a plunger that travelled with the fill
          would double the syringe's drawn length between empty and full. */}
      <Chrome />

      {/* Printed numbers. */}
      <g
        fill="var(--text-muted)"
        fontSize={LABEL_SIZE}
        textAnchor="middle"
        className="font-mono"
      >
        {ticks
          .filter((t) => t.labelled)
          .map((t) => {
            const x = barrelX(t.fraction)
            return (
              <g key={t.units}>
                <line
                  x1={x}
                  y1={BARREL_Y + BARREL_H}
                  x2={x}
                  y2={BARREL_Y + BARREL_H + TICK_ANCHOR}
                  stroke="var(--text-subtle)"
                  strokeWidth={1}
                />
                <text x={x} y={LABEL_Y}>
                  {t.units}
                </text>
              </g>
            )
          })}
      </g>
    </svg>
  )
}
