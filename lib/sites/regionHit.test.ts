import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { BodyMap } from "@/components/sites/BodyMap"
import { routeRegions, routeTransform } from "@/components/sites/bodyArtwork"
import {
  HALO_REACH,
  artScale,
  haloOrder,
  pathBounds,
  regionAccessibleName,
  regionHalos,
} from "@/components/sites/regionHit"
import { IM_SITES, SUBQ_SITES, sitesForSex } from "@/lib/home/siteCatalog"
import type { InjectionSiteRow } from "@/lib/db/types"

const BODIES = [
  ["male", "im"],
  ["male", "subq"],
  ["female", "im"],
  ["female", "subq"],
] as const
const ASPECTS = ["anterior", "posterior"] as const

/** Catalogue rows as the map receives them (only id, label and route are read). */
function rows(route: "im" | "subq", sex: "male" | "female"): InjectionSiteRow[] {
  const defs = sitesForSex(route === "im" ? IM_SITES : SUBQ_SITES, sex)
  return defs.map((d, i) => ({ id: d.id, label: d.label, route, sort_order: i }) as unknown as InjectionSiteRow)
}

function map(props: Partial<Parameters<typeof BodyMap>[0]> & { route?: "im" | "subq"; sex?: "male" | "female" }) {
  const { route = "im", sex = "male", ...rest } = props
  return renderToStaticMarkup(
    createElement(BodyMap, {
      sites: rows(route, sex),
      mode: "pick",
      sex,
      activeIds: [],
      onTapSite: () => {},
      ...rest,
    }),
  )
}

/** The markup of each of the two stacked panels' svgs, front then back. */
const panels = (html: string) => html.split("<svg").slice(1)

/** The halo layer's markup in one panel: from its group to the first region. */
function haloLayer(panel: string): string {
  const start = panel.indexOf('<g aria-hidden="true" fill="transparent"')
  expect(start).toBeGreaterThan(-1)
  return panel.slice(start, panel.indexOf("data-region="))
}

describe("regionAccessibleName (D25, F13)", () => {
  it("names a region in the app's words, without the catalogue's spaced dash", () => {
    expect(regionAccessibleName("Front Quad – Left", false)).toBe("Front Quad, Left")
    expect(regionAccessibleName("Outer Thigh – Lower Right", true)).toBe("Outer Thigh, Lower Right, selected")
  })

  it("does so for every site in the catalogue", () => {
    for (const s of [...IM_SITES, ...SUBQ_SITES]) {
      expect(regionAccessibleName(s.label, false)).not.toMatch(/\s[–—-]\s/)
    }
  })

  it("is what the body map announces and titles each region with", () => {
    const html = map({ activeIds: ["im-quad-out-l"] })
    expect(html).toContain('aria-label="Outer Quad, Left, selected"')
    expect(html).toContain('aria-label="Front Quad, Right"')
    expect(html).toContain("<title>Outer Quad, Left</title>")
    expect(html).not.toMatch(/aria-label="[^"]*\s–\s/)
    expect(html).not.toMatch(/<title>[^<]*\s–\s/)
  })
})

describe("pathBounds", () => {
  it("boxes straight edges exactly", () => {
    expect(pathBounds("M0 0L10 0L10 5Z")).toEqual({ x: 0, y: 0, w: 10, h: 5 })
    expect(pathBounds("M2 3H8V9H2Z")).toEqual({ x: 2, y: 3, w: 6, h: 6 })
  })

  it("follows relative commands and implicit linetos", () => {
    expect(pathBounds("m1 1l2 3h4v-6z")).toEqual({ x: 1, y: -2, w: 6, h: 6 })
    expect(pathBounds("M0 0 10 10 -5 2Z")).toEqual({ x: -5, y: 0, w: 15, h: 10 })
  })

  it("includes a curve's control points, so the box never undershoots it", () => {
    const b = pathBounds("M0 0C0 -10 10 -10 10 0Z")!
    expect(b.y).toBe(-10)
    expect(b.w).toBe(10)
  })

  it("returns null for an empty or malformed path rather than looping", () => {
    expect(pathBounds("")).toBeNull()
    expect(pathBounds("M0 0Z 5")).toBeNull()
    expect(pathBounds("12 4")).toBeNull()
  })

  it("boxes every region of every body inside the artwork's canvas", () => {
    for (const [sex, route] of BODIES) {
      for (const aspect of ASPECTS) {
        for (const r of routeRegions(route, aspect, sex)) {
          const b = pathBounds(r.d)
          expect(b, r.siteId).not.toBeNull()
          expect(b!.x).toBeGreaterThanOrEqual(0)
          expect(b!.y).toBeGreaterThanOrEqual(0)
          expect(b!.x + b!.w).toBeLessThanOrEqual(1491)
          expect(b!.y + b!.h).toBeLessThanOrEqual(2109)
          expect(b!.w * b!.h).toBeGreaterThan(0)
        }
      }
    }
  })
})

