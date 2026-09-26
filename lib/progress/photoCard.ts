/**
 * The Progress photos card (build-brief-final §3.15; Adrian's walk, W39): which
 * of the latest day's photos show as tiles, the ones past them, the day a
 * viewer swipes through, and the one mono line under the tiles. Pure, no React.
 *
 * The day's photos arrive in pose order (`groupByDate`: the catalogue's order,
 * so Front, Side and Back lead, then the other catalogue poses, then customs by
 * name). Up to three show as tiles, and the tiles GROW TO FILL THE ROW (W39:
 * "no empty space beside them"): one photo takes the whole row, two take half
 * each, three a third. Every tile stays 3:4, the frame photos are taken in, so
 * the viewer grows out of a tile and back into it exactly.
 *
 * More than three (W39, my call): the first three still show whole, never a
 * photo hidden under a "+N", and a long card under the row says how many more
 * there are and opens the viewer at the first of them, so nothing is skipped
 * and a swipe reaches every photo of the day. A day of three photos that are
 * not Front, Side and Back shows those three as they are, each labelled with
 * the pose picked when it was added.
 */

import { dayShort } from "@/lib/format/date"
import { formatWeight, type WeightUnit } from "@/lib/weight"

import { groupByDate, type ProgressPhoto } from "./photos"

/** Tiles in a row on the card. */
export const MAX_TILES = 3

/** One photo on the card. `index` is where the viewer opens for it. */
export interface PhotoTile {
  kind: "photo"
  photo: ProgressPhoto
  index: number
}

/** The card's tiles for one day's photos, already in pose order: the first
 *  three at most. */
export function photoTiles(day: readonly ProgressPhoto[]): PhotoTile[] {
  return day.slice(0, MAX_TILES).map((photo, index) => ({ kind: "photo", photo, index }))
}

/**
 * How many columns the row has: one per tile, so one to three photos always
 * fill it (W39). Zero for an empty day.
 */
export function tileColumns(day: readonly ProgressPhoto[]): number {
  return Math.min(day.length, MAX_TILES)
}

/** The photos past the tiles, and where the viewer opens for them. */
export interface PhotoOverflow {
  /** The viewer's index for the first photo not on a tile. */
  index: number
  /** How many photos are not on a tile. */
  count: number
  /** Those photos, in pose order (the card shows the first few, small). */
  photos: ProgressPhoto[]
}

/** The "N more" card under the row, or null when every photo has a tile. */
export function photoOverflow(day: readonly ProgressPhoto[]): PhotoOverflow | null {
  if (day.length <= MAX_TILES) return null
  return { index: MAX_TILES, count: day.length - MAX_TILES, photos: day.slice(MAX_TILES) }
}

/**
 * The tile a photo at viewer index `index` belongs to, so closing the viewer
 * shrinks it back into the tile it came from. A photo past the third has no
 * tile (-1): the viewer fades out for it rather than shrinking into a card of
 * another shape.
 */
export function tileForIndex(index: number, total: number): number {
  if (index < 0 || index >= Math.min(total, MAX_TILES)) return -1
  return index
}

/**
 * The photos a viewer swipes through: every photo in `pool` taken on the same
 * day as `photo`, in pose order. `photo` is always in it, so a caller that
 * passes no pool (or a pool without it) still gets a one-photo viewer.
 */
export function dayPhotosFor(
  photo: ProgressPhoto | null,
  pool: readonly ProgressPhoto[] | undefined,
): ProgressPhoto[] {
  if (!photo) return []
  const same = (pool ?? []).filter((p) => p.date === photo.date)
  if (!same.some((p) => p.id === photo.id)) same.push(photo)
  return groupByDate(same)[0]?.photos ?? [photo]
}

/**
 * Where the viewer's Previous (-1) or Next (1) goes from photo `at` of
 * `count`, or null at that end (cold review B35: the viewer moved by swipe and
 * arrow keys only, so VoiceOver and Switch Control could not reach photos 2
 * to N of a day).
 */
export function stepPhoto(at: number, count: number, dir: -1 | 1): number | null {
  const next = at + dir
  return next < 0 || next >= count ? null : next
}

/** "Photo 2 of 5": what the viewer announces as it moves (B35). Nothing for a
 *  day of one photo, where there is nowhere to move. */
export function photoPositionText(at: number, count: number): string {
  return count > 1 ? `Photo ${at + 1} of ${count}` : ""
}

/** Where `photo` sits in its day, or 0 when it is not there. */
export function indexInDay(day: readonly ProgressPhoto[], photo: ProgressPhoto | null): number {
  if (!photo) return 0
  const i = day.findIndex((p) => p.id === photo.id)
  return i < 0 ? 0 : i
}

/** The weight logged that day: the first of its photos that carries one. */
export function dayWeightKg(day: readonly ProgressPhoto[]): number | null {
  for (const p of day) if (p.weightKg != null) return p.weightKg
  return null
}

/**
 * "84.2 kg · 25 Sep", the line under the tiles (the card sets it in uppercase
 * mono). The year is added only when it is not this year, so an old photo is
 * never mistaken for a recent one.
 */
export function photoDayLine({
  date,
  weightKg,
  unit,
  todayKey,
}: {
  date: string
  weightKg: number | null
  unit: WeightUnit
  todayKey: string
}): string {
  const when = dayShort(date, Number(todayKey.slice(0, 4)))
  return weightKg != null ? `${formatWeight(weightKg, unit)} ${unit} · ${when}` : when
}
