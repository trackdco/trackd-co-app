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

/**
 * Set B's tub (build-brief-final §3.14), in the artwork's `0 0 64 100` viewBox:
 * a body from y=32 to 90 with the lid over its top, so a full tub's powder sits
 * just under the lid.
 */
export const TUB_FILL_TOP = 40
/** Tub floor: two units above the body's bottom edge. */
export const TUB_FILL_BOTTOM = 88
export const TUB_FILL_SPAN = TUB_FILL_BOTTOM - TUB_FILL_TOP

/** The powder's left and right edges, inside the body's walls. */
const TUB_LEFT = 10.5
const TUB_RIGHT = 53.5

/** Round to two places, so a path reads the same on the server and the client
 *  and carries no floating-point tails. */
const r2 = (v: number) => Math.round(v * 100) / 100

export interface TubPowder {
  /** The powder's level: the line its uneven surface is drawn about. */
  y: number
  /** Height of the powder mass. */
  height: number
  /** The powder mass: an uneven, scooped surface down to the floor. */
  path: string
  /** The lit band along the top of the powder, never deeper than the powder. */
  surfacePath: string
}

/**
 * The powder for a given fill. Mirrors {@link vialLiquid}: the surface falls as
 * the tub empties while the floor stays put.
 *
 * The surface is set B's scooped curve. Its unevenness flattens as the powder
 * thins, so the last of it lies on the floor rather than dipping through it.
 */
export function tubPowder(fill: number): TubPowder {
  const height = TUB_FILL_SPAN * clampFill(fill)
  const y = TUB_FILL_BOTTOM - height
  const a = Math.min(1, height / 6)
  const x = (t: number) => r2(TUB_LEFT + (TUB_RIGHT - TUB_LEFT) * t)
  const at = (dy: number) => r2(y + dy * a)
  const surface =
    `M${TUB_LEFT} ${at(2)}` +
    ` Q${x(0.2)} ${at(-2.4)} ${x(0.42)} ${at(1)}` +
    ` Q${x(0.64)} ${at(3.2)} ${x(0.82)} ${at(-1.4)}` +
    ` Q${x(0.92)} ${at(-2.6)} ${TUB_RIGHT} ${at(2)}`
  const band = r2(y + Math.min(6, height))
  const bulge = r2(y + Math.min(9.5, height))
  return {
    y,
    height,
    path: `${surface} L${TUB_RIGHT} ${TUB_FILL_BOTTOM} L${TUB_LEFT} ${TUB_FILL_BOTTOM} Z`,
    surfacePath: `${surface} L${TUB_RIGHT} ${band} Q32 ${bulge} ${TUB_LEFT} ${band} Z`,
  }
}

export interface TubGrain {
  /** The white grains, as one path. */
  light: string
  /** The grey grains, as one path. */
  shade: string
}

/**
 * The grain in the powder: set B's 34 seeded specks, a third of them grey. The
 * seed is fixed, so the same fill draws the same grain on the server and the
 * client. Two paths rather than 34 circles, because a screen can hold a dozen
 * tubs. A speck that would sit below the floor (a nearly empty tub) is dropped.
 */
export function tubGrain(fill: number): TubGrain {
  const { y, height } = tubPowder(fill)
  if (height <= 0) return { light: "", shade: "" }
  let seed = 11
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  let light = ""
  let shade = ""
  for (let i = 0; i < 34; i++) {
    const cx = r2(12 + rnd() * 40)
    const cy = r2(y + 5 + rnd() * Math.max(1, TUB_FILL_BOTTOM - y - 7))
    const r = r2(0.6 + rnd() * 1.2)
    if (cy + r > TUB_FILL_BOTTOM) continue
    const dot = `M${r2(cx - r)} ${cy}a${r} ${r} 0 1 0 ${r2(2 * r)} 0a${r} ${r} 0 1 0 ${r2(-2 * r)} 0Z`
    if (i % 3 === 0) shade += dot
    else light += dot
  }
  return { light, shade }
}

/* ---------------------------------------------------------------- bottle */

/** Contents surface at a full bottle, in the artwork's `0 0 60 96` viewBox:
 *  set B's body runs from y=19 to 92, and its contents from 23 to 89. */
export const BOTTLE_FILL_TOP = 23
/** The inside of the bottle's rounded base, where the last tablet rests. */
export const BOTTLE_FILL_BOTTOM = 89
export const BOTTLE_FILL_SPAN = BOTTLE_FILL_BOTTOM - BOTTLE_FILL_TOP

/**
 * The height the contents reach for a given fill.
 *
 * A bottle of tablets has no liquid surface to draw, so the artwork shows a
 * COUNT instead: each tablet declares the y it sits at, and the bottle renders
 * the ones at or below this line. Emptying the bottle removes them from the top
 * down, which is both what happens and what reads at a glance.
 *
 * At `ILLUSTRATIVE_FILL` the six lowest of {@link BOTTLE_TABLETS} are in the
 * bottle and the top two are not, so only a genuinely near-full bottle shows
 * all eight.
 */
export function bottleFillSurface(fill: number): number {
  return BOTTLE_FILL_BOTTOM - BOTTLE_FILL_SPAN * clampFill(fill)
}

export interface BottleTablet {
  /** Centre, in the bottle's viewBox. `y` is where it rests. */
  x: number
  y: number
  /** A capsule is a rotated pill shape; a tablet is a disc. */
  kind: "capsule" | "tablet"
  /** White or grey: set B alternates them. */
  shade: "light" | "shade"
  /** A capsule's tilt, in degrees. */
  tilt: number
}

/**
 * Set B's tablets and capsules, listed bottom-up so the last to go is the first
 * written. White and grey, never the compound's colour: the colour is on the
 * body, because a solid's container is coloured and a liquid's is clear.
 */
export const BOTTLE_TABLETS: readonly BottleTablet[] = [
  { x: 25.5, y: 84, kind: "capsule", shade: "shade", tilt: -17 },
  { x: 39.5, y: 80, kind: "capsule", shade: "light", tilt: -10 },
  { x: 26.5, y: 74, kind: "tablet", shade: "shade", tilt: 0 },
  { x: 41, y: 68.5, kind: "capsule", shade: "light", tilt: 4 },
  { x: 24, y: 62.5, kind: "capsule", shade: "shade", tilt: 11 },
  { x: 36, y: 58, kind: "tablet", shade: "light", tilt: 0 },
  { x: 35.5, y: 46, kind: "capsule", shade: "shade", tilt: -9 },
  { x: 24, y: 39, kind: "capsule", shade: "light", tilt: -2 },
]

/* --------------------------------------------------------------- dropper */

/** Liquid surface at a full dropper, in the artwork's `0 0 60 96` viewBox: the
 *  top of the body, just under its shoulder (the prototype's `88 - 46`). */
export const DROPPER_FILL_TOP = 42
/** Dropper floor — the liquid surface at empty. */
export const DROPPER_FILL_BOTTOM = 88
export const DROPPER_FILL_SPAN = DROPPER_FILL_BOTTOM - DROPPER_FILL_TOP

/** The dropper's liquid for a given fill: the vial's rule on the dropper's
 *  shorter body (the neck and shoulder hold no liquid). */
export function dropperLiquid(fill: number): VialLiquid {
  const height = DROPPER_FILL_SPAN * clampFill(fill)
  return {
    y: DROPPER_FILL_BOTTOM - height,
    height,
    meniscusHeight: Math.min(VIAL_MENISCUS_HEIGHT, height),
  }
}
