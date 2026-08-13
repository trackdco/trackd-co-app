import { describe, expect, it } from "vitest"

import { delta, pointsDelta } from "./deltas"
import {
  activityStreak,
  bestDay,
  buildRecords,
  headline,
  monthlyAmount,
  monthlyRevenue,
  rankMovers,
  type MoverInput,
  type PriceLike,
} from "./insights"

// ── Records & bests ──────────────────────────────────────────────────────────

describe("bestDay", () => {
  it("finds the highest day", () => {
    expect(
      bestDay([
        { day: "2026-08-01", count: 3 },
        { day: "2026-08-02", count: 11 },
        { day: "2026-08-03", count: 7 },
      ])
    ).toEqual({ day: "2026-08-02", count: 11 })
  })

  it("gives a tie to the earliest day, so the record has a first holder", () => {
    const out = bestDay([
      { day: "2026-08-03", count: 9 },
      { day: "2026-08-01", count: 9 },
      { day: "2026-08-02", count: 9 },
    ])
    expect(out).toEqual({ day: "2026-08-01", count: 9 })
  })

  // "Best day: 0" is the absence of a record, not a record.
  it("returns null for an empty or entirely quiet series", () => {
    expect(bestDay([])).toBeNull()
    expect(
      bestDay([
        { day: "2026-08-01", count: 0 },
        { day: "2026-08-02", count: 0 },
      ])
    ).toBeNull()
  })

  it("ignores non-finite counts rather than ranking them first", () => {
    expect(
      bestDay([
        { day: "2026-08-01", count: Number.NaN },
        { day: "2026-08-02", count: 2 },
      ])
    ).toEqual({ day: "2026-08-02", count: 2 })
  })
})

describe("activityStreak", () => {
  const today = "2026-08-13"

  it("counts consecutive active days back from today", () => {
    expect(
      activityStreak(
        [
          { day: "2026-08-10", count: 1 },
          { day: "2026-08-11", count: 4 },
          { day: "2026-08-12", count: 2 },
          { day: "2026-08-13", count: 9 },
        ],
        today
      )
    ).toBe(4)
  })

  // The day is not over — a quiet morning must not reset a running streak.
  it("does not break the streak because today is still empty", () => {
    expect(
      activityStreak(
        [
          { day: "2026-08-11", count: 4 },
          { day: "2026-08-12", count: 2 },
          { day: "2026-08-13", count: 0 },
        ],
        today
      )
    ).toBe(2)
  })

  // Yesterday is finished, so an empty yesterday IS an answer.
  it("breaks on an empty yesterday", () => {
    expect(
      activityStreak(
        [
          { day: "2026-08-11", count: 4 },
          { day: "2026-08-12", count: 0 },
          { day: "2026-08-13", count: 0 },
        ],
        today
      )
    ).toBe(0)
  })

  // Walking by array index rather than by date is the classic bug here.
  it("treats a hole in the series as an inactive day, not a skipped one", () => {
    expect(
      activityStreak(
        [
          { day: "2026-06-01", count: 5 },
          { day: "2026-08-12", count: 5 },
          { day: "2026-08-13", count: 5 },
        ],
        today
      )
    ).toBe(2)
  })

  it("ignores days after today so a future-dated row cannot inflate it", () => {
    expect(
      activityStreak(
        [
          { day: "2026-08-13", count: 1 },
          { day: "2026-08-20", count: 50 },
        ],
        today
      )
    ).toBe(1)
  })

  it("handles an empty series", () => {
    expect(activityStreak([], today)).toBe(0)
  })

  it("crosses a month boundary", () => {
    expect(
      activityStreak(
        [
          { day: "2026-07-31", count: 1 },
          { day: "2026-08-01", count: 1 },
        ],
        "2026-08-01"
      )
    ).toBe(2)
  })
})

describe("buildRecords", () => {
  it("assembles the four records and carries the streak window", () => {
    const out = buildRecords({
      signupsByDay: [{ day: "2026-08-01", count: 12 }],
      dosesByDay: [{ day: "2026-08-02", count: 40 }],
      accountsByDay: [{ day: "2026-08-03", count: 5 }],
      activityByDay: [
        { day: "2026-08-12", count: 3 },
        { day: "2026-08-13", count: 1 },
      ],
      streakWindowDays: 60,
      today: "2026-08-13",
    })
    expect(out.bestSignupDay).toEqual({ day: "2026-08-01", count: 12 })
    expect(out.bestDoseDay).toEqual({ day: "2026-08-02", count: 40 })
    expect(out.biggestAccountDay).toEqual({ day: "2026-08-03", count: 5 })
    expect(out.activityStreak).toBe(2)
    expect(out.streakWindowDays).toBe(60)
  })
})

