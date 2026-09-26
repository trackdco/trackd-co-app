import { describe, expect, it } from "vitest"

import {
  SMALL_PHONE_HIDDEN,
  SMALL_PHONE_MAX_HEIGHT,
  SMALL_PHONE_MAX_WIDTH,
  SMALL_PHONE_NO_TOP,
  isSmallPhone,
} from "@/lib/home/smallPhone"

/** Read the media query back out of a Tailwind arbitrary-variant class. */
function queryOf(cls: string): { maxWidth: number; maxHeight: number } {
  const m = /^\[@media\(max-width:(\d+)px\)_and_\(max-height:(\d+)px\)\]:/.exec(cls)
  if (!m) throw new Error(`not a small-phone class: ${cls}`)
  return { maxWidth: Number(m[1]), maxHeight: Number(m[2]) }
}

describe("ruling 2: Home drops the greeting on a small iPhone", () => {
  it("the classes carry the same query as the code", () => {
    for (const cls of [SMALL_PHONE_HIDDEN, SMALL_PHONE_NO_TOP]) {
      expect(queryOf(cls)).toEqual({ maxWidth: SMALL_PHONE_MAX_WIDTH, maxHeight: SMALL_PHONE_MAX_HEIGHT })
    }
    expect(SMALL_PHONE_HIDDEN.endsWith(":hidden")).toBe(true)
    expect(SMALL_PHONE_NO_TOP.endsWith(":mt-0")).toBe(true)
  })

  it("hides it on the SE: its full screen, as an app, and in Safari (the 375x548 check size)", () => {
    expect(isSmallPhone(375, 667)).toBe(true)
    expect(isSmallPhone(375, 647)).toBe(true)
    expect(isSmallPhone(375, 548)).toBe(true)
    expect(isSmallPhone(320, 460)).toBe(true) // the first SE, in Safari
  })

  it("keeps it on bigger phones, in Safari with its bars too", () => {
    expect(isSmallPhone(390, 844)).toBe(false) // the 390x844 check size
    expect(isSmallPhone(390, 664)).toBe(false) // an iPhone 14 in Safari
    expect(isSmallPhone(393, 659)).toBe(false) // a 15 Pro in Safari
    expect(isSmallPhone(414, 736)).toBe(false) // a Plus
    expect(isSmallPhone(375, 812)).toBe(false) // a mini, as an app
  })
})
