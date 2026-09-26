/**
 * What a compound's sheet on Protocol says about its stock and its next dose
 * (W17, cold reviews D13 and F14). Pure: no React, no storage
 * (code-standards.md).
 *
 * THE STOCK PICTURE (W17, Adrian: "show stock visually when you open a
 * compound: the current vial and its level, then unmixed and mixed vials").
 * The container in use leads, drawn at its own level with its own figure; the
 * rest of what the compound holds follows as small groups, each drawn as what
 * it is: vials also open (mixed) at their levels, spares still to mix dry with
 * their powder, sealed containers full. The count beside them names the
 * container, "+4 vials", as the Protocol card does (D13).
 */
import type { StockItem } from "@/lib/db/inventory"
import { containerNoun, remainingLabel } from "@/lib/containers/labels"
import { dayLong } from "@/lib/format/date"
import { toDateKey } from "@/lib/home/mockHomeData"
import { timesPerDayOf, upcomingDoseDates, type StackCompound } from "@/lib/home/stack"

/** How many of a group are drawn; its label still counts them all. */
export const HELD_DRAWN_MAX = 3

/** What a held container is. */
export type HeldKind = "mixed" | "open" | "unmixed" | "sealed"

/** A container as the picture draws it. */
export interface DrawnContainer {
  item: StockItem
  /** Its level, 0 to 1. Undefined when the view has no figure for a started
   *  one, so the drawing falls back to its illustrative level rather than
   *  claiming a number (`components/containers/types.ts`). */
  fill: number | undefined
  /** A powder vial still dry: drawn with its powder. */
  powder: boolean
}

export interface HeldGroup {
  kind: HeldKind
  /** "2 mixed", "3 unmixed", "1 sealed", "1 open". */
  label: string
  count: number
  /** The first {@link HELD_DRAWN_MAX}, oldest first. */
  drawn: DrawnContainer[]
}

export interface StockPicture {
  lead: DrawnContainer & {
    /** "Current vial"; for a compound holding only spares, what the first is. */
    title: string
    /** "7 doses left", "60 caps left"; null for a spare, which holds no doses
     *  until it is started. */
    figure: string | null
  }
  /** Mixed or open first (in use soonest), then unmixed, then sealed. Empty
   *  when the caller gave no breakdown. */
  groups: HeldGroup[]
  /** "+4 vials" with anything else held, else null (D13). */
  othersLabel: string | null
}

/** The fields a container is named and drawn from. */
type Naming = { category?: string | null; name?: string | null }

/** Started (mixed or opened), as against a spare held back (`026`). */
function started(item: StockItem): boolean {
  return item.acquiredOn != null
}

/** A powder vial with no water: dry, drawn with its powder. */
function dry(item: StockItem): boolean {
  return item.inventoryType === "reconstituted" && !started(item) && item.bacWaterMl == null
}

export function heldKind(item: StockItem): HeldKind {
  if (item.inventoryType === "reconstituted") {
    // A powder vial that holds water is mixed, even held back (written before
    // Correct stopped giving spares water, cold review S5).
    return dry(item) ? "unmixed" : "mixed"
  }
  return started(item) ? "open" : "sealed"
}

/** A container's level as the picture draws it. */
export function drawnFill(item: StockItem): number | undefined {
  if (dry(item)) return 0
  if (!started(item)) return 1
  if (item.remainingBase == null || !item.totalBase) return undefined
  return Math.max(0, Math.min(1, item.remainingBase / item.totalBase))
}

function drawn(item: StockItem): DrawnContainer {
  return { item, fill: drawnFill(item), powder: dry(item) }
}

/** The container's noun: "vial", "bottle", "tub", "dropper". */
export function nounOf(item: StockItem, naming: Naming): string {
  return containerNoun({
    inventoryType: item.inventoryType,
    totalAmountUnit: item.totalAmountUnit,
    category: naming.category ?? item.category,
    name: naming.name ?? item.compoundName,
  })
}

/** "+4 vials", "+1 bottle": the containers held beyond the one leading (D13). */
export function othersLabel(count: number, noun: string): string | null {
  if (!(count > 0)) return null
  return `+${count} ${noun}${count === 1 ? "" : "s"}`
}

/** "7 doses left", else what is physically left ("8.5 mL left"). */
function figureOf(item: StockItem): string | null {
  if (!started(item)) return null
  const n = item.dosesRemaining
  if (n != null) return `${n} ${n === 1 ? "dose" : "doses"} left`
  return remainingLabel(item)
}

function titleOf(item: StockItem, noun: string): string {
  if (started(item)) return `Current ${noun}`
  const kind = heldKind(item)
  if (kind === "unmixed") return "Powder, not mixed"
  if (kind === "mixed") return "Mixed, not started"
  return `Sealed ${noun}`
}

const GROUP_ORDER: HeldKind[] = ["mixed", "open", "unmixed", "sealed"]

/**
 * The picture for one compound.
 *
 * `inUse` is the container the sheet leads with (the oldest open one, else the
 * first spare), with its OWN figures (cold review F1). `extras` is everything
 * else the compound holds (`CompoundStockView.extras`); without it the picture
 * is the lead and the count alone, as the sheet was before.
 */
export function stockPicture(input: {
  inUse: StockItem | null
  extras?: readonly StockItem[] | null
  others: number
  naming: Naming
}): StockPicture | null {
  const { inUse: lead, extras, naming } = input
  if (!lead) return null
  const noun = nounOf(lead, naming)
  const rest = (extras ?? []).filter((i) => i.id !== lead.id)

  const groups: HeldGroup[] = []
  for (const kind of GROUP_ORDER) {
    const members = rest.filter((i) => heldKind(i) === kind)
    if (members.length === 0) continue
    groups.push({
      kind,
      label: `${members.length} ${kind}`,
      count: members.length,
      drawn: members.slice(0, HELD_DRAWN_MAX).map(drawn),
    })
  }

  return {
    lead: { ...drawn(lead), title: titleOf(lead, noun), figure: figureOf(lead) },
    groups,
    othersLabel: othersLabel(extras ? rest.length : input.others, noun),
  }
}

/* ------------------------------------------------------------ next dose */

/**
 * The ONE next dose the sheet names (D13: "Next dose" with one date, not
 * three). Today while a dose is still due today; once every one of today's
 * doses is logged or skipped, the next due day after it (F14: the sheet listed
 * today with today's dose already logged). Pauses and the cycle's weeks off are
 * skipped, as the Home week strip skips them. Null when nothing is due within
 * the year `upcomingDoseDates` walks.
 */
export function nextDoseKey(
  compound: Pick<StackCompound, "schedule" | "cycle" | "pauses">,
  now: Date,
  /** Today's doses already logged or skipped for this compound. */
  loggedToday: number,
): string | null {
  const today = toDateKey(now)
  const doneToday = loggedToday >= timesPerDayOf(compound.schedule)
  const dates = upcomingDoseDates(compound.schedule, now, 2, compound.cycle, compound.pauses)
  return dates.find((k) => !(k === today && doneToday)) ?? null
}

/** The next dose's day in words: "Today", "Tomorrow", else "Mon 28 Sep". */
export function nextDoseText(key: string, now: Date): string {
  const today = toDateKey(now)
  if (key === today) return "Today"
  const tomorrow = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  if (key === tomorrow) return "Tomorrow"
  return dayLong(key)
}
