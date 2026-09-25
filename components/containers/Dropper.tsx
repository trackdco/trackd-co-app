import { containerShades } from "@/lib/containers/colour";
import { dropperLiquid, ILLUSTRATIVE_FILL } from "@/lib/containers/geometry";
import {
  ContainerSvg,
  ContentsGradient,
  DETAIL_MIN_SIZE,
  Highlight,
  INK,
  useGradientId,
} from "./parts";
import { DEFAULT_CONTAINER_SIZE, type ContainerProps } from "./types";

const VIEW_W = 60;
const VIEW_H = 96;

/** The body: a neck under the collar, a shoulder, then the bottle. */
const BODY =
  "M23 27h14v6c0 2 2 3 5 4 3 1 5 3 5 7v39c0 4-3 7-7 7H20c-4 0-7-3-7-7V44c0-4 2-6 5-7 3-1 5-2 5-4z";

/**
 * The liquid-oral container (Adrian, 2026-09-24, "the five" → B), in set B's
 * rendering as the final check drew it (build-brief-final §3.14): clear glass
 * whose contents carry the hue in one gradient, a ribbed SCREW COLLAR and a
 * rubber BULB. The cap says it opens, so there is no flip-off disc. Graduations,
 * because it is measured: research liquids in mL at a stated strength, vitamin
 * drops by the drop. Both draw the same bottle.
 */
export function Dropper({
  colour,
  fill = ILLUSTRATIVE_FILL,
  size = DEFAULT_CONTAINER_SIZE,
  className,
  title,
}: ContainerProps) {
  const gradient = useGradientId();
  const liquid = dropperLiquid(fill);
  const shades = containerShades(colour);

  return (
    <ContainerSvg viewWidth={VIEW_W} viewHeight={VIEW_H} size={size} className={className} title={title}>
      <ContentsGradient id={gradient} top={shades.contentsTop} bottom={colour} />

      {/* Clear glass */}
      <path d={BODY} style={{ fill: INK.glass }} />

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
            style={{ fill: `url(#${gradient})` }}
          />
          <rect
            className="container-fill"
            x="15.5"
            y={liquid.y}
            width="29"
            height={liquid.meniscusHeight}
            rx="3"
            style={{ fill: shades.meniscus }}
          />
        </>
      )}

      <Highlight x={17.5} y={46} width={3} height={36} opacity={0.08} />
      {size >= DETAIL_MIN_SIZE && (
        <path d="M38 54H43M40 64H43M38 74H43" fill="none" style={{ stroke: INK.edge }} strokeWidth="1.2" />
      )}
      <path d={BODY} fill="none" style={{ stroke: INK.edge }} strokeWidth="1" />

      {/* The bulb, then the ribbed screw collar over the neck */}
      <rect x="23" y="2" width="14" height="17" rx="7" style={{ fill: INK.edge }} />
      <rect x="25.5" y="4.5" width="2.4" height="10" rx="1.2" style={{ fill: INK.white }} opacity="0.12" />
      <rect x="19" y="18" width="22" height="9" rx="2" style={{ fill: INK.collar }} />
      <path d="M23 19V26M27 19V26M31 19V26M35 19V26" fill="none" style={{ stroke: INK.raised }} strokeWidth="1" />
    </ContainerSvg>
  );
}
