import { cn } from "@/lib/utils";
import { lightenContainerColour } from "@/lib/containers/colour";
import { clampFill, ILLUSTRATIVE_FILL } from "@/lib/containers/geometry";
import { DEFAULT_CONTAINER_SIZE, type ContainerProps } from "./types";

const VIEW_W = 64;
const VIEW_H = 100;

/**
 * The powder container — a wide creatine-style body with an oversized screw lid.
 *
 * **There is no powder stock tracking yet**, so the contents sit at a fixed
 * illustrative level and the surrounding card must suppress any percentage bar,
 * doses-remaining figure or runs-dry date. `fill` rides the same interface as
 * the vial so this goes live unchanged when powder counts arrive.
 */
export function Tub({
  colour,
  fill = ILLUSTRATIVE_FILL,
  size = DEFAULT_CONTAINER_SIZE,
  className,
  title,
}: ContainerProps) {
  const light = lightenContainerColour(colour);
  const contentsOpacity = clampFill(fill) > 0 ? 1 : 0;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width={(size * VIEW_W) / VIEW_H}
      height={size}
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {/* Screw lid and rim */}
      <rect x="6" y="16" width="52" height="17" rx="6" fill="var(--border-default)" />
      <ellipse cx="32" cy="16.5" rx="26" ry="5" fill="var(--border-strong)" />

      {/* Body and inner rim */}
      <rect x="9" y="31" width="46" height="60" rx="7" fill="var(--bg-surface)" />
      <ellipse cx="32" cy="31.5" rx="23" ry="4.5" fill="var(--bg-surface-raised)" />

      {/* Powder — a fixed illustrative level, never a stock figure. */}
      <g opacity={contentsOpacity}>
        <path
          d="M11.5 56 h41 v31 a5 5 0 0 1 -5 5 h-31 a5 5 0 0 1 -5 -5 z"
          fill={colour}
        />
        <ellipse cx="32" cy="56" rx="20.5" ry="4" fill={light} />
      </g>

      {/* Label band, highlight, outline */}
      <rect
        x="9"
        y="60"
        width="46"
        height="17"
        rx="1"
        fill="var(--bg-base)"
        opacity="0.22"
      />
      <rect
        x="13"
        y="38"
        width="3.5"
        height="48"
        rx="1.75"
        fill="var(--accent-primary)"
        opacity="0.06"
      />
      <rect
        x="9"
        y="31"
        width="46"
        height="60"
        rx="7"
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth="1"
      />
    </svg>
  );
}