// ── Movers & the headline ────────────────────────────────────────────────────

/** A mover big enough to clear every threshold. */
function bigRise(key: string, label: string): MoverInput {
  return { key, label, delta: delta(160, 100) }
}

describe("rankMovers", () => {
  it("drops metrics with no comparable previous period", () => {
    const out = rankMovers([
      { key: "a", label: "A", delta: null },
      bigRise("b", "B"),
    ])
    expect(out.map((m) => m.key)).toEqual(["b"])
  })

  it("sorts significant movers above insignificant ones", () => {
    const out = rankMovers([
      { key: "quiet", label: "Quiet", delta: delta(101, 100) },
      bigRise("loud", "Loud"),
    ])
    expect(out.map((m) => m.key)).toEqual(["loud", "quiet"])
    expect(out[0].significant).toBe(true)
    expect(out[1].significant).toBe(false)
  })

  it("ranks by size of move, falls included", () => {
    const out = rankMovers([
      { key: "up", label: "Up", delta: delta(120, 100) },
      { key: "down", label: "Down", delta: delta(40, 100) },
    ])
    expect(out.map((m) => m.key)).toEqual(["down", "up"])
  })

  it("breaks ties on the key so the order is stable between refreshes", () => {
    const first = rankMovers([bigRise("zebra", "Z"), bigRise("apple", "A")])
    const second = rankMovers([bigRise("apple", "A"), bigRise("zebra", "Z")])
    expect(first.map((m) => m.key)).toEqual(["apple", "zebra"])
    expect(second.map((m) => m.key)).toEqual(first.map((m) => m.key))
  })

  // Beta-size noise: huge percentages off tiny baselines.
  it("does not call a move off a tiny baseline significant", () => {
    const out = rankMovers([{ key: "a", label: "A", delta: delta(3, 1) }])
    expect(out[0].significant).toBe(false)
  })

  it("does not call a two-thing move significant even at a big percentage", () => {
    const out = rankMovers([{ key: "a", label: "A", delta: delta(8, 6) }])
    expect(out[0].significant).toBe(false)
  })

  it("does not call a large but proportionally tiny move significant", () => {
    const out = rankMovers([{ key: "a", label: "A", delta: delta(10050, 10000) }])
    expect(out[0].significant).toBe(false)
  })

  it("treats a real rise from nothing as significant without a percentage", () => {
    const out = rankMovers([{ key: "a", label: "A", delta: delta(9, 0) }])
    expect(out[0].significant).toBe(true)
    expect(out[0].delta.pct).toBeNull()
  })

  it("holds a rate to a points threshold, not a percentage one", () => {
    const small = rankMovers([
      { key: "r", label: "R", delta: pointsDelta(32, 30), unit: "points" },
    ])
    const large = rankMovers([
      { key: "r", label: "R", delta: pointsDelta(42, 30), unit: "points" },
    ])
    expect(small[0].significant).toBe(false)
    expect(large[0].significant).toBe(true)
  })
})

