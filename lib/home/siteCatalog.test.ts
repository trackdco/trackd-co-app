import { describe, expect, it } from "vitest"

import { IM_SITES, SUBQ_SITES, siteDisplayName, siteShortLabel } from "./siteCatalog"

describe("site names", () => {
  it("drop the spaced dash for display", () => {
    expect(siteDisplayName("Side Abdomen – Left")).toBe("Side Abdomen, Left")
    expect(siteDisplayName("Outer Thigh – Upper Right")).toBe("Outer Thigh, Upper Right")
    expect(siteDisplayName("Glute")).toBe("Glute")
  })

  it("shorten for the Track bar", () => {
    expect(siteShortLabel("sq-abdo-l")).toBe("Side Abdomen L")
    expect(siteShortLabel("im-delt-r")).toBe("Delt R")
    expect(siteShortLabel("sq-thigh-up-r")).toBe("Upper Thigh R")
    expect(siteShortLabel("sq-thigh-lo-l")).toBe("Lower Thigh L")
    expect(siteShortLabel("sq-arm-l")).toBe("Back Arm L")
    expect(siteShortLabel("im-quad-front-l")).toBe("Front Quad L")
  })

  it("prefer the caller's label and never lose a site", () => {
    expect(siteShortLabel("x", "Lower Abdomen – Right")).toBe("Lower Abdomen R")
    expect(siteShortLabel("unknown-id")).toBe("unknown-id")
    for (const s of [...IM_SITES, ...SUBQ_SITES]) {
      const short = siteShortLabel(s.id)
      expect(short.length).toBeLessThanOrEqual(16)
      expect(short).toMatch(/ (R|L)$/)
    }
  })
})
