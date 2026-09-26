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
   *
   * This is the PUBLIC calculator's scale, frozen as it shipped. The app's own
   * barrel prints 5 / 5 / 20 (`APP_LABEL_STEP`, `scaleMarks`, below).
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
   The APP's printed scale (the calculator, and the app previews on the public
   site). The public calculator draws its own frozen copy over `graduations`
   above, which keeps the approved 5 / 5 / 10 labelling as it shipped.

   On 1 mL the app labels every 20 units, not every 10 (cold review D21 and
   Adrian's walk, W37): eleven numbers at a 10-unit pitch ran together into
   "90100". The tens in between keep a MID tick, longer than the minor ones,
   so a draw of 30 still reads straight off the barrel.
   --------------------------------------------------------------------------- */

/** Units between the app's printed numbers, per barrel. */
export const APP_LABEL_STEP: Readonly<Record<SyringeSizeId, number>> = {
  "0.3": 5,
  "0.5": 5,
  "1": 20,
}

/** Units between the mid ticks: every ten, where ten is not already printed. */
const MID_STEP = 10

export type TickKind = "major" | "mid" | "minor"

export interface ScaleMark extends Graduation {
  /** Major carries a printed number; mid is an unprinted ten; minor the rest. */
  kind: TickKind
}

/**
 * Every tick on the app's barrel, needle end (0) to plunger end (capacity),
 * with its kind. Same positions as `graduations`; only the labelling differs.
 */
export function scaleMarks(size: SyringeSize): ScaleMark[] {
  const step = APP_LABEL_STEP[size.id] ?? size.labelStep
  return graduations(size).map((g) => {
    const labelled = g.units % step === 0
    const kind: TickKind = labelled
      ? "major"
      : g.units % MID_STEP === 0
        ? "mid"
        : "minor"
    return { ...g, labelled, kind }
  })
}

/* ---------------------------------------------------------------------------
   The artwork's coordinate space. One viewBox, scaled to whatever width the
   card gives it, so the syringe keeps its proportions on every phone.

   FULL SIZE, WITH A MOVING PLUNGER (Adrian's walk of the preview, W37; cold
   review D21). The plunger is one rigid part that travels WITH the draw
   (build-brief-final §3.13). The first build reserved its whole travel inside
   the box, one more barrel length of empty ground to the right, which shrank
   the barrel to 42% of the box and pushed it left. Adrian asked for the
   syringe full size again, as it was, and the moving plunger only if it fits.

   It fits by FRAMING rather than by reserving: the barrel takes the same share
   of the box it had before the plunger moved (about 65%), and the drawing is a
   close view of the syringe. At an empty draw the whole plunger is in frame,
   its thumb rest just past the flange. As the draw grows the stopper, rod and
   thumb rest slide right together, 1:1, and the rod runs out of the frame
   through a short fade at the right edge (`PLUNGER_FADE_X`), the way a camera
   close on the barrel would show it. The box is the same size at every draw
   and on every barrel; nothing around it moves.
   --------------------------------------------------------------------------- */

/** The whole drawing. 320 wide, as the syringe was before the plunger moved. */
export const VIEW_W = 320
export const VIEW_H = 56

/** Barrel — the only part whose length carries meaning. `BARREL_X` is the 0
 *  mark, where the stopper bottoms out; `BARREL_W` runs 0 to the capacity. */
export const BARREL_X = 58
export const BARREL_W = 208
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
export const THUMB_X = FLANGE_X + FLANGE_W + 6
export const THUMB_W = 7

/**
 * Where the plunger starts to fade as it leaves the frame: just past the
 * thumb rest's resting place, so an empty syringe is drawn whole and a drawn
 * one lets its rod run out through the last stretch of the box.
 */
export const PLUNGER_FADE_X = THUMB_X + THUMB_W + 2

/** Tick lengths, measured down from the barrel's top edge. The major tick
 *  stops short of the rod, which runs along the axis behind the glass. */
export const TICK_MINOR = 6
export const TICK_MID = 8.5
export const TICK_MAJOR = 11

/** The length of one tick of the app's scale. */
export function tickLength(kind: TickKind): number {
  return kind === "major" ? TICK_MAJOR : kind === "mid" ? TICK_MID : TICK_MINOR
}

/**
 * Baseline and size for the printed numbers, below the barrel.
 *
 * The tightest case is 0.5 mL, eleven numbers at a 20.8-unit pitch; at 10 the
 * two-digit numbers are 12 units wide, which leaves 8.8 units of air between
 * neighbours. The SVG is drawn slightly wider than its card (see
 * `ReconCalculator`), so 10 here lands at about 11.5px on a 375px phone and
 * 12px on a 390px one, as it did before the plunger moved.
 *
 * The last number overhangs the capacity mark by half its width, which
 * `BARREL_TAIL` absorbs, so it never runs into the flange.
 */
export const LABEL_Y = BARREL_Y + BARREL_H + 14
export const LABEL_SIZE = 10

/** Left-to-right position of a 0…1 fraction along the barrel. */
export function barrelX(fraction: number): number {
  return BARREL_X + BARREL_W * fraction
}

/**
 * How far the stopper, rod and thumb rest sit from their empty position, for
 * a 0…1 fill. The plunger is rigid, so it travels exactly as far as the draw's
 * edge: `barrelX(fill) === BARREL_X + plungerOffset(fill)`. Clamped like the
 * fill, so no value can push the stopper past the capacity mark.
 */
export function plungerOffset(fill: number): number {
  if (!Number.isFinite(fill)) return 0
  return BARREL_W * Math.min(1, Math.max(0, fill))
}
