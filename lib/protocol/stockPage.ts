/**
 * The Stock page's words and defaults (Adrian, 2026-09-24). Pure, so the page
 * and its tests read the same answers.
 */
import type { StockItem } from "@/lib/db/inventory"
import { remainingLabel } from "@/lib/containers/labels"

const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "Runs dry" turns amber at this many days or fewer. */
export const RUNS_DRY_WARN_DAYS = 7

/**
 * When a compound runs dry, worded for a tile: "Today", "Tomorrow", "In 3 days"
 * while it is close (and amber), else the date, "30 Oct". Null when there is
 * nothing to count from (no open container, or nothing due).
 */
export function runsDryText(
  days: number | null,
  todayKey: string,
): { text: string; low: boolean } | null {
  if (days == null || !Number.isFinite(days) || days < 0) return null
  const low = days <= RUNS_DRY_WARN_DAYS
  if (days === 0) return { text: "Today", low }
  if (days === 1) return { text: "Tomorrow", low }
  if (low) return { text: `In ${days} days`, low }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayKey)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days)
  return { text: `${d.getDate()} ${MON_SHORT[d.getMonth()]}`, low }
}

/**
 * The line under a compound's name: "2 OPEN · 9 SPARE" with several open, else
 * what is left in the one in use ("8.5 mL left"), then its spares.
 */
export function stockSubLine(open: StockItem[], spares: StockItem[], inUse: StockItem | null): string {
  const head =
    open.length >= 2
      ? `${open.length} open`
      : inUse
        ? (remainingLabel(inUse) ?? (open.length === 1 ? "1 open" : ""))
        : ""
  const tail = spares.length > 0 ? `${spares.length} spare` : ""
  return [head, tail].filter(Boolean).join(" · ")
}

/**
 * The water a "Mix one" offers: what this compound's vials were last mixed
 * with, newest first, else 2 mL. It is shown on the button and can be changed
 * before mixing, so this is only where the number starts.
 */
export function mixWaterDefault(items: StockItem[]): number {
  const mixed = items
    .filter((i) => i.inventoryType === "reconstituted" && i.bacWaterMl != null && i.bacWaterMl > 0)
    .sort((a, b) => (b.reconstitutedOn ?? "").localeCompare(a.reconstitutedOn ?? ""))
  return mixed[0]?.bacWaterMl ?? 2
}

/** A spare that must be mixed before it can be used (an unmixed vial). */
export function needsMixing(item: StockItem): boolean {
  return item.inventoryType === "reconstituted"
}
