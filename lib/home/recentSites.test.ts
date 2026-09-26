import { describe, expect, it } from "vitest"

import type { DayLogs } from "@/lib/home/doseLog"
import { recentInjectionSites, siteLabelFrom } from "@/lib/home/recentSites"

const COMPOUNDS = [
  { id: "bpc", name: "BPC-157", method: "subq" },
  { id: "tb", name: "TB-500", method: "subq" },
  { id: "teste", name: "Testosterone Enanthate", method: "im" },
  { id: "deca", name: "Nandrolone Decanoate", method: "im" },
  { id: "oral", name: "Anavar", method: "po" },
]

const CATALOGUE = [
  { id: "sq-abdo-l", label: "Side Abdomen – Left" },
  { id: "sq-abdo-r", label: "Side Abdomen – Right" },
  { id: "im-delt-l", label: "Delt – Left" },
  { id: "im-glute-r", label: "Glute – Right" },
]
const labelFor = (id: string) => siteLabelFrom(CATALOGUE, id)

const dose = (siteId: string | null, time24 = "09:00") => ({ amount: "1", time24, siteId })
const logs = (x: Record<string, Record<string, ReturnType<typeof dose>>>) => x as unknown as DayLogs

describe("Home's Last logged list", () => {
  /*
   * F14 (cold functionality review): Home's Injection sites "Last logged" listed
   * a dose with no site as its first entry ("No site / BPC-157 / today"). The
   * list names muscles; a dose with no site is not one, so it is left out.
   */
  it("F14: leaves a dose with no site out, even when it is the newest", () => {
    const list = recentInjectionSites(
      logs({
        "2026-09-24": { bpc: dose("sq-abdo-l") },
        "2026-09-26": { bpc: dose(null, "08:00"), tb: dose("sq-abdo-r", "07:00") },
      }),
      "2026-09-26",
      COMPOUNDS,
      labelFor,
    )
    expect(list.map((s) => s.siteLabel)).toEqual(["Side Abdomen – Right", "Side Abdomen – Left"])
    expect(list.every((s) => s.siteLabel)).toBe(true)
  })

  it("F14: a day of site-less doses gives an empty list, not a No site row", () => {
    expect(
      recentInjectionSites(logs({ "2026-09-26": { bpc: dose(null) } }), "2026-09-26", COMPOUNDS, labelFor),
    ).toEqual([])
  })

  it("groups a muscle's compounds on its most recent day, newest muscle first", () => {
    const list = recentInjectionSites(
      logs({
        "2026-09-20": { teste: dose("im-delt-l") },
        "2026-09-23": { teste: dose("im-glute-r"), deca: dose("im-glute-r", "09:05") },
        "2026-09-25": { deca: dose("im-delt-l") },
      }),
      "2026-09-26",
      COMPOUNDS,
      labelFor,
    )
    expect(list).toEqual([
      { siteId: "im-delt-l", siteLabel: "Delt – Left", route: "im", compounds: ["Nandrolone Decanoate"], daysAgo: 1 },
      {
        siteId: "im-glute-r",
        siteLabel: "Glute – Right",
        route: "im",
        compounds: ["Testosterone Enanthate", "Nandrolone Decanoate"],
        daysAgo: 3,
      },
    ])
  })

  it("counts a day's later doses (slot keys) too", () => {
    const list = recentInjectionSites(
      logs({ "2026-09-26": { bpc: dose("sq-abdo-l", "08:00"), "bpc#1": dose("sq-abdo-r", "20:00") } }),
      "2026-09-26",
      COMPOUNDS,
      labelFor,
    )
    expect(list.map((s) => [s.siteId, s.compounds])).toEqual([
      ["sq-abdo-r", ["BPC-157"]],
      ["sq-abdo-l", ["BPC-157"]],
    ])
  })

  it("skips oral compounds, compounds no longer in the stack, and future days", () => {
    const list = recentInjectionSites(
      logs({
        "2026-09-25": { oral: dose("sq-abdo-l"), gone: dose("im-delt-l") },
        "2026-09-27": { bpc: dose("sq-abdo-r") },
      }),
      "2026-09-26",
      COMPOUNDS,
      labelFor,
    )
    expect(list).toEqual([])
  })

  it("counts calendar days across London's March clock change", () => {
    const before = process.env.TZ
    process.env.TZ = "Europe/London"
    try {
      const list = recentInjectionSites(
        logs({ "2026-03-29": { teste: dose("im-delt-l") } }),
        "2026-03-30",
        COMPOUNDS,
        labelFor,
      )
      expect(list[0]?.daysAgo).toBe(1)
    } finally {
      if (before === undefined) delete process.env.TZ
      else process.env.TZ = before
    }
  })
})

describe("siteLabelFrom", () => {
  it("takes the catalogue's label first", () => {
    expect(siteLabelFrom([{ id: "im-delt-l", label: "Left delt (db)" }], "im-delt-l")).toBe("Left delt (db)")
  })
  it("falls back to the bundled label for a site narrowed out of the catalogue", () => {
    expect(siteLabelFrom([], "im-pec-l")).toBe("Pec – Left")
  })
  it("gives null for an id nobody knows, so no raw id is printed", () => {
    expect(siteLabelFrom([], "made-up-site")).toBeNull()
  })
})
