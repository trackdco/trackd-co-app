/**
 * The calculator's three figures (Concentration, Per dose, Insulin) as the
 * page prints them. Pure, so the "nothing yet" state is pinned by a test.
 *
 * A figure with nothing to show is `null`, and the page leaves it BLANK under
 * its label with only its unit, the way an empty field shows only its unit
 * (cold review D23). It never stands in a dash: the app has no em dashes, and
 * a dash in a number's place reads as a value.
 */
import { formatConcentration, trim, type ReconResult } from "./recon"

export interface ReconFigures {
  /** mg/mL, once powder and water are in. */
  concentration: string | null
  /** mL per dose, once the dose is in too. */
  perDose: string | null
  /** Insulin units per dose, once the dose is in too. */
  insulin: string | null
}

export function reconFigures(result: ReconResult | null): ReconFigures {
  return {
    concentration: result ? formatConcentration(result.concentration) : null,
    perDose: result?.mlPerDose != null ? trim(result.mlPerDose, 3) : null,
    insulin: result?.unitsPerDose != null ? trim(result.unitsPerDose, 1) : null,
  }
}
