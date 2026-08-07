/**
 * Container artwork geometry — pure maths, no React (see `code-standards.md`).
 *
 * **All three containers now have a real fill** (Spec w2b-13, Step 3). It is
 * `remaining_base / total_base` from `v_inventory_math` in every case — the same
 * ratio the vial has always used, which the view has always computed for orals
 * and now computes for tubs too (`supabase/protocol/015`, `016`).
 *
 * `ILLUSTRATIVE_FILL` survives as the fallback for a container drawn with no
 * `fill` prop at all: the empty-state previews, and any card for a compound with
 * no stock recorded. A caller that HAS a number passes it; a caller that has
 * none still must not imply one (Spec 01 · part two → Fill behaviour).
 */

/** Liquid surface at a full vial, in the artwork's `0 0 60 96` viewBox. */
export const VIAL_FILL_TOP = 22
/** Vial floor — the liquid surface at empty. */
export const VIAL_FILL_BOTTOM = 86.5
/** Travel between empty and full. */
export const VIAL_FILL_SPAN = VIAL_FILL_BOTTOM - VIAL_FILL_TOP

/** Height of the lighter meniscus band sitting on the liquid surface. */
export const VIAL_MENISCUS_HEIGHT = 7

/**
 * The illustrative fill bottles and tubs draw at. Deliberately not 1 — a full
 * container reads as a claim about stock — and not a number any card may label.
 */
export const ILLUSTRATIVE_FILL = 0.62

/** Clamp any incoming fill to 0…1, treating a non-finite value as empty. */
export function clampFill(fill: number): number {
  if (!Number.isFinite(fill)) return 0
  return Math.min(1, Math.max(0, fill))
}

export interface VialLiquid {
  /** Top edge of the liquid rect. */
  y: number
  /** Height of the liquid rect. */
  height: number
  /** Meniscus height, never taller than the liquid it sits on. */
  meniscusHeight: number
}

/**
 * Liquid rect for a given fill. `height = VIAL_FILL_SPAN * fill` and
 * `y = VIAL_FILL_BOTTOM - height`, so the surface falls as the vial empties
 * while the floor stays put.
 */
export function vialLiquid(fill: number): VialLiquid {
  const height = VIAL_FILL_SPAN * clampFill(fill)
  return {
    y: VIAL_FILL_BOTTOM - height,
    height,
    meniscusHeight: Math.min(VIAL_MENISCUS_HEIGHT, height),
  }
}

/* ------------------------------------------------------------------- tub */

/** Powder surface at a full tub, in the artwork's `0 0 64 100` viewBox — just
 *  below the inner rim ellipse at y≈31.5. */
export const TUB_FILL_TOP = 34
/** Tub floor: the inside of the body's rounded bottom. */
export const TUB_FILL_BOTTOM = 92
export const TUB_FILL_SPAN = TUB_FILL_BOTTOM - TUB_FILL_TOP

/** Left/right inner walls and the body's bottom corner radius. */
const TUB_LEFT = 11.5
const TUB_RIGHT = 52.5
const TUB_CORNER = 5

export interface TubPowder {
  /** Top edge of the powder — where the surface ellipse sits. */
  y: number
  /** Height of the powder mass. */
  height: number
  /** The powder body as an SVG path, with the tub's rounded bottom corners. */
  path: string
  /** Horizontal radius of the surface ellipse, tapered as the powder runs out so
   *  the last of it reads as a heap in the bottom rather than a full-width disc. */
  surfaceRx: number
}

/**
 * The powder mass for a given fill. Mirrors {@link vialLiquid}: the surface
 * falls as the tub empties while the floor stays put.
 *
 * `TUB_FILL_TOP` is 34 rather than the body's true inner top because that is
 * what reproduces the previous fixed artwork EXACTLY at `ILLUSTRATIVE_FILL`
 * (0.62 → a surface at y=56, which is where the old hardcoded path had it). A
 * container with no stock recorded therefore looks precisely as it did before
 * this became a real measurement.
 */
export function tubPowder(fill: number): TubPowder {
  const f = clampFill(fill)
  const height = TUB_FILL_SPAN * f
  const y = TUB_FILL_BOTTOM - height
  // The corner radius cannot exceed the height it is rounding, or the arc
  // doubles back on itself and the path renders as a bow-tie.
  const r = Math.min(TUB_CORNER, height / 2)
  const w = TUB_RIGHT - TUB_LEFT
  const path =
    `M${TUB_LEFT} ${y} h${w} v${height - r} ` +
    `a${r} ${r} 0 0 1 ${-r} ${r} h${-(w - 2 * r)} ` +
    `a${r} ${r} 0 0 1 ${-r} ${-r} z`
  return {
    y,
    height,
    path,
    // Full width down to a fifth full, then tapering — powder does not hold a
    // flat surface across the tub once there is barely any of it.
    surfaceRx: 20.5 * Math.min(1, Math.max(0.35, f / 0.2)),
  }
}

/* ---------------------------------------------------------------- bottle */

/** Contents surface at a full bottle, in the artwork's `0 0 60 96` viewBox. */
export const BOTTLE_FILL_TOP = 22
/** The inside of the bottle's rounded base, where the last tablet rests. */
export const BOTTLE_FILL_BOTTOM = 90
export const BOTTLE_FILL_SPAN = BOTTLE_FILL_BOTTOM - BOTTLE_FILL_TOP

/**
 * The height the contents reach for a given fill.
 *
 * A bottle of tablets has no liquid surface to draw, so the artwork shows a
 * COUNT instead: each tablet declares the y it sits at, and the bottle renders
 * the ones at or below this line. Emptying the bottle removes them from the top
 * down, which is both what happens and what reads at a glance.
 *
 * The constants are chosen so all six of the original tablets sit below the line
 * at `ILLUSTRATIVE_FILL` — a bottle with no stock recorded is drawn exactly as
 * it was before this was a real measurement — while the two added above them
 * only appear on a genuinely near-full bottle.
 */
export function bottleFillSurface(fill: number): number {
  return BOTTLE_FILL_BOTTOM - BOTTLE_FILL_SPAN * clampFill(fill)
}
