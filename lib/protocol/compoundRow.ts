/**
 * Protocol's compounds row, as pure rules: the order, the type groups, what a
 * card's name reads, how many spare containers it draws, and the entrance a
 * type switch plays (Adrian's walk of the preview, 2026-09-26: W16, W18, W46,
 * cold review D10). No React, no DOM (code-standards.md); `CompoundsRow` and
 * `CompoundStorageCard` draw what these say.
 */
import { blendFor } from "@/lib/compound-blends"
import { CATEGORY_META, categoryRank, type CompoundCategory } from "@/lib/compound-categories"
import type { StackCompound } from "@/lib/home/stack"

/** Category order (anabolics first, `CATEGORY_DISPLAY_ORDER`), then by name. */
export function orderByCategory<T extends Pick<StackCompound, "category" | "name">>(compounds: readonly T[]): T[] {
  return [...compounds].sort((a, b) => {
    const byCategory = categoryRank(a.category) - categoryRank(b.category)
    if (byCategory !== 0) return byCategory
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    return a.name.localeCompare(b.name)
  })
}

/**
 * The type the row shows. A type that is no longer run (its last compound was
 * deleted or ended) falls back to "all": its chip is gone from the rail, and a
 * filter nobody can see or undo would leave the row empty.
 */
export function effectiveType(type: string, compounds: readonly Pick<StackCompound, "category">[]): string {
  if (type === "all") return "all"
  return compounds.some((c) => c.category === type) ? type : "all"
}

export interface RowGroup<T> {
  /** The category key: its colour is `var(--cat-<key>)`. */
  key: string
  /** Its title, "Peptides" (`CATEGORY_META`), else "Other". */
  label: string
  compounds: T[]
  /** Where its first card falls in the whole row (0-based): the order the
   *  entrance plays in. */
  start: number
}

/**
 * The row's groups under their type titles (W16): the compounds the chosen
 * type shows, in category order, one group per category present. Names sort
 * within a group.
 */
export function rowGroups<T extends Pick<StackCompound, "category" | "name">>(
  compounds: readonly T[],
  type: string,
): RowGroup<T>[] {
  const shown = type === "all" ? compounds : compounds.filter((c) => c.category === type)
  const out: RowGroup<T>[] = []
  orderByCategory(shown).forEach((c, i) => {
    const last = out[out.length - 1]
    if (last && last.key === c.category) last.compounds.push(c)
    else {
      out.push({
        key: c.category,
        label: CATEGORY_META[c.category as CompoundCategory]?.label ?? "Other",
        compounds: [c],
        start: i,
      })
    }
  })
  return out
}

/**
 * A card's name, in full (the copy rule; cold review D10). A blend reads as
 * its own name over what it holds, "Glow" over "BPC-157 + TB-500 + GHK-Cu",
 * which is the catalogue name with nothing dropped, and lets a long blend take
 * a third line without clipping. Anything else is its name as it stands.
 */
export function cardName(name: string): { head: string; parts: string[] | null } {
  const blend = blendFor(name)
  if (!blend) return { head: name, parts: null }
  return { head: blend.label, parts: [...blend.contains] }
}

/** The most spare containers a card draws behind the one in use. */
export const MAX_DRAWN_EXTRAS = 3

/**
 * The containers a card draws stacked behind the one in use (W18): one for
 * each held beyond it, at most {@link MAX_DRAWN_EXTRAS}; the count on the
 * badge says the rest. Nearest first: offset, scale and opacity for each, so
 * the one right behind reads clearest and the last fades out.
 */
export function extrasDrawn(others: number): { offsetX: number; lift: number; scale: number; opacity: number }[] {
  const n = Math.max(0, Math.min(MAX_DRAWN_EXTRAS, Math.floor(others)))
  return Array.from({ length: n }, (_, i) => ({
    offsetX: (i + 1) * 7,
    lift: (i + 1) * 3,
    scale: 0.92 - i * 0.04,
    opacity: 0.5 - i * 0.13,
  }))
}

/* ------------------------------------------------ the type switch's entrance */

/** Between one card and the next as they come in (the house's 40 to 60ms). */
export const ROW_STAGGER_MS = 45
/** Past this many, the rest come in together: they start off screen anyway,
 *  and a long row must not keep the last card waiting. */
export const ROW_STAGGER_CAP = 8
/** Each card's slide, the Protocol pages' own (`.subpage-in`: 26px, 300ms). */
export const ROW_ENTER_MS = 300
export const ROW_ENTER_OFFSET_PX = 26
export const ROW_ENTER_EASE = "cubic-bezier(0.22, 1, 0.36, 1)"
/** Reduced motion: one short fade, all at once (`.subpage-in`'s fallback). */
export const ROW_FADE_MS = 160

/**
 * How the card at `index` comes in when the type changes (W46): sliding in
 * along the row from the right with a fade, one after another, the Add tile
 * last (it takes the index after every card). Reduced motion: a fade, no
 * slide and no stagger.
 */
export function rowEntrance(
  index: number,
  reduced: boolean,
): { delay: number; duration: number; easing: string; fromX: number } {
  if (reduced) return { delay: 0, duration: ROW_FADE_MS, easing: "ease-out", fromX: 0 }
  const i = Math.max(0, Math.min(ROW_STAGGER_CAP, Math.floor(index)))
  return { delay: i * ROW_STAGGER_MS, duration: ROW_ENTER_MS, easing: ROW_ENTER_EASE, fromX: ROW_ENTER_OFFSET_PX }
}
