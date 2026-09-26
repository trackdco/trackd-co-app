/**
 * A blend on its half-life page (Adrian's walk, W5): the rail offers "All",
 * the whole blend, then each part by its full catalogue name ("BPC-157",
 * "TB-500", never "BPC" and "TB"). Under All the page shows every part's line
 * and the blend's Past runs; a part shows its own line and its own runs.
 *
 * Pure: no React.
 */
import { clearsAfterH, type AbsorptionRoute, type Dose } from "./model"

/** What the rail has picked: the whole blend, or one part (by its place
 *  among the parts that draw a line). */
export type BlendChoice = "all" | number

/** One part of a blend that draws a line. */
export interface BlendPartBasis {
  /** The exact catalogue name: the rail's label. */
  name: string
  halfLifeH: number
  route: AbsorptionRoute
  /** Its doses taken, oldest first (the blend's own instants, scaled). */
  taken: readonly Dose[]
}

/** The rail's choices: All, then each part in full, in blend order. */
export function blendChoices(parts: readonly Pick<BlendPartBasis, "name">[]): { key: BlendChoice; label: string }[] {
  return [{ key: "all" as BlendChoice, label: "All" }, ...parts.map((p, i) => ({ key: i as BlendChoice, label: p.name }))]
}

/** A choice that still names a part (the parts can change under it), else All. */
export function settleChoice(choice: BlendChoice, partCount: number): BlendChoice {
  return choice === "all" || (Number.isInteger(choice) && choice >= 0 && choice < partCount) ? choice : "all"
}

/** The one unit every part is counted in, or null when they differ (then no
 *  sum is shown: amounts in different units do not add). */
export function sharedUnit(units: readonly string[]): string | null {
  if (units.length === 0) return null
  return units.every((u) => u === units[0]) ? units[0] : null
}

/**
 * The whole blend's Past runs: its doses (every part shares the blend's
 * instants and count, so the first part's list stands for all), split at the
 * break of its SLOWEST part, and each run drawn until that part has cleared.
 * The blend is in you until its last part has gone.
 */
export function blendRunBasis(parts: readonly BlendPartBasis[]): {
  doses: readonly Dose[]
  halfLifeH: number
  clearsAfterH: number
} | null {
  if (parts.length === 0) return null
  return {
    doses: parts[0].taken,
    halfLifeH: Math.max(...parts.map((p) => p.halfLifeH)),
    clearsAfterH: Math.max(...parts.map((p) => clearsAfterH(p.halfLifeH, p.route))),
  }
}
