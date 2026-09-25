"use client"

import { useId } from "react"

import {
  AXIS_Y,
  BARREL_H,
  BARREL_R,
  BARREL_TAIL,
  BARREL_W,
  BARREL_X,
  BARREL_Y,
  FLANGE_W,
  FLANGE_X,
  LABEL_SIZE,
  LABEL_Y,
  STOPPER_W,
  SYRINGE_SIZES,
  THUMB_W,
  THUMB_X,
  TICK_MAJOR,
  TICK_MINOR,
  VIEW_H,
  VIEW_W,
  barrelX,
  graduations,
  plungerOffset,
  type SyringeSize,
} from "@/lib/calculator/syringe"

/** The glass runs past the capacity mark to the flange. */
const GLASS_W = BARREL_W + BARREL_TAIL
/** Where the needle meets the hub; the hub widens from here to the barrel. */
const HUB_X = BARREL_X - 12
const ROD_H = 7
const FLANGE_H = BARREL_H + 18
const THUMB_H = BARREL_H + 4

/** The needle: a bevelled tip, then a straight shaft into the hub. */
const NEEDLE_D = `M2 ${AXIS_Y + 1.1}L12 ${AXIS_Y - 1.1}H${HUB_X + 1}V${AXIS_Y + 1.1}Z`
/** The hub: a short cone from the needle to the barrel's mouth. */
const HUB_D = `M${HUB_X} ${AXIS_Y - 5.5}L${BARREL_X} ${AXIS_Y - 10}V${AXIS_Y + 10}L${HUB_X} ${AXIS_Y + 5.5}Z`

/**
 * One barrel's printed scale: the engraved ticks on the glass and the numbers
 * under it. All three are drawn and the selected one is shown, so switching
 * sizes is a plain opacity cross-fade (`.transition-syringe-scale`) that can be
 * interrupted mid-way, with no timers or unmount bookkeeping.
 *
 * Each tick is ENGRAVED: a dark cut with a thin lit edge 0.8 to its right. The
 * cut reads over the amber, the lit edge over the empty glass, so one layer
 * serves the whole barrel. The 0 tick is not drawn: the barrel's end is the
 * zero line, and a tick there would sit on the rounded corner.
 */
function Scale({
  size,
  shown,
  clipId,
}: {
  size: SyringeSize
  shown: boolean
  clipId: string
}) {
  const ticks = graduations(size)
  let cut = ""
  let lit = ""
  for (const t of ticks) {
    if (t.units === 0) continue
    const x = barrelX(t.fraction)
    const len = t.labelled ? TICK_MAJOR : TICK_MINOR
    cut += `M${x.toFixed(2)} ${BARREL_Y}V${BARREL_Y + len}`
    lit += `M${(x + 0.8).toFixed(2)} ${BARREL_Y + 0.5}V${BARREL_Y + len - 1}`
  }

  return (
    <g className="transition-syringe-scale" style={{ opacity: shown ? 1 : 0 }}>
      <g clipPath={`url(#${clipId})`} fill="none">
        <path d={cut} strokeWidth={1} style={{ stroke: "var(--syringe-tick)" }} />
        <path
          d={lit}
          strokeWidth={0.6}
          style={{ stroke: "var(--syringe-tick-lit)" }}
        />
      </g>
      <g
        fontSize={LABEL_SIZE}
        textAnchor="middle"
        className="font-mono tabular-nums"
        style={{ fill: "var(--text-muted)" }}
      >
        {ticks
          .filter((t) => t.labelled)
          .map((t) => (
            <text key={t.units} x={barrelX(t.fraction)} y={LABEL_Y}>
              {t.units}
            </text>
          ))}
      </g>
    </g>
  )
}

/** A vertical gradient between two tokens, top to bottom of whatever uses it. */
function Fall({ id, top, bottom }: { id: string; top: string; bottom: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style={{ stopColor: `var(${top})` }} />
      <stop offset="1" style={{ stopColor: `var(${bottom})` }} />
    </linearGradient>
  )
}

