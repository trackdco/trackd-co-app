import type { StockInsert, StockItem } from "@/lib/db/inventory"
import type { DoseUnit } from "@/lib/db/types"

/**
 * A container's raw inputs as `updateStockItem` writes them, read back from
 * the row it was loaded as. The toast's Undo after "Saved" on Edit stock
 * (build-brief-final §3.16) writes this to put the container back exactly as
 * it was: every type column, so the per-type CHECK holds as it did before.
 *
 * Null when the row cannot be written back whole (no amount or no unit): an
 * Undo that half-restores would be worse than none, so the toast offers none.
 * Pure.
 */
export function stockRowOf(
  item: StockItem,
): Omit<StockInsert, "id" | "protocol_compound_id"> | null {
  if (item.totalAmount == null || item.totalAmountUnit == null || !item.baseUnit) return null
  return {
    inventory_type: item.inventoryType,
    base_unit: item.baseUnit as DoseUnit,
    total_amount: item.totalAmount,
    total_amount_unit: item.totalAmountUnit as DoseUnit,
    bac_water_ml: item.bacWaterMl,
    concentration_mg_per_ml: item.concentrationMgPerMl,
    strength_per_unit: item.strengthPerUnit,
    serving_size_g: item.servingSizeG,
    reconstituted_on: item.reconstitutedOn,
    prior_used_base: item.priorUsedBase,
  }
}
