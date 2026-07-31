import { describe, expect, it } from "vitest"

import {
  DEFAULT_POSES,
  POSE_CATALOGUE,
  isCataloguePose,
  isDefaultPose,
  poseLabel,
  poseShape,
} from "./photos"

/**
 * Spec 08 · part two changed the three DEFAULT poses to Front / Side / Back.
 * The relaxed variants were the old defaults and must survive as addable poses,
 * because photos already saved under them keep their pose and are never
 * migrated. This suite exists to make that survival a build-time fact: deleting
 * or renaming a relaxed id here fails, rather than silently relabelling a user's
 * history the next time someone tidies the catalogue.
 */

describe("default poses", () => {
  it("are Front, Side and Back, in that order", () => {
    expect(DEFAULT_POSES.map((p) => p.id)).toEqual(["front", "side", "back"])
    expect(DEFAULT_POSES.map((p) => p.label)).toEqual(["Front", "Side", "Back"])
  })

  it("are the first three of the catalogue, so they lead every picker", () => {
    expect(POSE_CATALOGUE.slice(0, 3)).toEqual(DEFAULT_POSES)
  })

  it("report themselves as defaults, and the relaxed variants do not", () => {
    for (const p of DEFAULT_POSES) expect(isDefaultPose(p.id)).toBe(true)
    for (const id of ["front-relaxed", "side-relaxed", "back-relaxed"]) {
      expect(isDefaultPose(id)).toBe(false)
    }
  })
})

describe("the retired relaxed poses", () => {
  const RELAXED = [
    ["front-relaxed", "Front relaxed"],
    ["side-relaxed", "Side relaxed"],
    ["back-relaxed", "Back relaxed"],
  ] as const

  it("are still in the catalogue, so they stay addable", () => {
    for (const [id] of RELAXED) expect(isCataloguePose(id)).toBe(true)
  })

  it("keep their exact labels, so existing photos are not relabelled", () => {
    for (const [id, label] of RELAXED) expect(poseLabel(id)).toBe(label)
  })

  it("keep an illustration shape, so their thumbnails still draw", () => {
    for (const [id] of RELAXED) expect(poseShape(id)).not.toBeNull()
  })
})

describe("the catalogue as a whole", () => {
  it("has no duplicate ids", () => {
    const ids = POSE_CATALOGUE.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("gives every pose a label and a drawable shape", () => {
    for (const p of POSE_CATALOGUE) {
      expect(p.label.length).toBeGreaterThan(0)
      expect(poseShape(p.id)).not.toBeNull()
    }
  })

  it("falls back to the raw text for a user's custom pose", () => {
    expect(isCataloguePose("Fun house mirror")).toBe(false)
    expect(poseLabel("Fun house mirror")).toBe("Fun house mirror")
    expect(poseShape("Fun house mirror")).toBeNull()
  })
})
