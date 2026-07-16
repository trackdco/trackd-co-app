/**
 * Route- and sex-agnostic accessors over the generated IM / Sub-Q body artwork
 * (Spec 19). All four bodies (male/female × IM/Sub-Q) are drawn in the same
 * 1491×2109 canvas and share one transform onto the 0–100 grid, so switching
 * IM ↔ Sub-Q or male ↔ female never resizes or shifts the body. Every injectable
 * site is a REGION path (mirror convention: image-left → the "-l" site on both
 * views). `BodyMap` / `BodySilhouette` pick the right art by route + sex.
 *
 * The female IM art has no PEC regions, so `im-pec-l` / `im-pec-r` simply have no
 * region to draw for a female user. `sitesForSex` (lib/home/siteCatalog.ts) keeps
 * them out of the catalogue to match.
 */
import type {
  BodySex,
  InjectionSiteAspect,
  InjectionSiteRoute,
} from "@/lib/db/types"
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
import {
  FEMALE_IM_ART_TRANSFORM,
  FEMALE_IM_BASE_BACK,
  FEMALE_IM_BASE_FRONT,
  FEMALE_IM_REGIONS_BACK,
  FEMALE_IM_REGIONS_FRONT,
} from "@/components/sites/bodyArtworkFemaleIM"
import {
  FEMALE_SUBQ_ART_TRANSFORM,
  FEMALE_SUBQ_BASE_BACK,
  FEMALE_SUBQ_BASE_FRONT,
  FEMALE_SUBQ_REGIONS_BACK,
  FEMALE_SUBQ_REGIONS_FRONT,
} from "@/components/sites/bodyArtworkFemaleSubQ"

export type { BodyRegion }

/** One body's artwork: the transform plus base + regions for each aspect. */
interface BodyArt {
  transform: string
  baseFront: readonly string[]
  baseBack: readonly string[]
  regionsFront: readonly BodyRegion[]
  regionsBack: readonly BodyRegion[]
}

const ART: Record<BodySex, Record<InjectionSiteRoute, BodyArt>> = {
  male: {
    im: {
      transform: IM_ART_TRANSFORM,
      baseFront: IM_BASE_FRONT,
      baseBack: IM_BASE_BACK,
      regionsFront: IM_REGIONS_FRONT,
      regionsBack: IM_REGIONS_BACK,
    },
    subq: {
      transform: SUBQ_ART_TRANSFORM,
      baseFront: SUBQ_BASE_FRONT,
      baseBack: SUBQ_BASE_BACK,
      regionsFront: SUBQ_REGIONS_FRONT,
      regionsBack: SUBQ_REGIONS_BACK,
    },
  },
  female: {
    im: {
      transform: FEMALE_IM_ART_TRANSFORM,
      baseFront: FEMALE_IM_BASE_FRONT,
      baseBack: FEMALE_IM_BASE_BACK,
      regionsFront: FEMALE_IM_REGIONS_FRONT,
      regionsBack: FEMALE_IM_REGIONS_BACK,
    },
    subq: {
      transform: FEMALE_SUBQ_ART_TRANSFORM,
      baseFront: FEMALE_SUBQ_BASE_FRONT,
      baseBack: FEMALE_SUBQ_BASE_BACK,
      regionsFront: FEMALE_SUBQ_REGIONS_FRONT,
      regionsBack: FEMALE_SUBQ_REGIONS_BACK,
    },
  },
}

function art(route: InjectionSiteRoute, sex: BodySex): BodyArt {
  return ART[sex][route]
}

/** The native→0–100 transform for a body's artwork. */
export function routeTransform(
  route: InjectionSiteRoute,
  sex: BodySex = "male",
): string {
  return art(route, sex).transform
}

/** The dark base-body path strings for a body + aspect. */
export function routeBasePaths(
  route: InjectionSiteRoute,
  aspect: InjectionSiteAspect,
  sex: BodySex = "male",
): readonly string[] {
  const a = art(route, sex)
  return aspect === "anterior" ? a.baseFront : a.baseBack
}

/** The selectable regions (each mapped to a site id) for a body + aspect. */
export function routeRegions(
  route: InjectionSiteRoute,
  aspect: InjectionSiteAspect,
  sex: BodySex = "male",
): readonly BodyRegion[] {
  const a = art(route, sex)
  return aspect === "anterior" ? a.regionsFront : a.regionsBack
}
