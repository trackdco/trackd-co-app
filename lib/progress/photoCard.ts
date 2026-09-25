/**
 * The Progress photos card (build-brief-final §3.15): which of the latest day's
 * photos show as tiles, the "+N" tile, the day a viewer swipes through, and the
 * one mono line under the tiles. Pure, no React.
 *
 * The day's photos arrive in pose order (`groupByDate`: the catalogue's order,
 * so Front, Side and Back lead, then the other catalogue poses, then customs by
 * name). Up to three show as tiles. With more, the first two show and the third
 * tile is "+N", N being every photo not already on a tile, and it opens the
 * viewer AT the third photo, so nothing is skipped. A day of three photos that
 * are not Front, Side and Back shows those three as they are, each labelled
 * with the pose picked when it was added.
 */

import { formatWeight, type WeightUnit } from "@/lib/weight"

import { formatPhotoDateShort, groupByDate, type ProgressPhoto } from "./photos"

/** Tiles in a row on the card. */
export const MAX_TILES = 3

export type PhotoTile =
  | { kind: "photo"; photo: ProgressPhoto; index: number }
  /** The last tile when the day has more photos than tiles. `index` is the
   *  photo the viewer opens at; `count` is how many are behind it. */
  | { kind: "more"; photo: ProgressPhoto; index: number; count: number }

/** The card's tiles for one day's photos, already in pose order. */
export function photoTiles(day: readonly ProgressPhoto[]): PhotoTile[] {
  if (day.length <= MAX_TILES) {
    return day.map((photo, index) => ({ kind: "photo", photo, index }))
  }
  const lead = MAX_TILES - 1
  const tiles: PhotoTile[] = day.slice(0, lead).map((photo, index) => ({ kind: "photo", photo, index }))
  tiles.push({ kind: "more", photo: day[lead], index: lead, count: day.length - lead })
  return tiles
}

/**
 * The tile a photo at viewer index `index` belongs to, so closing the viewer
 * shrinks it back into the tile it came from. Every photo past the second, on
 * a day with a "+N" tile, belongs to that tile.
 */
export function tileForIndex(index: number, total: number): number {
  if (index < 0) return -1
  if (total <= MAX_TILES) return index
  return Math.min(index, MAX_TILES - 1)
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
  const full = formatPhotoDateShort(date)
  const sameYear = date.slice(0, 4) === todayKey.slice(0, 4)
  const when = sameYear ? full.replace(/ \d{4}$/, "") : full
  return weightKg != null ? `${formatWeight(weightKg, unit)} ${unit} · ${when}` : when
}
