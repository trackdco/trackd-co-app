/**
 * Syringe barrel geometry and scale — pure maths, no React (see
 * `code-standards.md`).
 *
 * The point of spec 07's graphic is PROPORTION: ten units on a 0.5 mL barrel
 * fills a fifth of it, the same ten units on a 1 mL barrel fills a tenth. So the
 * fill is always a fraction of the SELECTED syringe's capacity, never an
 * absolute length, and everything that decides how the barrel is drawn lives
 * here rather than inside the SVG.
 *
 * Barrels are marked in U-100 insulin units, which is the scale a user reads off
 * the syringe in their hand: 1 mL = 100 U. That is a unit conversion printed on
 * the syringe, not a dosing judgement.
 */

export type SyringeSizeId = "0.3" | "0.5" | "1"

export interface SyringeSize {
  id: SyringeSizeId
  /** Capacity in mL, as printed on the barrel. */
  ml: number
  /** The same capacity in U-100 units — the scale the barrel is marked in. */
  units: number
  /** Smallest drawn graduation, in units. */
  minorStep: number
  /**
   * Interval between LABELLED graduations, in units. Chosen so a value anywhere
   * between roughly 10 and 40 units is readable straight off the barrel, which
   * is the spec's bar. Approved by Adrian, 2026-07-30: 5 / 5 / 10.
   */
  labelStep: number
  /** Pill label. */
  label: string
}

export const SYRINGE_SIZES: readonly SyringeSize[] = [
  { id: "0.3", ml: 0.3, units: 30, minorStep: 1, labelStep: 5, label: "0.3 mL" },
  { id: "0.5", ml: 0.5, units: 50, minorStep: 1, labelStep: 5, label: "0.5 mL" },
  { id: "1", ml: 1, units: 100, minorStep: 2, labelStep: 10, label: "1 mL" },
]

/**
 * The 1 mL barrel is the default because it is the only size that cannot raise
 * the over-capacity warning on a first, correct calculation.
 */
export const DEFAULT_SYRINGE_SIZE: SyringeSizeId = "1"

export function syringeSize(id: SyringeSizeId): SyringeSize {
  const found = SYRINGE_SIZES.find((s) => s.id === id)
  // The union makes this unreachable; the fallback keeps the graphic drawable
  // rather than throwing inside a render if the stored id ever widens.
  return found ?? SYRINGE_SIZES[SYRINGE_SIZES.length - 1]
}

export interface Graduation {
  /** Position on the barrel's own scale, in units. */
  units: number
  /** 0…1 along the barrel, so the SVG never needs to know the capacity. */
  fraction: number
  /** Carries a printed number, and draws a longer tick. */
  labelled: boolean
}

/**
 * Every tick on the barrel, needle end (0) to plunger end (capacity). Stepped
 * over integers so no accumulated float error walks the ticks off the end.
 */
export function graduations(size: SyringeSize): Graduation[] {
  const out: Graduation[] = []
  for (let u = 0; u <= size.units; u += size.minorStep) {
    out.push({
      units: u,
      fraction: u / size.units,
      labelled: u % size.labelStep === 0,
    })
  }
  return out
}

/**
 * How much of the barrel the draw occupies, 0…1. A result larger than the barrel
 * clamps to a full barrel — the graphic cannot draw past the plunger, and the
 * over-capacity warning is what says so in words.
 */
export function fillFraction(
  unitsPerDose: number | null,
  size: SyringeSize,
): number {
  if (unitsPerDose == null || !Number.isFinite(unitsPerDose)) return 0
  return Math.min(1, Math.max(0, unitsPerDose / size.units))
}

/**
 * Below this, a draw is too small to read off any of the three barrels, which
 * nearly always means a wrong figure went in rather than a genuinely tiny dose.
 */
export const MIN_READABLE_UNITS = 2

/**
 * Which misuse warning the current result earns, if any. Both conditions mean
 * "re-check what you entered"; neither blocks anything, and neither is a
 * judgement about the dose itself.
 */
export type MisuseKind = "under" | "over" | null

export function misuseKind(
  unitsPerDose: number | null,
  size: SyringeSize,
): MisuseKind {
  if (unitsPerDose == null || !Number.isFinite(unitsPerDose)) return null
  if (unitsPerDose < MIN_READABLE_UNITS) return "under"
  if (unitsPerDose > size.units) return "over"
  return null
}

/* ---------------------------------------------------------------------------
   The artwork's coordinate space. One `0 0 320 64` viewBox, scaled to whatever
   width the card gives it, so the syringe keeps its proportions on every phone.
   --------------------------------------------------------------------------- */

export const VIEW_W = 320
export const VIEW_H = 66

/** Barrel — the only part whose length carries meaning. */
export const BARREL_X = 62
export const BARREL_W = 204
export const BARREL_Y = 16
export const BARREL_H = 28
export const BARREL_R = 3

/** Needle centreline, shared by the hub. */
export const AXIS_Y = BARREL_Y + BARREL_H / 2

/** Tick lengths, measured down from the barrel's top edge. */
export const TICK_MINOR = 6
export const TICK_MAJOR = 11
/** A short anchor tick under the barrel, tying a printed number to its mark. */
export const TICK_ANCHOR = 4

/**
 * Baseline and size for the printed numbers, below the barrel.
 *
 * The size is set by the tightest case, then pushed as large as that case
 * allows, because a scale you cannot read defeats the graphic. On the 1 mL
 * barrel 11 numbers sit at a 20.4-unit pitch and the widest ("100") is 3 ×
 * 0.6em; at 10 that is 18 units against a 20.4 pitch, and its neighbour ("90",
 * 12 units) leaves 5.4 units of air between the two. The SVG is drawn slightly
 * wider than its card (see `ReconCalculator`), so 10 here lands at roughly 8px
 * on a 320px phone and 10px on a 375px one.
 *
 * `LABEL_Y` clears the flange, which reaches y=53: the digits' cap height puts
 * their top at about y=53 for a baseline of 60.
 */
export const LABEL_Y = BARREL_Y + BARREL_H + 16
export const LABEL_SIZE = 10

/** Left-to-right position of a 0…1 fraction along the barrel. */
export function barrelX(fraction: number): number {
  return BARREL_X + BARREL_W * fraction
}
