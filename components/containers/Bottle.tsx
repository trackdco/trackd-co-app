import { cn } from "@/lib/utils";
import { lightenContainerColour } from "@/lib/containers/colour";
import { clampFill, ILLUSTRATIVE_FILL } from "@/lib/containers/geometry";
import { DEFAULT_CONTAINER_SIZE, type ContainerProps } from "./types";

const VIEW_W = 60;
const VIEW_H = 96;

/**
 * The tablet and capsule container.
 *
 * **There is no tablet stock tracking yet**, so the contents are a fixed
 * decorative arrangement and the surrounding card must suppress any percentage
 * bar, doses-remaining figure or runs-dry date — we never imply a number we do
 * not have. `fill` is accepted on the same interface as the vial so the artwork
 * goes live with no rework once counts exist; today it only fades the contents.
 */
export function Bottle({
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
      {/* Cap and collar */}
      <rect x="20" y="2" width="24" height="12" rx="2.5" fill="var(--border-default)" />
      <rect x="23" y="12" width="18" height="5" rx="1" fill="var(--border-strong)" />

      {/* Body and label panel */}
      <rect x="14" y="16" width="36" height="77" rx="7" fill="var(--bg-surface)" />
      <rect x="14" y="34" width="36" height="30" rx="1" fill="var(--bg-surface-raised)" />

      {/* Tablets and capsules — decorative until counts exist. */}
      <g opacity={contentsOpacity}>
        <rect
          x="19"
          y="70"
          width="15"
          height="7"
          rx="3.5"
          fill={colour}
          transform="rotate(-12 26.5 73.5)"
        />
        <rect
          x="32"
          y="76"
          width="15"
          height="7"
          rx="3.5"
          fill={light}
          transform="rotate(9 39.5 79.5)"
        />
        <rect
          x="18"
          y="80"
          width="15"
          height="7"
          rx="3.5"
          fill={colour}
          transform="rotate(6 25.5 83.5)"
        />
        <circle cx="41" cy="68" r="4.5" fill={light} />
        <circle cx="24" cy="62" r="4.5" fill={colour} />
        <circle cx="36" cy="58" r="4.5" fill={light} />
      </g>

      {/* Highlight + outline */}
      <rect
        x="17.5"
        y="22"
        width="3.5"
        height="64"
        rx="1.75"
        fill="var(--accent-primary)"
        opacity="0.06"
      />
      <rect
        x="14"
        y="16"
        width="36"
        height="77"
        rx="7"
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth="1"
      />
    </svg>
  );
}
