"use client"

import { useId, type CSSProperties } from "react"

import { AnimatedContainer, Container } from "@/components/containers"
import { DETAIL_MIN_SIZE, Graduations, Highlight } from "@/components/containers/parts"
import { containerFormFor } from "@/lib/containers/form"
import { VIAL_FILL_BOTTOM, VIAL_FILL_TOP } from "@/lib/containers/geometry"
import { cn } from "@/lib/utils"

/** The vial artwork's viewBox (`components/containers/Vial.tsx`). */
const VIEW_W = 60
const VIEW_H = 96

/**
 * The powder cake at the foot of an unmixed vial, in the vial's own viewBox:
 * the final check's dry vial (`bVial(…, "dry")` in `r6/page.js`), a quarter of
 * the glass deep, its top gently uneven.
 */
const CAKE_TOP =
  Math.round((VIAL_FILL_BOTTOM - Math.max(8, (VIAL_FILL_BOTTOM - VIAL_FILL_TOP) * 0.24)) * 100) / 100
const at = (dy: number) => Math.round((CAKE_TOP + dy) * 100) / 100
const CAKE_PATH =
  `M16.5 ${CAKE_TOP}` +
  ` Q22 ${at(-2.6)} 30 ${at(-1)}` +
  ` Q38 ${at(0.6)} 43.5 ${at(-1.6)}` +
  ` L43.5 ${VIAL_FILL_BOTTOM} L16.5 ${VIAL_FILL_BOTTOM} Z`

/**
 * A compound's container as STOCK draws it: the approved container, and, for
 * a powder vial still unmixed, its powder (W17, ruling 4: "the vial starts
 * with its powder, then the water goes in").
 *
 * The set-B vial has no dry state of its own, so the cake is drawn over it, in
 * the same viewBox and to the same scale, with the glass's graduations and
 * glint drawn again over the cake alone, as the reference draws them on top.
 * Only a vial gets a cake: nothing else is mixed.
 *
 * `powder` shows or hides the cake. Where the level moves (`animate`, the Mix
 * sheet) it fades (opacity only), so the powder dissolves as the water rises
 * and comes back if the level drains; with reduced motion the fade is short.
 *
 * `animate` eases the level through `AnimatedContainer`; `durationMs` is its
 * time, and the cake's fade matches it.
 */
export function StockContainer({
  name,
  category,
  inventoryType,
  fill,
  size,
  powder = false,
  animate = false,
  durationMs,
  className,
}: {
  name?: string | null
  category?: string | null
  inventoryType?: string | null
  fill?: number
  size: number
  powder?: boolean
  animate?: boolean
  durationMs?: number
  className?: string
}) {
  const clip = `cake-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  const isVial = containerFormFor({ inventoryType, category, name }) === "vial"
  const drawn = animate ? (
    <AnimatedContainer
      name={name}
      category={category}
      inventoryType={inventoryType}
      fill={fill}
      size={size}
      durationMs={durationMs}
    />
  ) : (
    <Container name={name} category={category} inventoryType={inventoryType} fill={fill} size={size} />
  )
  // The cake is drawn only where it can show: a dry vial, or one whose level
  // moves (the Mix sheet), where it fades as the water rises.
  if (!isVial || !(powder || animate)) {
    return <span className={cn("inline-flex shrink-0", className)}>{drawn}</span>
  }

  const fadeMs = durationMs ?? 600
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {drawn}
      <svg
        aria-hidden
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width={(size * VIEW_W) / VIEW_H}
        height={size}
        className="pointer-events-none absolute top-0 left-0 transition-opacity duration-[var(--cake-ms)] ease-motion motion-reduce:duration-150"
        style={{ opacity: powder ? 1 : 0, "--cake-ms": `${fadeMs}ms` } as CSSProperties}
      >
        <defs>
          {/* The liquid's own bounds, so the cake's foot is rounded as the
              liquid's is. */}
          <clipPath id={`${clip}-glass`}>
            <rect x="16.5" y={VIAL_FILL_TOP} width="27" height={VIAL_FILL_BOTTOM - VIAL_FILL_TOP} rx="3.5" />
          </clipPath>
          <clipPath id={`${clip}-cake`}>
            <path d={CAKE_PATH} />
          </clipPath>
        </defs>
        <path
          d={CAKE_PATH}
          style={{ fill: "var(--container-solid)" }}
          opacity={0.9}
          clipPath={`url(#${clip}-glass)`}
        />
        {/* The glass's marks, again, over the cake alone. */}
        <g clipPath={`url(#${clip}-cake)`}>
          {size >= DETAIL_MIN_SIZE && <Graduations right={44} top={22} bottom={86} count={7} />}
          <Highlight x={18} y={22} height={59} />
        </g>
      </svg>
    </span>
  )
}