/**
 * The syringe (spec 07, redrawn in the Instrument look, build-brief-final
 * §3.13). A number in a text field is easy to misread; a filled barrel that
 * matches the syringe in your hand is not.
 *
 * The barrel fills from the NEEDLE end, and its length is a fraction of the
 * SELECTED capacity — so the same ten units fill a fifth of a 0.5 mL barrel and
 * a tenth of a 1 mL one. That proportionality is the whole reason the graphic
 * exists, so the fraction, the scale and the plunger's travel all come from
 * `lib/calculator/syringe` (pure, tested) and nothing here re-derives them.
 *
 * The plunger (stopper, rod and thumb rest) is one rigid part that travels
 * with the draw, 1:1. The viewBox reserves its full travel, so the graphic's
 * box is the same size at every draw and nothing around it moves.
 *
 * Motion is transforms and opacity only. The fill is a full-length rect scaled
 * on X from the needle end, not a rect whose `width` changes: `transform` runs
 * on the compositor and cannot leave a half-drawn corner mid-transition (the
 * glass's clip path does the corner work). The stopper and the rod group
 * translate by the same offset on the same clock, so the draw's edge and the
 * stopper's face never part. Switching sizes eases the fill to its new fraction
 * while the printed scale cross-fades (§3.13); nothing is keyed by size, so
 * there is no remount and the ease has a previous value to leave from. The
 * transitions live in globals.css (`.transition-syringe-*`) with their
 * reduced-motion opt-out: an inline `transition` would outrank it.
 *
 * Flat plus depth: one gradient in the contents (the amber), one highlight on
 * the glass, a quiet top-to-bottom fall on each grey part. Colours are the
 * `--syringe-*` tokens.
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
  // Unique per instance: two graphics on one page must not share their defs.
  const uid = useId()
  const glassId = `${uid}-glass`
  const amberId = `${uid}-amber`
  const partId = `${uid}-part`
  const rodId = `${uid}-rod`

  const offset = plungerOffset(fill)
  const travel = `translateX(${offset.toFixed(2)}px)`

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="w-full"
      role="img"
      aria-label={label}
    >
      <defs>
        <clipPath id={glassId}>
          <rect
            x={BARREL_X}
            y={BARREL_Y}
            width={GLASS_W}
            height={BARREL_H}
            rx={BARREL_R}
          />
        </clipPath>
        <Fall id={amberId} top="--syringe-fill-top" bottom="--syringe-fill-bottom" />
        <Fall id={partId} top="--syringe-part-top" bottom="--syringe-part-bottom" />
        <Fall id={rodId} top="--syringe-rod-top" bottom="--syringe-rod-bottom" />
      </defs>

      {/* Needle and hub. */}
      <path d={NEEDLE_D} style={{ fill: "var(--syringe-needle)" }} />
      <path d={HUB_D} fill={`url(#${partId})`} />

      {/* The glass: clear, a faint light over the ground rather than a grey. */}
      <rect
        x={BARREL_X}
        y={BARREL_Y}
        width={GLASS_W}
        height={BARREL_H}
        rx={BARREL_R}
        style={{ fill: "var(--syringe-glass)" }}
      />

      {/* The draw and the stopper, clipped to the glass's rounded ends. */}
      <g clipPath={`url(#${glassId})`}>
        <rect
          x={BARREL_X}
          y={BARREL_Y}
          width={BARREL_W}
          height={BARREL_H}
          fill={`url(#${amberId})`}
          className="transition-syringe-fill"
          style={{ transform: `scaleX(${offset / BARREL_W})` }}
        />
        <rect
          x={BARREL_X}
          y={BARREL_Y}
          width={STOPPER_W}
          height={BARREL_H}
          rx={2}
          className="transition-syringe-plunger"
          style={{ transform: travel, fill: "var(--syringe-stopper)" }}
        />
      </g>

      {/* The rod, from the stopper's back out through the flange, and the
          thumb rest. Seen through the glass inside the barrel. */}
      <g className="transition-syringe-plunger" style={{ transform: travel }}>
        <rect
          x={BARREL_X + STOPPER_W - 0.5}
          y={AXIS_Y - ROD_H / 2}
          width={THUMB_X - BARREL_X - STOPPER_W + 1}
          height={ROD_H}
          fill={`url(#${rodId})`}
        />
        <rect
          x={THUMB_X}
          y={AXIS_Y - THUMB_H / 2}
          width={THUMB_W}
          height={THUMB_H}
          rx={2}
          fill={`url(#${partId})`}
        />
      </g>

      {/* The glass's one highlight. */}
      <rect
        x={BARREL_X + 4}
        y={BARREL_Y + 3}
        width={GLASS_W - 8}
        height={2.4}
        rx={1.2}
        style={{ fill: "var(--syringe-glint)" }}
      />

      {/* The printed scales, one per size; the selected one is shown. */}
      {SYRINGE_SIZES.map((s) => (
        <Scale
          key={s.id}
          size={s.id === size.id ? size : s}
          shown={s.id === size.id}
          clipId={glassId}
        />
      ))}

      {/* The glass's edge, over everything inside it. */}
      <rect
        x={BARREL_X}
        y={BARREL_Y}
        width={GLASS_W}
        height={BARREL_H}
        rx={BARREL_R}
        fill="none"
        strokeWidth={1}
        style={{ stroke: "var(--syringe-edge)" }}
      />

      {/* The finger flange, over the rod that passes through it. */}
      <rect
        x={FLANGE_X}
        y={AXIS_Y - FLANGE_H / 2}
        width={FLANGE_W}
        height={FLANGE_H}
        rx={1.5}
        fill={`url(#${partId})`}
      />
    </svg>
  )
}
