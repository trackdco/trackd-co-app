import { describe, expect, it } from "vitest"

import {
  ageBracket,
  consentExpectations,
  csvField,
  funnel,
  intersect,
  median,
  percent,
  safeFilename,
  seriesByDay,
  tally,
  timezoneRegion,
  toCsv,
} from "./aggregate"

describe("tally", () => {
  it("counts and ranks highest first", () => {
    const out = tally(["a", "b", "a", "c", "a", "b"])
    expect(out.map((t) => [t.key, t.count])).toEqual([
      ["a", 3],
      ["b", 2],
      ["c", 1],
    ])
  })

  it("drops empty, null and whitespace-only keys", () => {
    expect(tally(["a", null, undefined, "", "   "])).toEqual([
      { key: "a", label: "a", count: 1 },
    ])
  })

  it("breaks ties by key so equal counts do not reshuffle between renders", () => {
    const first = tally(["zebra", "apple"]).map((t) => t.key)
    const second = tally(["apple", "zebra"]).map((t) => t.key)
    expect(first).toEqual(["apple", "zebra"])
    expect(second).toEqual(first)
  })

  it("applies the label function", () => {
    expect(tally(["trt"], (k) => k.toUpperCase())[0].label).toBe("TRT")
  })
})

describe("percent", () => {
  it("rounds to a whole number", () => {
    expect(percent(1, 3)).toBe(33)
    expect(percent(2, 3)).toBe(67)
  })

  // The whole point: a share of nothing is not zero, it is unmeasured.
  it("returns null rather than 0 for an empty denominator", () => {
    expect(percent(0, 0)).toBeNull()
    expect(percent(5, 0)).toBeNull()
    expect(percent(1, -1)).toBeNull()
  })

  it("returns null for non-finite input", () => {
    expect(percent(NaN, 10)).toBeNull()
    expect(percent(1, Infinity)).toBeNull()
  })
})

describe("ageBracket", () => {
  const now = new Date("2026-08-13T00:00:00Z")

  it("buckets by age", () => {
    expect(ageBracket("2000-01-01", now)).toBe("25-34")
    expect(ageBracket("1990-01-01", now)).toBe("35-44")
    expect(ageBracket("1960-01-01", now)).toBe("55+")
  })

  it("handles a birthday that has not happened yet this year", () => {
    // Turns 25 in December, so still 24 in August.
    expect(ageBracket("2001-12-31", now)).toBe("18-24")
    // Turned 25 in January.
    expect(ageBracket("2001-01-01", now)).toBe("25-34")
  })

  it("returns null for under-18, which the 18+ gate says cannot exist", () => {
    expect(ageBracket("2015-01-01", now)).toBeNull()
  })

  it("returns null for missing or unparseable dates", () => {
    expect(ageBracket(null, now)).toBeNull()
    expect(ageBracket("", now)).toBeNull()
    expect(ageBracket("not-a-date", now)).toBeNull()
  })

  it("returns null for an implausible age rather than charting it", () => {
    expect(ageBracket("1800-01-01", now)).toBeNull()
  })
})

describe("timezoneRegion", () => {
  it("keeps the region and drops the city", () => {
    expect(timezoneRegion("Australia/Sydney")).toBe("Australia")
    expect(timezoneRegion("America/New_York")).toBe("America")
  })

  it("handles a bare region", () => {
    expect(timezoneRegion("UTC")).toBe("UTC")
  })

  it("returns null for nothing", () => {
    expect(timezoneRegion(null)).toBeNull()
    expect(timezoneRegion("  ")).toBeNull()
  })
})

