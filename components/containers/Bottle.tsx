import { containerShades } from "@/lib/containers/colour";
import {
  BOTTLE_TABLETS,
  bottleFillSurface,
  ILLUSTRATIVE_FILL,
} from "@/lib/containers/geometry";
import { ContainerSvg, DETAIL_MIN_SIZE, Highlight, INK, ScrewCap } from "./parts";
import { DEFAULT_CONTAINER_SIZE, type ContainerProps } from "./types";

const VIEW_W = 60;
const VIEW_H = 96;

/**
 * The tablet and capsule container, set B (build-brief-final §3.14): a SOLID,
 * so the body is coloured (the glass tinted with the compound's colour) and the
 * tablets inside are white and grey. A ribbed SCREW cap, because it opens,
 * drawn last so it sits in front of the body. No graduations: it is counted,
 * not measured.
 *
 * **The contents are REAL** (Spec w2b-13, Step 3): `fill` is
 * `remaining_base / total_base` from `v_inventory_math`. A bottle has no liquid
 * surface to draw, so it shows a COUNT: each tablet declares the y it rests at,
 * and only those at or below the fill line are drawn. The bottle empties from
 * the top down, which is what actually happens and what reads at a glance.
 *
 * A caller with no figure still gets `ILLUSTRATIVE_FILL`, which draws six of
 * the eight tablets.
 */
export function Bottle({
  colour,
  fill = ILLUSTRATIVE_FILL,
  size = DEFAULT_CONTAINER_SIZE,
  className,
  title,
}: ContainerProps) {
  const shades = containerShades(colour);
  // Tablets at or below this line are in the bottle; those above it are gone.
  const surface = bottleFillSurface(fill);
  const detail = size >= DETAIL_MIN_SIZE;

  return (
    <ContainerSvg viewWidth={VIEW_W} viewHeight={VIEW_H} size={size} className={className} title={title}>
      {/* Coloured body */}
      <rect x="14" y="19" width="36" height="73" rx="7" style={{ fill: shades.tintedGlass }} />

      {/* Tablets and capsules still in the bottle at this fill. */}
      {BOTTLE_TABLETS.map((t, i) => {
        if (t.y < surface) return null;
        const body = { fill: t.shade === "light" ? INK.solid : INK.solidShade };
        return t.kind === "tablet" ? (
          <g key={i}>
            <circle cx={t.x} cy={t.y} r="4.5" style={body} />
            {detail && (
              <ellipse
                cx={t.x - 1.3}
                cy={t.y - 1.4}
                rx="1.8"
                ry="1.2"
                style={{ fill: INK.white }}
                opacity="0.5"
              />
            )}
          </g>
        ) : (
          <g key={i} transform={`rotate(${t.tilt} ${t.x} ${t.y})`}>
            <rect x={t.x - 7.5} y={t.y - 3.6} width="15" height="7.2" rx="3.6" style={body} />
            {detail && (
              <rect
                x={t.x - 5}
                y={t.y - 2.2}
                width="6"
                height="1.6"
                rx="0.8"
                style={{ fill: INK.white }}
                opacity="0.45"
              />
            )}
          </g>
        );
      })}

      <Highlight x={18} y={24} height={60} />
      <rect
        x="14"
        y="19"
        width="36"
        height="73"
        rx="7"
        fill="none"
        style={{ stroke: shades.tintedEdge }}
        strokeWidth="1"
      />
      <ScrewCap cx={32} top={19} width={26} height={15} colour={colour} shades={shades} />
    </ContainerSvg>
  );
}
