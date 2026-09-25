import { containerShades } from "@/lib/containers/colour";
import { vialLiquid } from "@/lib/containers/geometry";
import {
  ContainerSvg,
  ContentsGradient,
  DETAIL_MIN_SIZE,
  FlipCap,
  Graduations,
  Highlight,
  INK,
  useGradientId,
} from "./parts";
import { DEFAULT_CONTAINER_SIZE, type ContainerProps } from "./types";

const VIEW_W = 60;
const VIEW_H = 96;

/**
 * The injectable container, set B (build-brief-final §3.14): clear glass,
 * because it holds a liquid, under a crimped FLIP-OFF cap, because a vial is
 * sealed and drawn through its stopper. The compound's colour is the liquid
 * (one gradient, lifted toward the surface) and the disc on the cap.
 * Graduations, because a vial is measured in mL. An oil vial and a mixed
 * powder vial are the same drawing; only the colour differs.
 *
 * The level is remaining volume against the vial's total, and it eases when a
 * dose is logged (`.container-fill` in `globals.css`).
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
  const gradient = useGradientId();
  const liquid = vialLiquid(fill);
  const shades = containerShades(colour);

  return (
    <ContainerSvg viewWidth={VIEW_W} viewHeight={VIEW_H} size={size} className={className} title={title}>
      <ContentsGradient id={gradient} top={shades.contentsTop} bottom={colour} />
      <FlipCap cx={30} top={17} width={22} colour={colour} />

      {/* Clear glass */}
      <rect x="14" y="17" width="32" height="72" rx="5" style={{ fill: INK.glass }} />

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
            style={{ fill: `url(#${gradient})` }}
          />
          <rect
            className="container-fill"
            x="16.5"
            y={liquid.y}
            width="27"
            height={liquid.meniscusHeight}
            rx="3"
            style={{ fill: shades.meniscus }}
          />
        </>
      )}

      {size >= DETAIL_MIN_SIZE && <Graduations right={44} top={22} bottom={86} count={7} />}
      <Highlight x={18} y={22} height={59} />
      <rect
        x="14"
        y="17"
        width="32"
        height="72"
        rx="5"
        fill="none"
        style={{ stroke: INK.edge }}
        strokeWidth="1"
      />
    </ContainerSvg>
  );
}
