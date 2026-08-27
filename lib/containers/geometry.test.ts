import { describe, expect, it } from "vitest"

import {
  BOTTLE_FILL_BOTTOM,
  BOTTLE_FILL_TOP,
  ILLUSTRATIVE_FILL,
  TUB_FILL_BOTTOM,
  TUB_FILL_TOP,
  VIAL_FILL_BOTTOM,
  VIAL_FILL_SPAN,
  VIAL_FILL_TOP,
  VIAL_MENISCUS_HEIGHT,
  bottleFillSurface,
  clampFill,
  tubPowder,
  vialLiquid,
} from "./geometry"
import { inventoryTypeForCompound } from "./form"

describe("vialLiquid", () => {
  it("is empty at 0% — floor height, nothing drawn above it", () => {
    expect(vialLiquid(0)).toEqual({
      y: VIAL_FILL_BOTTOM,
      height: 0,
      meniscusHeight: 0,
    })
  })

  it("sits halfway at 50%", () => {
    const { y, height } = vialLiquid(0.5)
    expect(height).toBe(VIAL_FILL_SPAN / 2)
    expect(height).toBe(32.25)
    expect(y).toBe(54.25)
    // The surface is exactly midway between empty and full.
    expect(y).toBe((VIAL_FILL_TOP + VIAL_FILL_BOTTOM) / 2)
  })

  it("reaches the shoulder at 100%", () => {
    expect(vialLiquid(1)).toEqual({
      y: VIAL_FILL_TOP,
      height: VIAL_FILL_SPAN,
      meniscusHeight: VIAL_MENISCUS_HEIGHT,
    })
    expect(VIAL_FILL_SPAN).toBe(64.5)
  })

  it("keeps the floor still at every level — y + height is always the floor", () => {
    for (const fill of [0, 0.13, 0.25, 0.5, 0.75, 0.99, 1]) {
      const { y, height } = vialLiquid(fill)
      expect(y + height).toBeCloseTo(VIAL_FILL_BOTTOM, 10)
    }
  })

  it("never lets the meniscus outgrow the liquid it sits on", () => {
    const shallow = vialLiquid(0.02)
    expect(shallow.height).toBeLessThan(VIAL_MENISCUS_HEIGHT)
    expect(shallow.meniscusHeight).toBe(shallow.height)
  })

  it("clamps out-of-range and non-finite fills rather than overflowing the glass", () => {
    expect(vialLiquid(1.4).height).toBe(VIAL_FILL_SPAN)
    expect(vialLiquid(-0.3).height).toBe(0)
    expect(vialLiquid(Number.NaN).height).toBe(0)
  })
})

describe("clampFill", () => {
  it("passes an in-range fill through untouched", () => {
    expect(clampFill(0.42)).toBe(0.42)
  })

  it("treats a non-finite fill as empty — garbage must not draw a full vial", () => {
    expect(clampFill(Number.NaN)).toBe(0)
    expect(clampFill(Number.POSITIVE_INFINITY)).toBe(0)
    expect(clampFill(Number.NEGATIVE_INFINITY)).toBe(0)
  })
})

describe("inventoryTypeForCompound — one answer for every surface", () => {
  it("resolves a catalogue compound by name and route", () => {
    expect(inventoryTypeForCompound("Testosterone Enanthate", "im")).toBe(
      "preconcentrated",
    )
  })

  it("falls back to the ROUTE off-catalogue, so a custom injectable is a vial", () => {
    // Protocol did this and the other screens returned null, so the same custom
    // compound drew a vial on one screen and a bottle on another.
    expect(inventoryTypeForCompound("My Secret Blend", "subq")).toBe(
      "preconcentrated",
    )
    expect(inventoryTypeForCompound("My Secret Blend", "im")).toBe(
      "preconcentrated",
    )
    expect(inventoryTypeForCompound("Some Custom Tablet", "po")).toBe("oral_solid")
  })

  it("never returns null, so no caller has to invent its own fallback", () => {
    for (const [n, m] of [["", "po"], ["  ", "im"], ["Unknown", "subq"]] as const) {
      expect(inventoryTypeForCompound(n, m)).not.toBeNull()
    }
  })

  it("ignores case and surrounding whitespace in the name", () => {
    expect(inventoryTypeForCompound("  testosterone enanthate  ", "im")).toBe(
      inventoryTypeForCompound("Testosterone Enanthate", "im"),
    )
  })
})