describe("median", () => {
  it("takes the middle of an odd-length list", () => {
    expect(median([3, 1, 2])).toBe(2)
  })

  it("averages the middle two of an even-length list", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  it("returns null for an empty list", () => {
    expect(median([])).toBeNull()
  })
})

describe("seriesByDay", () => {
  it("zero-fills the gaps so a quiet stretch is flat, not missing", () => {
    const out = seriesByDay(
      ["2026-08-01T10:00:00Z", "2026-08-03T10:00:00Z", "2026-08-03T11:00:00Z"],
      new Date("2026-08-01T00:00:00Z"),
      new Date("2026-08-04T00:00:00Z")
    )
    expect(out).toEqual([
      { day: "2026-08-01", count: 1 },
      { day: "2026-08-02", count: 0 },
      { day: "2026-08-03", count: 2 },
      { day: "2026-08-04", count: 0 },
    ])
  })

  it("starts at the first datapoint when no start is given", () => {
    const out = seriesByDay(
      ["2026-08-02T10:00:00Z"],
      null,
      new Date("2026-08-03T00:00:00Z")
    )
    expect(out[0].day).toBe("2026-08-02")
  })

  it("returns nothing when there is nothing", () => {
    expect(seriesByDay([], new Date("2026-08-01T00:00:00Z"))).toEqual([])
    expect(seriesByDay([null, undefined], new Date("2026-08-01T00:00:00Z"))).toEqual([])
  })
})

describe("csvField", () => {
  it("quotes every field and doubles embedded quotes", () => {
    expect(csvField("plain")).toBe('"plain"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
  })

  it("survives commas and newlines without breaking the column layout", () => {
    expect(csvField("a,b")).toBe('"a,b"')
    expect(csvField("line1\nline2")).toBe('"line1\nline2"')
  })

  // The security control, not a formatting nicety. A feedback note or a waitlist
  // email beginning with one of these becomes a live formula in Excel/Sheets.
  it("neutralises spreadsheet formula injection", () => {
    expect(csvField("=HYPERLINK(\"http://evil\",\"click\")")).toBe(
      '"\'=HYPERLINK(""http://evil"",""click"")"'
    )
    expect(csvField("+1234")).toBe("\"'+1234\"")
    expect(csvField("-1+1")).toBe("\"'-1+1\"")
    expect(csvField("@SUM(A1)")).toBe("\"'@SUM(A1)\"")
    expect(csvField("\tcmd")).toBe("\"'\tcmd\"")
  })

  it("leaves an ordinary value untouched apart from quoting", () => {
    expect(csvField("someone@example.com")).toBe('"someone@example.com"')
  })

  it("renders null and undefined as an empty field", () => {
    expect(csvField(null)).toBe('""')
    expect(csvField(undefined)).toBe('""')
  })
})

describe("toCsv", () => {
  it("writes a header row and CRLF line endings", () => {
    expect(toCsv(["a", "b"], [["1", "2"]])).toBe('"a","b"\r\n"1","2"')
  })

  it("handles no rows", () => {
    expect(toCsv(["a"], [])).toBe('"a"')
  })
})

describe("safeFilename", () => {
  it("keeps an ordinary name", () => {
    expect(safeFilename("trackd-waitlist.csv")).toBe("trackd-waitlist.csv")
  })

  // The point is not that the result is pretty — it is that the quote, the CR,
  // the LF, the semicolon and the colon are all gone, so nothing can terminate
  // the Content-Disposition header or start a new one.
  it("strips the characters a header-injection attempt would need", () => {
    const out = safeFilename('a"; rm -rf /\r\nX-Evil: 1')
    expect(out).toBe("arm-rfX-Evil1")
    expect(out).not.toMatch(/["\r\n;:/]/)
  })

  it("caps the length", () => {
    expect(safeFilename("a".repeat(500))).toHaveLength(100)
  })

  it("falls back when nothing survives", () => {
    expect(safeFilename("///")).toBe("export.csv")
  })
})

describe("consentExpectations", () => {
  // The bridge between two enums that share NO values. Comparing
  // `legal_documents.doc_type` to `consent_records.document` directly matches
  // nothing, always — which renders a confident "0% on the current version".
  it("translates legal doc types into the consent rows they require", () => {
    expect(
      consentExpectations([{ document: "terms_of_service", version: "1.3" }])
    ).toEqual([{ document: "tos", version: "1.3" }])
  })

  it("expands the privacy policy into TWO consent rows at the privacy version", () => {
    // health_data_consent is tied to the Privacy Policy and carries its version,
    // so publishing a new privacy policy makes two rows stale, not one.
    expect(
      consentExpectations([{ document: "privacy_policy", version: "2.0" }])
    ).toEqual([
      { document: "privacy", version: "2.0" },
      { document: "health_data_consent", version: "2.0" },
    ])
  })

  it("covers all three published document types", () => {
    const out = consentExpectations([
      { document: "terms_of_service", version: "1.3" },
      { document: "privacy_policy", version: "1.0" },
      { document: "medical_disclaimer", version: "1.1" },
    ])
    expect(out).toEqual([
      { document: "tos", version: "1.3" },
      { document: "privacy", version: "1.0" },
      { document: "health_data_consent", version: "1.0" },
      { document: "disclaimer", version: "1.1" },
    ])
  })

  it("ignores an unmapped doc type instead of making the bar unreachable", () => {
    expect(consentExpectations([{ document: "cookie_policy", version: "1.0" }])).toEqual([])
  })

  it("returns nothing for nothing", () => {
    expect(consentExpectations([])).toEqual([])
  })
})

describe("intersect", () => {
  it("keeps only the shared members", () => {
    expect([...intersect(new Set([1, 2, 3]), new Set([2, 3, 4]))]).toEqual([2, 3])
  })

  it("is empty when nothing is shared", () => {
    expect(intersect(new Set([1]), new Set([2])).size).toBe(0)
  })

  it("handles an empty side", () => {
    expect(intersect(new Set<number>(), new Set([1, 2])).size).toBe(0)
  })

  // The property the funnel relies on: the result can never be larger than
  // either input, so successive intersections can only ever shrink.
  it("never grows", () => {
    const a = new Set([1, 2, 3, 4])
    const b = new Set([3, 4, 5])
    const out = intersect(a, b)
    expect(out.size).toBeLessThanOrEqual(Math.min(a.size, b.size))
  })
})

describe("funnel", () => {
  it("carries both baselines, because one of them alone misleads", () => {
    const steps = funnel([
      { label: "Signed up", count: 100 },
      { label: "Onboarded", count: 50 },
      { label: "Logged", count: 25 },
    ])
    expect(steps[0]).toMatchObject({ pctOfTop: 100, pctOfPrev: null })
    expect(steps[1]).toMatchObject({ pctOfTop: 50, pctOfPrev: 50 })
    // 25% of the top, but 50% of the step above — the two sentences differ.
    expect(steps[2]).toMatchObject({ pctOfTop: 25, pctOfPrev: 50 })
  })

  it("reads as unmeasured, not as zero, on an empty funnel", () => {
    const steps = funnel([
      { label: "Signed up", count: 0 },
      { label: "Onboarded", count: 0 },
    ])
    expect(steps[0].pctOfTop).toBeNull()
    expect(steps[1].pctOfPrev).toBeNull()
  })
})