describe("the hit halos (D8)", () => {
  it("reads the artwork's scale from its transform", () => {
    expect(artScale("translate(12.0465 -4.3425) scale(0.05074)")).toBe(0.05074)
    expect(artScale("scale(2 3)")).toBe(2)
    expect(artScale("translate(1 2)")).toBe(1)
  })

  it("aim for a finger's reach: 44px on a 284px map", () => {
    expect((HALO_REACH / 100) * 284).toBeCloseTo(44, 0)
  })

  it("take every region's narrow side to that reach, and add nothing to a region already wide enough", () => {
    for (const [sex, route] of BODIES) {
      const t = routeTransform(route, sex)
      const k = artScale(t)
      for (const aspect of ASPECTS) {
        const regions = routeRegions(route, aspect, sex)
        const halos = new Map(regionHalos(regions, t).map((h) => [h.siteId, h.strokeWidth]))
        for (const r of regions) {
          const b = pathBounds(r.d)!
          const narrow = Math.min(b.w, b.h) * k
          const reach = narrow + (halos.get(r.siteId) ?? 0) * k
          expect(reach, `${sex} ${route} ${r.siteId}`).toBeGreaterThanOrEqual(HALO_REACH - 1e-9)
          if (narrow >= HALO_REACH) expect(halos.has(r.siteId)).toBe(false)
          else expect(reach).toBeCloseTo(HALO_REACH, 6)
        }
      }
    }
    // A region already wide enough gets no halo at all.
    const big = { siteId: "big", d: "M0 0H400V400H0Z" }
    const thin = { siteId: "thin", d: "M0 0H50V400H0Z" }
    expect(regionHalos([big, thin], "scale(0.05)").map((h) => h.siteId)).toEqual(["thin"])
    expect(regionHalos([thin], "scale(0.05)")[0].strokeWidth).toBeCloseTo(HALO_REACH / 0.05 - 50, 6)
  })

  it("take the thinnest regions the review measured (Outer Quad, Ventroglute) to a finger's width", () => {
    // The review saw Outer Quad at 9px and Ventroglute at 13px across; on the
    // same map they now span HALO_REACH units.
    const t = routeTransform("im", "male")
    const halos = regionHalos(routeRegions("im", "anterior", "male"), t)
    for (const id of ["im-quad-out-l", "im-quad-out-r", "im-vglute-l", "im-vglute-r"]) {
      expect(halos.find((h) => h.siteId === id), id).toBeDefined()
    }
  })

  it("keep every region, largest first, so the smallest region's halo is on top", () => {
    for (const [sex, route] of BODIES) {
      for (const aspect of ASPECTS) {
        const regions = routeRegions(route, aspect, sex)
        const ordered = haloOrder(regions)
        expect(ordered.map((r) => r.siteId).sort()).toEqual(regions.map((r) => r.siteId).sort())
        const areas = ordered.map((r) => {
          const b = pathBounds(r.d)!
          return b.w * b.h
        })
        for (let i = 1; i < areas.length; i++) expect(areas[i]).toBeLessThanOrEqual(areas[i - 1])
      }
    }
  })

  it("put the thin Outer Quad and Ventroglute above Front Quad, the region beside them", () => {
    for (const sex of ["male", "female"] as const) {
      const ids = haloOrder(routeRegions("im", "anterior", sex)).map((r) => r.siteId)
      for (const side of ["l", "r"]) {
        const front = ids.indexOf(`im-quad-front-${side}`)
        expect(ids.indexOf(`im-quad-out-${side}`)).toBeGreaterThan(front)
        expect(ids.indexOf(`im-vglute-${side}`)).toBeGreaterThan(front)
      }
    }
  })

  it("sit UNDER every region's fill, so no halo can take a tap from a neighbour", () => {
    for (const [sex, route] of BODIES) {
      const [front] = panels(map({ route, sex }))
      const lastHalo = front.lastIndexOf("data-halo=")
      const firstRegion = front.indexOf("data-region=")
      expect(lastHalo, `${sex} ${route}`).toBeGreaterThan(-1)
      expect(lastHalo).toBeLessThan(firstRegion)
      // One halo per thin tappable region on the side that is showing.
      const halos = front.match(/data-halo="/g)?.length ?? 0
      expect(halos).toBe(regionHalos(routeRegions(route, "anterior", sex), routeTransform(route, sex)).length)
      expect(halos).toBeGreaterThan(0)
    }
  })

  it("are invisible and silent: transparent, hidden from assistive tech, never focusable", () => {
    const [front] = panels(map({}))
    const layer = haloLayer(front)
    expect(layer).toMatch(/^<g aria-hidden="true" fill="transparent" stroke="transparent"/)
    expect(layer).not.toMatch(/tabindex|role=|aria-label|<title>/)
    // Only transparent paint: no colour of any kind reaches the screen.
    expect(layer.match(/(fill|stroke)="[^"]*"/g)).toEqual(['fill="transparent"', 'stroke="transparent"'])
  })

  it("are drawn only on the side that shows, and only where a tap does something", () => {
    // The faded-out side takes no taps.
    const [, back] = panels(map({}))
    expect(back).not.toContain("data-halo=")
    // A read-only map, a disabled one, or one with nothing to tap draws none.
    expect(map({ mode: "recency", onTapSite: undefined })).not.toContain("data-halo=")
    expect(map({ mode: "recency" })).not.toContain("data-halo=")
    expect(map({ disabled: true })).not.toContain("data-halo=")
    expect(map({ onTapSite: undefined })).not.toContain("data-halo=")
  })

  it("never mark a site: a halo carries no fill colour and no selected state", () => {
    const [front] = panels(map({ activeIds: [] }))
    const layer = haloLayer(front)
    expect(layer).not.toMatch(/accent-amber|ramp|selected/)
  })
})
