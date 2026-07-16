#!/usr/bin/env python3
"""
Generate the female body-artwork TS modules from Angus's SVGs (Spec 19 / female).
Mirrors the shape of the existing bodyArtworkIM.ts / bodyArtworkSubQ.ts.

    python3 scripts/gen-female-body-art.py

Reads  Context/Feature Specs/body-svg/female/*.svg
Writes components/sites/bodyArtworkFemale{IM,SubQ}.ts  (GENERATED — edit this
       script and re-run, don't hand-edit the output)

Angus's female ids differ in spelling from the male set, so each is mapped
explicitly to its catalogue site id. Any path whose id isn't in the map is base
body. Fails loudly if an expected site is missing or an id is unrecognised —
better a red build than a region that silently vanishes off the map.

Re-run this if Angus redraws the female artwork. The male modules were generated
ad-hoc before this script existed; they have no equivalent (leave them be).
"""
import os, re, sys, xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SVG_DIR = f"{ROOT}/Context/Feature Specs/body-svg/female"
OUT_DIR = f"{ROOT}/components/sites"
NS = "{http://www.w3.org/2000/svg}"

# Angus's female path/group id -> catalogue site id.
# `delth_l` is a typo for delt_l; `outer_quad_l_2` is Figma's dedupe suffix on the
# path inside the `outer_quad_l` group.
IM_FRONT = {
    "outer_quad_l": "im-quad-out-l", "outer_quad_l_2": "im-quad-out-l",
    "outer_quad_r": "im-quad-out-r",
    "front_quad_l": "im-quad-front-l", "front_quad_r": "im-quad-front-r",
    "ventroglute_l": "im-vglute-l", "ventroglute_r": "im-vglute-r",
    "delth_l": "im-delt-l", "delt_r": "im-delt-r",
    "bicep_l": "im-bicep-l", "bicep_r": "im-bicep-r",
}
IM_BACK = {
    "glute_l": "im-glute-l", "glute_r": "im-glute-r",
    "calf_l": "im-calf-l", "calf_r": "im-calf-r",
    "trap_l": "im-trap-l", "trap_r": "im-trap-r",
    "lat_l": "im-lat-l", "lat_r": "im-lat-r",
    "tricep_l": "im-tricep-l", "tricep_r": "im-tricep-r",
}
SUBQ_FRONT = {
    "outer_thigh_lower_l": "sq-thigh-lo-l", "outer_thigh_lower_r": "sq-thigh-lo-r",
    "outer_thigh_upper_l": "sq-thigh-up-l", "outer_thigh_upper_r": "sq-thigh-up-r",
    "lower_abdomen_l": "sq-abdo-ll", "lower_abdomen_r": "sq-abdo-lr",
    "side_abdomen_l": "sq-abdo-l", "side_abdomen_r": "sq-abdo-r",
}
SUBQ_BACK = {
    "subq_glute_l": "sq-glute-l", "subq_glute_r": "sq-glute-r",
    "back_of_arm_l": "sq-arm-l", "back_of_arm_r": "sq-arm-r",
    "love_handle_l": "sq-flank-l", "love_handle_r": "sq-flank-r",
}

# Ids that are decorative/base, not selectable regions.
BASE_RE = re.compile(r"^(body_base|body_shell|body_plate|Vector|Frame)")


def parse(fname, idmap):
    """-> (base_paths, regions[{siteId,d}]) in document order."""
    tree = ET.parse(f"{SVG_DIR}/{fname}")
    root = tree.getroot()
    # No group transforms in these files — assert rather than silently mis-place art.
    for g in root.iter(f"{NS}g"):
        if g.get("transform"):
            sys.exit(f"FAIL {fname}: unexpected transform on <g id={g.get('id')!r}>")

    base, regions, seen = [], [], {}

    def walk(node, inherited_site):
        for child in node:
            if child.tag == f"{NS}g":
                walk(child, idmap.get(child.get("id") or "", inherited_site))
                continue
            if child.tag != f"{NS}path":
                continue
            pid = child.get("id") or ""
            d = child.get("d")
            if not d:
                continue
            site = idmap.get(pid, inherited_site)
            if site:
                if site in seen:
                    sys.exit(f"FAIL {fname}: duplicate region for {site} ({pid})")
                seen[site] = pid
                regions.append({"siteId": site, "d": d})
            elif BASE_RE.match(pid):
                base.append(d)
            else:
                sys.exit(f"FAIL {fname}: unrecognised path id {pid!r} — map it or mark it base")

    walk(root, None)

    missing = set(idmap.values()) - set(seen)
    if missing:
        sys.exit(f"FAIL {fname}: missing regions {sorted(missing)}")
    return base, regions


