/**
 * The Stock page's words and defaults (Adrian, 2026-09-24), and how Protocol's
 * compound cards and sheet read a compound's stock. Pure, so the screens and
 * their tests read the same answers.
 */
import type { CompoundStock, StockItem } from "@/lib/db/inventory"
import { remainingLabel } from "@/lib/containers/labels"
import { dayShort } from "@/lib/format/date"
import { toDateKey } from "@/lib/home/mockHomeData"
import type { StackCompound } from "@/lib/home/stack"
import { runsDryInDays } from "@/lib/protocol/runsDry"
import { containersOf } from "@/lib/protocol/stockView"

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
  return { text: dayShort(toDateKey(d)), low }
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

/* --------------------------------------------- Protocol's cards and sheet */

/**
 * One compound's stock as Protocol holds it between reads: the container in
 * use with ITS OWN figures, and what the compound holds in every open
 * container, kept apart.
 *
 * They were merged once. The in-use container's `dosesRemaining` was
 * overwritten with the compound's total, so the sheet's "Current vial · 24
 * doses left" counted two vials while Home, reading the same vial, said 5, and
 * the card beside it said it ran dry in 5 days (cold review F1). The total is
 * the runway's figure and nothing else's.
 *
 * Nothing here is worked out for a day: the runway is walked from `dosesReady`
 * at render, on the day it is THEN (see {@link withRunway}; cold review B37).
 */
export interface CompoundStockView {
  /** The oldest open container, or the first spare when none is started. Its
   *  figures are its own, exactly as the read returned them. */
  inUse: StockItem
  /** Doses in every OPEN container (`v_compound_stock`): the runway's figure. */
  dosesReady: number | null
  /** Containers held beyond the one in use: the other open ones (oldest
   *  first), then the spares. */
  extras: StockItem[]
  /** How many: `extras.length`. */
  others: number
  /** A spare still to mix, when there is one. */
  drySpare: StockItem | null
  /** The water this compound's vials were last mixed with. */
  lastWater: number
  /** Doses logged on the read's own day when the read landed (see
   *  {@link StockSnapshot.readOn}). */
  takenOnRead: number
}

/** Every compound's {@link CompoundStockView}, and the day the read was taken. */
export interface StockSnapshot {
  /** The device's day when the read landed. */
  readOn: string
  views: Map<string, CompoundStockView>
}

/**
 * Every compound's {@link CompoundStockView}, keyed by the CLIENT id. Rows come
 * back keyed by `protocol_compounds.id`, which can differ from the client id,
 * so `pcToClient` maps them back; a compound it cannot map is left out, and so
 * is one holding no container at all. `takenOn(clientId)` is how many of the
 * read's day's doses were logged when it landed.
 */
export function compoundStockViews(
  read: { items: readonly StockItem[]; compounds: readonly CompoundStock[] },
  pcToClient: ReadonlyMap<string, string>,
  takenOn: (clientId: string) => number = () => 0,
): Map<string, CompoundStockView> {
  const out = new Map<string, CompoundStockView>()
  for (const held of read.compounds) {
    const clientId = pcToClient.get(held.protocolCompoundId)
    const box = containersOf(read.items, held.protocolCompoundId)
    // Only spares held (a box not yet mixed or opened): the first stands for
    // the compound, drawn full, with no runway until it is started.
    const inUse = box.inUse ?? box.spares[0] ?? null
    if (!clientId || !inUse) continue
    const mine = read.items.filter((i) => i.protocolCompoundId === held.protocolCompoundId)
    // Everything held but the one in use. Counted from the lists rather than
    // "open + spares - 1", which undercounted when the one in use is a used-up
    // vial (in neither list) sitting beside spares.
    const extras = [...box.open, ...box.spares].filter((i) => i !== inUse)
    out.set(clientId, {
      inUse,
      dosesReady: held.dosesReady,
      extras,
      others: extras.length,
      drySpare: box.spares.find(needsMixing) ?? null,
      lastWater: mixWaterDefault(mine),
      takenOnRead: takenOn(clientId),
    })
  }
  return out
}

/**
 * How full to draw a container held beyond the one in use, stacked behind it
 * on the card: an open one at its own level, a spare full, or empty when it is
 * powder still to mix (the glass is clear until the water goes in).
 */
export function extraFill(item: StockItem): number {
  if (item.acquiredOn == null) return needsMixing(item) ? 0 : 1
  if (item.remainingBase == null || !item.totalBase) return 1
  return Math.max(0, Math.min(1, item.remainingBase / item.totalBase))
}

/**
 * The in-use container as the card and the sheet draw it: its OWN figures
 * (what is left in it, its doses, its level), with `daysToEmpty` walked from
 * the compound's `dosesReady` over the days a dose is due, from `todayKey`.
 *
 * Called in render with the day it is NOW, so a screen left open past midnight
 * moves with the date rather than reading a day late (cold review B37). Today's
 * logged doses count only while the read is from today: a read from yesterday
 * has subtracted nothing logged since, so every one of today's slots is still
 * to be covered by what it counted.
 */
export function withRunway(
  view: CompoundStockView,
  compound: StackCompound | undefined,
  todayKey: string,
  readOn: string,
): StockItem {
  const taken = readOn === todayKey ? view.takenOnRead : 0
  return {
    ...view.inUse,
    daysToEmpty: compound
      ? runsDryInDays(compound, view.dosesReady, todayKey, taken)
      : view.inUse.daysToEmpty,
  }
}

/**
 * The foot of a compound's card on Protocol: when it runs dry, as the app has
 * always put it, "Runs dry" over the date (Adrian liked it, W15). Null when
 * there is nothing true to say (no due day runs short within the horizon).
 * Never asked without stock: the card offers "Add stock" instead.
 *
 * - Held but not started (spares only): "Not mixed" or "Not opened", no
 *   label, since nothing is being used yet.
 * - Paused: "Paused". A pause has no runway (`supabase/protocol/019`).
 * - The container in use is empty and nothing else is open: "Empty", amber.
 * - Else the runway, as `runsDryText` words it: amber at a week or less.
 */
export function cardStockLine(
  stock: StockItem,
  paused: boolean,
  todayKey: string,
): { label: string | null; text: string; low: boolean } | null {
  if (stock.acquiredOn == null) {
    return { label: null, text: needsMixing(stock) ? "Not mixed" : "Not opened", low: false }
  }
  if (paused) return { label: "Runs dry", text: "Paused", low: false }
  if (stock.remainingBase != null && stock.remainingBase <= 0) {
    return { label: "Runs dry", text: "Empty", low: true }
  }
  const dry = runsDryText(stock.daysToEmpty ?? null, todayKey)
  return dry ? { label: "Runs dry", ...dry } : null
}