describe("containersHaveOneSource — the structural guard", () => {
  /**
   * Twice now a screen has kept its own copy of this lookup and quietly drawn a
   * different container from the screen next to it. The second time was caused
   * by FIXING the first: consolidating the others onto a route fallback made the
   * one surviving copy — which still returned null off-catalogue — disagree on
   * Home, where nothing had disagreed before.
   *
   * A comment saying "do not copy this" did not stop it. This does. The
   * signature of a private copy is picking ONE inventory type out of a
   * compound's routes — `routesOf(...)` plus a `.inventoryType ?? null` tail —
   * which is exactly what both copies contained and what no other caller does.
   * Offering the full LIST of routes or forms (the add-compound and add-stock
   * sheets) is a different question and is deliberately not caught.
   */
  it("has no private copy of the container lookup anywhere in the app", async () => {
    const { readdir, readFile } = await import("node:fs/promises")
    const { join, relative } = await import("node:path")

    const ROOTS = ["app", "components", "lib"]
    const ALLOWED = [
      "lib/containers/form.ts",
      "lib/compound-categories.ts",
      "lib/containers/geometry.test.ts",
    ]

    async function walk(dir: string): Promise<string[]> {
      const entries = await readdir(dir, { withFileTypes: true })
      const out: string[] = []
      for (const e of entries) {
        const full = join(dir, e.name)
        if (e.isDirectory()) {
          if (e.name === "node_modules" || e.name.startsWith(".")) continue
          out.push(...(await walk(full)))
        } else if (/\.tsx?$/.test(e.name)) {
          out.push(full)
        }
      }
      return out
    }

    /**
     * ⚠️ THE READS RUN IN PARALLEL, AND THAT IS A CORRECTNESS FIX, NOT A SPEED-UP.
     *
     * This walked ~516 files with `await readFile` inside a nested `for`, one at a
     * time. On a loaded machine that exceeds vitest's 5000ms default and the test
     * fails with **"Test timed out in 5000ms"** — before the assertion below has
     * run at all.
     *
     * It was logged as a flake, then as a mystery: reproducing the predicate by
     * hand found no offenders, so "the guard and its stated logic disagree" went
     * into a handover as an unexplained defect. They never disagreed. The guard is
     * correct and the check simply never reached it.
     *
     * ⚠️ A STRUCTURAL GUARD THAT FAILS FOR A REASON UNRELATED TO WHAT IT GUARDS IS
     * WORSE THAN NO GUARD. It trains the next person to re-run it until it passes,
     * which is exactly what happened here across several sessions. So: the reads
     * are concurrent, and the timeout is explicit and generous, so a slow disk
     * produces a SLOW PASS rather than a false failure.
     */
    const files: string[] = []
    for (const root of ROOTS) files.push(...(await walk(root)))
    const candidates = files.filter((file) => {
      const rel = relative(process.cwd(), file).split("\\").join("/")
      return !ALLOWED.some((a) => rel.endsWith(a))
    })
    const sources = await Promise.all(
      candidates.map(async (file) => [file, await readFile(file, "utf8")] as const),
    )

    const offenders: string[] = []
    {
      for (const [file, src] of sources) {
        const rel = relative(process.cwd(), file).split("\\").join("/")
        // The copy's signature: walk a compound's routes, MATCH ONE by route,
        // and take its inventory type. Reading a vial's own stored
        // `inventoryType`, or offering the whole list of forms, is a different
        // question and must not trip this.
        const derivesOneFormFromRoutes =
          src.includes("routesOf(") &&
          /\.route === /.test(src) &&
          /\?\.inventoryType/.test(src)
        if (derivesOneFormFromRoutes) offenders.push(rel)
      }
    }

    /**
     * ⚠️ THE CONTROL: the walk must actually have found the tree. An empty
     * `offenders` is only meaningful if files were READ — a walk that silently
     * returned nothing (wrong cwd, renamed directory) would produce a green pass
     * that proves nothing at all. Rule 0: absent is not the same as unchecked.
     */
    expect(sources.length).toBeGreaterThan(200)
    expect(offenders).toEqual([])
  }, 30_000)
})