describe("headline", () => {
  const period = "the previous 30 days"

  it("names the biggest significant change", () => {
    const movers = rankMovers([
      { key: "doses", label: "Doses logged", delta: delta(161, 120) },
      { key: "signups", label: "Waitlist signups", delta: delta(21, 20) },
    ])
    expect(headline(movers, period)).toBe(
      "Doses logged up 34% on the previous 30 days (161 vs 120)."
    )
  })

  it("says a fall plainly", () => {
    const movers = rankMovers([
      { key: "doses", label: "Doses logged", delta: delta(60, 120) },
    ])
    expect(headline(movers, period)).toBe(
      "Doses logged down 50% on the previous 30 days (60 vs 120)."
    )
  })

  // No percentage is expressible over a zero baseline — so it does not print one.
  it("switches to absolute phrasing when the baseline was zero", () => {
    const movers = rankMovers([
      { key: "signups", label: "Waitlist signups", delta: delta(12, 0) },
    ])
    expect(headline(movers, period)).toBe(
      "Waitlist signups up from none to 12 on the previous 30 days."
    )
  })

  it("talks about a rate in points, never in percent", () => {
    const movers = rankMovers([
      {
        key: "retention",
        label: "Weekly retention",
        delta: pointsDelta(50, 38),
        unit: "points",
      },
    ])
    expect(headline(movers, "the previous week")).toBe(
      "Weekly retention up 12 points on the previous week (50% vs 38%)."
    )
  })

  it("formats large numbers with separators", () => {
    const movers = rankMovers([
      { key: "doses", label: "Doses logged", delta: delta(4200, 3000) },
    ])
    expect(headline(movers, period)).toBe(
      "Doses logged up 40% on the previous 30 days (4,200 vs 3,000)."
    )
  })

  // ── The say-nothing cases ─────────────────────────────────────────────────

  it("says nothing when there are no movers at all", () => {
    expect(headline([], period)).toBeNull()
    expect(headline(rankMovers([]), period)).toBeNull()
  })

  it("says nothing when every metric was unmeasurable", () => {
    const movers = rankMovers([
      { key: "a", label: "A", delta: null },
      { key: "b", label: "B", delta: null },
    ])
    expect(headline(movers, period)).toBeNull()
  })

  it("says nothing when nothing moved", () => {
    const movers = rankMovers([
      { key: "a", label: "A", delta: delta(100, 100) },
      { key: "b", label: "B", delta: delta(0, 0) },
    ])
    expect(headline(movers, period)).toBeNull()
  })

  it("says nothing about noise off a tiny baseline", () => {
    const movers = rankMovers([
      { key: "a", label: "A", delta: delta(3, 1) },
      { key: "b", label: "B", delta: delta(2, 0) },
    ])
    expect(headline(movers, period)).toBeNull()
  })

  it("says nothing when a rate wobbled by a point or two", () => {
    const movers = rankMovers([
      { key: "r", label: "R", delta: pointsDelta(31, 30), unit: "points" },
    ])
    expect(headline(movers, period)).toBeNull()
  })

  it("defaults to a neutral period name rather than inventing one", () => {
    const movers = rankMovers([{ key: "a", label: "Accounts", delta: delta(50, 25) }])
    expect(headline(movers)).toBe("Accounts up 100% on the previous period (50 vs 25).")
  })

  // A weekly metric must not be captioned "vs the previous 90 days".
  it("uses the winning mover's own comparison window over the page default", () => {
    const movers = rankMovers([
      {
        key: "daily",
        label: "Active today",
        delta: delta(30, 10),
        previousLabel: "yesterday",
      },
    ])
    expect(headline(movers, "the previous 90 days")).toBe(
      "Active today up 200% on yesterday (30 vs 10)."
    )
  })
})

// ── Revenue ──────────────────────────────────────────────────────────────────

describe("monthlyAmount", () => {
  it("leaves a monthly price alone", () => {
    expect(monthlyAmount(11.99, "month")).toBe(11.99)
  })

  it("divides a yearly price by twelve", () => {
    expect(monthlyAmount(120, "year")).toBe(10)
  })

  // Not "four weeks" — a month is 52/12 weeks, and the 8.6% error compounds.
  it("converts a weekly price through the year, not through four weeks", () => {
    expect(monthlyAmount(3, "week")).toBeCloseTo(13, 10)
    expect(monthlyAmount(3, "week")).not.toBe(12)
  })

  it("converts a daily price through the year", () => {
    expect(monthlyAmount(12, "day")).toBeCloseTo(365, 10)
  })

  // Guessing here would report a yearly amount as a monthly one.
  it("refuses an interval it does not recognise", () => {
    expect(monthlyAmount(10, "quarter")).toBeNull()
    expect(monthlyAmount(10, "")).toBeNull()
  })

  it("refuses a non-finite amount", () => {
    expect(monthlyAmount(Number.NaN, "month")).toBeNull()
  })
})

