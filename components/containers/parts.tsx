import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { ContainerShades } from "@/lib/containers/colour";

/**
 * The pieces set B builds every container from (build-brief-final §3.14): the
 * glass, the one gradient in the contents, the one highlight, graduations, and
 * the two caps. Internal to `components/containers`; not in the barrel.
 *
 * Colours are applied through `style`, never presentation attributes, because
 * `var()` and `color-mix()` are not reliable in an SVG attribute.
 */

/** The container greys and solids, from the `--container-*` tokens. */
export const INK = {
  glass: "var(--container-glass)",
  edge: "var(--container-edge)",
  rule: "var(--container-rule)",
  raised: "var(--container-raised)",
  collar: "var(--container-collar)",
  solid: "var(--container-solid)",
  solidShade: "var(--container-solid-shade)",
  /** Highlights and graduations: white at an opacity. */
  white: "var(--accent-primary)",
} as const;

/**
 * Below this rendered height the fine detail (graduations, powder grain, the
 * glint on each tablet) is under a pixel and only muddies the shape, so it is
 * left out, as the final check drew them.
 */
export const DETAIL_MIN_SIZE = 30;

export function ContainerSvg({
  viewWidth,
  viewHeight,
  size,
  className,
  title,
  children,
}: {
  viewWidth: number;
  viewHeight: number;
  size: number;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      width={(size * viewWidth) / viewHeight}
      height={size}
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {children}
    </svg>
  );
}

/** A gradient id of this container's own: a screen holds many containers, and a
 *  shared id would paint every one in the first one's colour. */
export function useGradientId(): string {
  return `cg-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/** The one gradient in the contents: lifted at the top, the colour at the foot. */
export function ContentsGradient({
  id,
  top,
  bottom,
}: {
  id: string;
  top: string;
  bottom: string;
}) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={{ stopColor: top }} />
        <stop offset="1" style={{ stopColor: bottom }} />
      </linearGradient>
    </defs>
  );
}

/** The one highlight: a soft glint down the left of the glass. */
export function Highlight({
  x,
  y,
  height,
  width = 3.5,
  opacity = 0.1,
}: {
  x: number;
  y: number;
  height: number;
  width?: number;
  opacity?: number;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={width / 2}
      style={{ fill: INK.white }}
      opacity={opacity}
    />
  );
}

/** Graduations up the right wall of a measured container, long and short in
 *  turn. One path, so a vial costs one element for all of them. */
export function Graduations({
  right,
  top,
  bottom,
  count,
}: {
  right: number;
  top: number;
  bottom: number;
  count: number;
}) {
  const step = (bottom - top) / (count + 1);
  let d = "";
  for (let i = 1; i <= count; i++) {
    const y = (bottom - step * i).toFixed(1);
    d += `M${right} ${y}H${right - (i % 2 ? 7 : 4.5)}`;
  }
  return (
    <path d={d} fill="none" style={{ stroke: INK.white }} strokeOpacity={0.3} strokeWidth={1} />
  );
}

/**
 * A crimped FLIP-OFF cap: a sealed vial, drawn through its stopper. The disc on
 * top is the compound's colour. Sits on the body at `top`.
 */
export function FlipCap({
  cx,
  top,
  width,
  colour,
}: {
  cx: number;
  top: number;
  width: number;
  colour: string;
}) {
  const x = cx - width / 2;
  return (
    <>
      <rect x={x} y={top - 11} width={width} height={7} rx={1.8} style={{ fill: INK.edge }} />
      <ellipse
        cx={cx}
        cy={top - 11}
        rx={width * 0.34}
        ry={width * 0.1}
        style={{ fill: colour }}
      />
      <rect
        x={x + 1.5}
        y={top - 4.5}
        width={width - 3}
        height={5}
        rx={1.4}
        style={{ fill: INK.rule }}
      />
    </>
  );
}

/**
 * A ribbed SCREW cap: a container that opens. Its top band is the compound's
 * colour. Drawn after the body so it sits in front of it, which is how a lid
 * sits; `top` is its lower edge.
 */
export function ScrewCap({
  cx,
  top,
  width,
  height,
  colour,
  shades,
}: {
  cx: number;
  top: number;
  width: number;
  height: number;
  colour: string;
  shades: ContainerShades;
}) {
  const x = cx - width / 2;
  const y = top - height;
  const n = Math.max(8, Math.round(width / 3.2));
  let ribs = "";
  for (let i = 1; i < n; i++) {
    const rx = (x + (width / n) * i).toFixed(1);
    ribs += `M${rx} ${y + 2.5}V${top - 1.5}`;
  }
  return (
    <>
      <rect x={x} y={y} width={width} height={height} rx={2.6} style={{ fill: shades.capBody }} />
      <path d={ribs} fill="none" style={{ stroke: "black" }} strokeOpacity={0.26} strokeWidth={0.8} />
      <rect x={x} y={y} width={width} height={3.2} rx={1.6} style={{ fill: colour }} />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={2.6}
        fill="none"
        style={{ stroke: shades.capEdge }}
        strokeWidth={1}
      />
      <rect
        x={x + 2}
        y={top - 1.5}
        width={width - 4}
        height={3.5}
        rx={1}
        style={{ fill: INK.rule }}
      />
    </>
  );
}
