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
   * 0…1. **Only the vial's fill is real** (remaining volume against the vial's
   * total). Bottles and tubs have no storage tracking yet and default to a fixed
   * illustrative level — the prop exists on all three so the artwork goes live
   * with no rework when tablet and powder counts arrive.
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
