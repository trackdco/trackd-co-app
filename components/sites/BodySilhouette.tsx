/**
 * The dark base body the injection-site map is drawn on (Spec 19). Pure SVG, no
 * state. Angus's hand-authored anatomy (IM + Sub-Q), just the BASE masses filled
 * with the `--bg-input` token — the individually-selectable regions are drawn a
 * step lighter and made interactive by `BodyMap`, on top of this. Rendered INSIDE a
 * parent `<svg viewBox="0 0 100 100">`; native artwork is mapped to that grid by the
 * route's transform. Single flat fill (no hex, no gradients / shading / 3D).
 */
import type {
  BodySex,
  InjectionSiteAspect,
  InjectionSiteRoute,
} from "@/lib/db/types"
import { routeBasePaths, routeTransform } from "@/components/sites/bodyArtwork"

export function BodySilhouette({
  aspect,
  route = "im",
  sex = "male",
}: {
  aspect: InjectionSiteAspect
  /** Which body to draw (IM or Sub-Q). */
  route?: InjectionSiteRoute
  /** Which figure to draw. Defaults to male (the body for a profile with no sex). */
  sex?: BodySex
}) {
  const paths = routeBasePaths(route, aspect, sex)
  return (
    <g aria-hidden="true">
      <g
        transform={routeTransform(route, sex)}
        style={{ fill: "var(--bg-input)" }}
        stroke="none"
      >
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </g>
  )
}
