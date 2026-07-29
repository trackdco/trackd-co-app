import { cn } from "@/lib/utils";
import { lightenContainerColour } from "@/lib/containers/colour";
import { vialLiquid } from "@/lib/containers/geometry";
import { DEFAULT_CONTAINER_SIZE, type ContainerProps } from "./types";

const VIEW_W = 60;
const VIEW_H = 96;

/**
 * The injectable container. **The only container with a real fill** — the level
 * is remaining volume against the vial's total, and it eases down by one dose
 * worth when a dose is logged (`.container-fill` in `globals.css`).
 *
 * Drawn, never photographed: a photo cannot be tinted per compound, cannot
 * animate a level, and does not scale.
 */
export function Vial({
  colour,
  fill = 1,
  size = DEFAULT_CONTAINER_SIZE,
  className,
  title,
}: ContainerProps) {
  const liquid = vialLiquid(fill);
  const light = lightenContainerColour(colour);

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
      {/* Cap and collar */}
      <rect x="19" y="2" width="22" height="13" rx="2.5" fill="var(--border-default)" />
      <rect x="21.5" y="13" width="17" height="5" rx="1" fill="var(--border-strong)" />

      {/* Glass body */}
      <rect x="14" y="17" width="32" height="72" rx="5" fill="var(--bg-surface)" />

      {/* Liquid. Hidden at empty so a drained vial shows no meniscus band. */}
      {liquid.height > 0 && (
        <>
          <rect
            className="container-fill"
            x="16.5"
            y={liquid.y}
            width="27"
            height={liquid.height}
            rx="3.5"
            fill={colour}
          />
          <rect
            className="container-fill"
            x="16.5"
            y={liquid.y}
            width="27"
            height={liquid.meniscusHeight}
            rx="3"
            fill={light}
          />
        </>
      )}

      {/* Glass highlight + outline */}
      <rect
        x="19"
        y="22"
        width="3.5"
        height="60"
        rx="1.75"
        fill="var(--accent-primary)"
        opacity="0.07"
      />
      <rect
        x="14"
        y="17"
        width="32"
        height="72"
        rx="5"
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth="1"
      />
    </svg>
  );
}
