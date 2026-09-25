import { containerShades } from "@/lib/containers/colour";
import { ILLUSTRATIVE_FILL, tubGrain, tubPowder } from "@/lib/containers/geometry";
import {
  ContainerSvg,
  ContentsGradient,
  DETAIL_MIN_SIZE,
  Highlight,
  INK,
  ScrewCap,
  useGradientId,
} from "./parts";
import { DEFAULT_CONTAINER_SIZE, type ContainerProps } from "./types";

const VIEW_W = 64;
const VIEW_H = 100;

/**
 * The powder container, set B (build-brief-final §3.14): a wide creatine-style
 * body, coloured because it holds a SOLID, and white powder with one gradient,
 * a lit surface and a little grain. The oversized screw lid is drawn LAST, so
 * it overlaps the body the way a lid actually sits. No graduations: it is
 * weighed, not read off the side.
 *
 * **The powder level is REAL** (Spec w2b-13, Step 3): it is
 * `remaining_base / total_base` from `v_inventory_math`, the same ratio the vial
 * draws from. A tub logged down to half is drawn half full. A caller with no
 * figure to pass still gets `ILLUSTRATIVE_FILL`.
 */
export function Tub({
  colour,
  fill = ILLUSTRATIVE_FILL,
  size = DEFAULT_CONTAINER_SIZE,
  className,
  title,
}: ContainerProps) {
  const gradient = useGradientId();
  const shades = containerShades(colour);
  const powder = tubPowder(fill);
  const grain = size >= DETAIL_MIN_SIZE ? tubGrain(fill) : null;

  return (
    <ContainerSvg viewWidth={VIEW_W} viewHeight={VIEW_H} size={size} className={className} title={title}>
      <ContentsGradient
        id={gradient}
        top={`color-mix(in srgb, ${INK.solid} 80%, white)`}
        bottom={INK.solid}
      />

      {/* Coloured body */}
      <rect x="9" y="32" width="46" height="58" rx="7" style={{ fill: shades.tintedGlass }} />

      {/* Powder: the real remaining level (see the component doc). */}
      {powder.height > 0 && (
        <>
          <path d={powder.path} style={{ fill: `url(#${gradient})` }} />
          <path d={powder.surfacePath} style={{ fill: INK.white }} opacity="0.55" />
          {grain?.light && <path d={grain.light} style={{ fill: INK.white }} opacity="0.55" />}
          {grain?.shade && <path d={grain.shade} style={{ fill: INK.solidShade }} opacity="0.7" />}
        </>
      )}

      <Highlight x={13} y={37} height={45} />
      <rect
        x="9"
        y="32"
        width="46"
        height="58"
        rx="7"
        fill="none"
        style={{ stroke: shades.tintedEdge }}
        strokeWidth="1"
      />

      {/* The lid, last: it sits in front of the body. */}
      <ScrewCap cx={32} top={37} width={52} height={18} colour={colour} shades={shades} />
    </ContainerSvg>
  );
}
