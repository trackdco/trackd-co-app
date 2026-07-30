"use client"

import { cn } from "@/lib/utils"
import { CARD_EYEBROW, DATA_MONO } from "@/lib/ui-presets"
import { Container } from "@/components/containers"
import { formatDateKeyShort, type StackCompound } from "@/lib/home/stack"
import type { StockItem } from "@/lib/db/inventory"

/**
 * Whole days from today until a vial runs dry, at or below which the date reads
 * amber. A week is the reorder window — long enough to order and receive
 * something before you run out.
 *
 * Measured in DAYS rather than doses on purpose: three doses left is a fortnight
 * on an E3D compound and three days on a daily one, so a dose count says nothing
 * about whether you need to act.
 */
export const RUNS_DRY_AMBER_DAYS = 7

/**
 * One compound in the Protocol row: its container, its name, and — for vials
 * only — how much is left, a fill bar, doses remaining and the runs-dry date.
 *
 * **Five pieces of information, no more.** A non-injectable has no storage data
 * at all, so its card SUPPRESSES the bottom three outright rather than printing
 * zeroes or placeholders, which would imply a number we do not have.
 *
 * Every derived figure comes from `v_inventory_math` via `StockItem` and is never
 * recomputed here (Invariant 1).
 */
export function CompoundStorageCard({
  compound,
  stock,
  inventoryType,
  todayKey,
  onOpen,
  onAddStock,
}: {
  compound: StackCompound
  /** The backing vial, if this compound has one. */
  stock: StockItem | null
  /** `reconstituted | preconcentrated | oral_solid` — decides the container AND
   *  whether storage fields exist at all. */
  inventoryType: string | null
  todayKey: string
  /** Tap the card → view / edit the compound. */
  onOpen: () => void
  /** Tap the stock line → add or refill its vial. Vial-form compounds only. */
  onAddStock: () => void
}) {
  // Tracked = anything the inventory model actually knows about: vials
  // (reconstituted / preconcentrated) AND tabs/caps (oral_solid), which have had
  // working tracking all along — `v_inventory_math.units_per_dose_oral`, and the
  // tabs branch of AddStockSheet. Spec 03 only removed orals from the ADD
  // COMPOUND form, never from storage. Showing them here is un-hiding what
  // exists, not building anything (Adrian's call).
  //
  // POWDERS are genuinely different: there is no inventory type for a tub, so
  // there is nothing to show and the card says so rather than implying one.
  const tracked =
    inventoryType === "reconstituted" ||
    inventoryType === "preconcentrated" ||
    inventoryType === "oral_solid"
  const fill = tracked ? fillOf(stock) : null
  const daysLeft = tracked ? daysUntil(todayKey, stock?.estEmptyDate ?? null) : null
  const runningOut = daysLeft !== null && daysLeft <= RUNS_DRY_AMBER_DAYS

  return (
    <div className="flex w-[136px] shrink-0 flex-col items-center gap-2 rounded-2xl bg-bg-surface p-4">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${compound.name}`}
        className="flex w-full flex-col items-center gap-2 transition active:scale-[0.98]"
      >
        <Container
          inventoryType={inventoryType}
          category={compound.category}
          fill={fill ?? 0.62}
          size={80}
        />
        <span className="w-full truncate text-center text-sm text-foreground">
          {compound.name}
        </span>
      </button>

      {tracked ? (
        // The stock block is its own tap target: add a vial when there isn't one,
        // refill when there is. Without it, merging the Stock tab away would have
        // silently removed the only path to adding stock.
        <button
          type="button"
          onClick={onAddStock}
          aria-label={
            stock ? `Refill ${compound.name}` : `Add stock for ${compound.name}`
          }
          className="flex w-full flex-col items-center gap-1 transition active:scale-[0.98]"
        >
          {/* No separate fill bar: the CONTAINER above already shows the level,
              and a bar beside it stated the same fact twice. Dropping it left
              room for a bigger vial and two clean lines. Still the spec's five
              pieces of information — just not one of them duplicated. */}
          <span className={cn(DATA_MONO, "w-full truncate text-center")}>
            {formatRemaining(stock)}
          </span>
          <span className={cn(DATA_MONO, "w-full truncate text-center")}>
            {formatDoses(stock)}
          </span>
          <span
            className={cn(
              "w-full truncate text-center font-mono text-[10px] tabular-nums",
              // Amber only when it genuinely needs action. Stock runway is
              // inventory, not health data, so this sits outside the
              // categorical-never-evaluative rule.
              runningOut ? "text-accent-amber" : "text-text-subtle"
            )}
          >
            {formatRunsDry(stock?.estEmptyDate ?? null, daysLeft)}
          </span>

          {/* The gauge sits at the FOOT of the card carrying its own percentage,
              so it reads as a summary line rather than restating the vial above
              it — which is what made the earlier mid-card bar redundant. */}
          {fill !== null && (
            <span className="mt-1 flex w-full items-center gap-2">
              <span
                aria-hidden
                className="h-1 flex-1 overflow-hidden rounded-full bg-bg-surface-raised"
              >
                <span
                  className="block h-full rounded-full bg-accent-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
                  style={{ width: `${Math.round(fill * 100)}%` }}
                />
              </span>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-text-subtle">
                {Math.round(fill * 100)}%
              </span>
            </span>
          )}
        </button>
      ) : (
        // No storage tracking for this form — say nothing rather than zero.
        <span className={cn(CARD_EYEBROW, "text-center")}>No stock tracked</span>
      )}
    </div>
  )
}

/** Remaining / total, straight from the view. Null when there is no vial. */
function fillOf(stock: StockItem | null): number | null {
  if (!stock || stock.remainingBase == null || !stock.totalBase) return null
  return Math.max(0, Math.min(1, stock.remainingBase / stock.totalBase))
}

/** How much is physically left — "8 mL", or a tablet count for orals. */
function formatRemaining(stock: StockItem | null): string {
  if (!stock || stock.remainingDisplay == null) return "Add stock"
  const unit = stock.inventoryType === "oral_solid" ? " tabs" : " mL"
  return `${stock.remainingDisplay}${unit} left`
}

/** How many DOSES that is — the figure people actually plan around. */
function formatDoses(stock: StockItem | null): string {
  if (!stock || stock.dosesRemaining == null) return ""
  return `${stock.dosesRemaining} doses`
}

function formatRunsDry(estEmptyDate: string | null, daysLeft: number | null): string {
  if (!estEmptyDate) return "No estimate"
  if (daysLeft === null) return formatDateKeyShort(estEmptyDate)
  if (daysLeft <= 0) return "Empty"
  if (daysLeft === 1) return "Runs dry tomorrow"
  if (daysLeft <= RUNS_DRY_AMBER_DAYS) return `Runs dry in ${daysLeft} days`
  return `Runs dry ${formatDateKeyShort(estEmptyDate)}`
}

/** Whole days between two "YYYY-MM-DD" keys, counted in UTC so a DST boundary
 *  can't add or drop one. */
function daysUntil(fromKey: string, toKey: string | null): number | null {
  if (!toKey) return null
  const a = dayNumber(fromKey)
  const b = dayNumber(toKey)
  if (a === null || b === null) return null
  return b - a
}

function dayNumber(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  return Math.floor(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000
  )
}
