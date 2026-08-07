"use client"

import { cn } from "@/lib/utils"
import { CARD_EYEBROW, DATA_MONO } from "@/lib/ui-presets"
import { Container } from "@/components/containers"
import type { StackCompound } from "@/lib/home/stack"
import type { StockItem } from "@/lib/db/inventory"
import { ILLUSTRATIVE_FILL } from "@/lib/containers/geometry"
import { formatGrams } from "@/lib/protocol/vialFill"
import { activePause } from "@/lib/home/pauses"

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
 * Every card in the compounds row is EXACTLY this size, including the trailing
 * "Add compound" one.
 *
 * Fixed rather than intrinsic on purpose: a vial card carries four lines of
 * figures, an oral card three, a stockless one a single button, and a tub none at
 * all. Letting them size themselves made a horizontally-scrolling row of ragged
 * cards. The height fits the tallest case (container, a two-line name, remaining,
 * doses, the runs-dry label and value, and the gauge) so nothing is ever clipped.
 *
 * 136px is the original width (Adrian's call): the earlier truncation that made a
 * wider card seem necessary was really the runs-dry line being one long string.
 * Splitting it into a label over a value, and dropping the weekday, made it fit
 * again — so the row stays compact and more cards are visible at once.
 */
export const CARD_W = "w-[136px]"
export const CARD_H = "h-[252px]"

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
  stockKnown,
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
  /** False until the stock read has landed. */
  stockKnown: boolean
  todayKey: string
  /** Tap the card → view / edit the compound. */
  onOpen: () => void
  /** Tap the stock line → add or refill its vial. Vial-form compounds only. */
  onAddStock: () => void
}) {
  // Tracked = anything the inventory model knows about, which since Spec w2b-13
  // is ALL FOUR forms. Vials and tabs/caps always were; a tub joined them when
  // `supabase/protocol/014` gave it an inventory type and `015` gave it a total
  // and a remaining.
  //
  // ~~POWDERS are genuinely different: there is no inventory type for a tub~~ —
  // there is now. That sentence was true when this card was written and is the
  // reason for the "No stock tracked" branch below, which is now reachable only
  // for a form this list does not name.
  const tracked =
    inventoryType === "reconstituted" ||
    inventoryType === "preconcentrated" ||
    inventoryType === "oral_solid" ||
    inventoryType === "bulk_powder"
  // ~~The GAUGE is vial-only~~, because a bottle's and a tub's artwork was a
  // fixed decorative arrangement that could not represent a level, and a
  // percentage bar beside it would have contradicted the picture on the same
  // card. **Spec w2b-13, Step 3 made both artworks real**, so the picture and
  // the bar now agree and the restriction is gone: whenever there is a fill to
  // show, it is shown.
  const gauged = tracked
  const hasVial = stock != null && stock.remainingDisplay != null
  const fill = tracked ? fillOf(stock) : null
  // The view's own day COUNT wherever it is available (`supabase/protocol/010`),
  // because `est_empty_date` is anchored to the DATABASE's date and Supabase runs
  // UTC: subtracting a local today from a UTC-anchored date is a day out for most
  // of the world for part of every day, which moved the amber flag with it. Falls
  // back to the old subtraction until 010 is applied.
  // ⚠️ A PAUSED compound has no runway, and must not fall back to one.
  // `supabase/protocol/019` returns NULL for `days_to_empty` while a pause is
  // open — deliberately, because "when does this run out" has no answer while
  // nothing is being consumed. The `?? estEmptyDate` fallback below then
  // resurrected the old number and fired the amber "runs dry" flag on a compound
  // the user is not taking, which is the exact outcome 019 exists to prevent.
  // `est_empty_date` is left pause-unaware on purpose (it is the UTC-leaking
  // column, on its way out), so the guard belongs here.
  // Derived here rather than taken as a prop: the card already has the compound,
  // and a pause is an interval read at render time, never a stored flag.
  const paused = activePause(compound.pauses, todayKey) !== null
  const daysLeft = !tracked || paused
    ? null
    : (stock?.daysToEmpty ?? daysUntil(todayKey, stock?.estEmptyDate ?? null))
  // The DATE shown for a far-off vial is derived from the local today plus that
  // count, for the same reason — otherwise the countdown was local and the date
  // beside it was not.
  const emptyDate =
    stock?.daysToEmpty != null
      ? addDays(todayKey, stock.daysToEmpty)
      : (stock?.estEmptyDate ?? null)
  const runningOut = daysLeft !== null && daysLeft <= RUNS_DRY_AMBER_DAYS

  return (
    <div
      className={cn(
        CARD_W,
        CARD_H,
        "flex shrink-0 flex-col items-center gap-2 rounded-2xl bg-bg-surface p-4"
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${compound.name}`}
        className="flex w-full flex-col items-center gap-2 transition active:scale-[0.98]"
      >
        <Container
          name={compound.name}
          inventoryType={inventoryType}
          category={compound.category}
          // NO STOCK RECORDED → the ILLUSTRATIVE level, on every container
          // (Adrian, 2026-08-07). This drew empty for a while, on the argument
          // that liquid beside "Add stock" is a claim; his call is that a
          // drained vial reads as a compound in trouble rather than as one you
          // simply have not entered yet, and the row of them looked broken.
          //
          // `fill` is null ONLY when there is no figure at all — a real, gauged
          // zero is 0 and still draws empty, which is the distinction that
          // matters.
          fill={fill ?? ILLUSTRATIVE_FILL}
          size={80}
        />
        {/* The name WRAPS to two lines rather than truncating: an ellipsis on a
            compound name is the one place a card must never be lossy, since the
            name is what you are identifying it by. Two lines are reserved
            whether or not they are used, so every card in the row stays the
            same height. */}
        <span className="flex h-9 w-full items-center justify-center">
          <span className="line-clamp-2 text-center text-sm leading-tight text-foreground">
            {compound.name}
          </span>
        </span>
      </button>

      {!stockKnown ? (
        // Reading. Reserve the space so the card doesn't jump, but claim nothing.
        <span aria-hidden className="h-16" />
      ) : tracked && !hasVial ? (
        // No vial: ONE affordance and nothing else. The spec is explicit that a
        // card with no storage data suppresses the figures rather than printing
        // placeholders, which imply a number we do not have.
        <button
          type="button"
          onClick={onAddStock}
          aria-label={`Add stock for ${compound.name}`}
          className="flex w-full items-center justify-center py-2 text-xs text-text-muted transition active:scale-[0.98]"
        >
          Add stock
        </button>
      ) : tracked ? (
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
          <span className={cn(DATA_MONO, "w-full text-center")}>
            {formatRemaining(stock)}
          </span>
          <span className={cn(DATA_MONO, "w-full text-center")}>
            {formatDoses(stock)}
          </span>
          {/* A dim lowercase label over a BRIGHT date. The label is the least
              interesting part of the line, so it recedes and the value it
              introduces is what you actually read. As one string ("Runs dry Wed
              16 Sep") it wrapped mid-date and broke the month onto its own line,
              which read like two separate facts.
              The date stays white in every state: the low-stock signal lives on
              the BAR below instead, which keeps amber to one beat per card and
              puts it on the gauge rather than on a piece of text. */}
          <span className="mt-0.5 flex w-full flex-col items-center leading-tight">
            <span className="text-[10px] lowercase text-text-subtle">runs dry</span>
            {/* Same weight as the "8.5 mL left" line above it (`--text-muted`,
                what DATA_MONO uses) rather than full white. The card's figures are
                one family and should read as one; white made the date the loudest
                thing on the card, which it is not. */}
            <span className="font-mono text-[11px] tabular-nums text-text-muted">
              {formatRunsDry(emptyDate, daysLeft)}
            </span>
          </span>

          {/* The gauge sits at the FOOT of the card carrying its own percentage,
              so it reads as a summary line rather than restating the vial above
              it — which is what made the earlier mid-card bar redundant. */}
          {gauged && fill !== null && (
            <span className="mt-1 flex w-full items-center gap-2">
              <span
                aria-hidden
                className="h-1 flex-1 overflow-hidden rounded-full bg-bg-surface-raised"
              >
                <span
                  className={cn(
                    "block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none",
                    // THE gauge is where low stock reads (Adrian's call): amber on
                    // the bar rather than on the date, so the signal sits on the
                    // thing that measures rather than on a label, and the card
                    // keeps a single amber beat.
                    runningOut ? "bg-accent-amber" : "bg-accent-primary"
                  )}
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
  // A tub is weighed, and it is worded as the tub is labelled — grams up to a
  // kilo, kilograms above it. Storage is grams throughout; see `formatGrams`.
  if (stock.inventoryType === "bulk_powder") {
    return `${formatGrams(stock.remainingDisplay)} left`
  }
  // Orals are stored as "tab" OR "capsule"; using the stored unit stops 60
  // capsules of NAC reading as "30 tabs left".
  const one = stock.remainingDisplay === 1
  const unit =
    stock.inventoryType === "oral_solid"
      ? ` ${stock.totalAmountUnit === "capsule" ? (one ? "cap" : "caps") : one ? "tab" : "tabs"}`
      : " mL"
  return `${stock.remainingDisplay}${unit} left`
}

/** How many DOSES that is — the figure people actually plan around. */
function formatDoses(stock: StockItem | null): string {
  if (!stock || stock.dosesRemaining == null) return ""
  // "1 doses" was rendering. `CycleCard` gets day/days right, so the app was
  // inconsistent with itself.
  return `${stock.dosesRemaining} ${stock.dosesRemaining === 1 ? "dose" : "doses"}`
}

/**
 * Just the VALUE — the "Runs dry" label is rendered separately above it.
 *
 * A near date reads as a countdown because that is the useful form when you need
 * to act; a far one reads as a date, because "in 47 days" is not something anyone
 * plans around. No weekday: on a reorder date it is noise, and it was what pushed
 * the line long enough to wrap.
 */
function formatRunsDry(estEmptyDate: string | null, daysLeft: number | null): string {
  if (!estEmptyDate) return "No estimate"
  if (daysLeft === null) return shortDate(estEmptyDate)
  if (daysLeft <= 0) return "Empty"
  if (daysLeft === 1) return "Tomorrow"
  if (daysLeft <= RUNS_DRY_AMBER_DAYS) return `In ${daysLeft} days`
  return shortDate(estEmptyDate)
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/** "2026-09-16" to "16 Sep". */
function shortDate(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return key
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`
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

/** "2026-09-16" + 12 → "2026-09-28". UTC arithmetic, so a DST boundary in the
 *  span cannot move the answer. */
function addDays(key: string, days: number): string | null {
  const n = dayNumber(key)
  if (n === null) return null
  const d = new Date((n + days) * 86_400_000)
  const p = (v: number) => String(v).padStart(2, "0")
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

function dayNumber(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  return Math.floor(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000
  )
}
