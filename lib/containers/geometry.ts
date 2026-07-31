/**
 * Container artwork geometry — pure maths, no React (see `code-standards.md`).
 *
 * Only the VIAL has a real fill level: it is derived from remaining volume
 * against the vial's total, which `v_inventory_math` already answers. Bottles
 * and tubs have no storage tracking yet, so they render at a fixed illustrative
 * fill and their surrounding card must not imply a number we do not have
 * (Spec 01 · part two → Fill behaviour).
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
