import { cn } from "@/lib/utils";
import { lightenContainerColour } from "@/lib/containers/colour";
import { dropperLiquid, ILLUSTRATIVE_FILL } from "@/lib/containers/geometry";
import { DEFAULT_CONTAINER_SIZE, type ContainerProps } from "./types";

const VIEW_W = 60;
const VIEW_H = 96;

/** The body: a neck under the collar, a shoulder, then the bottle. */
const BODY =
  "M23 27h14v6c0 2 2 3 5 4 3 1 5 3 5 7v39c0 4-3 7-7 7H20c-4 0-7-3-7-7V44c0-4 2-6 5-7 3-1 5-2 5-4z";

/**
 * The liquid-oral container (Adrian, 2026-09-24, "the five" → B): clear glass
 * whose contents carry the hue, with a ribbed SCREW COLLAR and a rubber BULB.
 * The cap says it opens, so there is no flip-off disc. Research liquids are
 * held in mL at a stated strength and vitamin drops by the drop; both draw the
 * same bottle.
 *
 * Drawn from tokens like the other three, so a palette retune carries it.
 */
export function Dropper({
  colour,
  fill = ILLUSTRATIVE_FILL,
  size = DEFAULT_CONTAINER_SIZE,
  className,
  title,
}: ContainerProps) {
  const liquid = dropperLiquid(fill);
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
      {/* Glass */}
      <path d={BODY} fill="var(--bg-surface)" />

      {/* Liquid. Hidden at empty so a drained dropper shows no meniscus band. */}
      {liquid.height > 0 && (
        <>
          <rect
            className="container-fill"
            x="15.5"
            y={liquid.y}
            width="29"
            height={liquid.height}
            rx="5"
            fill={colour}
          />
          <rect
            className="container-fill"
            x="15.5"
            y={liquid.y}
            width="29"
            height={liquid.meniscusHeight}
            rx="3"
            fill={light}
          />
        </>
      )}

      {/* Highlight, graduations and outline */}
      <rect x="17.5" y="46" width="3" height="36" rx="1.5" fill="var(--accent-primary)" opacity="0.07" />
      <g stroke="var(--border-strong)" strokeWidth="1.2">
        <line x1="38" y1="54" x2="43" y2="54" />
        <line x1="40" y1="64" x2="43" y2="64" />
        <line x1="38" y1="74" x2="43" y2="74" />
      </g>
      <path d={BODY} fill="none" stroke="var(--border-strong)" strokeWidth="1" />

      {/* The bulb, then the ribbed screw collar over the neck */}
      <rect x="23" y="2" width="14" height="17" rx="7" fill="var(--border-strong)" />
      <rect x="25.5" y="4.5" width="2.4" height="10" rx="1.2" fill="var(--accent-primary)" opacity="0.12" />
      <rect x="19" y="18" width="22" height="9" rx="2" fill="var(--border-default)" />
      <g stroke="var(--bg-surface-raised)" strokeWidth="1">
        <line x1="23" y1="19" x2="23" y2="26" />
        <line x1="27" y1="19" x2="27" y2="26" />
        <line x1="31" y1="19" x2="31" y2="26" />
        <line x1="35" y1="19" x2="35" y2="26" />
      </g>
    </svg>
  );
}
