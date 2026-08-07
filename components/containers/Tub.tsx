import { cn } from "@/lib/utils";
import { lightenContainerColour } from "@/lib/containers/colour";
import { clampFill, ILLUSTRATIVE_FILL, tubPowder } from "@/lib/containers/geometry";
import { DEFAULT_CONTAINER_SIZE, type ContainerProps } from "./types";

const VIEW_W = 64;
const VIEW_H = 100;

/**
 * The powder container — a wide creatine-style body with an oversized screw lid.
 *
 * **The powder level is REAL** (Spec w2b-13, Step 3): it is
 * `remaining_base / total_base` from `v_inventory_math`, the same ratio the vial
 * draws from, now that `supabase/protocol/015` gives a `bulk_powder` a total and
 * a remaining. A tub logged down to half is drawn half full.
 *
 * A caller with no figure to pass still gets `ILLUSTRATIVE_FILL`, and at that
 * value the artwork is pixel-identical to the fixed level this used to draw —
 * see `TUB_FILL_TOP` for why 34.
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
  const powder = tubPowder(fill);

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

      {/* Powder — the real remaining level (see the component doc). */}
      <g opacity={contentsOpacity}>
        <path d={powder.path} fill={colour} />
        <ellipse cx="32" cy={powder.y} rx={powder.surfaceRx} ry="4" fill={light} />
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
