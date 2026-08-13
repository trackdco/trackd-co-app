/**
 * The version-in-force rule, which two readers now share: the client's
 * `resolveScheduleOn` and the push runner's `stopped` gate. A divergence here is
 * a divergence between what the app shows and what the phone announces, which is
 * the failure this module was extracted to end.
 */
import { describe, it, expect } from "vitest"

import { isStoppedOn, versionInForceOn } from "@/lib/protocol/scheduleVersions"

const v = (effectiveFrom: string, stopped = false) => ({ effectiveFrom, stopped })

describe("versionInForceOn", () => {
  it("takes the latest version that had taken effect", () => {
    const versions = [v("2026-01-01"), v("2026-01-10"), v("2026-01-20")]
    expect(versionInForceOn(versions, "2026-01-15")?.effectiveFrom).toBe("2026-01-10")
    expect(versionInForceOn(versions, "2026-01-10")?.effectiveFrom).toBe("2026-01-10")
    expect(versionInForceOn(versions, "2026-01-25")?.effectiveFrom).toBe("2026-01-20")
  })

  it("falls back to the EARLIEST for a day that predates them all", () => {
    // Never the current rule — that is the retroactive rewrite versioning exists
    // to stop.
    const versions = [v("2026-01-10"), v("2026-01-20")]
    expect(versionInForceOn(versions, "2026-01-01")?.effectiveFrom).toBe("2026-01-10")
  })

  it("does not care what order it is given them in", () => {
    const shuffled = [v("2026-01-20"), v("2026-01-01"), v("2026-01-10")]
    expect(versionInForceOn(shuffled, "2026-01-15")?.effectiveFrom).toBe("2026-01-10")
    expect(versionInForceOn(shuffled, "2025-12-01")?.effectiveFrom).toBe("2026-01-01")
  })

  it("answers null for no versions at all", () => {
    expect(versionInForceOn([], "2026-01-15")).toBeNull()
  })

  it("crosses months and years, because the keys sort as calendar dates", () => {
    const versions = [v("2025-12-28"), v("2026-01-03")]
    expect(versionInForceOn(versions, "2025-12-31")?.effectiveFrom).toBe("2025-12-28")
    expect(versionInForceOn(versions, "2026-01-04")?.effectiveFrom).toBe("2026-01-03")
  })
})

describe("isStoppedOn", () => {
  it("is true from the day of the delete forward", () => {
    const versions = [v("2026-01-01"), v("2026-01-10", true)]
    expect(isStoppedOn(versions, "2026-01-09")).toBe(false)
    expect(isStoppedOn(versions, "2026-01-10")).toBe(true)
    expect(isStoppedOn(versions, "2026-06-01")).toBe(true)
  })

  it("stops being true once a later version resumes the compound", () => {
    const versions = [v("2026-01-10", true), v("2026-01-15")]
    expect(isStoppedOn(versions, "2026-01-12")).toBe(true)
    expect(isStoppedOn(versions, "2026-01-15")).toBe(false)
  })

  it("reads no trail as running, not as unknown", () => {
    expect(isStoppedOn([], "2026-01-15")).toBe(false)
  })

  it("treats a missing `stopped` as not stopped", () => {
    // The column is absent on rows written before the flag existed, and absent
    // is not true.
    expect(isStoppedOn([{ effectiveFrom: "2026-01-01" }], "2026-01-15")).toBe(false)
  })
})
