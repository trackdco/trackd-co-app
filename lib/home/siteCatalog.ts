/**
 * The injection-site catalog — the source for the per-compound rotation picker
 * and the id→label lookup the Home card + Log sheet use.
 *
 * Sites are based on standard injection guidance (not a substitute for medical
 * advice — see the app's medical disclaimer):
 *  - **SubQ** (subcutaneous — peptides, into fat): the abdomen AT LEAST ~2in from
 *    the navel (lower and side, never the upper stomach), the love handles /
 *    flanks, the outer thigh, and the back of the upper arm. The navel area,
 *    upper stomach, inner thigh and front thigh are deliberately excluded.
 *  - **IM** (intramuscular — anabolics, into muscle): the established sites
 *    (ventrogluteal, gluteal, deltoid, vastus lateralis / outer quad, rectus
 *    femoris / front quad) plus the commonly-used spot-injection muscles.
 * Each side is its own entry so the rotation steps through individual sites.
 * `po` / `nasal` have no sites (`sitesForMethod` returns `[]`). Static data only.
 */
import type { InjectionMethod } from "@/lib/home/stack"

export interface InjectionSiteDef {
  id: string
  label: string
}

// Intramuscular — muscle bellies (anabolics). Left / right per site.
export const IM_SITES: InjectionSiteDef[] = [
  { id: "im-vglute-r", label: "Ventroglute – Right" },
  { id: "im-vglute-l", label: "Ventroglute – Left" },
  { id: "im-glute-r", label: "Glute – Right" },
  { id: "im-glute-l", label: "Glute – Left" },
  { id: "im-delt-r", label: "Delt – Right" },
  { id: "im-delt-l", label: "Delt – Left" },
  { id: "im-quad-out-r", label: "Outer Quad – Right" },
  { id: "im-quad-out-l", label: "Outer Quad – Left" },
  { id: "im-quad-front-r", label: "Front Quad – Right" },
  { id: "im-quad-front-l", label: "Front Quad – Left" },
  { id: "im-bicep-r", label: "Bicep – Right" },
  { id: "im-bicep-l", label: "Bicep – Left" },
  { id: "im-tricep-r", label: "Tricep – Right" },
  { id: "im-tricep-l", label: "Tricep – Left" },
  { id: "im-lat-r", label: "Lat – Right" },
  { id: "im-lat-l", label: "Lat – Left" },
  { id: "im-pec-r", label: "Pec – Right" },
  { id: "im-pec-l", label: "Pec – Left" },
  { id: "im-calf-r", label: "Calf – Right" },
  { id: "im-calf-l", label: "Calf – Left" },
]

// Subcutaneous — fatty sites (peptides), all ≥ ~2in from the navel.
export const SUBQ_SITES: InjectionSiteDef[] = [
  { id: "sq-abdo-lr", label: "Lower Abdomen – Right" },
  { id: "sq-abdo-ll", label: "Lower Abdomen – Left" },
  { id: "sq-abdo-r", label: "Side Abdomen – Right" },
  { id: "sq-abdo-l", label: "Side Abdomen – Left" },
  { id: "sq-flank-r", label: "Love Handle – Right" },
  { id: "sq-flank-l", label: "Love Handle – Left" },
  { id: "sq-thigh-up-r", label: "Outer Thigh – Upper Right" },
  { id: "sq-thigh-up-l", label: "Outer Thigh – Upper Left" },
  { id: "sq-thigh-lo-r", label: "Outer Thigh – Lower Right" },
  { id: "sq-thigh-lo-l", label: "Outer Thigh – Lower Left" },
  { id: "sq-arm-r", label: "Back of Arm – Right" },
  { id: "sq-arm-l", label: "Back of Arm – Left" },
]

/** The catalog of sites a compound with this method can rotate through. */
export function sitesForMethod(method: InjectionMethod): InjectionSiteDef[] {
  if (method === "im") return IM_SITES
  if (method === "subq") return SUBQ_SITES
  return [] // po / nasal — no injection sites
}

const SITE_LABELS: Record<string, string> = Object.fromEntries(
  [...IM_SITES, ...SUBQ_SITES].map((s) => [s.id, s.label])
)

/** Human label for a site id; falls back to the id for an unknown/stale value. */
export function siteLabel(id: string): string {
  return SITE_LABELS[id] ?? id
}
