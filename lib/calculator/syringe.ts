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
 * The barrel the calculator opens on, until the user picks another (which then
 * sticks; see `syringeChoice.ts`).
 *
 * 0.5 mL because the equipment guides call it the best all-round size for
 * subcutaneous peptide injection: 0.3 mL is for 2 to 10 unit draws, and 1 mL
 * trades away precision at the small end of its range.
 *
 * Getting this wrong is a cosmetic problem, not a safety one: the UNITS figure
 * is identical on every barrel (10 units is 10 units), and only the fill
 * PROPORTION and the over-capacity threshold move with the size (Adrian,
 * 2026-07-30).
 */
export const DEFAULT_SYRINGE_SIZE: SyringeSizeId = "0.5"

/** Narrows an unknown string (a stored preference, a URL param) to a real id. */
export function isSyringeSizeId(v: string | null | undefined): v is SyringeSizeId {
  return v != null && SYRINGE_SIZES.some((s) => s.id === v)
}

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
   The artwork's coordinate space. One viewBox, scaled to whatever width the
   card gives it, so the syringe keeps its proportions on every phone.

   The plunger is one rigid part that travels WITH the draw (build-brief-final
   §3.13), so the box reserves its whole travel: to the right of the thumb
   rest's resting place sits one more barrel length of empty ground, and the
   graphic is the same size at every draw. That reserve is why the barrel is a
   smaller share of the box than it was when the plunger stood still.
   --------------------------------------------------------------------------- */

/** Barrel — the only part whose length carries meaning. `BARREL_X` is the 0
 *  mark, where the stopper bottoms out; `BARREL_W` runs 0 to the capacity. */
export const BARREL_X = 46
export const BARREL_W = 200
/** Unmarked glass past the capacity mark, before the flange, as on a real
 *  barrel. It is also what keeps the last printed number clear of the flange. */
export const BARREL_TAIL = 12
export const BARREL_Y = 10
export const BARREL_H = 30
export const BARREL_R = 5

/** Needle centreline, shared by the hub, the rod and the thumb rest. */
export const AXIS_Y = BARREL_Y + BARREL_H / 2

/** The finger flange, where the glass ends. */
export const FLANGE_X = BARREL_X + BARREL_W + BARREL_TAIL
export const FLANGE_W = 5

/** The stopper's length. Its FRONT face is the draw's edge, the line you read. */
export const STOPPER_W = 8

/** The thumb rest at rest (an empty barrel): a short stub of rod past the
 *  flange, then the rest itself. It moves right by `plungerOffset(fill)`. */
export const THUMB_X = FLANGE_X + FLANGE_W + 5
export const THUMB_W = 7

/** Wide enough for the thumb rest at a FULL draw, one barrel length out. */
export const VIEW_W = THUMB_X + BARREL_W + THUMB_W + 1
export const VIEW_H = 56

/** Tick lengths, measured down from the barrel's top edge. The major tick
 *  stops short of the rod, which runs along the axis behind the glass. */
export const TICK_MINOR = 6
export const TICK_MAJOR = 11

/**
 * Baseline and size for the printed numbers, below the barrel.
 *
 * The size is set by the tightest case, then pushed as large as that case
 * allows, because a scale you cannot read defeats the graphic. On the 1 mL
 * barrel 11 numbers sit at a 20-unit pitch and the widest ("100") is 3 × 0.6em;
 * at 11 its neighbour ("90") leaves 3.5 units of advance between the two (more
 * of ink). The SVG is drawn slightly wider than its card (see
 * `ReconCalculator`), so 11 here lands at about 8px on a 375px phone: the
 * plunger's reserved travel is what costs the size.
 *
 * The last number overhangs the capacity mark by half its width, which
 * `BARREL_TAIL` absorbs, so it never runs into the flange.
 */
export const LABEL_Y = BARREL_Y + BARREL_H + 14
export const LABEL_SIZE = 11

/** Left-to-right position of a 0…1 fraction along the barrel. */
export function barrelX(fraction: number): number {
  return BARREL_X + BARREL_W * fraction
}

/**
 * How far the stopper, rod and thumb rest sit from their empty position, for
 * a 0…1 fill. The plunger is rigid, so it travels exactly as far as the draw's
 * edge: `barrelX(fill) === BARREL_X + plungerOffset(fill)`. Clamped like the
 * fill, so no value can push the thumb rest out of the box reserved for it.
 */
export function plungerOffset(fill: number): number {
  if (!Number.isFinite(fill)) return 0
  return BARREL_W * Math.min(1, Math.max(0, fill))
}
