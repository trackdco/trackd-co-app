import { describe, expect, it } from "vitest"

import {
  hasOneOffOn,
  normalizeOneOff,
  oneOffsInWindow,
  oneOffsOn,
  recentOneOffLabels,
  type OneOffDays,
  type OneOffLog,
} from "./oneOffLogs"

const log = (over: Partial<OneOffLog> & { id: string; loggedFor: string }): OneOffLog => ({
  label: "Creatine Monohydrate",
  time24: "08:00",
  ...over,
})

describe("normalizeOneOff — a record that cannot be shown or deleted is dropped", () => {
  it("keeps a well-formed entry", () => {
    expect(
      normalizeOneOff({
        id: "a",
        label: "Creatine",
        loggedFor: "2026-08-07",
        time24: "08:00",
      })
    ).toEqual({ id: "a", label: "Creatine", loggedFor: "2026-08-07", time24: "08:00" })
  })

  it("drops one with no id, no label or no day", () => {
    // Each is unrecoverable: no id means it cannot be deleted, no label means it
    // cannot be displayed, no day means it belongs nowhere.
    expect(normalizeOneOff({ label: "x", loggedFor: "2026-08-07" })).toBeNull()
    expect(normalizeOneOff({ id: "a", label: "   ", loggedFor: "2026-08-07" })).toBeNull()
    expect(normalizeOneOff({ id: "a", label: "x", loggedFor: "nope" })).toBeNull()
  })

  it("drops a unit the table would reject rather than storing it", () => {
    const out = normalizeOneOff({
      id: "a",
      label: "x",
      loggedFor: "2026-08-07",
      unit: "furlongs",
    })
    expect(out?.unit).toBeUndefined()
  })

  it("keeps `scoop`, which the dose_unit enum deliberately does not have", () => {
    const out = normalizeOneOff({
      id: "a",
      label: "x",
      loggedFor: "2026-08-07",
      unit: "scoop",
    })
    expect(out?.unit).toBe("scoop")
  })

  it("trims the label rather than storing the whitespace", () => {
    expect(normalizeOneOff({ id: "a", label: "  Creatine  ", loggedFor: "2026-08-07" })?.label)
      .toBe("Creatine")
  })
})

describe("a day holds a LIST, because two of the same thing both count", () => {
  const days: OneOffDays = {
    "2026-08-07": [
      log({ id: "a", loggedFor: "2026-08-07", time24: "20:00", label: "Creatine" }),
      log({ id: "b", loggedFor: "2026-08-07", time24: "08:00", label: "Creatine" }),
    ],
  }

  it("keeps both entries of the same thing on the same day", () => {
    // The reason this table has a random id: no deterministic key could tell
    // these apart, so one would overwrite the other.
    expect(oneOffsOn(days, "2026-08-07")).toHaveLength(2)
  })

  it("orders them by time", () => {
    expect(oneOffsOn(days, "2026-08-07").map((l) => l.id)).toEqual(["b", "a"])
  })

  it("puts an untimed entry last rather than first", () => {
    // `""` string-compares below every real time, so a naive sort would float
    // an untimed entry to the top of the day.
    const withUntimed: OneOffDays = {
      "2026-08-07": [
        log({ id: "x", loggedFor: "2026-08-07", time24: "" }),
        log({ id: "y", loggedFor: "2026-08-07", time24: "08:00" }),
      ],
    }
    expect(oneOffsOn(withUntimed, "2026-08-07").map((l) => l.id)).toEqual(["y", "x"])
  })

  it("answers hasOneOffOn for the calendar's mark", () => {
    expect(hasOneOffOn(days, "2026-08-07")).toBe(true)
    expect(hasOneOffOn(days, "2026-08-08")).toBe(false)
    expect(hasOneOffOn({}, "2026-08-07")).toBe(false)
  })
})

describe("oneOffsInWindow — what a block's look-back lists", () => {
  const days: OneOffDays = {
    "2026-07-31": [log({ id: "before", loggedFor: "2026-07-31", label: "Creatine" })],
    "2026-08-01": [log({ id: "a", loggedFor: "2026-08-01", label: "Creatine" })],
    "2026-08-05": [
      log({ id: "b", loggedFor: "2026-08-05", label: "Creatine" }),
      log({ id: "c", loggedFor: "2026-08-05", label: "Ashwagandha" }),
    ],
    "2026-09-01": [log({ id: "after", loggedFor: "2026-09-01", label: "Creatine" })],
  }

  it("counts each distinct label once, with how many times it appears", () => {
    const out = oneOffsInWindow(days, "2026-08-01", "2026-08-31")
    expect(out).toEqual([
      { label: "Creatine", count: 2 },
      { label: "Ashwagandha", count: 1 },
    ])
  })

  it("clips to the window at BOTH ends", () => {
    const labels = oneOffsInWindow(days, "2026-08-01", "2026-08-31").map((o) => o.label)
    expect(labels).not.toContain("before")
    const counts = oneOffsInWindow(days, "2026-08-01", "2026-08-31")
    // The 07-31 and 09-01 entries are outside, so Creatine is 2 and not 4.
    expect(counts[0].count).toBe(2)
  })

  it("matches labels case-insensitively so one thing is one row", () => {
    const mixed: OneOffDays = {
      "2026-08-01": [log({ id: "a", loggedFor: "2026-08-01", label: "Creatine" })],
      "2026-08-02": [log({ id: "b", loggedFor: "2026-08-02", label: "creatine" })],
    }
    const out = oneOffsInWindow(mixed, "2026-08-01", "2026-08-31")
    expect(out).toHaveLength(1)
    expect(out[0].count).toBe(2)
  })

  it("orders most-taken first, then alphabetically", () => {
    const out = oneOffsInWindow(days, "2026-08-01", "2026-08-31")
    expect(out[0].label).toBe("Creatine")
  })
})

describe("recentOneOffLabels — the chips that make the second time two taps", () => {
  const days: OneOffDays = {
    "2026-08-06": [log({ id: "a", loggedFor: "2026-08-06", label: "Creatine" })],
    "2026-08-05": [log({ id: "b", loggedFor: "2026-08-05", label: "Ashwagandha" })],
    "2026-08-04": [log({ id: "c", loggedFor: "2026-08-04", label: "Creatine" })],
    "2026-05-01": [log({ id: "old", loggedFor: "2026-05-01", label: "Magnesium" })],
  }

  it("offers each label once, most recent first", () => {
    expect(recentOneOffLabels(days, "2026-08-07").map((l) => l.label)).toEqual([
      "Creatine",
      "Ashwagandha",
    ])
  })

  it("ignores anything outside the window", () => {
    expect(recentOneOffLabels(days, "2026-08-07").map((l) => l.label)).not.toContain(
      "Magnesium"
    )
  })

  it("caps the list", () => {
    const many: OneOffDays = {}
    for (let i = 1; i <= 12; i++) {
      const day = `2026-08-${String(i).padStart(2, "0")}`
      many[day] = [log({ id: `x${i}`, loggedFor: day, label: `Thing ${i}` })]
    }
    expect(recentOneOffLabels(many, "2026-08-13", 30, 6)).toHaveLength(6)
  })
})