def ts_array(name, items):
    body = "\n".join(f'  "{d}",' for d in items)
    return f"export const {name}: readonly string[] = [\n{body}\n]\n"


def ts_regions(name, regions):
    body = "\n".join(
        f'  {{ siteId: "{r["siteId"]}", d: "{r["d"]}" }},' for r in regions
    )
    return f"export const {name}: readonly BodyRegion[] = [\n{body}\n]\n"


def emit(route, header, transform_const, files):
    (ff, fmap), (bf, bmap) = files
    base_f, reg_f = parse(ff, fmap)
    base_b, reg_b = parse(bf, bmap)
    P = route.upper()
    out = header
    out += f'\nexport const FEMALE_{P}_ART_TRANSFORM = {transform_const} as const\n\n'
    out += ts_array(f"FEMALE_{P}_BASE_FRONT", base_f) + "\n"
    out += ts_array(f"FEMALE_{P}_BASE_BACK", base_b) + "\n"
    out += ts_regions(f"FEMALE_{P}_REGIONS_FRONT", reg_f) + "\n"
    out += ts_regions(f"FEMALE_{P}_REGIONS_BACK", reg_b)
    path = f"{OUT_DIR}/bodyArtworkFemale{'IM' if route=='im' else 'SubQ'}.ts"
    open(path, "w").write(out)
    print(f"wrote {path}: base {len(base_f)}/{len(base_b)}, regions {len(reg_f)}/{len(reg_b)}")


IM_HEADER = '''/**
 * Female intramuscular (IM) body artwork (Spec 19) — Angus's hand-authored front &
 * back silhouettes. GENERATED. Same split as the male set: the dark base body + the
 * individually-selectable REGIONS (each mapped to its catalogue site id). MIRROR
 * convention: image-left → the "-l" (left) site on BOTH views, so screen-left is
 * always the user's own left. Drawn in the SAME 1491×2109 canvas as the male art, so
 * it reuses the identical transform onto the 0–100 grid — switching sex or route
 * never resizes or shifts the body.
 *
 * NOTE: the female IM art has no PEC regions (Angus's set omits them), so
 * `im-pec-l` / `im-pec-r` are not selectable for female users — see
 * `sitesForSex` in `lib/home/siteCatalog.ts`, which filters them from the catalogue.
 */
import type { BodyRegion } from "@/components/sites/bodyArtworkIM"
'''

SUBQ_HEADER = '''/**
 * Female subcutaneous (Sub-Q) body artwork (Spec 19) — Angus's hand-authored front &
 * back silhouettes. GENERATED. Same split as the male set: the dark base body + the
 * individually-selectable REGIONS (each mapped to its catalogue site id). MIRROR
 * convention: image-left → the "-l" (left) site on BOTH views. Drawn in the SAME
 * 1491×2109 canvas as the male art, so it reuses the identical transform onto the
 * 0–100 grid. Covers all 14 Sub-Q sites (a 1:1 match with the male set).
 */
import type { BodyRegion } from "@/components/sites/bodyArtworkIM"
'''

TRANSFORM = '"translate(12.0465 -4.3425) scale(0.05074)"'

emit("im", IM_HEADER, TRANSFORM, [("fem_im_front.svg", IM_FRONT), ("fem_im_back.svg", IM_BACK)])
emit("subq", SUBQ_HEADER, TRANSFORM, [("fem_subq_front.svg", SUBQ_FRONT), ("fem_subq_back.svg", SUBQ_BACK)])
