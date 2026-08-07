/**
 * The one interface all three containers share (Spec 01 · part two). A caller
 * swaps a vial for a tub without touching a prop.
 */
export interface ContainerProps {
  /**
   * Resolved container colour — a `var(--token)` string from
   * `containerColour()`. Never a literal; containers define no colours of their
   * own.
   */
  colour: string
  /**
   * 0…1. **Real on all three containers** (Spec w2b-13, Step 3): it is
   * `remaining_base / total_base` from `v_inventory_math` in every case — volume
   * for a vial, tablets for a bottle, grams for a tub.
   *
   * OMITTED is meaningful and is not the same as 0. A container drawn with no
   * `fill` falls back to `ILLUSTRATIVE_FILL`, which is deliberately not 1,
   * because a caller with no stock figure must not imply one. Pass a number only
   * when you have one.
   */
  fill?: number
  /** Rendered height in px. The artwork scales from its viewBox — there are no
   *  separate small and large variants. */
  size?: number
  className?: string
  /** Accessible label. Containers are decorative (`aria-hidden`) without one. */
  title?: string
}

/** Natural rendered height when a caller doesn't specify one. */
export const DEFAULT_CONTAINER_SIZE = 96
