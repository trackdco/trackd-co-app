import { describe, expect, it } from "vitest"

import {
  MAX_TILES,
  dayPhotosFor,
  dayWeightKg,
  indexInDay,
  photoDayLine,
  photoOverflow,
  photoPositionText,
  photoTiles,
  stepPhoto,
  tileColumns,
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

  it("with more than three: the first three whole, never a photo under a +N (W39)", () => {
    const day = [shot("a", "front"), shot("b", "side"), shot("c", "back"), shot("d", "most-muscular"), shot("e", "Vacuum")]
    const tiles = photoTiles(day)
    expect(tiles).toHaveLength(MAX_TILES)
    expect(tiles.map((t) => [t.kind, t.index, t.photo.id])).toEqual([
      ["photo", 0, "a"],
      ["photo", 1, "b"],
      ["photo", 2, "c"],
    ])
  })
})

describe("the row fills itself (W39)", () => {
  it("has one column per photo, up to three, so one or two photos leave no gap", () => {
    expect(tileColumns([])).toBe(0)
    expect(tileColumns([shot("a", "front")])).toBe(1)
    expect(tileColumns([shot("a", "front"), shot("b", "side")])).toBe(2)
    expect(tileColumns([shot("a", "front"), shot("b", "side"), shot("c", "back")])).toBe(3)
    expect(tileColumns([shot("a", "front"), shot("b", "side"), shot("c", "back"), shot("d", "Vacuum")])).toBe(3)
  })
})

describe("photoOverflow (W39: more than three open another way)", () => {
  it("is nothing while every photo has a tile", () => {
    expect(photoOverflow([])).toBeNull()
    expect(photoOverflow([shot("a", "front"), shot("b", "side"), shot("c", "back")])).toBeNull()
  })

  it("counts every photo past the third and opens the viewer at the fourth", () => {
    const day = [shot("a", "front"), shot("b", "side"), shot("c", "back"), shot("d", "side-chest"), shot("e", "Vacuum")]
    const more = photoOverflow(day)!
    expect(more.index).toBe(3)
    expect(more.count).toBe(2)
    expect(more.photos.map((p) => p.id)).toEqual(["d", "e"])
    // The viewer's day holds all five, so the fourth is where it opens and a
    // swipe back still reaches the first three.
    expect(day[more.index].id).toBe("d")
  })
})

describe("pose order on the card", () => {
  it("puts Front, Side and Back first, whatever order they were added in", () => {
    const day = latestDay([shot("x", "most-muscular"), shot("b", "back"), shot("s", "side"), shot("f", "front")])!
    expect(day.photos.map((p) => poseLabel(p.pose))).toEqual(["Front", "Side", "Back", "Most muscular"])
    expect(photoTiles(day.photos).map((t) => poseLabel(t.photo.pose))).toEqual(["Front", "Side", "Back"])
    expect(photoOverflow(day.photos)?.photos.map((p) => poseLabel(p.pose))).toEqual(["Most muscular"])
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

  it("gives the first three their tiles and a photo past them none", () => {
    expect([0, 1, 2, 3, 4].map((i) => tileForIndex(i, 5))).toEqual([0, 1, 2, -1, -1])
  })

  it("has no tile for a photo that is not there", () => {
    expect(tileForIndex(-1, 5)).toBe(-1)
    expect(tileForIndex(2, 2)).toBe(-1)
  })
})

describe("the viewer's Previous and Next (cold review B35)", () => {
  it("steps one photo either way", () => {
    expect(stepPhoto(1, 5, 1)).toBe(2)
    expect(stepPhoto(1, 5, -1)).toBe(0)
  })

  it("goes nowhere past either end", () => {
    expect(stepPhoto(0, 5, -1)).toBeNull()
    expect(stepPhoto(4, 5, 1)).toBeNull()
    expect(stepPhoto(0, 1, 1)).toBeNull()
  })

  it("announces the position, counting from one", () => {
    expect(photoPositionText(1, 5)).toBe("Photo 2 of 5")
    expect(photoPositionText(0, 2)).toBe("Photo 1 of 2")
  })

  it("announces nothing for a day of one photo", () => {
    expect(photoPositionText(0, 1)).toBe("")
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
