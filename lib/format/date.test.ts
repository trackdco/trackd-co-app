import { describe, expect, it } from "vitest"

import { dayLong, dayRange, dayShort } from "@/lib/format/date"

describe("the date formats", () => {
  it("writes a day long, short, and with the year only when it is not this year", () => {
    expect(dayLong("2026-09-01")).toBe("Tue 1 Sep")
    expect(dayShort("2026-09-03", 2026)).toBe("3 Sep")
    expect(dayShort("2025-09-03", 2026)).toBe("3 Sep 2025")
  })

  it("writes a range within a month, across months, and across a year", () => {
    expect(dayRange("2026-09-03", "2026-09-09", 2026)).toBe("3 to 9 Sep")
    expect(dayRange("2026-08-28", "2026-09-03", 2026)).toBe("28 Aug to 3 Sep")
    expect(dayRange("2025-12-28", "2026-01-03", 2026)).toBe("28 Dec 2025 to 3 Jan")
  })
})
