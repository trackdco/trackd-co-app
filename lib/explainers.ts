/**
 * THE EXPLAINERS' WORDS, PICTURE GEOMETRY AND MOTION (build-brief-final §3.8;
 * Adrian's walk of the preview, W6 and W25 to W27). The "?" beside the Stacks,
 * Cycles and Half-life titles (and on Protocol's three buttons) opens a pop-up
 * with a picture and a few lines; `components/protocol/Explainer.tsx` draws it
 * from what is here.
 *
 * THE WORDS report what the feature does, checked against the code that does
 * it, and never advise (Apple 1.4.2):
 * - A stack (`lib/home/stacks.ts`, `lib/home/stackTicks.ts`) only GROUPS
 *   compounds taken at the same time: one row on Home whose tick logs every
 *   member that is due and not yet logged; the row opens to tick one on its
 *   own; nothing about a member's dose or schedule changes.
 * - A cycle (`lib/protocol/cycleRule.ts`) is an on/off pattern ABOVE one
 *   compound's schedule: the schedule still picks the days, and on an off day
 *   the compound is not due. An on/off cycle ends never, on a date, or after a
 *   number of rounds (`availableCycleEnds`).
 * - The half-life curves (`lib/halflife/model.ts`, `compoundCurve.ts`) add up
 *   the logged doses and the ones the schedule has to come: In you now, the
 *   peak, and Clears in (the last dose under 3%, about five half-lives).
 *
 * Pure data and maths: no React, no DOM (`code-standards.md`).
 */
import { PRODUCT_NAME } from "@/lib/brand"

export type ExplainerTopic = "stacks" | "cycles" | "half-life"

export const EXPLAINER_COPY: Record<ExplainerTopic, { title: string; lines: string[] }> = {
  stacks: {
    title: "What is a stack?",
    lines: [
      "A stack is a set of compounds you take at the same time, like your morning doses.",
      "On Home they share one row. Tick the stack once and every compound in it that is due is logged.",
      "Each compound keeps its own dose and schedule, and you can open the stack to log one on its own.",
    ],
  },
  cycles: {
    title: "What is a cycle?",
    lines: [
      "A cycle gives one compound days on and days off, such as 5 on and 2 off, and then repeats.",
      "On days on, its schedule runs as usual. On days off it isn’t due.",
      "A cycle can run with no end, until a date, or for a set number of rounds. The Cycles page shows where you are in it.",
    ],
  },
  "half-life": {
    title: "What is a half-life?",
    lines: [
      "A half-life is how long your body takes to clear half of what it has absorbed. After one, half is left. After two, a quarter.",
      "Each compound has its own: some clear in hours, others over days, depending on how the body breaks it down and how slowly it is released.",
      `From the doses you log and your schedule, ${PRODUCT_NAME} draws roughly how much is in you now, when it peaks and how long it takes to clear. The curves are estimates, not measurements.`,
    ],
  },
}

/* ------------------------------------------------------------------ the "?" */

/** The "?" key's drawn size, in px: a small indented key (W25). */
export const EXPLAINER_KEY_SIZE = 20

/**
 * How far a hit area must reach past a drawing on every side for the whole
 * target to be at least `floor` across (Apple's 44; cold review D8).
 */
export function hitReach(drawn: number, floor = 44): number {
  return Math.max(0, (floor - drawn) / 2)
}

/* ---------------------------------------------------------- the cycle strip */

/** Day by day, whether a cycle of `onDays` on and `offDays` off is on. */
export function cycleDays(onDays: number, offDays: number, count: number): boolean[] {
  const period = onDays + offDays
  if (onDays <= 0 || period <= 0) return Array.from({ length: Math.max(0, count) }, () => false)
  return Array.from({ length: Math.max(0, count) }, (_, i) => i % period < onDays)
}

/* ------------------------------------------------------- the half-life curve */

export interface HalfLifePictureInput {
  /** Where the dose is taken, on the x axis. */
  doseX: number
  /** Where the curve peaks (the dose absorbed). */
  peakX: number
  /** The right end of the curve. */
  endX: number
  /** The axis the curve stands on (y grows downward). */
  baseY: number
  /** The peak's y. */
  peakY: number
  /** One half-life, in x units. */
  halfW: number
  /** How many half-life marks to place after the peak. */
  marks: number
}

