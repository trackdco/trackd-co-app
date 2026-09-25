import { describe, expect, it } from "vitest"

import {
  MAX_TILES,
  dayPhotosFor,
  dayWeightKg,
  indexInDay,
  photoDayLine,
  photoTiles,
  tileForIndex,
} from "./photoCard"
import { latestDay, poseLabel, type ProgressPhoto } from "./photos"

const shot = (id: string, pose: string, date = "2026-09-25", weightKg: number | null = 84.2): ProgressPhoto => ({
  id,
  pose,
  date,
  url: `u-${id}`,
  weightKg,
  note: null,
})

describe("photoTiles", () => {
  it("shows every photo when there are three or fewer", () => {
    const day = [shot("a", "front"), shot("b", "side"), shot("c", "back")]
    const tiles = photoTiles(day)
    expect(tiles.map((t) => t.kind)).toEqual(["photo", "photo", "photo"])
    expect(tiles.map((t) => t.index)).toEqual([0, 1, 2])
  })

  it("shows one and two photos as they are", () => {
    expect(photoTiles([shot("a", "front")])).toHaveLength(1)
    expect(photoTiles([shot("a", "front"), shot("b", "side")])).toHaveLength(2)
    expect(photoTiles([])).toEqual([])
  })

  it("with more than three: the first two, then +N for the rest, opening at the third", () => {
    const day = [shot("a", "front"), shot("b", "side"), shot("c", "back"), shot("d", "most-muscular"), shot("e", "Vacuum")]
    const tiles = photoTiles(day)
    expect(tiles).toHaveLength(MAX_TILES)
    expect(tiles[0]).toMatchObject({ kind: "photo", index: 0 })
    expect(tiles[1]).toMatchObject({ kind: "photo", index: 1 })
    expect(tiles[2]).toMatchObject({ kind: "more", index: 2, count: 3 })
    // It opens the viewer at the THIRD photo, so nothing is skipped.
    expect(tiles[2].photo.id).toBe("c")
  })

  it("counts every photo not on a tile, four photos reading +2", () => {
    const day = [shot("a", "front"), shot("b", "side"), shot("c", "back"), shot("d", "side-chest")]
    const more = photoTiles(day)[2]
    expect(more.kind === "more" && more.count).toBe(2)
  })
})

describe("pose order on the card", () => {
  it("puts Front, Side and Back first, whatever order they were added in", () => {
    const day = latestDay([shot("x", "most-muscular"), shot("b", "back"), shot("s", "side"), shot("f", "front")])!
    expect(day.photos.map((p) => poseLabel(p.pose))).toEqual(["Front", "Side", "Back", "Most muscular"])
    const tiles = photoTiles(day.photos)
    expect(tiles.map((t) => (t.kind === "photo" ? poseLabel(t.photo.pose) : `+${t.count}`))).toEqual([
      "Front",
      "Side",
      "+2",
    ])
  })

  it("labels three photos that are not Front, Side and Back with their own poses", () => {
    const day = latestDay([shot("v", "Vacuum"), shot("m", "most-muscular"), shot("c", "side-chest")])!
    expect(photoTiles(day.photos).map((t) => poseLabel(t.photo.pose))).toEqual([
      "Side chest",
      "Most muscular",
      "Vacuum",
    ])
  })
})

describe("tileForIndex", () => {
  it("maps each photo to its own tile when all fit", () => {
    expect([0, 1, 2].map((i) => tileForIndex(i, 3))).toEqual([0, 1, 2])
  })

  it("maps every photo from the third on to the +N tile", () => {
    expect([0, 1, 2, 3, 4].map((i) => tileForIndex(i, 5))).toEqual([0, 1, 2, 2, 2])
  })

  it("has no tile for a photo that is not there", () => {
    expect(tileForIndex(-1, 5)).toBe(-1)
  })
})

describe("dayPhotosFor", () => {
  const pool = [
    shot("a", "back", "2026-09-25"),
    shot("b", "front", "2026-09-25"),
    shot("c", "front", "2026-09-01"),
  ]

  it("is the photo's day, in pose order", () => {
    expect(dayPhotosFor(pool[0], pool).map((p) => p.id)).toEqual(["b", "a"])
  })

  it("is just the photo without a pool", () => {
    expect(dayPhotosFor(pool[2], undefined).map((p) => p.id)).toEqual(["c"])
  })

  it("always holds the photo, even when the pool does not", () => {
    const lone = shot("z", "side", "2026-09-25")
    expect(dayPhotosFor(lone, pool).map((p) => p.id)).toEqual(["b", "z", "a"])
  })

  it("is empty with no photo", () => {
    expect(dayPhotosFor(null, pool)).toEqual([])
  })

  it("indexInDay finds the photo, or falls back to the first", () => {
    const day = dayPhotosFor(pool[0], pool)
    expect(indexInDay(day, pool[0])).toBe(1)
    expect(indexInDay(day, pool[2])).toBe(0)
    expect(indexInDay(day, null)).toBe(0)
  })
})

describe("the line under the tiles", () => {
  it("reads weight then date, without the year this year", () => {
    expect(photoDayLine({ date: "2026-09-25", weightKg: 84.2, unit: "kg", todayKey: "2026-09-26" })).toBe(
      "84.2 kg · 25 Sep",
    )
  })

  it("adds the year for an older photo", () => {
    expect(photoDayLine({ date: "2025-12-30", weightKg: 84.2, unit: "kg", todayKey: "2026-01-02" })).toBe(
      "84.2 kg · 30 Dec 2025",
    )
  })

  it("is just the date when no weight was logged that day", () => {
    expect(photoDayLine({ date: "2026-09-25", weightKg: null, unit: "kg", todayKey: "2026-09-26" })).toBe("25 Sep")
  })

  it("converts to pounds", () => {
    expect(photoDayLine({ date: "2026-09-25", weightKg: 100, unit: "lbs", todayKey: "2026-09-26" })).toBe(
      "220.46 lbs · 25 Sep",
    )
  })

  it("takes the day's weight from the first photo that has one", () => {
    expect(dayWeightKg([shot("a", "front", "2026-09-25", null), shot("b", "side", "2026-09-25", 83.9)])).toBe(83.9)
    expect(dayWeightKg([shot("a", "front", "2026-09-25", null)])).toBeNull()
  })
})
