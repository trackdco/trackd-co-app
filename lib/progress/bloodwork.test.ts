import { describe, expect, it } from "vitest"

import { bloodworkDateKey, bloodworkDateText } from "./bloodwork"

describe("bloodworkDateKey (W42: the date a report is shown under)", () => {
  it("is the draw date the user picked, exactly", () => {
    expect(bloodworkDateKey("2026-09-12", "2026-09-20T03:00:00Z")).toBe("2026-09-12")
  })

  it("never moves the draw date through a time zone", () => {
    // A draw on the 1st uploaded late on the 31st, UTC: still the 1st.
    expect(bloodworkDateKey("2026-09-01", "2026-08-31T23:30:00Z")).toBe("2026-09-01")
  })

  it("falls back to the upload's UTC day when no draw date was written", () => {
    expect(bloodworkDateKey(null, "2026-09-20T03:00:00Z")).toBe("2026-09-20")
    expect(bloodworkDateKey(undefined, "2026-09-20T23:59:00+00:00")).toBe("2026-09-20")
  })

  it("is empty for a row with nothing to go on", () => {
    expect(bloodworkDateKey(null, "not a date")).toBe("")
  })
})

describe("bloodworkDateText (the card's date, formatted like the rest)", () => {
  it("leaves this year off", () => {
    expect(bloodworkDateText("2026-09-12", "2026-09-26")).toBe("12 Sep")
  })

  it("adds the year for an older report, by the DEVICE's year", () => {
    expect(bloodworkDateText("2025-12-30", "2026-01-02")).toBe("30 Dec 2025")
  })

  it("reads the draw date's own day, never a day early", () => {
    expect(bloodworkDateText("2026-03-01", "2026-09-26")).toBe("1 Mar")
  })
})
