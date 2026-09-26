/**
 * How a body-map region is reached: its accessible name and its invisible hit
 * halo. Pure (no React, no DOM), beside the artwork accessors in
 * `bodyArtwork.ts`; tested in `lib/sites/regionHit.test.ts`.
 */
import { siteDisplayName } from "@/lib/home/siteCatalog"

/**
 * A region's accessible name: the app's words for the site ("Front Quad,
 * Left"), never the catalogue's spaced dash (build-brief-final §3.4; cold
 * reviews D25 and F13). `selected` adds the state for a picked region.
 */
export function regionAccessibleName(label: string, selected: boolean): string {
  return `${siteDisplayName(label)}${selected ? ", selected" : ""}`
}

/* ---------------------------------------------------------------------------
   THE HIT HALO (cold review D8). Some regions are drawn as small as 9 x 42
   (Outer Quad) and 13 x 29 (Ventroglute) CSS pixels, well under the 44-point
   reach every other control has. The drawing is Angus's and does not change;
   what changes is where a tap lands.

   Each tappable region that needs it gets an invisible twin: its own outline,
   stroked wide and transparent, in a layer UNDER every region's fill. That
   order is the whole rule:
   - A tap on any region's own paint always lands on that region, because every
     fill sits above every halo. A halo can never take a neighbour's tap (the
     way the first, blanket `.site-hit` halo let Front Quad swallow Outer Quad).
   - A tap just outside a region, on the body or the ground around it, lands on
     the halo, so a thin region is reachable from a finger's width away.
   - Where two halos overlap in the gap between regions, the SMALLER region's
     halo is drawn later and wins: the region that needs the reach gets it.
   - Each halo is only as wide as its region needs: enough to take the region's
     narrow side to `HALO_REACH`, and none for a region already that wide. A
     blanket width reached far past the big regions and made most of the torso
     a target (drawn and looked at, 26 Sep).
   The halo draws nothing and suggests nothing ("never suggest a site"): it is
   not focusable, not announced, and never lit.

   The halo scales with the drawing (a plain stroke in the artwork's own units),
   so its reach is a share of the body, like the regions themselves.
   --------------------------------------------------------------------------- */

/**
 * The span every tappable region reaches across its narrow side, in the map's
 * 0-100 units: 44px on a 284px map. The map is drawn 250 to 360px wide in the
 * app, so the reach is 39 to 56px there.
 */
export const HALO_REACH = 15.5

/** The `scale(k)` factor of an artwork transform ("translate(..) scale(k)"). */
export function artScale(transform: string): number {
  const m = /scale\(\s*(-?[\d.]+(?:e[-+]?\d+)?)/.exec(transform)
  const k = m ? Number(m[1]) : 1
  return Number.isFinite(k) && k > 0 ? k : 1
}

export interface RegionHalo {
  siteId: string
  d: string
  /** The halo's stroke width, in the artwork's own units (it scales with it). */
  strokeWidth: number
}

/**
 * The halos to draw for a body's regions, in draw order (largest region
 * first, so the smallest one's halo is on top where two meet), each as wide as
 * its region needs to span `HALO_REACH` across its narrow side. A stroke of
 * width W reaches W/2 beyond the outline on each side, so the region spans its
 * narrow side plus W. Regions already that wide, and paths with no points, get
 * none. `transform` is the artwork's own (`routeTransform`).
 */
export function regionHalos(
  regions: readonly { siteId: string; d: string }[],
  transform: string,
): RegionHalo[] {
  const target = HALO_REACH / artScale(transform)
  const out: RegionHalo[] = []
  for (const r of haloOrder(regions)) {
    const b = pathBounds(r.d)!
    const strokeWidth = target - Math.min(b.w, b.h)
    if (strokeWidth > 0) out.push({ siteId: r.siteId, d: r.d, strokeWidth })
  }
  return out
}

export interface PathBounds {
  x: number
  y: number
  w: number
  h: number
}

/**
 * The box around a path, from its points and control points. A cubic curve
 * lies inside its control points' hull, so the box is exact for straight edges
 * and at most a little generous for curves, which is all the halo's ORDER
 * needs. Handles absolute and relative M, L, H, V, C, S, Q, T and Z (the body
 * artwork uses absolute M, L, H, V, C and Z); an arc counts its end point.
 * Returns null for a path with no points.
 */
export function pathBounds(d: string): PathBounds | null {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g)
  if (!tokens) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (x: number, y: number) => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0
  let cmd = ""
  let i = 0
  const num = () => Number(tokens[i++])
  const hasNum = () => i < tokens.length && !/[a-zA-Z]/.test(tokens[i])
  while (i < tokens.length) {
    const from = i
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++]
    else if (!cmd) return null
    const rel = cmd === cmd.toLowerCase()
    const ox = rel ? cx : 0
    const oy = rel ? cy : 0
    switch (cmd.toUpperCase()) {
      case "M":
      case "L":
      case "T": {
        if (!hasNum()) break
        cx = ox + num()
        cy = oy + num()
        add(cx, cy)
        if (cmd === "M" || cmd === "m") {
          startX = cx
          startY = cy
          // Further pairs after a moveto are linetos.
          cmd = rel ? "l" : "L"
        }
        break
      }
      case "H":
        if (!hasNum()) break
        cx = (rel ? cx : 0) + num()
        add(cx, cy)
        break
      case "V":
        if (!hasNum()) break
        cy = (rel ? cy : 0) + num()
        add(cx, cy)
        break
      case "C": {
        if (!hasNum()) break
        for (let k = 0; k < 3; k++) {
          const x = ox + num()
          const y = oy + num()
          add(x, y)
          if (k === 2) {
            cx = x
            cy = y
          }
        }
        break
      }
      case "S":
      case "Q": {
        if (!hasNum()) break
        for (let k = 0; k < 2; k++) {
          const x = ox + num()
          const y = oy + num()
          add(x, y)
          if (k === 1) {
            cx = x
            cy = y
          }
        }
        break
      }
      case "A": {
        if (!hasNum()) break
        i += 5
        cx = ox + num()
        cy = oy + num()
        add(cx, cy)
        break
      }
      case "Z":
        cx = startX
        cy = startY
        break
      default:
        return null
    }
    // Every pass consumes a letter or numbers. One that consumed nothing (a
    // number after Z) is a malformed path, not a loop.
    if (i === from) return null
  }
  if (!Number.isFinite(minX)) return null
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/**
 * The regions in the order their halos are drawn: largest box first, so the
 * smallest region's halo is on top where two halos meet. Ties keep the
 * artwork's order. Regions whose path has no points are left out.
 */
export function haloOrder<T extends { siteId: string; d: string }>(
  regions: readonly T[],
): T[] {
  return regions
    .map((r, index) => ({ r, index, b: pathBounds(r.d) }))
    .filter((e): e is { r: T; index: number; b: PathBounds } => e.b !== null)
    .sort((a, b) => b.b.w * b.b.h - a.b.w * a.b.h || a.index - b.index)
    .map((e) => e.r)
}
