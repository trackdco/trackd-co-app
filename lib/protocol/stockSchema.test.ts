import { describe, expect, it } from "vitest"

import { dropperOffered, offerableForms, stockSchemaFromProbe } from "@/lib/protocol/stockSchema"

describe("SW: the stock probe reads the schema from v_compound_stock", () => {
  it("no error: 026 is applied", () => {
    expect(stockSchemaFromProbe(null)).toBe(true)
    expect(stockSchemaFromProbe(undefined)).toBe(true)
  })
  it("a missing relation, from Postgres or from PostgREST's cache: not applied", () => {
    expect(stockSchemaFromProbe({ code: "42P01" })).toBe(false)
    expect(stockSchemaFromProbe({ code: "PGRST205" })).toBe(false)
  })
  it("any other error says nothing", () => {
    expect(stockSchemaFromProbe({ code: "08006" })).toBeNull()
    expect(stockSchemaFromProbe({})).toBeNull()
  })
})

describe("SW: the dropper is offered only where it can save", () => {
  const PO = ["oral_solid", "bulk_powder", "dropper"] as const

  it("offered only on a database known to hold it", () => {
    expect(dropperOffered(true)).toBe(true)
    expect(dropperOffered(false)).toBe(false)
    // Unknown hides it: a refused dropper costs the whole form.
    expect(dropperOffered(null)).toBe(false)
  })

  it("taken out of the forms on the live database (no 025/026)", () => {
    expect(offerableForms(PO, dropperOffered(false))).toEqual(["oral_solid", "bulk_powder"])
    expect(offerableForms(PO, dropperOffered(null))).toEqual(["oral_solid", "bulk_powder"])
  })

  it("kept once the database holds it", () => {
    expect(offerableForms(PO, dropperOffered(true))).toEqual([...PO])
  })

  it("never taken from under a container that already is one", () => {
    expect(offerableForms(PO, false, "dropper")).toEqual([...PO])
  })

  it("leaves every other form alone", () => {
    expect(offerableForms(["reconstituted", "preconcentrated"], false)).toEqual([
      "reconstituted",
      "preconcentrated",
    ])
  })
})
