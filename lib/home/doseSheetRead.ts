"use server"

/**
 * Everything the Log dose sheet reads from the server, in ONE round trip
 * (feel pass §4).
 *
 * The sheet used to call three server actions (the draw source, the stock list,
 * the catalogue) and, for a back-dated dose, a fourth. Next runs server actions
 * one at a time from a client, so they landed in sequence and each one pushed
 * the sheet: the Draw row grew it by 53px, then the map arrived, then the stock.
 * Here they run in parallel on the server and arrive together.
 *
 * Nothing is recomputed: each part is the existing action, called directly,
 * with its existing guarantees (identity from the session, RLS, never throws).
 */
import { resolveDrawSources, resolveVialForDate } from "@/lib/home/protocolSync"
import { listStock, type StockItem } from "@/lib/db/inventory"
import { listInjectionSiteCatalogue } from "@/lib/db/injectionSites"
import type { DrawSource } from "@/lib/home/draw"
import type { InjectionSiteRow } from "@/lib/db/types"

export interface DoseSheetWants {
  /** The draw source for this compound on the day (injectables). */
  draw: boolean
  /** The user's active stock (the sheet filters it to this compound). */
  stock: boolean
  /** Which vial was in use on a BACK-DATED day. */
  dateVial: boolean
  /** The site catalogue, when the caller did not pass one in. */
  catalogue: boolean
}

export interface DoseSheetRead {
  /** The vial facts for the draw; null when none resolved or not asked. */
  drawSource: DrawSource | null
  /** Active stock, or null when not asked. */
  stock: StockItem[] | null
  /** The back-dated day's vial id (null = none then); undefined when not asked. */
  dateVialId: string | null | undefined
  /** The catalogue, or null when not asked. */
  catalogue: InjectionSiteRow[] | null
}

export async function readDoseSheet(
  compoundId: string,
  dateKey: string,
  wants: DoseSheetWants,
): Promise<DoseSheetRead> {
  const [draw, stock, dateVial, catalogue] = await Promise.all([
    wants.draw ? resolveDrawSources([compoundId], dateKey) : null,
    wants.stock ? listStock() : null,
    wants.dateVial ? resolveVialForDate(compoundId, dateKey) : undefined,
    wants.catalogue ? listInjectionSiteCatalogue() : null,
  ])
  return {
    drawSource: draw?.sources[compoundId] ?? null,
    stock,
    dateVialId: dateVial === undefined ? undefined : (dateVial?.id ?? null),
    catalogue,
  }
}
