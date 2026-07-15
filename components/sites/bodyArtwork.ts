/**
 * Route-agnostic accessors over the generated IM / Sub-Q body artwork (Spec 19).
 * Both routes are drawn in the same 1491×2109 canvas and share one transform onto
 * the 0–100 grid, so switching IM ↔ Sub-Q never resizes the body. Every injectable
 * site is a REGION path (mirror convention: image-left → the "-l" site on both
 * views). `BodyMap` / `BodySilhouette` pick the right art by route.
 */
import type { InjectionSiteAspect, InjectionSiteRoute } from "@/lib/db/types"
import {
  IM_ART_TRANSFORM,
  IM_BASE_BACK,
  IM_BASE_FRONT,
  IM_REGIONS_BACK,
  IM_REGIONS_FRONT,
  type BodyRegion,
} from "@/components/sites/bodyArtworkIM"
import {
  SUBQ_ART_TRANSFORM,
  SUBQ_BASE_BACK,
  SUBQ_BASE_FRONT,
  SUBQ_REGIONS_BACK,
  SUBQ_REGIONS_FRONT,
} from "@/components/sites/bodyArtworkSubQ"

export type { BodyRegion }

/** The native→0–100 transform for a route's artwork. */
export function routeTransform(route: InjectionSiteRoute): string {
  return route === "subq" ? SUBQ_ART_TRANSFORM : IM_ART_TRANSFORM
}

/** The dark base-body path strings for a route + aspect. */
export function routeBasePaths(
  route: InjectionSiteRoute,
  aspect: InjectionSiteAspect,
): readonly string[] {
  if (route === "subq") {
    return aspect === "anterior" ? SUBQ_BASE_FRONT : SUBQ_BASE_BACK
  }
  return aspect === "anterior" ? IM_BASE_FRONT : IM_BASE_BACK
}

/** The selectable regions (each mapped to a site id) for a route + aspect. */
export function routeRegions(
  route: InjectionSiteRoute,
  aspect: InjectionSiteAspect,
): readonly BodyRegion[] {
  if (route === "subq") {
    return aspect === "anterior" ? SUBQ_REGIONS_FRONT : SUBQ_REGIONS_BACK
  }
  return aspect === "anterior" ? IM_REGIONS_FRONT : IM_REGIONS_BACK
}