export interface HalfLifePicture {
  /** The curve, as an SVG path. */
  line: string
  /** The same curve closed down to the axis, for the soft fill under it. */
  area: string
  /** One mark per half-life after the peak: where it sits on the curve, and
   *  what share of the peak is left there (½, ¼, …). */
  marks: { x: number; y: number; left: number }[]
}

const r1 = (v: number) => Math.round(v * 10) / 10

/**
 * The half-life picture's curve: a quick rise to the peak (the dose being
 * absorbed), then halving every `halfW` from the peak. Each mark sits exactly
 * on the curve, one half-life apart, so the ½ and ¼ the picture prints are
 * true of the line it draws.
 */
export function halfLifePicture(p: HalfLifePictureInput): HalfLifePicture {
  const height = p.baseY - p.peakY
  const yAt = (x: number): number => {
    if (x <= p.doseX) return p.baseY
    if (x < p.peakX) {
      // An ease-out rise: fast at the dose, level at the peak.
      const t = (x - p.doseX) / (p.peakX - p.doseX)
      return p.baseY - height * (1 - (1 - t) * (1 - t))
    }
    return p.baseY - height * Math.pow(0.5, (x - p.peakX) / p.halfW)
  }
  const xs: number[] = []
  for (let x = p.doseX; x < p.peakX; x += 1) xs.push(x)
  for (let x = p.peakX; x <= p.endX; x += 2) xs.push(x)
  if (xs[xs.length - 1] !== p.endX) xs.push(p.endX)
  const line = xs.map((x, i) => `${i ? "L" : "M"}${r1(x)} ${r1(yAt(x))}`).join("")
  const area = `${line}V${p.baseY}H${p.doseX}Z`
  const marks = Array.from({ length: Math.max(0, p.marks) }, (_, i) => {
    const x = p.peakX + p.halfW * (i + 1)
    return { x, y: yAt(x), left: Math.pow(0.5, i + 1) }
  })
  return { line, area, marks }
}

/** "½", "¼", or "1/8" for a share left. */
export function shareLabel(left: number): string {
  if (left === 0.5) return "½"
  if (left === 0.25) return "¼"
  return `1/${Math.round(1 / left)}`
}

/* ------------------------------------------------------------------- motion */

/**
 * The picture plays once as the pop-up lands (calm, then still): each drawn
 * part marked `data-play` enters by one of these, after its own delay. WAAPI
 * keyframes carry numbers only (`var()` snaps in Safari), move only transform
 * and opacity, and all end at rest, so an interrupted play leaves nothing out
 * of place. Reduced motion skips them: the picture is simply there.
 */
export const PICTURE_PLAYS = {
  /** A tick filling: the log tick's gentle lift (.8 → 1.04 → 1). */
  lift: {
    keyframes: [
      { opacity: 0, transform: "scale(0.8)" },
      { opacity: 1, transform: "scale(1.04)", offset: 0.6 },
      { opacity: 1, transform: "scale(1)" },
    ],
    duration: 360,
    easing: "cubic-bezier(0.3, 1.1, 0.5, 1)",
  },
  /** A part rising 6px into place. */
  rise: {
    keyframes: [
      { opacity: 0, transform: "translateY(6px)" },
      { opacity: 1, transform: "translateY(0px)" },
    ],
    duration: 320,
    easing: "cubic-bezier(0.16, 1, 0.3, 1)",
  },
  /** A line sliding right into place (the Cycles Today line, W29). */
  slide: {
    keyframes: [
      { opacity: 0, transform: "translateX(-14px)" },
      { opacity: 1, transform: "translateX(0px)" },
    ],
    duration: 520,
    easing: "cubic-bezier(0.16, 1, 0.3, 1)",
  },
  /** The loop mark turning a little into place. */
  turn: {
    keyframes: [
      { opacity: 0, transform: "rotate(-70deg)" },
      { opacity: 1, transform: "rotate(0deg)" },
    ],
    duration: 560,
    easing: "cubic-bezier(0.16, 1, 0.3, 1)",
  },
  /** A label or a guide fading in. */
  fade: {
    keyframes: [{ opacity: 0 }, { opacity: 1 }],
    duration: 240,
    easing: "ease-out",
  },
} as const

export type PicturePlay = keyof typeof PICTURE_PLAYS

/** When the picture starts: as the pop-up's scale-in (340ms) settles. */
export const PICTURE_PLAY_START_MS = 220
/** The stagger between parts of one kind (40 to 60ms, the house rule). */
export const PICTURE_STAGGER_MS = 50