describe("monthlyRevenue", () => {
  const prices: PriceLike[] = [
    { priceId: "price_year", plan: "yearly", amount: 69.99, currency: "usd", interval: "year" },
    { priceId: "price_month", plan: "monthly", amount: 11.99, currency: "usd", interval: "month" },
    { priceId: "price_week", plan: "weekly", amount: 3.99, currency: "usd", interval: "week" },
  ]

  // The state today: zero subscriptions. It must be quiet, not zero-shaped noise.
  it("returns a clean zero with no subscriptions, and no invented currency", () => {
    const out = monthlyRevenue([], prices)
    expect(out.mrr).toBe(0)
    expect(out.arr).toBe(0)
    expect(out.currency).toBeNull()
    expect(out.arpu).toBeNull()
    expect(out.byPlan).toEqual([])
    expect(out.subscriptions).toBe(0)
  })

  it("returns zero, never throws, when Stripe returned no prices at all", () => {
    const out = monthlyRevenue([{ priceId: "price_year", account: "u1" }], [])
    expect(out.mrr).toBe(0)
    expect(out.currency).toBeNull()
    expect(out.unpriced).toBe(1)
  })

  it("normalises every interval to a month and sums them", () => {
    const out = monthlyRevenue(
      [
        { priceId: "price_year", account: "u1" },
        { priceId: "price_month", account: "u2" },
      ],
      prices
    )
    // 69.99/12 = 5.8325, + 11.99 = 17.8225 → 17.82
    expect(out.mrr).toBe(17.82)
    expect(out.currency).toBe("usd")
    expect(out.subscriptions).toBe(2)
    expect(out.payingAccounts).toBe(2)
  })

  it("reports ARR as twelve times MRR", () => {
    const out = monthlyRevenue([{ priceId: "price_month", account: "u1" }], prices)
    expect(out.mrr).toBe(11.99)
    expect(out.arr).toBe(143.88)
  })

  // Every other billing number counts accounts; revenue counts subscriptions.
  it("counts subscription ROWS, because Stripe bills each one", () => {
    const out = monthlyRevenue(
      [
        { priceId: "price_month", account: "u1" },
        { priceId: "price_month", account: "u1" },
      ],
      prices
    )
    expect(out.subscriptions).toBe(2)
    expect(out.mrr).toBe(23.98)
    // …but ARPU is still per PERSON.
    expect(out.payingAccounts).toBe(1)
    expect(out.arpu).toBe(23.98)
  })

  // Rounding each subscription first loses a cent per subscription per month.
  it("rounds the total once, not every subscription", () => {
    const out = monthlyRevenue(
      Array.from({ length: 12 }, (_, i) => ({ priceId: "price_year", account: `u${i}` })),
      prices
    )
    expect(out.mrr).toBe(69.99)
  })

  it("splits MRR by plan, biggest first, using the paywall's own labels", () => {
    const out = monthlyRevenue(
      [
        { priceId: "price_month", account: "u1" },
        { priceId: "price_year", account: "u2" },
      ],
      prices
    )
    expect(out.byPlan).toEqual([
      { key: "monthly", label: "Monthly", mrr: 11.99, subscriptions: 1 },
      { key: "yearly", label: "Yearly", mrr: 5.83, subscriptions: 1 },
    ])
  })

  it("excludes a subscription whose price Stripe did not return, and says so", () => {
    const out = monthlyRevenue(
      [
        { priceId: "price_month", account: "u1" },
        { priceId: "price_retired", account: "u2" },
        { priceId: null, account: "u3" },
      ],
      prices
    )
    expect(out.mrr).toBe(11.99)
    expect(out.subscriptions).toBe(1)
    expect(out.unpriced).toBe(2)
  })

  it("excludes a price with an interval it cannot normalise", () => {
    const out = monthlyRevenue(
      [{ priceId: "price_odd", account: "u1" }],
      [
        {
          priceId: "price_odd",
          plan: "odd",
          amount: 30,
          currency: "usd",
          interval: "fortnight",
        },
      ]
    )
    expect(out.mrr).toBe(0)
    expect(out.unpriced).toBe(1)
  })

  // Adding 10 EUR to 10 USD gives 20 of nothing.
  it("never sums across currencies — it reports the biggest and counts the rest", () => {
    const mixed: PriceLike[] = [
      ...prices,
      { priceId: "price_eur", plan: "monthly", amount: 500, currency: "eur", interval: "month" },
    ]
    const out = monthlyRevenue(
      [
        { priceId: "price_month", account: "u1" },
        { priceId: "price_eur", account: "u2" },
      ],
      mixed
    )
    expect(out.currency).toBe("eur")
    expect(out.mrr).toBe(500)
    expect(out.otherCurrency).toBe(1)
    expect(out.subscriptions).toBe(1)
  })

  it("does not count an account-less subscription toward ARPU's denominator", () => {
    const out = monthlyRevenue(
      [
        { priceId: "price_month", account: null },
        { priceId: "price_month", account: "u1" },
      ],
      prices
    )
    expect(out.subscriptions).toBe(2)
    expect(out.payingAccounts).toBe(1)
    expect(out.mrr).toBe(23.98)
  })
})

describe("monthlyAmount — interval_count", () => {
  // Stripe expresses "every 3 months" as interval:"month" + interval_count:3.
  // Reading only the interval prices that plan as if it were charged monthly,
  // which overstates MRR by exactly the interval count.
  it("divides by the interval count", () => {
    expect(monthlyAmount(30, "month", 3)).toBe(10)
    expect(monthlyAmount(120, "month", 6)).toBe(20)
  })

  it("defaults to 1, so every price configured today is unchanged", () => {
    expect(monthlyAmount(29, "month")).toBe(29)
    expect(monthlyAmount(29, "month", 1)).toBe(29)
  })

  it("applies to the other intervals too", () => {
    // A price charged every 2 years buys 24 months.
    expect(monthlyAmount(240, "year", 2)).toBeCloseTo(10, 6)
  })

  it("refuses a nonsensical count rather than inventing a number", () => {
    expect(monthlyAmount(30, "month", 0)).toBeNull()
    expect(monthlyAmount(30, "month", -1)).toBeNull()
    expect(monthlyAmount(30, "month", NaN)).toBeNull()
  })
})
