import { cn } from "@/lib/utils";
import { lightenContainerColour } from "@/lib/containers/colour";
import {
  bottleFillSurface,
  clampFill,
  ILLUSTRATIVE_FILL,
} from "@/lib/containers/geometry";
import { DEFAULT_CONTAINER_SIZE, type ContainerProps } from "./types";

const VIEW_W = 60;
const VIEW_H = 96;

/**
 * The tablet and capsule container.
 *
 * **The contents are REAL** (Spec w2b-13, Step 3): `fill` is
 * `remaining_base / total_base` from `v_inventory_math`, which has always had a
 * total and a remaining for an oral — the artwork simply threw them away.
 *
 * A bottle has no liquid surface to draw, so it shows a COUNT: each tablet
 * declares the y it rests at, and only those at or below the fill line are
 * drawn. The bottle empties from the top down, which is what actually happens
 * and what reads at a glance.
 *
 * A caller with no figure still gets `ILLUSTRATIVE_FILL`, and at that value the
 * original six tablets all render — so a bottle with no stock recorded looks
 * exactly as it did before this was a measurement.
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
  // Tablets at or below this line are in the bottle; those above it are gone.
  const surface = bottleFillSurface(fill);
  const inBottle = (restsAt: number) => restsAt >= surface;

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

      {/* Tablets and capsules — the ones still in the bottle at this fill.
          Listed bottom-up, so the last to go is the first written. */}
      <g opacity={contentsOpacity}>
        {inBottle(83.5) && (
          <rect
            x="18"
            y="80"
            width="15"
            height="7"
            rx="3.5"
            fill={colour}
            transform="rotate(6 25.5 83.5)"
          />
        )}
        {inBottle(79.5) && (
          <rect
            x="32"
            y="76"
            width="15"
            height="7"
            rx="3.5"
            fill={light}
            transform="rotate(9 39.5 79.5)"
          />
        )}
        {inBottle(73.5) && (
          <rect
            x="19"
            y="70"
            width="15"
            height="7"
            rx="3.5"
            fill={colour}
            transform="rotate(-12 26.5 73.5)"
          />
        )}
        {inBottle(68) && <circle cx="41" cy="68" r="4.5" fill={light} />}
        {inBottle(62) && <circle cx="24" cy="62" r="4.5" fill={colour} />}
        {inBottle(58) && <circle cx="36" cy="58" r="4.5" fill={light} />}
        {/* Above ILLUSTRATIVE_FILL: only a genuinely near-full bottle reaches
            these two, so the default artwork is unchanged. */}
        {inBottle(45) && (
          <rect
            x="28"
            y="41.5"
            width="15"
            height="7"
            rx="3.5"
            fill={colour}
            transform="rotate(-7 35.5 45)"
          />
        )}
        {inBottle(38) && <circle cx="24" cy="38" r="4.5" fill={light} />}
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