describe("tubPowder — the surface falls, the floor stays put", () => {
  it("is empty at 0% and full at 100%", () => {
    expect(tubPowder(0).height).toBe(0)
    expect(tubPowder(0).y).toBe(TUB_FILL_BOTTOM)
    expect(tubPowder(1).y).toBe(TUB_FILL_TOP)
  })

  it("reproduces the OLD fixed artwork at the illustrative fill", () => {
    // The whole reason TUB_FILL_TOP is 34: a container with no stock recorded
    // must look exactly as it did before this became a measurement. The old
    // hardcoded path put the surface at y=56.
    expect(Math.round(tubPowder(ILLUSTRATIVE_FILL).y)).toBe(56)
  })

  it("clamps a nonsense fill instead of drawing outside the tub", () => {
    expect(tubPowder(5).y).toBe(TUB_FILL_TOP)
    expect(tubPowder(-1).y).toBe(TUB_FILL_BOTTOM)
    expect(tubPowder(Number.NaN).height).toBe(0)
  })

  it("never lets the corner radius exceed the height it is rounding", () => {
    // A radius taller than the shape makes the arc double back and the path
    // renders as a bow-tie. Checked across the range where it can bite.
    for (const f of [0.001, 0.01, 0.02, 0.05, 0.1]) {
      const { path, height } = tubPowder(f)
      const radii = [...path.matchAll(/a([\d.]+) /g)].map((m) => Number(m[1]))
      for (const r of radii) expect(r).toBeLessThanOrEqual(height / 2 + 1e-9)
      expect(path).not.toContain("NaN")
    }
  })

  it("tapers the surface as the last of the powder goes", () => {
    expect(tubPowder(0.02).surfaceRx).toBeLessThan(tubPowder(1).surfaceRx)
    expect(tubPowder(0.5).surfaceRx).toBe(tubPowder(1).surfaceRx)
  })
})

describe("bottleFillSurface — tablets leave from the top down", () => {
  it("spans the bottle from its base to its shoulder", () => {
    expect(bottleFillSurface(0)).toBe(BOTTLE_FILL_BOTTOM)
    expect(bottleFillSurface(1)).toBe(BOTTLE_FILL_TOP)
  })

  it("keeps all six original tablets in the bottle at the illustrative fill", () => {
    // Same contract as the tub: a bottle with no stock recorded is drawn
    // exactly as it was before. The six sit at y = 58…83.5.
    const surface = bottleFillSurface(ILLUSTRATIVE_FILL)
    for (const restsAt of [58, 62, 68, 73.5, 79.5, 83.5]) {
      expect(restsAt).toBeGreaterThanOrEqual(surface)
    }
    // …and the two added above them stay out of it, so the default is unchanged.
    for (const restsAt of [38, 45]) {
      expect(restsAt).toBeLessThan(surface)
    }
  })

  it("empties monotonically — no tablet reappears as stock falls", () => {
    const visible = (f: number) =>
      [38, 45, 58, 62, 68, 73.5, 79.5, 83.5].filter((y) => y >= bottleFillSurface(f)).length
    let prior = visible(1)
    for (const f of [0.9, 0.75, 0.6, 0.4, 0.25, 0.1, 0]) {
      const now = visible(f)
      expect(now).toBeLessThanOrEqual(prior)
      prior = now
    }
  })
})
